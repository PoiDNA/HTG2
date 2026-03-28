import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAdmin } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'HTG <sesje@htgcyou.com>';

// POST /api/email/send — Admin sends reply in a conversation thread
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { user } = auth;

  const { conversationId, to, cc, bcc, subject, bodyHtml, bodyText } = await req.json();
  if (!conversationId || !to || (!bodyHtml && !bodyText)) {
    return NextResponse.json({ error: 'conversationId, to, and body required' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  // Get conversation + last inbound message for threading headers
  const { data: conv } = await db
    .from('conversations')
    .select('id, mailbox_id, subject')
    .eq('id', conversationId)
    .single();
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  // Check mailbox access (admin has full access)
  // TODO: For non-admin staff, check mailbox_members access

  // Get last inbound message for In-Reply-To / References
  const { data: lastInbound } = await db
    .from('messages')
    .select('smtp_message_id, smtp_references')
    .eq('conversation_id', conversationId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const inReplyTo = lastInbound?.smtp_message_id || undefined;
  const referencesChain = [
    ...(lastInbound?.smtp_references || []),
    ...(inReplyTo ? [inReplyTo] : []),
  ].filter(Boolean);

  // Ensure subject has Re: prefix
  const replySubject = subject || (conv.subject
    ? (conv.subject.match(/^(Re|Odp):/i) ? conv.subject : `Re: ${conv.subject}`)
    : 'Re:');

  // Send via Resend with threading headers
  const { data: sentEmail, error: sendError } = await resend.emails.send({
    from: FROM_EMAIL,
    to: Array.isArray(to) ? to : [to],
    cc: cc || undefined,
    bcc: bcc || undefined,
    subject: replySubject,
    html: bodyHtml || undefined,
    text: bodyText || undefined,
    headers: {
      ...(inReplyTo ? { 'In-Reply-To': inReplyTo } : {}),
      ...(referencesChain.length > 0 ? { References: referencesChain.join(' ') } : {}),
    },
  });

  if (sendError) {
    return NextResponse.json({ error: sendError.message }, { status: 500 });
  }

  // Save outbound message
  const { data: msg } = await db.from('messages').insert({
    conversation_id: conversationId,
    channel: 'email',
    direction: 'outbound',
    from_address: 'sesje@htgcyou.com',
    to_address: Array.isArray(to) ? to[0] : to,
    subject: replySubject,
    body_html: bodyHtml || null,
    body_text: bodyText || null,
    cc: cc || [],
    bcc: bcc || [],
    provider_message_id: sentEmail?.id || null,
    sent_by: user.id,
    processing_status: 'done',
  }).select('id').single();

  // Update conversation
  await db.from('conversations').update({
    last_message_at: new Date().toISOString(),
    status: 'pending', // Awaiting client response
  }).eq('id', conversationId);

  return NextResponse.json({ sent: true, messageId: msg?.id, resendId: sentEmail?.id });
}

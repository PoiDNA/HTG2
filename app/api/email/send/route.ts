import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAdmin } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { downloadFile } from '@/lib/bunny-storage';

let _resend: Resend;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
const FALLBACK_FROM = 'HTG <sesje@htgcyou.com>';

// Map mailbox addresses to display names for From header
const FROM_NAMES: Record<string, string> = {
  'kontakt@htgcyou.com': 'HTG Kontakt',
  'sesje@htgcyou.com': 'HTG Sesje',
  'htg@htg.cyou': 'HTG',
  'natalia@htg.cyou': 'Natalia HTG',
};

// POST /api/email/send — Admin sends reply in a conversation thread
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { user } = auth;

  const { conversationId, to, cc, bcc, subject, bodyHtml, bodyText, attachments: attachmentsMeta } = await req.json();
  if (!conversationId || !to || (!bodyHtml && !bodyText)) {
    return NextResponse.json({ error: 'conversationId, to, and body required' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  // Get conversation with mailbox for From address
  const { data: conv } = await db
    .from('conversations')
    .select('id, mailbox_id, subject, to_address, mailboxes(address, name)')
    .eq('id', conversationId)
    .single();
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  // Resolve FROM address from the mailbox the conversation belongs to
  const mailboxAddress = (conv as any).mailboxes?.address || conv.to_address;
  const fromName = FROM_NAMES[mailboxAddress || ''] || 'HTG';
  const fromEmail = mailboxAddress || 'sesje@htgcyou.com';

  // Check mailbox access for non-admin staff
  if (!auth.user.email || !(await isAdminOrMailboxMember(db, auth.user.id, conv.mailbox_id))) {
    return NextResponse.json({ error: 'No access to this mailbox' }, { status: 403 });
  }

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

  // Prepare Resend attachments
  const resendAttachments: { filename: string; content: Buffer }[] = [];
  if (attachmentsMeta?.length > 0) {
    for (const att of attachmentsMeta) {
      if (att.bunny_path) {
        try {
          const { buffer } = await downloadFile(att.bunny_path);
          resendAttachments.push({ filename: att.filename, content: Buffer.from(buffer) });
        } catch { /* skip */ }
      }
    }
  }

  // Send via Resend with threading headers — FROM = mailbox address
  const { data: sentEmail, error: sendError } = await getResend().emails.send({
    from: `${fromName} <${fromEmail}>`,
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
    ...(resendAttachments.length > 0 && { attachments: resendAttachments }),
  });

  if (sendError) {
    return NextResponse.json({ error: sendError.message }, { status: 500 });
  }

  // Save outbound message
  const { data: msg } = await db.from('messages').insert({
    conversation_id: conversationId,
    channel: 'email',
    direction: 'outbound',
    from_address: fromEmail,
    to_address: Array.isArray(to) ? to[0] : to,
    subject: replySubject,
    body_html: bodyHtml || null,
    body_text: bodyText || null,
    cc: cc || [],
    bcc: bcc || [],
    provider_message_id: sentEmail?.id || null,
    sent_by: user.id,
    has_attachments: (attachmentsMeta?.length || 0) > 0,
    attachments: attachmentsMeta || [],
    processing_status: 'done',
  }).select('id').single();

  // Update conversation
  await db.from('conversations').update({
    last_message_at: new Date().toISOString(),
    status: 'pending', // Awaiting client response
  }).eq('id', conversationId);

  return NextResponse.json({ sent: true, messageId: msg?.id, resendId: sentEmail?.id });
}

// Helper: check if user is admin or member of a mailbox
async function isAdminOrMailboxMember(db: any, userId: string, mailboxId: string | null): Promise<boolean> {
  // Admin check (already done by requireAdmin, but for staff access)
  const { data: profile } = await db.from('profiles').select('role').eq('id', userId).single();
  if (profile?.role === 'admin') return true;

  // Mailbox member check
  if (!mailboxId) return false;
  const { data } = await db
    .from('mailbox_members')
    .select('id')
    .eq('mailbox_id', mailboxId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

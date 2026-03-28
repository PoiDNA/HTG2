import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireEmailAccess, getUserMailboxIds } from '@/lib/email/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { normalizeAddress, resolveUser } from '@/lib/email/hub';
import { downloadFile } from '@/lib/bunny-storage';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_NAMES: Record<string, string> = {
  'kontakt@htgcyou.com': 'HTG Kontakt',
  'sesje@htgcyou.com': 'HTG Sesje',
  'htg@htg.cyou': 'HTG',
  'natalia@htg.cyou': 'Natalia HTG',
};

// POST /api/email/compose — Create new conversation + send first message
export async function POST(req: NextRequest) {
  const auth = await requireEmailAccess();
  if ('error' in auth) return auth.error;
  const { user, isAdmin } = auth;

  const { to, from, subject, bodyHtml, bodyText, attachments: attachmentsMeta } = await req.json();
  if (!to || (!bodyHtml && !bodyText)) {
    return NextResponse.json({ error: 'to and body required' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  // Determine FROM address (from mailbox selector or default)
  const accessibleIds = await getUserMailboxIds(user.id, isAdmin);
  let fromAddress = from || 'sesje@htgcyou.com';

  // Verify user has access to this from-address mailbox
  if (from) {
    const { data: mb } = await db
      .from('mailboxes')
      .select('id')
      .eq('address', from)
      .in('id', accessibleIds)
      .maybeSingle();
    if (!mb && !isAdmin) {
      return NextResponse.json({ error: 'No access to this mailbox' }, { status: 403 });
    }
  }

  // Resolve mailbox_id for the from-address
  const { data: mailbox } = await db
    .from('mailboxes')
    .select('id')
    .eq('address', fromAddress)
    .maybeSingle();

  const fromName = FROM_NAMES[fromAddress] || 'HTG';
  const toNormalized = normalizeAddress(to, 'email');

  // Try to resolve recipient as HTG user
  const userResult = await resolveUser(toNormalized);

  // Create conversation
  const { data: conv, error: convError } = await db
    .from('conversations')
    .insert({
      mailbox_id: mailbox?.id || null,
      channel: 'email',
      subject: subject || null,
      from_address: fromAddress,
      from_name: fromName,
      to_address: toNormalized,
      user_id: userResult.userId,
      user_link_verified: userResult.verified,
      user_link_method: userResult.method,
      status: 'pending',
    })
    .select('id')
    .single();

  if (convError || !conv) {
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }

  // Prepare Resend attachments (download from Bunny → send as buffer)
  const resendAttachments: { filename: string; content: Buffer }[] = [];
  if (attachmentsMeta?.length > 0) {
    for (const att of attachmentsMeta) {
      if (att.bunny_path) {
        try {
          const { buffer } = await downloadFile(att.bunny_path);
          resendAttachments.push({ filename: att.filename, content: Buffer.from(buffer) });
        } catch { /* skip failed downloads */ }
      }
    }
  }

  // Send via Resend
  const { data: sentEmail, error: sendError } = await resend.emails.send({
    from: `${fromName} <${fromAddress}>`,
    to: [toNormalized],
    subject: subject || '(bez tematu)',
    html: bodyHtml || undefined,
    text: bodyText || undefined,
    ...(resendAttachments.length > 0 && { attachments: resendAttachments }),
  });

  if (sendError) {
    // Cleanup conversation on send failure
    await db.from('conversations').delete().eq('id', conv.id);
    return NextResponse.json({ error: sendError.message }, { status: 500 });
  }

  // Save outbound message
  await db.from('messages').insert({
    conversation_id: conv.id,
    channel: 'email',
    direction: 'outbound',
    from_address: fromAddress,
    to_address: toNormalized,
    subject: subject || null,
    body_html: bodyHtml || null,
    body_text: bodyText || null,
    provider_message_id: sentEmail?.id || null,
    sent_by: user.id,
    has_attachments: (attachmentsMeta?.length || 0) > 0,
    attachments: attachmentsMeta || [],
    processing_status: 'done',
  });

  return NextResponse.json({ sent: true, conversationId: conv.id });
}

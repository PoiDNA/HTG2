import { NextRequest, NextResponse, after } from 'next/server';
import { Resend } from 'resend';
import { requireEmailAccess, isAdminOrMailboxMember } from '@/lib/email/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { validateUUID, validateBodyText } from '@/lib/portal/validation';

let _resend: Resend;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// POST /api/portal/admin-reply — admin/staff replies to a portal conversation
export async function POST(req: NextRequest) {
  const auth = await requireEmailAccess();
  if ('error' in auth) return auth.error;
  const { supabase: db, user, isAdmin } = auth;

  const body = await req.json();
  const conversationId = validateUUID(body.conversationId);
  const bodyText = validateBodyText(body.bodyText, 5000);

  if (!conversationId) {
    return NextResponse.json({ error: 'Nieprawidłowy identyfikator konwersacji' }, { status: 400 });
  }
  if (!bodyText) {
    return NextResponse.json({ error: 'Treść odpowiedzi jest wymagana (1-5000 znaków)' }, { status: 400 });
  }

  // Fetch conversation and verify portal channel
  const { data: conv } = await db
    .from('conversations')
    .select('id, channel, mailbox_id, from_address, user_id, status')
    .eq('id', conversationId)
    .single();

  if (!conv || conv.channel !== 'portal') {
    return NextResponse.json({ error: 'Konwersacja nie znaleziona' }, { status: 404 });
  }

  // Verify mailbox access
  if (!isAdmin && !(await isAdminOrMailboxMember(db, user.id, conv.mailbox_id))) {
    console.info('Portal admin-reply auth denied', { userId: user.id, conversationId });
    return NextResponse.json({ error: 'Brak dostępu do tej skrzynki' }, { status: 403 });
  }

  // Insert outbound message
  const { data: msg, error } = await db.from('messages').insert({
    conversation_id: conversationId,
    channel: 'portal',
    direction: 'outbound',
    from_address: 'portal@htg.internal',
    to_address: conv.from_address,
    body_text: bodyText,
    sent_by: user.id,
    processing_status: 'done',
  }).select('id').single();

  if (error) {
    console.error('Portal admin-reply insert failed', { userId: user.id, conversationId, error: error.message });
    return NextResponse.json({ error: 'Nie udało się wysłać odpowiedzi' }, { status: 500 });
  }

  // Update conversation status to 'pending' (admin replied, awaiting user)
  // Intentionally works on closed conversations too — admin has absolute authority to re-open
  await db.from('conversations').update({
    last_message_at: new Date().toISOString(),
    status: 'pending',
  }).eq('id', conversationId);

  console.info('Portal admin reply', { adminId: user.id, conversationId, messageId: msg?.id });

  // Get user display name for email notification
  let userName = '';
  if (conv.user_id) {
    const { data: profile } = await db
      .from('profiles')
      .select('display_name')
      .eq('id', conv.user_id)
      .single();
    userName = profile?.display_name || '';
  }

  const response = NextResponse.json({ sent: true, messageId: msg?.id });

  // Email notification via after() — best-effort, not guaranteed delivery
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://htg.cyou';
  const toAddress = conv.from_address;
  after(async () => {
    try {
      await getResend().emails.send({
        from: 'HTG <sesje@htgcyou.com>',
        to: toAddress,
        subject: 'Nowa wiadomość w Centrum Kontaktu HTG',
        text: [
          'Masz nową wiadomość w Centrum Kontaktu HTG.',
          '',
          'Pozdrawiamy,',
          'HTG',
        ].join('\n'),
      });
      console.info('Portal notification sent', { to: toAddress, conversationId });
    } catch (err) {
      console.error('Portal notification FAILED', { to: toAddress, conversationId, error: err });
    }
  });

  return response;
}

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { validateUUID, validateBodyText } from '@/lib/portal/validation';

const PORTAL_ADDRESS = 'portal@htg.internal';
const MAX_MESSAGES_PER_HOUR = 20;

// POST /api/portal/conversations/[id]/messages — user sends follow-up message
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!validateUUID(id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const bodyText = validateBodyText(body.body_text);
  if (!bodyText) {
    return NextResponse.json({ error: 'Treść wiadomości jest wymagana (1-2000 znaków)' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  // Ownership check
  const { data: conversation } = await db
    .from('conversations')
    .select('id, status, from_address')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('channel', 'portal')
    .single();

  if (!conversation) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Status check: closed threads reject new messages
  if (conversation.status === 'closed') {
    return NextResponse.json(
      { error: 'Wątek zamknięty', code: 'CONVERSATION_CLOSED' },
      { status: 409 }
    );
  }

  // Rate limit: 20 messages per hour per user
  const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('channel', 'portal')
    .eq('direction', 'inbound')
    .eq('from_address', user.email || '')
    .gte('created_at', since1h);

  if ((count || 0) >= MAX_MESSAGES_PER_HOUR) {
    console.info('Portal message rate limit hit', { userId: user.id, count });
    return NextResponse.json(
      { error: 'Przekroczono limit wiadomości. Spróbuj ponownie za chwilę.', code: 'RATE_LIMITED' },
      { status: 429 }
    );
  }

  // Insert message
  const { data: msg, error } = await db.from('messages').insert({
    conversation_id: id,
    channel: 'portal',
    direction: 'inbound',
    from_address: user.email || '',
    to_address: PORTAL_ADDRESS,
    body_text: bodyText,
    processing_status: 'done',
  }).select('id').single();

  if (error) {
    console.error('Portal message insert failed', { userId: user.id, conversationId: id, error: error.message });
    return NextResponse.json({ error: 'Nie udało się wysłać wiadomości' }, { status: 500 });
  }

  // Update conversation: re-activate to 'open' (user responded)
  await db.from('conversations').update({
    last_message_at: new Date().toISOString(),
    status: 'open',
  }).eq('id', id);

  console.info('Portal message sent', { userId: user.id, conversationId: id, messageId: msg?.id });

  return NextResponse.json({ messageId: msg?.id });
}

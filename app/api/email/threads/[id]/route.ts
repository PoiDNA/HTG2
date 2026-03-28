import { NextRequest, NextResponse } from 'next/server';
import { requireEmailAccess, getUserMailboxIds } from '@/lib/email/auth';
import { getCustomerCard } from '@/lib/email/context';
import { getSignedAttachmentUrl } from '@/lib/email/hub';

// GET /api/email/threads/[id] — Thread detail with messages + customer card
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireEmailAccess();
  if ('error' in auth) return auth.error;
  const { supabase, user, isAdmin } = auth;
  const { id } = await params;

  // Fetch conversation
  const { data: conv, error } = await supabase
    .from('conversations')
    .select('*, mailboxes(name, address)')
    .eq('id', id)
    .single();

  if (error || !conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Check mailbox access
  if (!isAdmin && conv.mailbox_id) {
    const ids = await getUserMailboxIds(user.id, false);
    if (!ids.includes(conv.mailbox_id)) {
      return NextResponse.json({ error: 'No access' }, { status: 403 });
    }
  }

  // Fetch messages
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });

  // Sign attachment URLs
  const messagesWithSignedUrls = (messages || []).map((msg: any) => ({
    ...msg,
    attachments: (msg.attachments || []).map((att: any) => ({
      ...att,
      signedUrl: att.bunny_path ? getSignedAttachmentUrl(att.bunny_path) : null,
    })),
  }));

  // Customer card (with PII guard)
  const customerCard = await getCustomerCard(
    conv.from_address,
    conv.user_id,
    conv.user_link_verified
  );

  return NextResponse.json({
    ...conv,
    messages: messagesWithSignedUrls,
    customerCard,
  });
}

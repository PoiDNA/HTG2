import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';

// POST — manually link conversation to a user profile (unverified)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const { userId } = await req.json();

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  // Verify user exists
  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('id, display_name, email')
    .eq('id', userId)
    .single();

  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  await auth.supabase
    .from('conversations')
    .update({
      user_id: userId,
      user_link_verified: false,
      user_link_method: 'manual',
    })
    .eq('id', id);

  return NextResponse.json({
    linked: true,
    verified: false,
    user: { id: profile.id, displayName: profile.display_name, email: profile.email },
  });
}

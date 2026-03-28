import { NextRequest, NextResponse } from 'next/server';
import { requireEmailAccess } from '@/lib/email/auth';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailAccess();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  await auth.supabase.from('conversations').update({ status: 'closed' }).eq('id', id);
  return NextResponse.json({ closed: true });
}

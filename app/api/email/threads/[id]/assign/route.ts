import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const { assignedTo } = await req.json();

  await auth.supabase.from('conversations').update({ assigned_to: assignedTo || null }).eq('id', id);
  return NextResponse.json({ assigned: true });
}

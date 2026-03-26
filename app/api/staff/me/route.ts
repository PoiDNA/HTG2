import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/staff/auth';

export async function GET() {
  const auth = await requireStaff();
  if ('error' in auth) return auth.error;
  const { staffMember } = auth;

  return NextResponse.json({ staffMember });
}

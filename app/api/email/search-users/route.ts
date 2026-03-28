import { NextRequest, NextResponse } from 'next/server';
import { requireEmailAccess } from '@/lib/email/auth';

// GET /api/email/search-users?q=... — autocomplete for To field
export async function GET(req: NextRequest) {
  const auth = await requireEmailAccess();
  if ('error' in auth) return auth.error;
  const { supabase } = auth;

  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return NextResponse.json({ users: [] });

  const { data } = await supabase
    .from('profiles')
    .select('id, email, display_name')
    .or(`email.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(8);

  return NextResponse.json({ users: data || [] });
}

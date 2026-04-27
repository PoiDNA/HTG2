import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import type { User } from '@supabase/supabase-js';

export type AuthedRequest = {
  user: User;
  token: string;
};

/**
 * Validate a Supabase bearer token from the `Authorization` header.
 * Returns the authenticated user and token, or throws a NextResponse 401.
 *
 * Usage in a route handler:
 *   export async function GET(req: NextRequest) {
 *     const auth = await requireBearer(req);
 *     if (auth instanceof NextResponse) return auth;
 *     // ...auth.user
 *   }
 */
export async function requireBearer(
  req: NextRequest,
): Promise<AuthedRequest | NextResponse> {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = header.slice(7).trim();
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseServiceRole();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return { user: data.user, token };
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

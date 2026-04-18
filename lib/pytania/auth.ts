import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail, isStaffEmail } from '@/lib/roles';

export interface PytaniaAuthResult {
  supabase: ReturnType<typeof createSupabaseServiceRole>;
  user: { id: string; email: string };
  isAdmin: boolean;
  isStaff: boolean;
  hasPoSesji: boolean;
  canAccess: boolean;
}

export interface PytaniaAuthError {
  error: NextResponse;
}

export async function requirePytaniaAuth(): Promise<PytaniaAuthResult | PytaniaAuthError> {
  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const email = user.email ?? '';
  const isAdmin = isAdminEmail(email);
  const isStaff = isStaffEmail(email) || isAdmin;

  const serviceClient = createSupabaseServiceRole();

  let hasPoSesji = false;
  if (!isStaff) {
    const { data } = await serviceClient.rpc('has_po_sesji_access', { uid: user.id });
    hasPoSesji = data === true;
  }

  const canAccess = isStaff || hasPoSesji;

  return {
    supabase: serviceClient,
    user: { id: user.id, email },
    isAdmin,
    isStaff,
    hasPoSesji,
    canAccess,
  };
}

export function forbiddenForPoSesji() {
  return NextResponse.json({ error: 'Dostęp tylko dla osób po sesji badawczej' }, { status: 403 });
}

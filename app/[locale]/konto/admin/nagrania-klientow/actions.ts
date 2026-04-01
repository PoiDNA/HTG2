'use server';

import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';

export async function logAdminPageView(page: string) {
  try {
    const sessionClient = await createSupabaseServer();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user || !isAdminEmail(user.email ?? '')) return;

    const db = createSupabaseServiceRole();
    await db.from('admin_audit_log').insert({
      admin_id: user.id,
      action: 'page_view',
      details: { page },
    });
  } catch {
    // Non-blocking — audit failure should never break the UI
  }
}

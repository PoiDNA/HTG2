import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { createClient } from '@supabase/supabase-js';
import { translators } from '@/lib/staff-config';

/**
 * POST /api/admin/create-translator-accounts
 *
 * One-time admin endpoint to create translator accounts in Supabase Auth
 * and set their profile role to 'translator'.
 *
 * Idempotent — skips accounts that already exist.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  // Need admin client with service_role for auth.admin operations
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const db = createSupabaseServiceRole();

  // Source of truth: lib/staff-config.ts
  const TRANSLATORS = translators.map(t => ({ email: t.email, name: t.name, locale: t.locale }));

  const results: Array<{ email: string; status: string; userId?: string }> = [];

  // Fetch all users once (not per-translator)
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();

  for (const translator of TRANSLATORS) {
    const existing = existingUsers?.users?.find(
      u => u.email?.toLowerCase() === translator.email.toLowerCase()
    );

    if (existing) {
      // Upsert profile (handles missing rows from manual auth user creation)
      await db.from('profiles').upsert({
        id: existing.id,
        email: translator.email,
        display_name: translator.name,
        role: 'translator',
        preferred_locale: translator.locale,
      }, { onConflict: 'id' });

      results.push({ email: translator.email, status: 'already_exists', userId: existing.id });
      continue;
    }

    try {
      // Create auth user with a random password (they'll use magic link to login)
      const randomPassword = crypto.randomUUID() + '!Aa1';
      const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
        email: translator.email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: {
          full_name: translator.name,
          display_name: translator.name,
        },
      });

      if (error) {
        results.push({ email: translator.email, status: `error: ${error.message}` });
        continue;
      }

      if (newUser?.user) {
        // Upsert profile with role and locale
        await db.from('profiles').upsert({
          id: newUser.user.id,
          email: translator.email,
          display_name: translator.name,
          role: 'translator',
          preferred_locale: translator.locale,
        }, { onConflict: 'id' });

        results.push({ email: translator.email, status: 'created', userId: newUser.user.id });
      }
    } catch (error: any) {
      results.push({ email: translator.email, status: `error: ${error.message}` });
    }
  }

  return NextResponse.json({ results });
}

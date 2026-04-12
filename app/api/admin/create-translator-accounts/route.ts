import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { createClient } from '@supabase/supabase-js';

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

  const TRANSLATORS = [
    { email: 'melania@htg.cyou', name: 'Melania', locale: 'en' },
    { email: 'bernadetta@htg.cyou', name: 'Bernadetta', locale: 'de' },
    { email: 'edytap@htg.cyou', name: 'Edyta', locale: 'pt' },
  ];

  const results: Array<{ email: string; status: string; userId?: string }> = [];

  for (const translator of TRANSLATORS) {
    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existing = existingUsers?.users?.find(
      u => u.email?.toLowerCase() === translator.email.toLowerCase()
    );

    if (existing) {
      // Ensure role is set to translator
      await db.from('profiles')
        .update({ role: 'translator', preferred_locale: translator.locale })
        .eq('id', existing.id);

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
        // Set profile role and locale
        await db.from('profiles')
          .update({
            role: 'translator',
            display_name: translator.name,
            preferred_locale: translator.locale,
          })
          .eq('id', newUser.user.id);

        results.push({ email: translator.email, status: 'created', userId: newUser.user.id });
      }
    } catch (error: any) {
      results.push({ email: translator.email, status: `error: ${error.message}` });
    }
  }

  return NextResponse.json({ results });
}

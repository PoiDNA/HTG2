import { cookies } from 'next/headers';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail, isTranslatorEmail, TRANSLATOR_LOCALE } from '@/lib/roles';
import { IMPERSONATE_USER_COOKIE } from '@/lib/admin/impersonate-const';
import TranslatorPanelClient from './TranslatorPanelClient';

/**
 * /konto/tlumacz — panel tłumacza.
 *
 * Serwer sprawdza, czy admin podgląda panel przez impersonację:
 * - jeśli tak, pobiera locale impersonowanego użytkownika i przekazuje do klienta
 * - klient pomija wtedy sprawdzenie isTranslator po stronie JS (które czyta prawdziwą sesję)
 */
export default async function TranslatorPage() {
  const cookieStore = await cookies();
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  let adminOverrideLocale: string | undefined;

  // Sprawdź impersonację (tylko dla admina)
  if (user && isAdminEmail(user.email ?? '')) {
    const viewAsUserId = cookieStore.get(IMPERSONATE_USER_COOKIE)?.value;
    if (viewAsUserId) {
      const db = createSupabaseServiceRole();
      const { data: profile } = await db
        .from('profiles')
        .select('email')
        .eq('id', viewAsUserId)
        .single();

      const email = profile?.email ?? '';
      if (email && isTranslatorEmail(email)) {
        adminOverrideLocale = TRANSLATOR_LOCALE[email.toLowerCase()];
      }
    }
  }

  return <TranslatorPanelClient adminOverrideLocale={adminOverrideLocale} />;
}

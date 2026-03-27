import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { SessionPicker } from './SessionPicker';

export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Individual' });
  return { title: t('title') };
}

async function getIndividualSessions() {
  const supabase = await createSupabaseServer();

  const { data: products } = await supabase
    .from('products')
    .select(`
      id, name, slug, description, metadata,
      prices ( id, stripe_price_id, amount, currency )
    `)
    .in('slug', ['sesja-natalia', 'sesja-natalia-agata', 'sesja-natalia-justyna'])
    .eq('is_active', true);

  return products || [];
}

// Pre-session options keyed by session type slug (natalia_agata / natalia_justyna)
async function getPreSessionOptions(userId: string | null) {
  const db = createSupabaseServiceRole();

  // Fetch paid pre-session settings for assistant session types
  const { data: settings } = await db
    .from('pre_session_settings')
    .select('staff_member_id, stripe_price_id, price_pln, staff_members!inner(id, name, slug, session_types)')
    .eq('is_enabled', true)
    .not('stripe_price_id', 'is', null)
    .not('price_pln', 'is', null);

  if (!settings || settings.length === 0) return {};

  // Check if user already has active eligibility for these assistants
  const staffIds = settings.map((s: any) => s.staff_member_id);
  const existingEligibilityIds = new Set<string>();
  if (userId) {
    const { data: existing } = await db
      .from('pre_session_eligibility')
      .select('staff_member_id')
      .eq('user_id', userId)
      .in('staff_member_id', staffIds)
      .eq('is_active', true);
    (existing || []).forEach((e: any) => existingEligibilityIds.add(e.staff_member_id));
  }

  // Map assistant slug → session type
  const SESSION_TYPE_BY_SLUG: Record<string, string> = {
    agata: 'natalia_agata',
    justyna: 'natalia_justyna',
  };

  const STAFF_NAME_WITH: Record<string, string> = {
    agata: 'Agatą',
    justyna: 'Justyną',
  };

  const result: Record<string, { staffId: string; staffName: string; staffNameWith: string; priceId: string; pricePln: number }> = {};
  for (const s of settings as any[]) {
    const staff = s.staff_members;
    const sessionType = SESSION_TYPE_BY_SLUG[staff.slug];
    if (!sessionType) continue;
    // Skip if user already has eligibility
    if (existingEligibilityIds.has(s.staff_member_id)) continue;
    result[sessionType] = {
      staffId: s.staff_member_id,
      staffName: staff.name,
      staffNameWith: STAFF_NAME_WITH[staff.slug] || staff.name,
      priceId: s.stripe_price_id,
      pricePln: Math.round(s.price_pln / 100), // convert grosz → PLN for display
    };
  }
  return result;
}

export default async function IndividualSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Individual' });

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const [sessions, preSessionOptions] = await Promise.all([
    getIndividualSessions(),
    getPreSessionOptions(user?.id ?? null),
  ]);

  // Transform for client component
  const sessionOptions = sessions.map((s: any) => {
    const price = s.prices?.[0];
    return {
      slug: s.slug,
      name: s.name,
      description: s.description,
      amount: price?.amount || 0,
      currency: price?.currency || 'pln',
      priceId: price?.stripe_price_id || '',
      sessionType: s.metadata?.session_type || '',
    };
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-serif font-bold text-htg-fg mb-4">
          {t('title')}
        </h1>
        <p className="text-htg-fg-muted text-lg max-w-2xl mx-auto">
          {t('subtitle')}
        </p>
      </div>

      {/* How it works */}
      <div className="bg-htg-surface rounded-xl p-6 mb-10">
        <h2 className="font-serif font-semibold text-lg text-htg-fg mb-4">{t('how_title')}</h2>
        <ol className="space-y-3">
          {['step_1', 'step_2', 'step_3', 'step_4'].map((key, i) => (
            <li key={key} className="flex items-start gap-3 text-sm text-htg-fg">
              <span className="shrink-0 w-7 h-7 bg-htg-sage text-white rounded-full flex items-center justify-center text-xs font-bold">
                {i + 1}
              </span>
              <span className="pt-0.5">{t(key)}</span>
            </li>
          ))}
        </ol>
      </div>

      <SessionPicker
        sessions={sessionOptions}
        preSessionOptions={preSessionOptions}
        labels={{
          choose: t('choose_session'),
          date_label: t('date_label'),
          date_hint: t('date_hint'),
          topics_label: t('topics_label'),
          topics_placeholder: t('topics_placeholder'),
          buy: t('buy'),
          cancel_policy: t('cancel_policy'),
          per_session: t('per_session'),
        }}
      />
    </div>
  );
}

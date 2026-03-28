import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { locales, Link } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { Gift, ArrowLeft, CheckCircle2, Clock, XCircle } from 'lucide-react';
import GiftManagement from './GiftManagement';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function PodarowaneSesje({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const db = createSupabaseServiceRole();

  // Gifts Iwona sent (purchased_by = user)
  const { data: sentGifts } = await db
    .from('session_gifts')
    .select(`
      id, recipient_email, status, claim_token, message, claimed_at, created_at,
      entitlements!inner (
        id, type, valid_until,
        products ( name )
      )
    `)
    .eq('purchased_by', user.id)
    .order('created_at', { ascending: false });

  // Gifts received (recipient_user_id = user OR matched by email)
  const { data: userProfile } = await db
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .single();

  const { data: receivedGifts } = await db
    .from('session_gifts')
    .select(`
      id, purchased_by, recipient_email, status, claim_token, message, claimed_at, created_at,
      entitlements!inner ( id, type, valid_until, products ( name ) )
    `)
    .or(`recipient_user_id.eq.${user.id},recipient_email.eq.${userProfile?.email ?? ''}`)
    .neq('purchased_by', user.id)
    .order('created_at', { ascending: false });

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://htgcyou.com';

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link href={`/${locale}/konto`} className="text-htg-fg-muted hover:text-htg-fg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-xl font-serif font-semibold text-htg-fg flex items-center gap-2">
            <Gift className="w-5 h-5 text-htg-warm" />
            Podarowane sesje
          </h2>
          <p className="text-sm text-htg-fg-muted">Sesje kupione dla innych lub otrzymane w prezencie</p>
        </div>
      </div>

      <GiftManagement
        sentGifts={(sentGifts ?? []) as any[]}
        receivedGifts={(receivedGifts ?? []) as any[]}
        baseUrl={baseUrl}
        locale={locale}
      />
    </div>
  );
}

import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { getEffectiveUser } from '@/lib/admin/effective-user';
import AccountUpdateClient from './AccountUpdateClient';
import { ProfileForm } from '@/components/konto/ProfileForm';
import { PasskeySection } from '@/components/konto/PasskeySection';
import { NotificationPreferences } from '@/components/community/NotificationPreferences';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function AktualizacjaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Account' });

  const { userId, supabase } = await getEffectiveUser();

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, phone, email, created_at, wix_created_at')
    .eq('id', userId)
    .single();

  // Effective account creation date: WIX original date takes precedence
  const accountCreatedAt: string =
    (profile as any)?.wix_created_at ?? profile?.created_at ?? new Date().toISOString();

  // Fetch consents
  const { data: consents } = await supabase
    .from('consent_records')
    .select('id, consent_type, granted, consent_text, created_at')
    .eq('user_id', userId)
    .eq('granted', true)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-10">
      {/* Section 1: Account update (client component — loads its own data) */}
      <AccountUpdateClient />

      {/* Section 2: Profile */}
      <div className="border-t border-htg-card-border pt-8 space-y-8">
        <h2 className="text-xl font-serif font-semibold text-htg-fg">{t('profile')}</h2>

        <ProfileForm
          email={profile?.email || ''}
          displayName={profile?.display_name || ''}
          phone={profile?.phone || ''}
          consents={consents || []}
          accountCreatedAt={accountCreatedAt}
          labels={{
            name: t('profile_name'),
            email: t('profile_email'),
            phone: t('profile_phone'),
            save: t('profile_save'),
            saved: t('profile_saved'),
            gdprConsents: t('gdpr_consents'),
            gdprGranted: t('gdpr_granted', { date: '' }),
            gdprRevoke: t('gdpr_revoke'),
            deleteAccount: t('delete_account'),
          }}
        />

        <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
          <PasskeySection
            labels={{
              title: t('passkey_title'),
              add: t('passkey_add'),
              remove: t('passkey_remove'),
              noPasskeys: t('passkey_none'),
              namePrompt: t('passkey_name_prompt'),
              namePlaceholder: t('passkey_name_placeholder'),
              added: t('passkey_added'),
              lastUsed: t('passkey_last_used'),
              never: t('passkey_never'),
              confirm_remove: t('passkey_confirm_remove'),
              success_added: t('passkey_success_added'),
              success_removed: t('passkey_success_removed'),
              error_generic: t('passkey_error'),
              not_supported: t('passkey_not_supported'),
            }}
          />
        </div>

        <div>
          <h2 className="text-xl font-serif font-semibold text-htg-fg mb-4">
            Powiadomienia społeczności
          </h2>
          <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
            <NotificationPreferences />
          </div>
        </div>
      </div>
    </div>
  );
}

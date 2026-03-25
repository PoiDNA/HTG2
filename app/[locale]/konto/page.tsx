import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales, Link } from '@/i18n-config';
import { Play } from 'lucide-react';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function MySessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Account' });

  // TODO: Fetch user's entitled sessions from Supabase
  const sessions: any[] = [];

  return (
    <div>
      <h2 className="text-xl font-serif font-semibold text-htg-fg mb-6">{t('my_sessions')}</h2>

      {sessions.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 text-center">
          <Play className="w-12 h-12 text-htg-fg-muted mx-auto mb-4" />
          <p className="text-htg-fg-muted mb-4">{t('no_sessions')}</p>
          <Link
            href="/sesje"
            className="inline-block bg-htg-sage text-white px-6 py-3 rounded-lg font-medium hover:bg-htg-sage-dark transition-colors"
          >
            {t('browse_sessions')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.map((session: any) => (
            <div key={session.id} className="bg-htg-card border border-htg-card-border rounded-xl p-4">
              <h3 className="font-semibold text-htg-fg">{session.title}</h3>
              <p className="text-sm text-htg-fg-muted">
                {t('valid_until', { date: session.validUntil })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

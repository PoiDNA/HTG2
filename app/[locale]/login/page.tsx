import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { isAnyPortal } from '@/lib/portal';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isPortal = isAnyPortal((await headers()).get('host'));

  return (
    <div className={`flex items-center justify-center px-6 ${isPortal ? 'min-h-dvh' : 'min-h-[calc(100dvh-73px)]'}`}>
      <div className="w-full max-w-md">
        {/* Heading — visible only on main HTG (not portal) */}
        {!isPortal && (
          <div className="mb-8">
            <h1 className="text-3xl font-serif font-bold text-htg-fg mb-2">
              Otwórz przestrzeń
            </h1>
            <p className="text-xs tracking-[0.22em] uppercase text-htg-fg-muted/60">
              logowanie
            </p>
          </div>
        )}
        <LoginForm />
      </div>
    </div>
  );
}

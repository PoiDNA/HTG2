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
        <LoginForm />
      </div>
    </div>
  );
}

import { setRequestLocale } from 'next-intl/server';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex items-center justify-center px-6 min-h-[calc(100dvh-73px)]">
      <div className="w-full max-w-md">
        <LoginForm />
      </div>
    </div>
  );
}

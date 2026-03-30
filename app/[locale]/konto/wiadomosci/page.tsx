import { setRequestLocale } from 'next-intl/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import PortalMessages from '@/components/account/PortalMessages';

export default async function PortalMessagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-htg-fg mb-6">Centrum Kontaktu</h1>
      <PortalMessages />
    </div>
  );
}

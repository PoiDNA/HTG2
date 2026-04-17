import { setRequestLocale } from 'next-intl/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import RadioPlayer from '@/components/fragments/RadioPlayer';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Radio Momentów — HTG',
};

type Props = { params: Promise<{ locale: string }> };

export default async function RadioPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <RadioPlayer scope="all" />
    </div>
  );
}

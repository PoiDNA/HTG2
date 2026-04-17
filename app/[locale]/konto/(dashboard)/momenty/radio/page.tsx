import { setRequestLocale } from 'next-intl/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import RadioPageClient from './RadioPageClient';
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

  // Prefetch user categories for the scope selector
  const { data: categories } = await supabase
    .from('user_categories')
    .select('id, name, color')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <RadioPageClient categories={categories ?? []} />
    </div>
  );
}

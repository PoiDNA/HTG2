import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { locales } from '@/i18n-config';

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const locale = body?.locale;

  if (!locale || !(locales as readonly string[]).includes(locale)) {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
  }

  const { error } = await supabase
    .from('profiles')
    .update({ preferred_locale: locale })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to update locale' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

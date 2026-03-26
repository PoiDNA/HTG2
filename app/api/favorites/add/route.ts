import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { email } = await request.json();
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  // Find user by email
  const { data: target } = await supabase
    .from('profiles')
    .select('id, email, display_name')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (!target) return NextResponse.json({ error: 'Użytkownik nie znaleziony' }, { status: 404 });
  if (target.id === user.id) return NextResponse.json({ error: 'Nie możesz dodać siebie' }, { status: 400 });

  const { error } = await supabase.from('user_favorites').insert({
    user_id: user.id,
    favorite_user_id: target.id,
  });

  if (error?.code === '23505') {
    return NextResponse.json({ error: 'Już w polubionych' }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, favorite: { id: target.id, email: target.email, name: target.display_name } });
}

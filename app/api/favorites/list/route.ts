import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // My favorites
  const { data: myFavs } = await supabase
    .from('user_favorites')
    .select('favorite_user_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // Get profiles for favorites
  const favIds = myFavs?.map(f => f.favorite_user_id) || [];
  let favorites: any[] = [];
  if (favIds.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .in('id', favIds);
    favorites = data || [];
  }

  // Who added me
  const { data: addedMe } = await supabase
    .from('user_favorites')
    .select('user_id, created_at')
    .eq('favorite_user_id', user.id)
    .order('created_at', { ascending: false });

  const addedMeIds = addedMe?.map(f => f.user_id) || [];
  let followers: any[] = [];
  if (addedMeIds.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .in('id', addedMeIds);
    followers = data || [];
  }

  return NextResponse.json({ favorites, followers });
}

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * POST /api/fragments/shares
 *
 * Create a category share (owner → recipient or link-based).
 *
 * Body: {
 *   category_id: string,
 *   recipient_user_id?: string,  // direct share; omit for link-only
 *   can_resave?: boolean,         // default false
 *   expires_at?: string,          // ISO timestamp or null
 * }
 *
 * Guard: category must not contain any booking_recording saves.
 * DB trigger `category_shares_shareable` is a fail-safe — this check is the
 * API-level guard with a user-friendly error message.
 *
 * Response:
 *   { share: { id, share_token, category_id, recipient_user_id, expires_at, created_at } }
 */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // List shares created by the user
  const { data, error } = await supabase
    .from('category_shares')
    .select('id, share_token, category_id, recipient_user_id, can_resave, expires_at, revoked_at, created_at, user_categories(name, color)')
    .eq('owner_user_id', user.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ shares: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.category_id) return NextResponse.json({ error: 'category_id required' }, { status: 400 });

  const { category_id, recipient_user_id, can_resave = false, expires_at } = body as {
    category_id: string;
    recipient_user_id?: string;
    can_resave?: boolean;
    expires_at?: string | null;
  };

  const db = createSupabaseServiceRole();

  // Verify category ownership
  const { data: cat } = await db
    .from('user_categories')
    .select('id, user_id')
    .eq('id', category_id)
    .eq('user_id', user.id)
    .single();

  if (!cat) return NextResponse.json({ error: 'Category not found' }, { status: 404 });

  // API-level guard: reject if category (or any descendant) contains booking_recording saves
  // DB trigger is the fail-safe; this gives a user-friendly error.
  const { data: recordingSaves } = await db
    .from('user_fragment_saves')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', category_id)
    .not('booking_recording_id', 'is', null)
    .limit(1);

  // recordingSaves is null on no results (head:true); check count via count: exact approach
  const { count: recordingCount } = await db
    .from('user_fragment_saves')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', category_id)
    .not('booking_recording_id', 'is', null);

  if ((recordingCount ?? 0) > 0) {
    return NextResponse.json({
      error: 'cannot_share_recording_category',
      message: 'Nie można udostępniać kategorii zawierającej fragmenty Twoich nagrań.',
    }, { status: 400 });
  }

  // Insert share — DB trigger provides recursive subtree check
  const { data: share, error } = await db
    .from('category_shares')
    .insert({
      category_id,
      owner_user_id: user.id,
      recipient_user_id: recipient_user_id ?? null,
      can_resave,
      expires_at: expires_at ?? null,
    })
    .select('id, share_token, category_id, recipient_user_id, can_resave, expires_at, created_at')
    .single();

  if (error) {
    if (error.code === 'check_violation' || error.message?.includes('booking-recording')) {
      return NextResponse.json({
        error: 'cannot_share_recording_category',
        message: 'Nie można udostępniać kategorii zawierającej fragmenty nagrań.',
      }, { status: 400 });
    }
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Share already exists for this recipient' }, { status: 409 });
    }
    console.error('[shares] POST failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ share }, { status: 201 });
}

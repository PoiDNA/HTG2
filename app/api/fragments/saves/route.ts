import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';
import { userHasFragmentAccess } from '@/lib/access/fragment-access';

/**
 * GET /api/fragments/saves
 * List user's fragment saves with optional filters.
 * Query params:
 *   category_id  — filter by category
 *   favorites    — "true" → only is_favorite
 *   recordings   — "true" → only booking_recording saves (🎙 Twoje Nagrania Sesji)
 *   session_id   — filter by session_template_id
 *   limit        — default 50, max 200
 *   offset       — default 0
 *
 * POST /api/fragments/saves
 * Create a new save. Requires fragment_access entitlement (admin bypass).
 * Body: {
 *   session_template_id?: string,
 *   booking_recording_id?: string,
 *   fragment_type: 'predefined' | 'custom',
 *   session_fragment_id?: string,      // predefined only
 *   fallback_start_sec?: number,       // predefined only (snapshot at save time)
 *   fallback_end_sec?: number,
 *   custom_start_sec?: number,         // custom only
 *   custom_end_sec?: number,
 *   custom_title?: string,
 *   note?: string,
 *   category_id?: string,
 *   is_favorite?: boolean,
 * }
 */

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const categoryId = params.get('category_id');
  const favorites = params.get('favorites') === 'true';
  const recordings = params.get('recordings') === 'true';
  const sessionId = params.get('session_id');
  const limit = Math.min(Number(params.get('limit') ?? 50), 200);
  const offset = Number(params.get('offset') ?? 0);

  let query = supabase
    .from('user_fragment_saves')
    .select(`
      id, user_id, session_template_id, booking_recording_id,
      fragment_type, session_fragment_id,
      custom_start_sec, custom_end_sec, custom_title,
      fallback_start_sec, fallback_end_sec,
      note, category_id, is_favorite, last_played_at, play_count,
      created_at, updated_at,
      session_fragments(id, ordinal, start_sec, end_sec, title, title_i18n, is_impulse),
      session_templates(id, title, slug, thumbnail_url),
      user_categories(id, name, color)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (categoryId) query = query.eq('category_id', categoryId);
  if (favorites)  query = query.eq('is_favorite', true);
  if (recordings) query = query.not('booking_recording_id', 'is', null);
  if (sessionId)  query = query.eq('session_template_id', sessionId);

  const { data, error } = await query;
  if (error) {
    console.error('[saves] GET failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saves: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = isAdminEmail(user.email ?? '');
  const db = createSupabaseServiceRole();

  // Fragment feature gate (admin bypass)
  if (!isAdmin) {
    const hasAccess = await userHasFragmentAccess(user.id, db);
    if (!hasAccess) {
      return NextResponse.json({
        error: 'fragment_access_required',
        message: 'Dostęp do fragmentów wymaga aktywnej subskrypcji.',
      }, { status: 403 });
    }
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const {
    session_template_id,
    booking_recording_id,
    fragment_type,
    session_fragment_id,
    fallback_start_sec,
    fallback_end_sec,
    custom_start_sec,
    custom_end_sec,
    custom_title,
    note,
    category_id,
    is_favorite = false,
  } = body;

  // Source XOR validation
  if (!session_template_id && !booking_recording_id) {
    return NextResponse.json({ error: 'session_template_id or booking_recording_id required' }, { status: 400 });
  }
  if (session_template_id && booking_recording_id) {
    return NextResponse.json({ error: 'Only one of session_template_id or booking_recording_id allowed' }, { status: 400 });
  }
  if (!fragment_type || !['predefined', 'custom'].includes(fragment_type)) {
    return NextResponse.json({ error: 'fragment_type must be predefined or custom' }, { status: 400 });
  }
  if (fragment_type === 'predefined' && booking_recording_id) {
    return NextResponse.json({ error: 'Predefined fragments are only available for VOD sessions' }, { status: 400 });
  }

  // Validate session/recording existence and ownership
  if (session_template_id) {
    const { data: session } = await db
      .from('session_templates')
      .select('id, is_published')
      .eq('id', session_template_id)
      .single();
    if (!session || (!session.is_published && !isAdmin)) {
      return NextResponse.json({ error: 'Session not found or not published' }, { status: 404 });
    }
  }

  if (booking_recording_id) {
    const { data: access } = await db
      .from('booking_recording_access')
      .select('id')
      .eq('recording_id', booking_recording_id)
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .maybeSingle();
    if (!access && !isAdmin) {
      return NextResponse.json({ error: 'Recording access not found' }, { status: 403 });
    }
  }

  // Validate fragment snapshot for predefined saves
  if (fragment_type === 'predefined') {
    if (session_fragment_id) {
      // Live predefined: check fragment belongs to session
      const { data: fragment } = await db
        .from('session_fragments')
        .select('id, session_template_id, start_sec, end_sec')
        .eq('id', session_fragment_id)
        .single();
      if (!fragment || fragment.session_template_id !== session_template_id) {
        return NextResponse.json({ error: 'Fragment not found or does not belong to session' }, { status: 400 });
      }
    }
    if (typeof fallback_start_sec !== 'number' || typeof fallback_end_sec !== 'number') {
      return NextResponse.json({ error: 'fallback_start_sec and fallback_end_sec required for predefined saves' }, { status: 400 });
    }
  } else {
    if (typeof custom_start_sec !== 'number' || typeof custom_end_sec !== 'number') {
      return NextResponse.json({ error: 'custom_start_sec and custom_end_sec required for custom saves' }, { status: 400 });
    }
    if (custom_end_sec <= custom_start_sec) {
      return NextResponse.json({ error: 'custom_end_sec must be greater than custom_start_sec' }, { status: 400 });
    }
  }

  // Validate category ownership
  if (category_id) {
    const { data: cat } = await db
      .from('user_categories')
      .select('id, user_id')
      .eq('id', category_id)
      .single();
    if (!cat || cat.user_id !== user.id) {
      return NextResponse.json({ error: 'Category not found' }, { status: 400 });
    }
  }

  const { data, error } = await db
    .from('user_fragment_saves')
    .insert({
      user_id: user.id,
      session_template_id: session_template_id ?? null,
      booking_recording_id: booking_recording_id ?? null,
      fragment_type,
      session_fragment_id: session_fragment_id ?? null,
      fallback_start_sec: fallback_start_sec ?? null,
      fallback_end_sec: fallback_end_sec ?? null,
      custom_start_sec: custom_start_sec ?? null,
      custom_end_sec: custom_end_sec ?? null,
      custom_title: custom_title ?? null,
      note: note ?? null,
      category_id: category_id ?? null,
      is_favorite,
    })
    .select('id, fragment_type, session_template_id, booking_recording_id, session_fragment_id, is_favorite, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'You have already saved this fragment' }, { status: 409 });
    }
    if (error.code === 'check_violation' || error.code === '23514') {
      return NextResponse.json({ error: 'Invalid fragment save data: ' + error.message }, { status: 422 });
    }
    console.error('[saves] POST failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ save: data }, { status: 201 });
}

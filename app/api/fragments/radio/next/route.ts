import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * POST /api/fragments/radio/next
 *
 * Returns the next fragment for radio playback (shuffle, non-repeat window).
 * Only returns VOD session_template saves — booking_recording saves are excluded
 * (radio only supports session_template context in MVP; no fragment_radio for recordings).
 *
 * Body:
 *   scope: 'all' | 'favorites' | 'category' | 'session' | 'pytania'
 *   scopeId?: string          — category_id or session_template_id when scope = category|session
 *   excludeIds?: string[]     — saveIds / sessionFragmentIds to exclude (rolling window, max 20)
 *
 * Response:
 *   { save: { id, session_template_id, fragment_type, fallback_start_sec, fallback_end_sec,
 *             custom_start_sec, custom_end_sec, custom_title,
 *             session_templates: { id, title },
 *             pytaniaSessionFragmentId? } }
 *   or { save: null } when pool exhausted
 */

const MAX_EXCLUDE = 20;

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { scope = 'all', scopeId, excludeIds = [] } = body as {
    scope?: 'all' | 'favorites' | 'category' | 'session' | 'pytania' | 'slowo';
    scopeId?: string;
    excludeIds?: string[];
  };

  // Validate and clamp excludeIds
  const safeExcludes: string[] = Array.isArray(excludeIds)
    ? excludeIds.filter(id => typeof id === 'string').slice(0, MAX_EXCLUDE)
    : [];

  // ── Pytania scope: recognized questions with answer fragments ─────────────
  if (scope === 'pytania') {
    const db = createSupabaseServiceRole();
    let pytQuery = db
      .from('session_questions')
      .select(`
        id, title, answer_fragment_id,
        session_fragments!answer_fragment_id(
          id, start_sec, end_sec,
          session_template_id,
          session_templates(id, title, slug)
        )
      `)
      .eq('status', 'rozpoznane')
      .not('answer_fragment_id', 'is', null);

    // Exclude recently played (by session_fragment_id)
    if (safeExcludes.length > 0) {
      pytQuery = pytQuery.not('answer_fragment_id', 'in', `(${safeExcludes.join(',')})`);
    }

    const { data: questions, error: pytError } = await pytQuery;
    if (pytError) {
      console.error('[fragments/radio/next pytania] query failed', pytError);
      return NextResponse.json({ error: pytError.message }, { status: 500 });
    }
    if (!questions || questions.length === 0) {
      return NextResponse.json({ save: null });
    }

    const idx = Math.floor(Math.random() * questions.length);
    const q = questions[idx];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frag: any = Array.isArray(q.session_fragments) ? q.session_fragments[0] : q.session_fragments;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const st: any = frag ? (Array.isArray(frag.session_templates) ? frag.session_templates[0] : frag.session_templates) : null;

    return NextResponse.json({
      save: {
        id: frag?.id ?? q.answer_fragment_id,  // session_fragment_id used as excludeId key
        session_template_id: frag?.session_template_id ?? null,
        fragment_type: 'predefined',
        fallback_start_sec: frag?.start_sec ?? 0,
        fallback_end_sec: frag?.end_sec ?? 0,
        custom_start_sec: null,
        custom_end_sec: null,
        custom_title: q.title,   // question title shown in radio UI
        session_templates: { id: st?.id ?? '', title: st?.title ?? '', slug: st?.slug ?? '' },
        pytaniaSessionFragmentId: frag?.id ?? q.answer_fragment_id,
      },
    });
  }
  // ── Słowo scope: admin-curated is_slowo=true fragments ───────────────────
  if (scope === 'slowo') {
    const db = createSupabaseServiceRole();
    let slwoQuery = db
      .from('session_fragments')
      .select(`
        id, start_sec, end_sec, title, session_template_id,
        session_templates!inner(id, title, slug, is_published)
      `)
      .eq('is_slowo', true)
      .eq('session_templates.is_published', true);

    // Exclude recently played (by session_fragment_id)
    if (safeExcludes.length > 0) {
      slwoQuery = slwoQuery.not('id', 'in', `(${safeExcludes.join(',')})`);
    }

    const { data: fragments, error: slwoError } = await slwoQuery;
    if (slwoError) {
      console.error('[fragments/radio/next slowo] query failed', slwoError);
      return NextResponse.json({ error: slwoError.message }, { status: 500 });
    }
    if (!fragments || fragments.length === 0) {
      return NextResponse.json({ save: null });
    }

    const idx = Math.floor(Math.random() * fragments.length);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f: any = fragments[idx];
    const st = Array.isArray(f.session_templates) ? f.session_templates[0] : f.session_templates;

    return NextResponse.json({
      save: {
        id: f.id,   // session_fragment_id used as excludeId key
        session_template_id: f.session_template_id ?? null,
        fragment_type: 'predefined',
        fallback_start_sec: f.start_sec ?? 0,
        fallback_end_sec: f.end_sec ?? 0,
        custom_start_sec: null,
        custom_end_sec: null,
        custom_title: f.title,   // fragment title shown in radio UI
        session_templates: { id: st?.id ?? '', title: st?.title ?? '', slug: st?.slug ?? '' },
        slowoSessionFragmentId: f.id,   // signals fragment-token path in engine
      },
    });
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Build query — only session_template saves, not booking_recordings
  let query = supabase
    .from('user_fragment_saves')
    .select(`
      id, session_template_id, fragment_type,
      fallback_start_sec, fallback_end_sec,
      custom_start_sec, custom_end_sec, custom_title,
      session_templates!inner(id, title, slug)
    `)
    .eq('user_id', user.id)
    .not('session_template_id', 'is', null)
    .is('booking_recording_id', null);

  // Apply scope filter
  switch (scope) {
    case 'favorites':
      query = query.eq('is_favorite', true);
      break;
    case 'category':
      if (scopeId) query = query.eq('category_id', scopeId);
      break;
    case 'session':
      if (scopeId) query = query.eq('session_template_id', scopeId);
      break;
    // 'all': no additional filter
  }

  // Exclude recently played fragments (non-repeat window)
  if (safeExcludes.length > 0) {
    query = query.not('id', 'in', `(${safeExcludes.join(',')})`);
  }

  // Fetch candidates and pick one at random
  const { data: candidates, error } = await query;

  if (error) {
    console.error('[fragments/radio/next] query failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!candidates || candidates.length === 0) {
    // Pool exhausted — client should reset excludeIds and retry
    return NextResponse.json({ save: null });
  }

  // Random pick
  const idx = Math.floor(Math.random() * candidates.length);
  const next = candidates[idx];

  return NextResponse.json({ save: next });
}

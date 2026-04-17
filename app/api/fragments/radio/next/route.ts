import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

/**
 * POST /api/fragments/radio/next
 *
 * Returns the next fragment for radio playback (shuffle, non-repeat window).
 * Only returns VOD session_template saves — booking_recording saves are excluded
 * (radio only supports session_template context in MVP; no fragment_radio for recordings).
 *
 * Body:
 *   scope: 'all' | 'favorites' | 'category' | 'session'
 *   scopeId?: string          — category_id or session_template_id when scope = category|session
 *   excludeIds?: string[]     — saveIds to exclude (rolling non-repeat window, max 20)
 *
 * Response:
 *   { save: { id, session_template_id, fragment_type, fallback_start_sec, fallback_end_sec,
 *             custom_start_sec, custom_end_sec, custom_title,
 *             session_templates: { id, title } } }
 *   or { save: null } when the pool is exhausted (client resets excludeIds and retries)
 */

const MAX_EXCLUDE = 20;

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { scope = 'all', scopeId, excludeIds = [] } = body as {
    scope?: 'all' | 'favorites' | 'category' | 'session';
    scopeId?: string;
    excludeIds?: string[];
  };

  // Validate and clamp excludeIds
  const safeExcludes: string[] = Array.isArray(excludeIds)
    ? excludeIds.filter(id => typeof id === 'string').slice(0, MAX_EXCLUDE)
    : [];

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

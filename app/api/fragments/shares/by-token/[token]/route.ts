import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { checkRateLimit, logRateLimitAction } from '@/lib/rate-limit/check';

/**
 * GET /api/fragments/shares/by-token/[token]
 *
 * Look up a share by its public share_token (UUID).
 * Login required — unauthenticated users are redirected to login page by middleware.
 *
 * Anti-enumeration:
 *   - Rate-limited (10 req/min per user)
 *   - Field allowlist: only public-safe fields are returned (no owner email/id)
 *
 * Returns:
 *   { share: { id, category_name, owner_display_name, can_resave, expires_at },
 *     saves: [{ id, title, range, session_title, session_slug }] }
 *   — or 404 if token is invalid, revoked, or expired.
 */

type Params = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Rate limit: anti-enumeration
  const rateLimited = await checkRateLimit(user.id, 'share_token_lookup');
  if (rateLimited) {
    return NextResponse.json({ error: 'Zbyt wiele żądań. Spróbuj za chwilę.' }, { status: 429 });
  }
  await logRateLimitAction(user.id, 'share_token_lookup');

  const { token } = await params;

  const db = createSupabaseServiceRole();

  // Look up share by token (active, not expired)
  const { data: share } = await db
    .from('category_shares')
    .select('id, category_id, owner_user_id, recipient_user_id, can_resave, expires_at, revoked_at')
    .eq('share_token', token)
    .is('revoked_at', null)
    .single();

  if (!share) {
    return NextResponse.json({ error: 'Share not found or expired' }, { status: 404 });
  }

  // Check expiry
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Share expired' }, { status: 404 });
  }

  // Check recipient restriction (direct share)
  if (share.recipient_user_id && share.recipient_user_id !== user.id) {
    return NextResponse.json({ error: 'Share not found or expired' }, { status: 404 });
  }

  // Fetch category name
  const { data: category } = await db
    .from('user_categories')
    .select('id, name, color')
    .eq('id', share.category_id)
    .single();

  // Fetch saves in this category — field allowlist only (no owner PII)
  // booking_recording saves never appear (they can't be in a shared category by design)
  const { data: rawSaves } = await db
    .from('user_fragment_saves')
    .select(`
      id, fragment_type,
      custom_start_sec, custom_end_sec, custom_title,
      fallback_start_sec, fallback_end_sec,
      session_fragments(title, title_i18n),
      session_templates!inner(id, title, slug)
    `)
    .eq('category_id', share.category_id)
    .is('booking_recording_id', null)   // safety: no recordings in shared categories
    .order('created_at', { ascending: false })
    .limit(100);

  // Transform to field-allowlist (no owner info)
  const saves = (rawSaves ?? []).map((s: any) => {
    const startSec = s.fragment_type === 'predefined' ? s.fallback_start_sec : s.custom_start_sec;
    const endSec = s.fragment_type === 'predefined' ? s.fallback_end_sec : s.custom_end_sec;
    const fragmentTitle = s.custom_title
      ?? (Array.isArray(s.session_fragments) ? s.session_fragments[0]?.title : s.session_fragments?.title)
      ?? null;
    const st = Array.isArray(s.session_templates) ? s.session_templates[0] : s.session_templates;
    return {
      id: s.id,
      title: fragmentTitle ?? `${Math.floor((startSec ?? 0) / 60)}:${String(Math.floor((startSec ?? 0) % 60)).padStart(2, '0')} – ${Math.floor((endSec ?? 0) / 60)}:${String(Math.floor((endSec ?? 0) % 60)).padStart(2, '0')}`,
      start_sec: startSec,
      end_sec: endSec,
      session_title: st?.title ?? null,
      session_slug: st?.slug ?? null,
    };
  });

  return NextResponse.json({
    share: {
      id: share.id,
      category_name: category?.name ?? 'Fragmenty',
      category_color: category?.color ?? null,
      can_resave: share.can_resave,
      expires_at: share.expires_at,
    },
    saves,
  });
}

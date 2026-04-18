import { NextRequest, NextResponse } from 'next/server';
import { requirePytaniaAuth } from '@/lib/pytania/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { signMedia } from '@/lib/media-signing';
import { checkRateLimit, logRateLimitAction } from '@/lib/rate-limit/check';

/**
 * POST /api/pytania/answer-token
 * Body: { sessionFragmentId: string, deviceId: string }
 *
 * Returns a signed playback URL for a session fragment that is assigned as
 * an answer to a pytania question. Accessible to po_sesji users and staff.
 * Does NOT require is_impulse=true (unlike /api/video/fragment-token path B).
 */
export async function POST(request: NextRequest) {
  const auth = await requirePytaniaAuth();
  if ('error' in auth) return auth.error;
  if (!auth.canAccess) {
    return NextResponse.json({ allowed: false, title: 'Brak dostępu', message: 'Dostęp tylko dla uczestników sesji.' });
  }

  // Rate limit
  const rateLimited = await checkRateLimit(auth.user.id, 'fragment_token');
  if (rateLimited) {
    return NextResponse.json({ error: 'Zbyt wiele żądań. Spróbuj za chwilę.' }, { status: 429 });
  }
  await logRateLimitAction(auth.user.id, 'fragment_token');

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { sessionFragmentId, deviceId } = body as { sessionFragmentId?: string; deviceId?: string };
  if (!sessionFragmentId) return NextResponse.json({ error: 'sessionFragmentId required' }, { status: 400 });
  if (!deviceId) return NextResponse.json({ error: 'deviceId required' }, { status: 400 });

  const db = createSupabaseServiceRole();

  // Verify fragment is actually used as a pytania answer
  const { data: question } = await db
    .from('session_questions')
    .select('id')
    .eq('answer_fragment_id', sessionFragmentId)
    .limit(1)
    .single();

  if (!question) {
    return NextResponse.json({
      allowed: false,
      title: 'Fragment niedostępny',
      message: 'Ten fragment nie jest przypisany jako odpowiedź.',
    });
  }

  // Fetch fragment + session media info
  const { data: fragment } = await db
    .from('session_fragments')
    .select(`
      id, start_sec, end_sec,
      session_templates!inner(bunny_video_id, bunny_library_id, is_published)
    `)
    .eq('id', sessionFragmentId)
    .single();

  if (!fragment) {
    return NextResponse.json({
      allowed: false,
      title: 'Fragment niedostępny',
      message: 'Fragment nie istnieje.',
    });
  }

  const st = (fragment as any).session_templates;

  if (!auth.isAdmin && !st.is_published) {
    return NextResponse.json({
      allowed: false,
      title: 'Sesja niedostępna',
      message: 'Źródłowa sesja nie jest opublikowana.',
    });
  }

  const signed = signMedia({
    bunny_video_id: st.bunny_video_id,
    bunny_library_id: st.bunny_library_id,
    backup_storage_path: null,
  }, 3600);

  if (!signed) {
    return NextResponse.json({
      allowed: false,
      title: 'Nagranie niedostępne',
      message: 'Plik nagrania nie został odnaleziony.',
    });
  }

  if (!auth.isAdmin) {
    await db.from('active_streams').upsert({
      user_id: auth.user.id,
      device_id: deviceId,
      stream_context: 'fragment_review',
      last_heartbeat: new Date().toISOString(),
    }, { onConflict: 'user_id,device_id' });
  }

  return NextResponse.json({
    allowed: true,
    url: signed.url,
    deliveryType: signed.deliveryType,
    mimeType: signed.mimeType,
    expiresIn: 3600,
    startSec: fragment.start_sec,
    endSec: fragment.end_sec,
    sessionType: 'fragment_review',
  });
}

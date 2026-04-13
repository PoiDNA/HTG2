import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { translateSessionById, translateAllMissing } from '@/lib/services/translate-session-content';
import { after } from 'next/server';

/**
 * POST /api/admin/translate-sessions
 *
 * Trigger Claude API translation for session content.
 *
 * Body options:
 *   { all: true }                                             → translate all missing
 *   { table, id }                                            → translate one record (missing locales only)
 *   { table, id, force: true }                               → re-translate all locales
 */
export async function POST(request: NextRequest) {
  const result = await requireAdmin();
  if ('error' in result) return result.error;

  const body = await request.json();

  if (body.all) {
    // Fire-and-forget: runs after response is sent
    after(async () => {
      try {
        const counts = await translateAllMissing();
        console.log(`[translate-sessions] Done: ${counts.sessions} sessions, ${counts.sets} sets`);
      } catch (err) {
        console.error('[translate-sessions] Batch error:', err);
      }
    });
    return NextResponse.json({ ok: true, queued: 'all' });
  }

  const { table, id, force } = body;
  if (!table || !id) {
    return NextResponse.json({ error: 'Missing table or id' }, { status: 400 });
  }
  if (!['session_templates', 'monthly_sets'].includes(table)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
  }

  after(async () => {
    try {
      const result = await translateSessionById(table, id, !!force);
      console.log(`[translate-sessions] ${table}/${id} → ${result.localesTranslated.join(', ')}`);
    } catch (err) {
      console.error(`[translate-sessions] Error for ${table}/${id}:`, err);
    }
  });

  return NextResponse.json({ ok: true, queued: id });
}

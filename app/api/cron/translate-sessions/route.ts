import { NextRequest, NextResponse } from 'next/server';
import { translateAllMissing } from '@/lib/services/translate-session-content';

/**
 * GET /api/cron/translate-sessions
 *
 * Auto-translate session_templates and monthly_sets that have a Polish title
 * but are missing EN/DE/PT translations.
 *
 * Called by Vercel Cron (recommended schedule: daily or on-demand).
 * Only fills missing locales — never overwrites manually entered translations.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const counts = await translateAllMissing();
    return NextResponse.json({
      ok: true,
      sessions: counts.sessions,
      sets: counts.sets,
    });
  } catch (err) {
    console.error('[cron/translate-sessions]', err);
    return NextResponse.json({ error: 'Translation batch failed' }, { status: 500 });
  }
}

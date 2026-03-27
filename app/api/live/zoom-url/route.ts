import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isStaffEmail } from '@/lib/roles';

/**
 * GET /api/live/zoom-url
 * Returns the emergency backup Zoom meeting URL — staff only.
 * Kept server-side so the URL is never exposed in client bundle.
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isStaffEmail(user.email ?? '')) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const url = (process.env.ZOOM_BACKUP_URL ?? '').trim();
    if (!url) {
      return NextResponse.json({ error: 'ZOOM_BACKUP_URL not configured' }, { status: 503 });
    }

    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

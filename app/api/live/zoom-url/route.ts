import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isStaffEmail } from '@/lib/roles';

const BACKUP_ZOOM_URL = 'https://us06web.zoom.us/j/89618749712';

/**
 * GET /api/live/zoom-url?slotId=xxx
 * Returns Zoom meeting URL for a session — staff only.
 * Priority: slot-specific zoom_url → env ZOOM_BACKUP_URL → hardcoded backup
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isStaffEmail(user.email ?? '')) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const slotId = req.nextUrl.searchParams.get('slotId');

    // 1. Try slot-specific zoom_url
    if (slotId) {
      const db = createSupabaseServiceRole();
      const { data: slot } = await db
        .from('booking_slots')
        .select('zoom_url')
        .eq('id', slotId)
        .single();

      if (slot?.zoom_url) {
        return NextResponse.json({ url: slot.zoom_url, source: 'slot' });
      }
    }

    // 2. Try environment variable
    const envUrl = (process.env.ZOOM_BACKUP_URL ?? '').trim();
    if (envUrl) {
      return NextResponse.json({ url: envUrl, source: 'env' });
    }

    // 3. Hardcoded backup
    return NextResponse.json({ url: BACKUP_ZOOM_URL, source: 'backup' });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

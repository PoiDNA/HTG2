import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail } from '@/lib/roles';

/**
 * POST /api/admin/user-purchase
 * Admin manually adds a purchase/entitlement for a user.
 */
export async function POST(req: NextRequest) {
  const sessionClient = await createSupabaseServer();
  const { data: { user: adminUser } } = await sessionClient.auth.getUser();
  if (!adminUser || !isAdminEmail(adminUser.email ?? '')) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { userId, purchaseType, scopeMonth, source, notes, individualType, sessionDate, startTime, paymentStatus } = body;

  if (!userId || !purchaseType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  try {
    if (purchaseType === 'individual') {
      // Add a booking record (manual individual session)
      if (!sessionDate) {
        return NextResponse.json({ error: 'Session date required for individual sessions' }, { status: 400 });
      }

      const { error } = await db.from('bookings').insert({
        user_id: userId,
        session_type: individualType || 'natalia_solo',
        session_date: sessionDate,
        start_time: startTime || '09:00:00',
        status: 'confirmed',
        payment_status: paymentStatus || 'confirmed_paid',
        payment_notes: notes || `Dodano ręcznie przez admina (${adminUser.email}) ${new Date().toLocaleDateString('pl')}`,
      });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, type: 'booking' });
    }

    // Library entitlement (session, monthly, yearly)
    // valid_until: sessions/yearly = 5 years, monthly = end of month
    const now = new Date();
    let validUntil: string;
    if (purchaseType === 'monthly' && scopeMonth) {
      const [y, m] = scopeMonth.split('-').map(Number);
      validUntil = new Date(y, m, 1).toISOString(); // first day of next month
    } else {
      validUntil = new Date(now.getFullYear() + 5, now.getMonth(), now.getDate()).toISOString();
    }

    const entitlementData: Record<string, unknown> = {
      user_id: userId,
      type: purchaseType === 'session' ? 'session' : purchaseType === 'monthly' ? 'monthly' : 'yearly',
      source: source || 'manual',
      is_active: true,
      valid_from: now.toISOString(),
      valid_until: validUntil,
    };

    if ((purchaseType === 'monthly' || purchaseType === 'yearly') && scopeMonth) {
      entitlementData.scope_month = scopeMonth;
    }
    // Store admin notes in metadata if provided
    if (notes) {
      entitlementData.metadata = { admin_note: notes, added_by: adminUser.email, added_at: now.toISOString() };
    }

    const { error } = await db.from('entitlements').insert(entitlementData);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, type: 'entitlement' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

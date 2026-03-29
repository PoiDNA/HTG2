import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isStaffEmail, isAdminEmail } from '@/lib/roles';
import { transferToAssistant, SESSION_PAYOUT_CONFIG } from '@/lib/stripe-connect';

// POST /api/stripe/settle — settle a completed session
// Called automatically after session ends or manually by admin
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    // Only staff/admin can settle
    if (!user || (!isStaffEmail(user.email ?? '') && !isAdminEmail(user.email ?? ''))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookingId } = await request.json();
    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId required' }, { status: 400 });
    }

    const admin = createSupabaseServiceRole();

    // 1. Get settlement record
    const { data: settlement, error: settleErr } = await admin
      .from('session_settlements')
      .select('*')
      .eq('booking_id', bookingId)
      .single();

    if (settleErr || !settlement) {
      return NextResponse.json({ error: 'Settlement not found for this booking' }, { status: 404 });
    }

    // 2. Idempotency: already settled?
    if (settlement.status === 'settled') {
      return NextResponse.json({
        message: 'Already settled',
        settlement,
      });
    }

    // 3. No assistant = no transfer needed (1:1 Natalia)
    if (settlement.assistant_amount === 0 || settlement.transfer_status === 'not_applicable') {
      await admin.from('session_settlements').update({
        status: 'settled',
        transfer_status: 'not_applicable',
        updated_at: new Date().toISOString(),
      }).eq('id', settlement.id);

      return NextResponse.json({
        message: 'No transfer needed (solo session)',
        platformAmount: settlement.platform_amount,
      });
    }

    // 4. Get assistant's connected account
    if (!settlement.assistant_staff_id) {
      return NextResponse.json({ error: 'No assistant linked to this settlement' }, { status: 400 });
    }

    const { data: staffMember } = await admin
      .from('staff_members')
      .select('stripe_connected_account_id, name')
      .eq('id', settlement.assistant_staff_id)
      .single();

    if (!staffMember?.stripe_connected_account_id) {
      await admin.from('session_settlements').update({
        transfer_status: 'failed',
        transfer_error: 'Assistant has no Stripe Connected Account',
        updated_at: new Date().toISOString(),
      }).eq('id', settlement.id);

      return NextResponse.json({
        error: 'Assistant has no Stripe Connected Account. They need to complete onboarding.',
      }, { status: 400 });
    }

    // 5. Execute transfer
    await admin.from('session_settlements').update({
      transfer_status: 'processing',
      updated_at: new Date().toISOString(),
    }).eq('id', settlement.id);

    try {
      const transfer = await transferToAssistant({
        amount: settlement.assistant_amount,
        connectedAccountId: staffMember.stripe_connected_account_id,
        transferGroup: bookingId,
        description: `HTG sesja — ${staffMember.name} — ${settlement.session_type}`,
        idempotencyKey: settlement.idempotency_key,
      });

      // 6. Mark as settled
      await admin.from('session_settlements').update({
        status: 'settled',
        transfer_status: 'completed',
        stripe_transfer_id: transfer.id,
        transferred_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', settlement.id);

      return NextResponse.json({
        message: 'Transfer completed',
        transferId: transfer.id,
        platformAmount: settlement.platform_amount,
        assistantAmount: settlement.assistant_amount,
        assistantName: staffMember.name,
      });

    } catch (transferErr: any) {
      await admin.from('session_settlements').update({
        transfer_status: 'failed',
        transfer_error: transferErr.message,
        updated_at: new Date().toISOString(),
      }).eq('id', settlement.id);

      return NextResponse.json({
        error: `Transfer failed: ${transferErr.message}`,
      }, { status: 500 });
    }

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET /api/stripe/settle — get settlement status for a booking
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  // Only staff/admin can view settlements
  if (!user || (!isStaffEmail(user.email ?? '') && !isAdminEmail(user.email ?? ''))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bookingId = request.nextUrl.searchParams.get('bookingId');
  if (!bookingId) return NextResponse.json({ error: 'bookingId required' }, { status: 400 });

  const admin = createSupabaseServiceRole();

  const { data } = await admin
    .from('session_settlements')
    .select('*')
    .eq('booking_id', bookingId)
    .single();

  return NextResponse.json({ settlement: data });
}

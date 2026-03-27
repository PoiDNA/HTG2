import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isStaffEmail } from '@/lib/roles';
import {
  createConnectedAccount,
  createOnboardingLink,
  checkAccountStatus,
  createDashboardLink,
} from '@/lib/stripe-connect';

// POST /api/stripe/connect — create connected account or get onboarding link
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isStaffEmail(user.email ?? '')) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const { action } = await request.json();
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Get staff member
    const { data: staff } = await admin
      .from('staff_members')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!staff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    const origin = request.headers.get('origin') || 'https://htgcyou.com';

    // Action: create — create new connected account
    if (action === 'create') {
      if (staff.stripe_connected_account_id) {
        return NextResponse.json({ error: 'Connected account already exists' }, { status: 400 });
      }

      const account = await createConnectedAccount(user.email!, staff.name);

      await admin.from('staff_members').update({
        stripe_connected_account_id: account.id,
      }).eq('id', staff.id);

      // Generate onboarding link
      const link = await createOnboardingLink(
        account.id,
        `${origin}/pl/prowadzacy?stripe=complete`,
        `${origin}/pl/prowadzacy?stripe=refresh`,
      );

      return NextResponse.json({
        accountId: account.id,
        onboardingUrl: link.url,
      });
    }

    // Action: onboard — get new onboarding link (re-onboard)
    if (action === 'onboard') {
      if (!staff.stripe_connected_account_id) {
        return NextResponse.json({ error: 'No connected account. Create one first.' }, { status: 400 });
      }

      const link = await createOnboardingLink(
        staff.stripe_connected_account_id,
        `${origin}/pl/prowadzacy?stripe=complete`,
        `${origin}/pl/prowadzacy?stripe=refresh`,
      );

      return NextResponse.json({ onboardingUrl: link.url });
    }

    // Action: status — check account status
    if (action === 'status') {
      if (!staff.stripe_connected_account_id) {
        return NextResponse.json({ hasAccount: false });
      }

      const status = await checkAccountStatus(staff.stripe_connected_account_id);

      // Update onboarding status in DB
      if (status.detailsSubmitted && !staff.stripe_onboarding_complete) {
        await admin.from('staff_members').update({
          stripe_onboarding_complete: true,
        }).eq('id', staff.id);
      }

      return NextResponse.json({
        hasAccount: true,
        accountId: staff.stripe_connected_account_id,
        ...status,
      });
    }

    // Action: dashboard — get Express dashboard login link
    if (action === 'dashboard') {
      if (!staff.stripe_connected_account_id) {
        return NextResponse.json({ error: 'No connected account' }, { status: 400 });
      }

      const link = await createDashboardLink(staff.stripe_connected_account_id);
      return NextResponse.json({ dashboardUrl: link.url });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Stripe Connect error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { SESSION_CONFIG, PRODUCT_SLUGS, LOCALE_CURRENCY } from '@/lib/booking/constants';
import type { SessionType } from '@/lib/booking/types';

// Allowed return paths for checkout success/cancel
const ALLOWED_RETURN_PATHS = ['/konto', '/sesje', '/sesje-indywidualne'];

// Valid locales for URL construction
const VALID_LOCALES = ['pl', 'en', 'de', 'pt'];

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      priceId,
      mode = 'payment',
      quantity = 1,
      metadata = {},
      amountOverride,
      addOns = [],
      locale: requestLocale,
    } = body;

    const db = createSupabaseServiceRole();
    const origin = request.headers.get('origin') || 'https://htgcyou.com';
    const returnPath = ALLOWED_RETURN_PATHS.includes(metadata.return_path) ? metadata.return_path : '/konto';

    // Determine locale and currency
    const locale = VALID_LOCALES.includes(requestLocale) ? requestLocale : 'pl';
    const currency = LOCALE_CURRENCY[locale] || 'pln';

    // ── Translate bulk session/month purchases to pending_checkout ──────────
    const sessionIds: string[] = metadata.sessionIds ? JSON.parse(metadata.sessionIds) : [];
    const monthLabels: string[] = metadata.monthLabels ? JSON.parse(metadata.monthLabels) : [];
    const isBulkPurchase = (metadata.type === 'sessions' && sessionIds.length > 0)
      || (metadata.type === 'monthly' && monthLabels.length > 0);

    let checkoutId: string | null = null;
    let finalLineItems: any[] | null = null;

    if (isBulkPurchase) {
      // ── Pre-check: yearly full access ──
      const { data: yearlyEnt } = await db.from('entitlements')
        .select('id').eq('user_id', user.id).eq('type', 'yearly')
        .eq('is_active', true).gt('valid_until', new Date().toISOString())
        .limit(1);
      if (yearlyEnt && yearlyEnt.length > 0) {
        return NextResponse.json({ error: 'Masz pełen dostęp — nie musisz kupować' }, { status: 400 });
      }

      // ── Canonicalize & validate ──
      let canonicalSessions: string[] = [];
      let canonicalMonths: { monthly_set_id: string; month_label: string }[] = [];

      if (sessionIds.length > 0) {
        const { data: validSessions } = await db.from('session_templates')
          .select('id').in('id', [...new Set(sessionIds)]);
        canonicalSessions = (validSessions || []).map(s => s.id);
      }

      if (monthLabels.length > 0) {
        const { data: validSets } = await db.from('monthly_sets')
          .select('id, month_label').in('month_label', [...new Set(monthLabels)])
          .eq('is_published', true);
        canonicalMonths = (validSets || []).map(s => ({
          monthly_set_id: s.id,
          month_label: s.month_label,
        }));
      }

      // ── Filter out already-owned ──
      const now = new Date().toISOString();

      if (canonicalSessions.length > 0) {
        const { data: ownedDirect } = await db.from('entitlements')
          .select('session_id').eq('user_id', user.id).eq('type', 'session')
          .eq('is_active', true).gt('valid_until', now)
          .in('session_id', canonicalSessions);
        const ownedDirectSet = new Set((ownedDirect || []).map(e => e.session_id));

        const { data: ownedMonthEnts } = await db.from('entitlements')
          .select('monthly_set_id').eq('user_id', user.id)
          .in('type', ['monthly', 'yearly']).eq('is_active', true).gt('valid_until', now)
          .not('monthly_set_id', 'is', null);
        const ownedMonthSetIds = (ownedMonthEnts || []).map(e => e.monthly_set_id);

        let ownedViaMonthSet = new Set<string>();
        if (ownedMonthSetIds.length > 0) {
          const { data: setSessionRows } = await db.from('set_sessions')
            .select('session_id').in('set_id', ownedMonthSetIds);
          ownedViaMonthSet = new Set((setSessionRows || []).map(r => r.session_id));
        }

        canonicalSessions = canonicalSessions.filter(
          id => !ownedDirectSet.has(id) && !ownedViaMonthSet.has(id)
        );
      }

      if (canonicalMonths.length > 0) {
        const { data: ownedMonths } = await db.from('entitlements')
          .select('monthly_set_id, scope_month').eq('user_id', user.id)
          .in('type', ['monthly', 'yearly']).eq('is_active', true)
          .gt('valid_until', now);
        const ownedSetIds = new Set((ownedMonths || []).map(e => e.monthly_set_id).filter(Boolean));
        const ownedScopes = new Set((ownedMonths || []).map(e => e.scope_month).filter(Boolean));

        canonicalMonths = canonicalMonths.filter(
          m => !ownedSetIds.has(m.monthly_set_id) && !ownedScopes.has(m.month_label)
        );
      }

      // ── Empty cart after filtering? ──
      if (canonicalSessions.length === 0 && canonicalMonths.length === 0) {
        return NextResponse.json({ error: 'Posiadasz już wszystkie wybrane pozycje' }, { status: 400 });
      }

      // ── Fetch prices (filtered by currency) ──
      const { data: sessionProduct } = await db.from('products').select('id')
        .eq('slug', PRODUCT_SLUGS.SINGLE_SESSION).single();
      const { data: monthlyProduct } = await db.from('products').select('id')
        .eq('slug', PRODUCT_SLUGS.MONTHLY).single();

      const { data: sessionPrice } = await db.from('prices').select('stripe_price_id, amount')
        .eq('product_id', sessionProduct?.id || '').eq('is_active', true)
        .eq('currency', currency).single();
      const { data: monthlyPrice } = await db.from('prices').select('stripe_price_id, amount')
        .eq('product_id', monthlyProduct?.id || '').eq('is_active', true)
        .eq('currency', currency).single();

      // ── Determine purchase type ──
      const purchaseType = canonicalSessions.length > 0 && canonicalMonths.length > 0
        ? 'mixed' : canonicalSessions.length > 0 ? 'sessions_only' : 'months_only';

      const totalAmount = (canonicalSessions.length * (sessionPrice?.amount || 0))
        + (canonicalMonths.length * (monthlyPrice?.amount || 0));

      // ── Create pending_checkout ──
      const { data: pendingCheckout } = await db.from('pending_checkouts').insert({
        user_id: user.id,
        items: { sessions: canonicalSessions, months: canonicalMonths },
        purchase_type: purchaseType,
        total_amount: totalAmount,
        currency,
      }).select('id').single();

      checkoutId = pendingCheckout?.id || null;

      // ── Build Stripe line items ──
      finalLineItems = [];
      if (canonicalSessions.length > 0 && sessionPrice?.stripe_price_id) {
        finalLineItems.push({ price: sessionPrice.stripe_price_id, quantity: canonicalSessions.length });
      }
      if (canonicalMonths.length > 0 && monthlyPrice?.stripe_price_id) {
        finalLineItems.push({ price: monthlyPrice.stripe_price_id, quantity: canonicalMonths.length });
      }
    }

    // ── Standard (non-bulk) flow ──────────────────────────────────────────────

    if (!priceId && !amountOverride && !finalLineItems) {
      return NextResponse.json({ error: 'priceId or amountOverride required' }, { status: 400 });
    }

    // ── Anti-tampering: validate priceId matches expected currency ──
    if (priceId && !finalLineItems) {
      const { data: priceRecord } = await db.from('prices')
        .select('currency, product_id')
        .eq('stripe_price_id', priceId)
        .eq('is_active', true)
        .single();

      if (priceRecord && priceRecord.currency !== currency) {
        return NextResponse.json({
          error: 'Currency mismatch — price does not match locale currency',
        }, { status: 400 });
      }
    }

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user.email!,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // Build line items
    let lineItems: any[];

    if (finalLineItems) {
      lineItems = finalLineItems;
    } else if (amountOverride && amountOverride > 0) {
      const sessionLabel = SESSION_CONFIG[metadata.session_type as SessionType]?.label || metadata.session_type || 'Sesja indywidualna HTG';

      // Locale-aware product name for Stripe invoice
      const sessionName = locale === 'pl' ? sessionLabel
        : locale === 'de' ? (SESSION_CONFIG[metadata.session_type as SessionType]?.labelShort || sessionLabel)
        : locale === 'pt' ? (SESSION_CONFIG[metadata.session_type as SessionType]?.labelShort || sessionLabel)
        : (SESSION_CONFIG[metadata.session_type as SessionType]?.labelShort || sessionLabel);

      const productName = metadata.payment_mode === 'installments'
        ? locale === 'pl' ? `Rata ${metadata.installment_number || 1}/3 — ${sessionName}`
          : `Installment ${metadata.installment_number || 1}/3 — ${sessionName}`
        : metadata.payment_mode === 'custom'
          ? locale === 'pl' ? `Dopłata — ${sessionName}` : `Additional payment — ${sessionName}`
          : sessionName;

      lineItems = [{
        price_data: {
          currency,
          unit_amount: Math.round(amountOverride),
          product_data: { name: productName },
        },
        quantity: 1,
      }];
    } else {
      lineItems = [{ price: priceId, quantity: Math.max(1, Math.min(quantity, 100)) }];
    }

    // Add optional add-on line items
    for (const addOn of addOns) {
      if (addOn.priceId) {
        lineItems.push({ price: addOn.priceId, quantity: 1 });
      }
    }

    const sessionParams: any = {
      customer: customerId,
      line_items: lineItems,
      mode,
      success_url: `${origin}/${locale}${returnPath}?checkout=success`,
      cancel_url: `${origin}/${locale}${returnPath}?checkout=cancelled`,
      metadata: {
        supabase_user_id: user.id,
        ...(checkoutId ? { checkout_id: checkoutId } : {}),
        purchase_type: metadata.type || 'single',
        session_ids: checkoutId ? '' : (metadata.sessionIds || ''),
        month_labels: checkoutId ? '' : (metadata.monthLabels || ''),
        start_month: metadata.startMonth || '',
        selected_months: metadata.selectedMonths || '',
        payment_mode: metadata.payment_mode || 'full',
        total_amount: metadata.total_amount || '',
        installment_number: metadata.installment_number || '',
        installments_total: metadata.installments_total || '',
        session_type: metadata.session_type || '',
        slot_id: metadata.slot_id || '',
        booking_id: metadata.booking_id || '',
        pre_session_staff_id: metadata.pre_session_staff_id || '',
        pre_session_source_booking_id: metadata.pre_session_source_booking_id || '',
        gift_for_email: metadata.gift_for_email || '',
        gift_message: metadata.gift_message || '',
        locale,
      },
    };

    if (mode === 'payment') {
      sessionParams.invoice_creation = { enabled: true };
    }

    // ── Stripe Connect: pre-session transfer ──
    const preSessionStaffId = metadata.pre_session_staff_id;
    if (preSessionStaffId) {
      const connectDb = createSupabaseServiceRole();
      const { data: psData } = await connectDb
        .from('pre_session_settings')
        .select('price_pln, staff_members!inner(stripe_connect_account_id)')
        .eq('staff_member_id', preSessionStaffId)
        .maybeSingle();

      const connectAccountId = (psData?.staff_members as any)?.stripe_connect_account_id;
      const pricePln = psData?.price_pln || 0;

      if (connectAccountId && pricePln > 0) {
        const transferAmount = Math.floor(pricePln * 0.60);
        sessionParams.payment_intent_data = {
          ...(sessionParams.payment_intent_data || {}),
          transfer_data: { destination: connectAccountId, amount: transferAmount },
        };
      }
    }

    const session = await getStripe().checkout.sessions.create(sessionParams);

    // Update pending_checkout with Stripe session ID
    if (checkoutId) {
      await db.from('pending_checkouts')
        .update({ stripe_checkout_session_id: session.id })
        .eq('id', checkoutId);
    }

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe checkout error:', error?.message, error?.type);
    return NextResponse.json({
      error: error.message || 'Unknown error',
      type: error?.type,
    }, { status: 500 });
  }
}

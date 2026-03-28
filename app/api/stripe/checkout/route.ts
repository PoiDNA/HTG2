import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      priceId,
      mode = 'payment',
      quantity = 1,
      metadata = {},
      amountOverride, // For installments / custom payments (in grosz)
      addOns = [],    // Additional line items: [{ priceId: string, name: string }]
    } = await request.json();

    if (!priceId && !amountOverride) {
      return NextResponse.json({ error: 'priceId or amountOverride required' }, { status: 400 });
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

    const origin = request.headers.get('origin') || 'https://htgcyou.com';

    // Build line items
    let lineItems: any[];

    if (amountOverride && amountOverride > 0) {
      // Human-readable session type names
      const SESSION_TYPE_NAMES: Record<string, string> = {
        natalia_solo: 'Sesja 1:1 z Natalią',
        natalia_agata: 'Sesja z Natalią i Agatą',
        natalia_justyna: 'Sesja z Natalią i Justyną',
      };
      const sessionName = SESSION_TYPE_NAMES[metadata.session_type] || 'Sesja indywidualna HTG';

      const productName = metadata.payment_mode === 'installments'
        ? `Rata ${metadata.installment_number || 1}/3 — ${sessionName}`
        : metadata.payment_mode === 'custom'
          ? `Dopłata — ${sessionName}`
          : sessionName;

      lineItems = [{
        price_data: {
          currency: 'pln',
          unit_amount: Math.round(amountOverride),
          product_data: {
            name: productName,
          },
        },
        quantity: 1,
      }];
    } else {
      lineItems = [{ price: priceId, quantity: Math.max(1, Math.min(quantity, 100)) }];
    }

    // Add optional add-on line items (e.g. paid pre-session meeting)
    for (const addOn of addOns) {
      if (addOn.priceId) {
        lineItems.push({ price: addOn.priceId, quantity: 1 });
      }
    }

    const sessionParams: any = {
      customer: customerId,
      line_items: lineItems,
      mode,
      success_url: `${origin}/pl/konto?checkout=success`,
      cancel_url: `${origin}/pl/sesje-indywidualne?checkout=cancelled`,
      metadata: {
        supabase_user_id: user.id,
        purchase_type: metadata.type || 'single',
        session_ids: metadata.sessionIds || '',
        month_labels: metadata.monthLabels || '',
        start_month: metadata.startMonth || '',
        // Installment tracking
        payment_mode: metadata.payment_mode || 'full',
        total_amount: metadata.total_amount || '',
        installment_number: metadata.installment_number || '',
        installments_total: metadata.installments_total || '',
        session_type: metadata.session_type || '',
        slot_id: metadata.slot_id || '',
        // Pre-session meeting add-on
        pre_session_staff_id: metadata.pre_session_staff_id || '',
        pre_session_source_booking_id: metadata.pre_session_source_booking_id || '',
        // Gift session
        gift_for_email: metadata.gift_for_email || '',
        gift_message: metadata.gift_message || '',
      },
    };

    // Enable automatic invoicing for one-time payments
    if (mode === 'payment') {
      sessionParams.invoice_creation = { enabled: true };
    }

    // ── Stripe Connect: pre-session transfer to assistant ─────────────────
    const preSessionStaffId = metadata.pre_session_staff_id;
    if (preSessionStaffId) {
      const db = createSupabaseServiceRole();
      const { data: psData } = await db
        .from('pre_session_settings')
        .select('price_pln, staff_members!inner(stripe_connect_account_id)')
        .eq('staff_member_id', preSessionStaffId)
        .maybeSingle();

      const connectAccountId = (psData?.staff_members as any)?.stripe_connect_account_id;
      const pricePln = psData?.price_pln || 0; // grosz

      if (connectAccountId && pricePln > 0) {
        // 60% to assistant, 40% to platform
        const transferAmount = Math.floor(pricePln * 0.60);
        sessionParams.payment_intent_data = {
          ...(sessionParams.payment_intent_data || {}),
          transfer_data: {
            destination: connectAccountId,
            amount: transferAmount,
          },
        };
      }
    }

    const session = await getStripe().checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe checkout error:', error?.message, error?.type);
    return NextResponse.json({
      error: error.message || 'Unknown error',
      type: error?.type,
    }, { status: 500 });
  }
}

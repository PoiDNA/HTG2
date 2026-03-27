import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createSupabaseServer } from '@/lib/supabase/server';

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
      // Custom amount — use price_data instead of priceId
      // Look up the product name from the price
      const productName = metadata.payment_mode === 'installments'
        ? `Rata ${metadata.installment_number || 1}/3 — Sesja indywidualna HTG`
        : metadata.payment_mode === 'custom'
          ? 'Dopłata — Sesja indywidualna HTG'
          : 'Sesja indywidualna HTG';

      lineItems = [{
        price_data: {
          currency: 'pln',
          unit_amount: Math.round(amountOverride),
          product_data: {
            name: productName,
            description: metadata.session_type
              ? `Typ: ${metadata.session_type}`
              : undefined,
          },
        },
        quantity: 1,
      }];
    } else {
      lineItems = [{ price: priceId, quantity: Math.max(1, Math.min(quantity, 100)) }];
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
      },
    };

    // Enable automatic invoicing for one-time payments
    if (mode === 'payment') {
      sessionParams.invoice_creation = { enabled: true };
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

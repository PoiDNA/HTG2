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

    const { priceId, mode = 'payment', quantity = 1, metadata = {} } = await request.json();

    if (!priceId) {
      return NextResponse.json({ error: 'priceId required' }, { status: 400 });
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

    const sessionParams: any = {
      customer: customerId,
      line_items: [{ price: priceId, quantity: Math.max(1, Math.min(quantity, 100)) }],
      mode,
      success_url: `${origin}/pl/konto?checkout=success`,
      cancel_url: `${origin}/pl/subskrypcje?checkout=cancelled`,
      metadata: {
        supabase_user_id: user.id,
        // Pass through purchase metadata for webhook processing
        purchase_type: metadata.type || 'single',
        session_ids: metadata.sessionIds || '',
        month_labels: metadata.monthLabels || '',
        start_month: metadata.startMonth || '',
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

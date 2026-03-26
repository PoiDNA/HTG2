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

    const { priceId, mode = 'payment' } = await request.json();

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
      line_items: [{ price: priceId, quantity: 1 }],
      mode,
      success_url: `${origin}/pl/konto?checkout=success`,
      cancel_url: `${origin}/pl/subskrypcje?checkout=cancelled`,
      metadata: {
        supabase_user_id: user.id,
      },
      // TODO: Enable consent_collection after configuring Terms URL in Stripe Dashboard
      // consent_collection: { terms_of_service: 'required' },
    };

    // Enable automatic invoicing for one-time payments
    if (mode === 'payment') {
      sessionParams.invoice_creation = { enabled: true };
    }

    const session = await getStripe().checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe checkout error:', {
      message: error?.message,
      type: error?.type,
      statusCode: error?.statusCode,
      code: error?.code,
      stripeKey: process.env.STRIPE_SECRET_KEY ? 'SET (' + process.env.STRIPE_SECRET_KEY.slice(0, 10) + '...)' : 'NOT SET',
    });
    return NextResponse.json({
      error: error.message || 'Unknown error',
      type: error?.type,
      keyPresent: !!process.env.STRIPE_SECRET_KEY,
      keyPrefix: process.env.STRIPE_SECRET_KEY?.slice(0, 10),
    }, { status: 500 });
  }
}

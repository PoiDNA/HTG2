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

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ error: 'No Stripe customer found' }, { status: 400 });
    }

    const origin = request.headers.get('origin') || 'https://htg.cyou';

    const session = await getStripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/pl/konto/subskrypcje`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe portal error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

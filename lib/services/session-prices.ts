import { createSupabaseServer } from '@/lib/supabase/server';
import { PRODUCT_SLUGS } from '@/lib/booking/constants';

export interface SessionPrices {
  sessionPriceId: string;
  sessionAmount: number;   // in grosz (1/100 PLN)
  monthlyPriceId: string;
  monthlyAmount: number;
  yearlyPriceId: string;
  yearlyAmount: number;
}

/**
 * Fetch active prices for session, monthly, and yearly products.
 */
export async function getSessionPrices(): Promise<SessionPrices> {
  const supabase = await createSupabaseServer();

  const [
    { data: sessionProduct },
    { data: monthlyProduct },
    { data: yearlyProduct },
  ] = await Promise.all([
    supabase.from('products').select('id').eq('slug', PRODUCT_SLUGS.SINGLE_SESSION).single(),
    supabase.from('products').select('id').eq('slug', PRODUCT_SLUGS.MONTHLY).single(),
    supabase.from('products').select('id').eq('slug', PRODUCT_SLUGS.YEARLY).single(),
  ]);

  const [
    { data: sessionPrice },
    { data: monthlyPrice },
    { data: yearlyPrice },
  ] = await Promise.all([
    supabase.from('prices').select('stripe_price_id, amount')
      .eq('product_id', sessionProduct?.id || '').eq('is_active', true).single(),
    supabase.from('prices').select('stripe_price_id, amount')
      .eq('product_id', monthlyProduct?.id || '').eq('is_active', true).single(),
    supabase.from('prices').select('stripe_price_id, amount')
      .eq('product_id', yearlyProduct?.id || '').eq('is_active', true).single(),
  ]);

  return {
    sessionPriceId: sessionPrice?.stripe_price_id || '',
    sessionAmount: sessionPrice?.amount || 0,
    monthlyPriceId: monthlyPrice?.stripe_price_id || '',
    monthlyAmount: monthlyPrice?.amount || 0,
    yearlyPriceId: yearlyPrice?.stripe_price_id || '',
    yearlyAmount: yearlyPrice?.amount || 0,
  };
}

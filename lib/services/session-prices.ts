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
 * Uses maybeSingle() to avoid throwing when products/prices don't exist.
 */
export async function getSessionPrices(): Promise<SessionPrices> {
  const supabase = await createSupabaseServer();

  const [
    { data: sessionProduct },
    { data: monthlyProduct },
    { data: yearlyProduct },
  ] = await Promise.all([
    supabase.from('products').select('id').eq('slug', PRODUCT_SLUGS.SINGLE_SESSION).maybeSingle(),
    supabase.from('products').select('id').eq('slug', PRODUCT_SLUGS.MONTHLY).maybeSingle(),
    supabase.from('products').select('id').eq('slug', PRODUCT_SLUGS.YEARLY).maybeSingle(),
  ]);

  const [
    { data: sessionPrice },
    { data: monthlyPrice },
    { data: yearlyPrice },
  ] = await Promise.all([
    sessionProduct?.id
      ? supabase.from('prices').select('stripe_price_id, amount').eq('product_id', sessionProduct.id).eq('is_active', true).maybeSingle()
      : { data: null },
    monthlyProduct?.id
      ? supabase.from('prices').select('stripe_price_id, amount').eq('product_id', monthlyProduct.id).eq('is_active', true).maybeSingle()
      : { data: null },
    yearlyProduct?.id
      ? supabase.from('prices').select('stripe_price_id, amount').eq('product_id', yearlyProduct.id).eq('is_active', true).maybeSingle()
      : { data: null },
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

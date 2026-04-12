import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { requireAdmin } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * POST /api/admin/create-i18n-prices
 *
 * One-time admin endpoint to create EUR and USD Stripe Prices for existing
 * individual session products, and insert matching rows into the prices table.
 *
 * Idempotent — skips prices that already exist for a given product+currency.
 *
 * Prices (confirmed):
 * - sesja-natalia (1:1):          710 EUR / 830 USD
 * - sesja-natalia-agata:          990 EUR / 1150 USD
 * - sesja-natalia-justyna:        990 EUR / 1150 USD
 * - sesja-natalia-para:           990 EUR / 1150 USD
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const db = createSupabaseServiceRole();
  const stripe = getStripe();

  const PRICE_CONFIG = [
    { slug: 'sesja-natalia',         eur: 71000,  usd: 83000  },
    { slug: 'sesja-natalia-agata',   eur: 99000,  usd: 115000 },
    { slug: 'sesja-natalia-justyna', eur: 99000,  usd: 115000 },
    { slug: 'sesja-natalia-para',    eur: 99000,  usd: 115000 },
  ];

  const results: Array<{ slug: string; currency: string; status: string; stripe_price_id?: string }> = [];

  for (const config of PRICE_CONFIG) {
    // Get product from DB
    const { data: product } = await db
      .from('products')
      .select('id, stripe_product_id')
      .eq('slug', config.slug)
      .eq('is_active', true)
      .single();

    if (!product) {
      results.push({ slug: config.slug, currency: 'eur', status: 'product_not_found' });
      results.push({ slug: config.slug, currency: 'usd', status: 'product_not_found' });
      continue;
    }

    for (const [currency, amount] of [['eur', config.eur], ['usd', config.usd]] as const) {
      // Check if price already exists in DB
      const { data: existing } = await db
        .from('prices')
        .select('id, stripe_price_id')
        .eq('product_id', product.id)
        .eq('currency', currency)
        .eq('is_active', true)
        .maybeSingle();

      if (existing) {
        results.push({ slug: config.slug, currency, status: 'already_exists', stripe_price_id: existing.stripe_price_id });
        continue;
      }

      try {
        // Create Stripe Price
        const stripePrice = await stripe.prices.create({
          product: product.stripe_product_id!,
          unit_amount: amount,
          currency,
          metadata: {
            product_slug: config.slug,
            product_id: product.id,
          },
        });

        // Insert into prices table
        await db.from('prices').insert({
          product_id: product.id,
          stripe_price_id: stripePrice.id,
          amount,
          currency,
          interval: null,
          is_active: true,
        });

        results.push({ slug: config.slug, currency, status: 'created', stripe_price_id: stripePrice.id });
      } catch (error: any) {
        results.push({ slug: config.slug, currency, status: `error: ${error.message}` });
      }
    }
  }

  return NextResponse.json({ results });
}

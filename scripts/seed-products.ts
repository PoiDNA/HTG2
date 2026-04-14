#!/usr/bin/env npx tsx
/**
 * HTG — Seed Products & Prices
 *
 * Creates the 3 subscription tiers in Supabase:
 *   1. A la carte (pojedyncze sesje) — vod_single
 *   2. Pakiet Miesięczny — vod_set
 *   3. Pakiet Roczny — subscription (yearly)
 *
 * Also creates a placeholder yearly product for Stripe subscription.
 *
 * Usage:
 *   npx tsx scripts/seed-products.ts
 *
 * Env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Note: Run this AFTER creating corresponding Stripe Products/Prices,
 * then update stripe_product_id and stripe_price_id values below.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Product definitions
// ---------------------------------------------------------------------------

const PRODUCTS = [
  {
    name: 'Pojedyncza sesja',
    slug: 'sesja-pojedyncza',
    description: 'Dostęp do wybranej sesji grupowej na 24 miesiące.',
    type: 'vod_single' as const,
    stripe_product_id: null, // TODO: fill after Stripe setup
    is_active: true,
    metadata: { entitlement_type: 'session', valid_months: 24 },
  },
  {
    name: 'Pakiet Miesięczny',
    slug: 'pakiet-miesieczny',
    description: 'Zestaw sesji grupowych z danego miesiąca. Dostęp na 24 miesiące.',
    type: 'vod_set' as const,
    stripe_product_id: null, // TODO: fill after Stripe setup
    is_active: true,
    metadata: { entitlement_type: 'monthly', valid_months: 24 },
  },
  {
    name: 'Pakiet Roczny',
    slug: 'pakiet-roczny',
    description: 'Pełny dostęp do całego archiwum i nowych sesji przez 12 miesięcy. Płacisz za 10, dostajesz 12.',
    type: 'subscription' as const,
    stripe_product_id: null, // TODO: fill after Stripe setup
    is_active: true,
    metadata: { entitlement_type: 'yearly', valid_months: 12 },
  },
  {
    name: 'Sesja z tłumaczem',
    slug: 'sesja-natalia-tlumacz',
    description: 'Indywidualna sesja z Natalią z tłumaczem (EN/DE/PT). 180 minut.',
    type: 'individual_session' as const,
    stripe_product_id: 'prod_UKjuklKlcizbqk',
    is_active: true,
    metadata: { session_type: 'natalia_interpreter', valid_months: 6 },
  },
];

// Prices — amounts in grosz/cents (1 PLN = 100 grosz, 1 USD = 100 cents, 1 EUR = 100 cents)
// TODO: Update amounts and stripe_price_id after Stripe setup
const PRICES = [
  {
    product_slug: 'sesja-pojedyncza',
    stripe_price_id: 'price_placeholder_single', // TODO: replace
    amount: 15000, // 150 PLN
    currency: 'pln',
    interval: null, // one-time
  },
  {
    product_slug: 'pakiet-miesieczny',
    stripe_price_id: 'price_placeholder_monthly', // TODO: replace
    amount: 30000, // 300 PLN
    currency: 'pln',
    interval: null, // one-time per set
  },
  {
    product_slug: 'pakiet-roczny',
    stripe_price_id: 'price_placeholder_yearly', // TODO: replace
    amount: 300000, // 3000 PLN (10 months × 300)
    currency: 'pln',
    interval: 'year' as const,
  },
  {
    product_slug: 'sesja-natalia-tlumacz',
    stripe_price_id: 'price_1TM4RxKwJfb68PaVRKiJsBUM',
    amount: 83000, // $830 USD
    currency: 'usd',
    interval: null,
  },
  {
    product_slug: 'sesja-natalia-tlumacz',
    stripe_price_id: 'price_1TM4RxKwJfb68PaVKlQF1yaW',
    amount: 71000, // €710 EUR
    currency: 'eur',
    interval: null,
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n🌱 HTG — Seeding Products & Prices\n');

  // Upsert products
  for (const product of PRODUCTS) {
    const { data, error } = await supabase
      .from('products')
      .upsert(
        {
          name: product.name,
          slug: product.slug,
          description: product.description,
          type: product.type,
          stripe_product_id: product.stripe_product_id,
          is_active: product.is_active,
          metadata: product.metadata,
        },
        { onConflict: 'slug' }
      )
      .select('id, slug')
      .single();

    if (error) {
      console.error(`  ❌ Product "${product.name}": ${error.message}`);
      continue;
    }
    console.log(`  ✅ Product "${product.name}" → ${data.id}`);
  }

  // Upsert prices (need product_id from products)
  for (const price of PRICES) {
    // Get product_id
    const { data: product } = await supabase
      .from('products')
      .select('id')
      .eq('slug', price.product_slug)
      .single();

    if (!product) {
      console.error(`  ❌ Price for "${price.product_slug}": product not found`);
      continue;
    }

    const { data, error } = await supabase
      .from('prices')
      .upsert(
        {
          product_id: product.id,
          stripe_price_id: price.stripe_price_id,
          amount: price.amount,
          currency: price.currency,
          interval: price.interval,
          is_active: true,
        },
        { onConflict: 'stripe_price_id' }
      )
      .select('id')
      .single();

    if (error) {
      console.error(`  ❌ Price for "${price.product_slug}": ${error.message}`);
      continue;
    }
    console.log(`  ✅ Price ${price.amount / 100} PLN (${price.product_slug}) → ${data.id}`);
  }

  console.log('\n✨ Done! Remember to update stripe_product_id and stripe_price_id after Stripe setup.\n');
}

main().catch((err) => {
  console.error('💥 Seed failed:', err);
  process.exit(1);
});

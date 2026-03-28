#!/usr/bin/env npx tsx
// @ts-nocheck/**
 * HTG — Create "Sesja dla par" Stripe product + price, sync to DB
 *
 * Usage:
 *   cd /Users/lk/work/HTG2
 *   npx tsx scripts/create-para-product.ts
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

import { readFileSync } from 'fs';
import { join } from 'path';
try {
  const envLocal = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
  for (const line of envLocal.split('\n')) {
    const m = line.match(/^([^=]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* ignore */ }

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!STRIPE_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars'); process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2025-01-27.acacia' });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('\n🎯 Creating "Sesja dla par" in Stripe + Supabase\n');

  // 1. Create Stripe Product
  const stripeProduct = await stripe.products.create({
    name: 'Sesja dla par',
    description: 'Sesja dla par z Natalią HTG — 2 osoby, 120 minut',
    metadata: {
      entitlement_type: 'individual_booking',
      valid_months: '24',
      session_id: '',               // filled when booking slot is assigned
      product_id: '',               // will be updated after DB insert
      session_type: 'natalia_para',
    },
  });
  console.log(`✅ Stripe Product: ${stripeProduct.id} — ${stripeProduct.name}`);

  // 2. Create Stripe Price (1600 PLN one-time)
  const stripePrice = await stripe.prices.create({
    product: stripeProduct.id,
    unit_amount: 160000, // grosz
    currency: 'pln',
    metadata: {
      session_type: 'natalia_para',
      entitlement_type: 'individual_booking',
      valid_months: '24',
    },
  });
  console.log(`✅ Stripe Price: ${stripePrice.id} — ${stripePrice.unit_amount! / 100} PLN`);

  // 3. Upsert product in Supabase
  const { data: product, error: productError } = await supabase
    .from('products')
    .upsert({
      name: 'Sesja dla par',
      slug: 'sesja-natalia-para',
      description: 'Sesja dla par z Natalią HTG — 2 osoby, 120 minut',
      type: 'vod_single',
      stripe_product_id: stripeProduct.id,
      is_active: true,
      metadata: {
        entitlement_type: 'individual_booking',
        valid_months: 24,
        session_type: 'natalia_para',
      },
    }, { onConflict: 'slug' })
    .select('id')
    .single();

  if (productError) {
    console.error('❌ Supabase product upsert failed:', productError.message);
    process.exit(1);
  }
  console.log(`✅ Supabase Product: ${product.id}`);

  // 4. Update Stripe product metadata with product_id
  await stripe.products.update(stripeProduct.id, {
    metadata: { product_id: product.id },
  });

  // 5. Upsert price in Supabase
  const { data: price, error: priceError } = await supabase
    .from('prices')
    .upsert({
      product_id: product.id,
      stripe_price_id: stripePrice.id,
      amount: 160000,
      currency: 'pln',
      interval: null,
      is_active: true,
    }, { onConflict: 'stripe_price_id' })
    .select('id')
    .single();

  if (priceError) {
    console.error('❌ Supabase price upsert failed:', priceError.message);
    process.exit(1);
  }
  console.log(`✅ Supabase Price: ${price.id}`);

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ Done! Stripe product created and synced.

Stripe Product ID : ${stripeProduct.id}
Stripe Price ID   : ${stripePrice.id}
Supabase Product  : ${product.id}
Supabase Price    : ${price.id}

The SessionPicker will now load the priceId from DB and enable checkout.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch(err => { console.error('💥', err); process.exit(1); });

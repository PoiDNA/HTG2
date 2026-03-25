#!/usr/bin/env npx tsx
/**
 * HTG — WIX Subscription Migration Script
 *
 * Imports existing WIX subscriptions into Supabase (htg schema).
 * Creates auth users (via invite), profiles, orders, and entitlements.
 *
 * Input format (JSON array):
 * [
 *   {
 *     "orderId": "123",
 *     "planName": "Premium",           // mapped to HTG product
 *     "email": "test@mail.com",
 *     "status": "ACTIVE",              // ACTIVE | CANCELED | EXPIRED
 *     "startDate": "2024-01-01T00:00:00.000Z",
 *     "endDate": "2025-01-01T00:00:00.000Z",
 *     "lastPaymentDate": "2024-02-01T00:00:00.000Z"
 *   }
 * ]
 *
 * Usage:
 *   npx tsx scripts/migrate-wix.ts ./data/wix-subscriptions.json [--dry-run]
 *
 * Env vars required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes('--dry-run');
const INPUT_FILE = process.argv[2];

if (!INPUT_FILE) {
  console.error('Usage: npx tsx scripts/migrate-wix.ts <path-to-json> [--dry-run]');
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)) {
  console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  console.error('Use --dry-run to test without Supabase connection.');
  process.exit(1);
}

const supabase = (!DRY_RUN)
  ? createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null as any; // Not used in dry-run

// ---------------------------------------------------------------------------
// WIX plan → HTG entitlement mapping
// ---------------------------------------------------------------------------

interface WixPlanMapping {
  entitlementType: 'monthly' | 'yearly';
  /** How many months of access the original WIX plan granted */
  defaultValidMonths: number;
}

/**
 * Map WIX plan names to HTG entitlement types.
 * Adjust these to match your actual WIX plan names.
 */
const PLAN_MAP: Record<string, WixPlanMapping> = {
  // Monthly plans (various WIX naming conventions)
  'Miesięczny': { entitlementType: 'monthly', defaultValidMonths: 24 },
  'Monthly': { entitlementType: 'monthly', defaultValidMonths: 24 },
  'Pakiet Miesięczny': { entitlementType: 'monthly', defaultValidMonths: 24 },
  'Premium': { entitlementType: 'monthly', defaultValidMonths: 24 },
  'Basic': { entitlementType: 'monthly', defaultValidMonths: 24 },

  // Yearly plans
  'Roczny': { entitlementType: 'yearly', defaultValidMonths: 12 },
  'Yearly': { entitlementType: 'yearly', defaultValidMonths: 12 },
  'Pakiet Roczny': { entitlementType: 'yearly', defaultValidMonths: 12 },
  'Annual': { entitlementType: 'yearly', defaultValidMonths: 12 },
};

function resolvePlan(planName: string): WixPlanMapping {
  // Exact match first
  if (PLAN_MAP[planName]) return PLAN_MAP[planName];

  // Case-insensitive partial match
  const lower = planName.toLowerCase();
  if (lower.includes('roczn') || lower.includes('year') || lower.includes('annual')) {
    return { entitlementType: 'yearly', defaultValidMonths: 12 };
  }
  // Default to monthly
  return { entitlementType: 'monthly', defaultValidMonths: 24 };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WixSubscription {
  orderId: string;
  planName: string;
  email: string;
  status: 'ACTIVE' | 'CANCELED' | 'EXPIRED' | string;
  startDate: string;
  endDate: string;
  lastPaymentDate: string;
}

interface MigrationResult {
  email: string;
  wixOrderId: string;
  status: 'created' | 'skipped_existing' | 'skipped_expired' | 'error';
  detail?: string;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n🔄 HTG — WIX Migration ${DRY_RUN ? '(DRY RUN)' : ''}\n`);

  // Read input
  const raw = readFileSync(resolve(INPUT_FILE), 'utf-8');
  const subscriptions: WixSubscription[] = JSON.parse(raw);
  console.log(`📄 Loaded ${subscriptions.length} subscriptions from ${INPUT_FILE}\n`);

  // Validate
  const invalid = subscriptions.filter(s => !s.email || !s.orderId);
  if (invalid.length) {
    console.error(`❌ ${invalid.length} entries missing email or orderId. Aborting.`);
    process.exit(1);
  }

  const results: MigrationResult[] = [];
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const sub of subscriptions) {
    const result = await migrateSingle(sub);
    results.push(result);
    if (result.status === 'created') created++;
    else if (result.status.startsWith('skipped')) skipped++;
    else errors++;

    // Status indicator
    const icon = result.status === 'created' ? '✅' : result.status === 'error' ? '❌' : '⏭️';
    console.log(`  ${icon} ${sub.email} (${sub.planName}) → ${result.status}${result.detail ? ` — ${result.detail}` : ''}`);
  }

  // Summary
  console.log(`\n📊 Migration summary:`);
  console.log(`   Created:  ${created}`);
  console.log(`   Skipped:  ${skipped}`);
  console.log(`   Errors:   ${errors}`);
  console.log(`   Total:    ${subscriptions.length}\n`);

  // Write report
  const reportPath = resolve(`migration-report-${Date.now()}.json`);
  if (!DRY_RUN) {
    const { writeFileSync } = await import('fs');
    writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`📝 Report saved: ${reportPath}\n`);
  }
}

// ---------------------------------------------------------------------------
// Single subscription migration
// ---------------------------------------------------------------------------

async function migrateSingle(sub: WixSubscription): Promise<MigrationResult> {
  const email = sub.email.trim().toLowerCase();
  const base = { email, wixOrderId: sub.orderId };

  try {
    // 1. Skip expired subscriptions with past endDate
    const endDate = new Date(sub.endDate);
    if (sub.status === 'EXPIRED' && endDate < new Date()) {
      return { ...base, status: 'skipped_expired', detail: `ended ${sub.endDate}` };
    }

    if (DRY_RUN) {
      const mapping = resolvePlan(sub.planName);
      return { ...base, status: 'created', detail: `DRY RUN → ${mapping.entitlementType}` };
    }

    // 2. Find or create auth user
    const userId = await findOrCreateUser(email);

    // 3. Check for duplicate WIX order
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('stripe_checkout_session_id', `wix_${sub.orderId}`)
      .maybeSingle();

    if (existingOrder) {
      return { ...base, status: 'skipped_existing', detail: `order already migrated` };
    }

    // 4. Resolve plan mapping
    const mapping = resolvePlan(sub.planName);

    // 5. Calculate validity
    const startDate = new Date(sub.startDate);
    let validUntil: Date;

    if (sub.status === 'ACTIVE') {
      // Active subscriptions: use endDate from WIX, but at least now + 30 days
      validUntil = new Date(sub.endDate);
      const minDate = new Date();
      minDate.setDate(minDate.getDate() + 30);
      if (validUntil < minDate) {
        validUntil = minDate; // Grace period for active migrated subs
      }
    } else {
      // CANCELED: honor original endDate
      validUntil = endDate;
    }

    // 6. Create order (using wix_ prefix for stripe_checkout_session_id to avoid conflicts)
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        stripe_checkout_session_id: `wix_${sub.orderId}`,
        status: sub.status === 'ACTIVE' ? 'paid' : 'refunded',
        total_amount: 0, // WIX amount unknown, mark as migration
        currency: 'pln',
      })
      .select('id')
      .single();

    if (orderErr) throw new Error(`Order insert: ${orderErr.message}`);

    // 7. Create entitlement
    const { error: entErr } = await supabase
      .from('entitlements')
      .insert({
        user_id: userId,
        type: mapping.entitlementType,
        valid_from: startDate.toISOString(),
        valid_until: validUntil.toISOString(),
        is_active: sub.status === 'ACTIVE',
      });

    if (entErr) throw new Error(`Entitlement insert: ${entErr.message}`);

    // 8. Audit log
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action: 'wix_migration',
      entity_type: 'order',
      entity_id: order.id,
      metadata: {
        wix_order_id: sub.orderId,
        wix_plan: sub.planName,
        wix_status: sub.status,
        wix_start: sub.startDate,
        wix_end: sub.endDate,
        entitlement_type: mapping.entitlementType,
        valid_until: validUntil.toISOString(),
      },
    });

    return { ...base, status: 'created', detail: `${mapping.entitlementType} → ${validUntil.toISOString().slice(0, 10)}` };
  } catch (err: any) {
    return { ...base, status: 'error', detail: err.message };
  }
}

// ---------------------------------------------------------------------------
// Auth user creation (with cache to avoid repeated API calls)
// ---------------------------------------------------------------------------

/** email → user_id cache, populated once at startup */
const userCache = new Map<string, string>();
let cacheLoaded = false;

async function loadUserCache(): Promise<void> {
  if (cacheLoaded) return;

  console.log('📋 Loading existing users...');
  let page = 1;
  const perPage = 1000;
  let total = 0;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`List users page ${page}: ${error.message}`);
    if (!data?.users?.length) break;

    for (const u of data.users) {
      if (u.email) {
        userCache.set(u.email.toLowerCase(), u.id);
      }
    }
    total += data.users.length;
    if (data.users.length < perPage) break;
    page++;
  }

  cacheLoaded = true;
  console.log(`   Found ${total} existing users\n`);
}

async function findOrCreateUser(email: string): Promise<string> {
  await loadUserCache();

  // Check cache
  const cached = userCache.get(email);
  if (cached) return cached;

  // Create new user via admin API (they'll get OTP on first login)
  const { data: newUser, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true, // Pre-confirm — they migrated from WIX, email is verified
    user_metadata: { source: 'wix_migration' },
  });

  if (error) throw new Error(`Create user ${email}: ${error.message}`);

  // Update cache
  userCache.set(email, newUser.user.id);
  return newUser.user.id;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error('💥 Migration failed:', err);
  process.exit(1);
});

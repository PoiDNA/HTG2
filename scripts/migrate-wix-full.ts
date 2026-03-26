/**
 * Full WIX Migration Script
 *
 * Reads subscriptions_full-3.json and:
 * 1. Creates Supabase Auth accounts for all users (email OTP login)
 * 2. Creates profiles with wix_member_id
 * 3. Ensures all monthly_sets exist
 * 4. Creates orders (source: 'wix') for audit
 * 5. Creates entitlements with UNLIMITED access (valid_until: 2099-12-31)
 *
 * Idempotent — safe to re-run.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Month mapping ──
const MONTH_MAP: Record<string, string> = {
  'styczeń': '01', 'luty': '02', 'marzec': '03', 'kwiecień': '04',
  'maj': '05', 'czerwiec': '06', 'lipiec': '07', 'sierpień': '08',
  'wrzesień': '09', 'październik': '10', 'listopad': '11', 'grudzień': '12',
};

const MONTH_SLUG: Record<string, string> = {
  'styczeń': 'styczen', 'luty': 'luty', 'marzec': 'marzec', 'kwiecień': 'kwiecien',
  'maj': 'maj', 'czerwiec': 'czerwiec', 'lipiec': 'lipiec', 'sierpień': 'sierpien',
  'wrzesień': 'wrzesien', 'październik': 'pazdziernik', 'listopad': 'listopad', 'grudzień': 'grudzien',
};

// Plans that are yearly (999 PLN for 12 months)
const YEARLY_PATTERNS = [/^12 Pakiet/, /^12 miesi/, /^12M /, /^HTG 12/];
const isYearlyPlan = (name: string) => YEARLY_PATTERNS.some(p => p.test(name));

// UNLIMITED access date
const UNLIMITED = '2099-12-31T23:59:59.000Z';

// ── Parse plan name to month_label ──
function planToMonthLabel(name: string): string | null {
  const m = name.match(/^Sesje\s+(\S+)\s+(\d{4})$/);
  if (!m) return null;
  const mm = MONTH_MAP[m[1].toLowerCase()];
  return mm ? `${m[2]}-${mm}` : null;
}

// ── Parse yearly plan description to start month ──
function parseYearlyStartMonth(d: any): string | null {
  const desc = (d.description || '').toLowerCase();

  // "lipiec 2024 - czerwiec 2025" or "luty '26 -> styczeń '27"
  const m = desc.match(/(\w+)\s+['']?(\d{2,4})\s*[-–→>]+\s*(\w+)\s+['']?(\d{2,4})/);
  if (m) {
    const sm = MONTH_MAP[m[1]];
    const sy = m[2].length === 2 ? '20' + m[2] : m[2];
    if (sm) return `${sy}-${sm}`;
  }

  // "12M do Czerwiec 2025" → start = Jul 2024
  const m2 = d.name.match(/12M do (\w+) (\d{4})/i);
  if (m2) {
    const endMM = MONTH_MAP[m2[1].toLowerCase()];
    if (endMM) {
      let sm = parseInt(endMM) - 11;
      let sy = parseInt(m2[2]);
      if (sm <= 0) { sm += 12; sy--; }
      return `${sy}-${String(sm).padStart(2, '0')}`;
    }
  }

  // "12 Pakietów do Stycznia 2027" → start = Feb 2026
  const m3 = d.name.match(/12 Pakiet\w* do (\w+) (\d{4})/i);
  if (m3) {
    const endMM = MONTH_MAP[m3[1].toLowerCase()];
    if (endMM) {
      let sm = parseInt(endMM) - 11;
      let sy = parseInt(m3[2]);
      if (sm <= 0) { sm += 12; sy--; }
      return `${sy}-${String(sm).padStart(2, '0')}`;
    }
  }

  // "Sierpień 2025 -> Lipiec 2026"
  const m4 = desc.match(/^(\w+)\s+(\d{4})\s*[-–→>]/);
  if (m4) {
    const sm = MONTH_MAP[m4[1]];
    if (sm) return `${m4[2]}-${sm}`;
  }

  return null;
}

// ── Generate 12 month labels from start ──
function generate12Months(startLabel: string): string[] {
  const [y, m] = startLabel.split('-').map(Number);
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    let nm = m + i;
    let ny = y;
    if (nm > 12) { nm -= 12; ny++; }
    months.push(`${ny}-${String(nm).padStart(2, '0')}`);
  }
  return months;
}

// ── Month label → Polish title ──
const MONTH_NAMES: Record<string, string> = {
  '01': 'Styczeń', '02': 'Luty', '03': 'Marzec', '04': 'Kwiecień',
  '05': 'Maj', '06': 'Czerwiec', '07': 'Lipiec', '08': 'Sierpień',
  '09': 'Wrzesień', '10': 'Październik', '11': 'Listopad', '12': 'Grudzień',
};

function monthLabelToTitle(label: string): string {
  const [y, m] = label.split('-');
  return `Sesje ${MONTH_NAMES[m] || m} ${y}`;
}

function monthLabelToSlug(label: string): string {
  const [y, m] = label.split('-');
  const name = MONTH_NAMES[m] || m;
  const slug = MONTH_SLUG[name.toLowerCase()] || name.toLowerCase();
  return `sesje-${slug}-${y}`;
}

// ══════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════
async function main() {
  console.log('🔄 HTG Full WIX Migration\n');

  // 1. Load & deduplicate
  const raw = JSON.parse(fs.readFileSync('/Users/lk/Downloads/subscriptions_full-3.json', 'utf8'));
  const seen = new Set<string>();
  const unique: any[] = [];
  raw.forEach((d: any) => {
    const email = d.billingSettings?.billingAddress?.contactDetails?.email;
    if (!email) return;
    const key = `${email}|${d.name}`;
    if (!seen.has(key)) { seen.add(key); unique.push(d); }
  });

  console.log(`Raw: ${raw.length} → Deduped: ${unique.length}`);

  // 2. Collect all month_labels needed
  const neededMonths = new Set<string>();
  unique.forEach((d: any) => {
    if (isYearlyPlan(d.name)) {
      const start = parseYearlyStartMonth(d);
      if (start) generate12Months(start).forEach(m => neededMonths.add(m));
    } else {
      const ml = planToMonthLabel(d.name);
      if (ml) neededMonths.add(ml);
    }
  });

  // 3. Ensure monthly_sets exist
  const { data: existingSets } = await supabase.from('monthly_sets').select('id, month_label, slug');
  const existingLabels = new Set(existingSets?.map(s => s.month_label) || []);

  const { data: monthlyProd } = await supabase.from('products').select('id').eq('slug', 'pakiet-miesieczny').single();
  const { data: yearlyProd } = await supabase.from('products').select('id').eq('slug', 'pakiet-roczny').single();

  const missingSets = [...neededMonths].filter(m => !existingLabels.has(m)).sort();
  if (missingSets.length > 0) {
    console.log(`\n📦 Creating ${missingSets.length} missing monthly sets:`);
    for (const ml of missingSets) {
      const title = monthLabelToTitle(ml);
      const slug = monthLabelToSlug(ml);
      const { error } = await supabase.from('monthly_sets').upsert({
        product_id: monthlyProd!.id,
        title,
        slug,
        month_label: ml,
        is_published: true,
      }, { onConflict: 'slug' });
      console.log(error ? `  ❌ ${ml}: ${error.message}` : `  ✅ ${ml} → ${title}`);
    }
  }

  // Reload sets
  const { data: allSets } = await supabase.from('monthly_sets').select('id, month_label');
  const setMap = new Map(allSets?.map(s => [s.month_label, s.id]) || []);

  // 4. Get all existing auth users
  console.log('\n👤 Loading existing users...');
  const allUsers: any[] = [];
  let page = 1;
  while (true) {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !users || users.length === 0) break;
    allUsers.push(...users);
    if (users.length < 1000) break;
    page++;
  }
  const userByEmail = new Map(allUsers.map(u => [u.email, u]));
  console.log(`  Found ${allUsers.length} existing auth users`);

  // 5. Group subscriptions by email
  const perEmail: Record<string, any[]> = {};
  unique.forEach(d => {
    const email = d.billingSettings.billingAddress.contactDetails.email;
    if (!perEmail[email]) perEmail[email] = [];
    perEmail[email].push(d);
  });

  const emails = Object.keys(perEmail).sort();
  console.log(`\n🚀 Migrating ${emails.length} users...\n`);

  let usersCreated = 0, usersExisting = 0;
  let entitlementsCreated = 0, entitlementsSkipped = 0;
  let ordersCreated = 0;

  for (const email of emails) {
    const subs = perEmail[email];

    // 5a. Create or find user
    let userId: string;
    const existing = userByEmail.get(email);

    if (existing) {
      userId = existing.id;
      usersExisting++;
    } else {
      const tempPass = 'WIX_' + Math.random().toString(36).slice(2, 20) + '!Aa1';
      const { data: newUser, error } = await supabase.auth.admin.createUser({
        email,
        password: tempPass,
        email_confirm: true,
        user_metadata: { name: email.split('@')[0], migrated_from: 'wix' },
      });
      if (error) {
        console.log(`❌ ${email} — create failed: ${error.message}`);
        continue;
      }
      userId = newUser.user.id;
      usersCreated++;
    }

    // 5b. Update profile
    const wixMemberId = subs[0].customer?.memberId;
    await supabase.from('profiles').upsert({
      id: userId,
      email,
      wix_member_id: wixMemberId,
      wix_migrated_at: new Date().toISOString(),
      display_name: email.split('@')[0],
    }, { onConflict: 'id' });

    // 5c. Process each subscription
    for (const sub of subs) {
      const price = parseInt(sub.billingStatus?.latestPaymentData?.totals?.totalPrice || '99');

      if (isYearlyPlan(sub.name)) {
        // ── YEARLY: create entitlement per month in range ──
        const startMonth = parseYearlyStartMonth(sub);
        if (!startMonth) {
          console.log(`  ⚠️ ${email} | ${sub.name} — cannot parse yearly range`);
          continue;
        }

        const months = generate12Months(startMonth);
        let yearlyOk = 0;

        for (const ml of months) {
          const setId = setMap.get(ml);
          // Check if exists
          const { data: existEnt } = await supabase.from('entitlements')
            .select('id')
            .eq('user_id', userId)
            .eq('scope_month', ml)
            .eq('source', 'wix')
            .maybeSingle();

          if (existEnt) { entitlementsSkipped++; continue; }

          await supabase.from('entitlements').insert({
            user_id: userId,
            product_id: yearlyProd!.id,
            type: 'yearly',
            scope_month: ml,
            monthly_set_id: setId || null,
            valid_from: `${ml}-01`,
            valid_until: UNLIMITED,
            is_active: true,
            source: 'wix',
          });
          entitlementsCreated++;
          yearlyOk++;
        }

        // Create order
        const { error: oErr } = await supabase.from('orders').insert({
          user_id: userId,
          status: 'paid',
          total_amount: price * 100,
          currency: 'pln',
          wix_order_id: sub.id,
          wix_plan_name: sub.name,
          source: 'wix',
        });
        if (!oErr) ordersCreated++;

        if (yearlyOk > 0) {
          console.log(`  ✅ ${email} | ${sub.name} → ${yearlyOk} months (${startMonth} +12)`);
        }

      } else {
        // ── MONTHLY: single entitlement ──
        const monthLabel = planToMonthLabel(sub.name);
        if (!monthLabel) {
          console.log(`  ⚠️ ${email} | ${sub.name} — cannot parse month`);
          continue;
        }

        const setId = setMap.get(monthLabel);

        // Check if exists
        const { data: existEnt } = await supabase.from('entitlements')
          .select('id')
          .eq('user_id', userId)
          .eq('scope_month', monthLabel)
          .eq('source', 'wix')
          .maybeSingle();

        if (existEnt) { entitlementsSkipped++; continue; }

        await supabase.from('entitlements').insert({
          user_id: userId,
          product_id: monthlyProd!.id,
          type: 'monthly',
          scope_month: monthLabel,
          monthly_set_id: setId || null,
          valid_from: `${monthLabel}-01`,
          valid_until: UNLIMITED,
          is_active: true,
          source: 'wix',
        });
        entitlementsCreated++;

        // Create order
        const { error: oErr } = await supabase.from('orders').insert({
          user_id: userId,
          status: 'paid',
          total_amount: price * 100,
          currency: 'pln',
          wix_order_id: sub.id,
          wix_plan_name: sub.name,
          source: 'wix',
        });
        if (!oErr) ordersCreated++;
      }
    }
  }

  console.log('\n════════════════════════════════════');
  console.log('✅ MIGRATION COMPLETE');
  console.log('════════════════════════════════════');
  console.log(`Users created:       ${usersCreated}`);
  console.log(`Users existing:      ${usersExisting}`);
  console.log(`Entitlements created: ${entitlementsCreated}`);
  console.log(`Entitlements skipped: ${entitlementsSkipped}`);
  console.log(`Orders created:      ${ordersCreated}`);

  // Verify totals
  const { count: totalUsers } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
  const { count: totalEnts } = await supabase.from('entitlements').select('id', { count: 'exact', head: true });
  const { count: totalOrders } = await supabase.from('orders').select('id', { count: 'exact', head: true });
  const { count: totalSets } = await supabase.from('monthly_sets').select('id', { count: 'exact', head: true });

  console.log(`\nDB totals:`);
  console.log(`  Profiles:     ${totalUsers}`);
  console.log(`  Entitlements: ${totalEnts}`);
  console.log(`  Orders:       ${totalOrders}`);
  console.log(`  Monthly sets: ${totalSets}`);
}

main().catch(console.error);

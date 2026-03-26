/**
 * Full User Migration Script
 *
 * Reads htg_users.json (2144 users) and subscriptions_full-3.json.
 * For each user:
 * 1. Check if already exists in Supabase Auth (by email)
 * 2. If not: create with supabase.auth.admin.createUser({ email, email_confirm: true })
 * 3. Update profile: set display_name from first_name + last_name, wix_member_id from member_id
 * 4. For existing 426 sub users: update display_name with real names from htg_users.json
 * 5. For 1718 free users: create accounts, set role='user'
 *
 * Idempotent — safe to re-run.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface WixUser {
  _id?: string;
  member_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  loginEmail?: string;
  status?: string;
  [key: string]: unknown;
}

interface Subscription {
  customer?: { memberId?: string };
  billingSettings?: {
    billingAddress?: {
      contactDetails?: { email?: string };
    };
  };
  [key: string]: unknown;
}

async function main() {
  console.log('=== HTG Full User Migration ===\n');

  // 1. Load htg_users.json
  const usersPath = '/Users/lk/Downloads/htg_users.json';
  if (!fs.existsSync(usersPath)) {
    console.error(`File not found: ${usersPath}`);
    process.exit(1);
  }
  const allWixUsers: WixUser[] = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  console.log(`Loaded ${allWixUsers.length} users from htg_users.json`);

  // 2. Load subscriptions for member_id matching
  const subsPath = '/Users/lk/Downloads/subscriptions_full-3.json';
  if (!fs.existsSync(subsPath)) {
    console.error(`File not found: ${subsPath}`);
    process.exit(1);
  }
  const allSubs: Subscription[] = JSON.parse(fs.readFileSync(subsPath, 'utf8'));
  console.log(`Loaded ${allSubs.length} subscriptions from subscriptions_full-3.json`);

  // Build member_id → email map from subscriptions
  const memberIdToSubEmail = new Map<string, string>();
  for (const sub of allSubs) {
    const memberId = sub.customer?.memberId;
    const email = sub.billingSettings?.billingAddress?.contactDetails?.email;
    if (memberId && email) {
      memberIdToSubEmail.set(memberId, email.toLowerCase().trim());
    }
  }
  console.log(`Subscription member_id map: ${memberIdToSubEmail.size} entries`);

  // 3. Deduplicate users by email
  const usersByEmail = new Map<string, WixUser>();
  let skippedNoEmail = 0;
  for (const u of allWixUsers) {
    const email = (u.email || u.loginEmail || '').toLowerCase().trim();
    if (!email) {
      skippedNoEmail++;
      continue;
    }
    // Keep the first occurrence (or one with more data)
    if (!usersByEmail.has(email)) {
      usersByEmail.set(email, u);
    }
  }
  console.log(`Unique emails: ${usersByEmail.size} (skipped ${skippedNoEmail} without email)\n`);

  // 4. Get all existing Supabase Auth users
  console.log('Loading existing Supabase Auth users...');
  const existingAuthUsers = new Map<string, { id: string; email: string }>();
  let page = 1;
  while (true) {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !users || users.length === 0) break;
    for (const u of users) {
      if (u.email) {
        existingAuthUsers.set(u.email.toLowerCase(), { id: u.id, email: u.email });
      }
    }
    if (users.length < 1000) break;
    page++;
  }
  console.log(`Found ${existingAuthUsers.size} existing auth users\n`);

  // 5. Process each user
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  const emails = [...usersByEmail.keys()].sort();
  console.log(`Processing ${emails.length} users...\n`);

  for (const email of emails) {
    const wixUser = usersByEmail.get(email)!;
    const firstName = (wixUser.first_name || '').trim();
    const lastName = (wixUser.last_name || '').trim();
    const displayName = [firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0];
    const memberId = wixUser._id || wixUser.member_id || '';

    // Check if user has subscriptions (is a "sub user")
    const hasSub = memberId ? memberIdToSubEmail.has(memberId) : false;

    const existing = existingAuthUsers.get(email);

    if (existing) {
      // User exists — update profile with real name and wix_member_id
      const { error: profileErr } = await supabase
        .from('profiles')
        .upsert({
          id: existing.id,
          email,
          display_name: displayName,
          wix_member_id: memberId || null,
          wix_migrated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

      if (profileErr) {
        console.log(`  ERR update ${email}: ${profileErr.message}`);
        errors++;
      } else {
        updated++;
      }
    } else {
      // Create new user
      const tempPass = 'WIX_' + Math.random().toString(36).slice(2, 20) + '!Aa1';
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: tempPass,
        email_confirm: true,
        user_metadata: { name: displayName, migrated_from: 'wix' },
      });

      if (createErr) {
        console.log(`  ERR create ${email}: ${createErr.message}`);
        errors++;
        continue;
      }

      const userId = newUser.user.id;

      // Create profile
      const { error: profileErr } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          email,
          display_name: displayName,
          role: 'user',
          wix_member_id: memberId || null,
          wix_migrated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

      if (profileErr) {
        console.log(`  ERR profile ${email}: ${profileErr.message}`);
        errors++;
      } else {
        created++;
      }
    }
  }

  // 6. Summary
  console.log('\n========================================');
  console.log('  MIGRATION COMPLETE');
  console.log('========================================');
  console.log(`Users created:  ${created}`);
  console.log(`Users updated:  ${updated}`);
  console.log(`Errors:         ${errors}`);
  console.log(`Total processed: ${created + updated + errors}`);

  // Verify totals
  const { count: totalProfiles } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true });

  let totalAuthUsers = 0;
  let p = 1;
  while (true) {
    const { data: { users } } = await supabase.auth.admin.listUsers({ page: p, perPage: 1000 });
    if (!users || users.length === 0) break;
    totalAuthUsers += users.length;
    if (users.length < 1000) break;
    p++;
  }

  console.log(`\nDB totals:`);
  console.log(`  Auth users: ${totalAuthUsers}`);
  console.log(`  Profiles:   ${totalProfiles}`);
}

main().catch(console.error);

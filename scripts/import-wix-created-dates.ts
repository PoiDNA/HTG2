/**
 * Import WIX account creation dates into profiles.wix_created_at
 *
 * Source:  ~/Downloads/htg_users.json  (WIX member export)
 * Match:   htg_users[].member_id  →  profiles.wix_member_id
 * Writes:  profiles.wix_created_at  (ISO timestamp from htg_users[].created_date)
 *
 * Prerequisites:
 *   1. Run migration 034_profiles_wix_created_at.sql in Supabase dashboard first.
 *   2. NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 *
 * Usage:
 *   npx tsx scripts/import-wix-created-dates.ts [path/to/htg_users.json]
 *
 * Idempotent — safe to re-run (only sets wix_created_at, never touches other columns).
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const JSON_PATH = process.argv[2]
  ?? path.join(process.env.HOME ?? '', 'Downloads', 'htg_users.json');

// ── Types ─────────────────────────────────────────────────────────────────────

interface WixUser {
  member_id:    string;
  contact_id:   string;
  email:        string;
  created_date: string; // "YYYY-MM-DD"
  is_member:    boolean;
  [key: string]: unknown;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Reading WIX export from: ${JSON_PATH}`);
  const raw = fs.readFileSync(JSON_PATH, 'utf-8');
  const users: WixUser[] = JSON.parse(raw);
  console.log(`Loaded ${users.length} WIX users`);

  // Filter entries that have both member_id and created_date
  const valid = users.filter(u => u.member_id && u.created_date);
  console.log(`  → ${valid.length} have member_id + created_date`);

  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Fetch ALL profiles that have a wix_member_id — paginate to avoid 1000-row default limit
  const allProfiles: Array<{ id: string; wix_member_id: string | null; wix_created_at: string | null }> = [];
  const PAGE_SIZE = 1000;
  let page = 0;

  while (true) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, wix_member_id, wix_created_at')
      .not('wix_member_id', 'is', null)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) {
      console.error('Failed to fetch profiles:', error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;
    allProfiles.push(...data);
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  const profiles = allProfiles;
  console.log(`Fetched ${profiles.length} profiles with wix_member_id`);

  // Build map: wix_member_id → profile id
  const profileMap = new Map<string, { id: string; wix_created_at: string | null }>();
  for (const p of profiles ?? []) {
    if (p.wix_member_id) profileMap.set(p.wix_member_id, p);
  }

  // Prepare updates
  const updates: Array<{ id: string; wix_created_at: string }> = [];
  const skippedAlreadySet: string[] = [];
  const skippedNoProfile: string[] = [];

  for (const user of valid) {
    const profile = profileMap.get(user.member_id);
    if (!profile) {
      skippedNoProfile.push(user.member_id);
      continue;
    }
    if (profile.wix_created_at) {
      skippedAlreadySet.push(user.member_id);
      continue; // idempotent: don't overwrite existing value
    }
    // Convert YYYY-MM-DD to ISO timestamp (midnight UTC)
    const isoDate = new Date(`${user.created_date}T00:00:00Z`).toISOString();
    updates.push({ id: profile.id, wix_created_at: isoDate });
  }

  console.log(`\nSummary:`);
  console.log(`  To update:        ${updates.length}`);
  console.log(`  Already set:      ${skippedAlreadySet.length}`);
  console.log(`  No matching profile: ${skippedNoProfile.length}`);

  if (updates.length === 0) {
    console.log('\nNothing to update. Done.');
    return;
  }

  // Batch update in groups of 50 to avoid request size limits
  const BATCH_SIZE = 50;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(({ id, wix_created_at }) =>
        supabase
          .from('profiles')
          .update({ wix_created_at })
          .eq('id', id)
      )
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.error) {
        console.error(`  Update error: ${result.value.error.message}`);
        errorCount++;
      } else if (result.status === 'rejected') {
        console.error(`  Request failed: ${result.reason}`);
        errorCount++;
      } else {
        successCount++;
      }
    }

    const progress = Math.min(i + BATCH_SIZE, updates.length);
    process.stdout.write(`\r  Progress: ${progress}/${updates.length}`);
  }

  console.log(`\n\nDone! Updated: ${successCount}, Errors: ${errorCount}`);

  if (skippedNoProfile.length > 0) {
    console.log(`\nWIX member_ids with no matching profile (${skippedNoProfile.length}):`);
    skippedNoProfile.slice(0, 20).forEach(id => console.log(`  ${id}`));
    if (skippedNoProfile.length > 20) {
      console.log(`  ... and ${skippedNoProfile.length - 20} more`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

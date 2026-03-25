#!/usr/bin/env npx tsx
/**
 * Push HTG schema to Supabase by executing SQL statements
 * via individual REST API calls.
 *
 * Supabase REST API (PostgREST) doesn't support raw DDL.
 * Instead, we create an RPC function first, then use it to
 * execute the migration.
 *
 * Usage: export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/push-schema.ts
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

async function execSQL(sql: string): Promise<{ data: any; error: any }> {
  // Use the Supabase SQL endpoint (available since late 2024)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (res.ok) {
    return { data: await res.json().catch(() => null), error: null };
  }

  const error = await res.json().catch(() => ({ message: res.statusText }));
  return { data: null, error };
}

async function main() {
  console.log('\n🔄 HTG Schema Push\n');

  // First, create the exec_sql function itself
  console.log('1️⃣  Creating exec_sql helper function...');

  // We can't create a function via PostgREST — we need to use the pg_net extension
  // or the Supabase Management API. Let's check if exec_sql already exists.
  const { error: checkErr } = await execSQL('SELECT 1');

  if (checkErr) {
    console.log('   ❌ exec_sql function does not exist.');
    console.log('');
    console.log('   You need to run this SQL in the Supabase Dashboard SQL Editor first:');
    console.log('');
    console.log('   CREATE OR REPLACE FUNCTION exec_sql(query text)');
    console.log('   RETURNS json AS $$');
    console.log('   BEGIN');
    console.log('     EXECUTE query;');
    console.log('     RETURN \'{"ok": true}\'::json;');
    console.log('   END;');
    console.log('   $$ LANGUAGE plpgsql SECURITY DEFINER;');
    console.log('');
    console.log('   Then re-run this script.');
    console.log('');
    console.log('   OR just paste the full migration SQL from clipboard:');
    console.log('   📋 Supabase Dashboard → SQL Editor → Paste → Run');

    // Copy to clipboard
    const { execSync } = await import('child_process');
    execSync('cat supabase/migrations/001_htg_schema.sql | pbcopy');
    console.log('   ✅ Migration SQL copied to clipboard!');
    process.exit(1);
  }

  // If exec_sql exists, run migration
  console.log('   ✅ exec_sql available');

  const { readFileSync } = await import('fs');
  const sql = readFileSync('supabase/migrations/001_htg_schema.sql', 'utf-8');

  // Split into individual statements
  const statements = sql
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`2️⃣  Running ${statements.length} statements...\n`);

  let ok = 0;
  let failed = 0;

  for (const stmt of statements) {
    const short = stmt.substring(0, 60).replace(/\n/g, ' ');
    const { error } = await execSQL(stmt + ';');
    if (error) {
      console.log(`   ❌ ${short}...`);
      console.log(`      ${error.message || JSON.stringify(error)}`);
      failed++;
    } else {
      console.log(`   ✅ ${short}...`);
      ok++;
    }
  }

  console.log(`\n📊 Done: ${ok} ok, ${failed} failed\n`);
}

main().catch(console.error);

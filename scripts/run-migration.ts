#!/usr/bin/env npx tsx
/**
 * Run HTG schema migration on Supabase using the Management API
 * or directly via the PostgREST SQL execution.
 *
 * Since Supabase doesn't expose a public SQL exec endpoint,
 * we use the database connection string directly.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function checkSchema() {
  // Try to query htg.profiles to see if schema exists
  const { data, error } = await supabase.from('profiles').select('id').limit(1);

  if (error && error.code === '42P01') {
    console.log('❌ Schema not found — migration needed');
    return false;
  } else if (error && error.message.includes('schema')) {
    console.log('❌ Schema not found —', error.message);
    return false;
  } else if (error) {
    console.log('⚠️ Error:', error.code, error.message);
    return false;
  } else {
    console.log('✅ Schema exists, profiles table accessible, rows:', data?.length);
    return true;
  }
}

async function main() {
  console.log('\n🔄 HTG Schema Migration Check\n');
  console.log(`Project: ${SUPABASE_URL}`);

  const exists = await checkSchema();

  if (exists) {
    console.log('\n✅ Schema already migrated. Nothing to do.\n');
    return;
  }

  console.log('\n⚠️  Schema needs to be created.');
  console.log('   Since Supabase REST API cannot execute DDL statements,');
  console.log('   you need to run the migration SQL in one of these ways:\n');
  console.log('   Option 1: Supabase Dashboard → SQL Editor');
  console.log('   Option 2: psql with database password');
  console.log('   Option 3: supabase db push (if CLI is linked)\n');

  const sqlPath = resolve('supabase/migrations/001_htg_schema.sql');
  const sql = readFileSync(sqlPath, 'utf-8');
  console.log(`   SQL file: ${sqlPath}`);
  console.log(`   SQL size: ${sql.length} bytes\n`);

  // Copy to clipboard on macOS
  try {
    const { execSync } = await import('child_process');
    execSync(`cat "${sqlPath}" | pbcopy`);
    console.log('   📋 SQL copied to clipboard! Paste it in Supabase SQL Editor.\n');
  } catch {
    console.log('   (Could not copy to clipboard)\n');
  }
}

main().catch(console.error);

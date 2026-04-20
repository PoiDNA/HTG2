/**
 * Archiwizuje (deaktywuje) wszystkie istniejące importy archival_diarize (OpenAI)
 * dla sesji HTG-Month — zwalnia miejsce pod nowe importy z Fireflies.
 *
 * Uruchamianie:
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/archive-openai-imports.ts --dry-run
 *   env $(grep -v '^#' .env.local | xargs) npx tsx scripts/archive-openai-imports.ts
 */

import { createClient } from '@supabase/supabase-js';

function assertEnv(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`❌ Brak env: ${name}`); process.exit(1); }
  return v;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const supabaseUrl = assertEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = assertEnv('SUPABASE_SERVICE_ROLE_KEY');
  const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Znajdź wszystkie aktywne importy dla sesji HTG-Month
  const { data: imports, error } = await db
    .from('session_speaker_imports')
    .select('id, session_template_id, source, source_job_key, session_templates!inner(bunny_video_id)')
    .eq('is_active', true)
    .eq('source', 'archival_diarize')
    .ilike('session_templates.bunny_video_id', 'HTG-Month/%');

  if (error) { console.error('❌ DB error:', error.message); process.exit(1); }

  const list = (imports ?? []) as Array<{
    id: string;
    session_template_id: string;
    source: string;
    source_job_key: string;
    session_templates: { bunny_video_id: string };
  }>;

  console.log(`\n📋 Znaleziono ${list.length} aktywnych importów OpenAI dla HTG-Month\n`);

  if (dryRun) {
    for (const r of list) {
      console.log(`  ${r.id} — ${r.session_templates.bunny_video_id}`);
    }
    console.log(`\n✨ Dry-run: ${list.length} importów byłoby zarchiwizowanych.`);
    return;
  }

  const ids = list.map((r) => r.id);
  const { error: updateErr } = await db
    .from('session_speaker_imports')
    .update({ is_active: false, status: 'superseded' })
    .in('id', ids);

  if (updateErr) { console.error('❌ Update error:', updateErr.message); process.exit(1); }

  console.log(`✅ Zarchiwizowano ${ids.length} importów OpenAI.`);
}

main().catch((e) => { console.error('💥', e); process.exit(1); });

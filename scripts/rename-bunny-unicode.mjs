#!/usr/bin/env node
/**
 * Rename Bunny Storage files with Unicode characters to ASCII-safe names.
 * Also updates bunny_video_id in Supabase session_templates.
 *
 * Bunny CDN pull zones can't serve files with Unicode chars in path (404).
 * This script transliterates Polish diacritical chars to ASCII equivalents.
 *
 * Usage: node scripts/rename-bunny-unicode.mjs [--dry-run] [--execute]
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env.local manually (no dotenv dependency)
const __dirname = dirname(fileURLToPath(import.meta.url));
// Try multiple env file locations (worktree → repo root)
const envPaths = [
  resolve(__dirname, '../.env.local'),
  resolve(__dirname, '../../../.env.local'),
  resolve(__dirname, '../../../../.env.local'),
];
const envPath = envPaths.find(p => { try { readFileSync(p); return true; } catch { return false; } });
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
} catch { /* ignore */ }

const STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE;
const STORAGE_HOST = process.env.BUNNY_STORAGE_HOSTNAME;
const STORAGE_KEY = process.env.BUNNY_STORAGE_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const dryRun = !process.argv.includes('--execute');

if (dryRun) {
  console.log('=== DRY RUN (use --execute to apply) ===\n');
}

// Polish char transliteration
const POLISH_MAP = {
  'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
  'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z',
  '\u00a0': '_', // non-breaking space → underscore
};

function transliterate(name) {
  // Normalize to NFC first (precomposed), then try map
  let normalized = name.normalize('NFC');
  let result = '';
  for (const ch of normalized) {
    result += POLISH_MAP[ch] ?? ch;
  }
  // If still has non-ASCII, try NFD (decomposed) → strip combining marks
  if ([...result].some(c => c.charCodeAt(0) > 127)) {
    result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  // Final safety: replace any remaining non-ASCII with empty string
  result = result.replace(/[^\x20-\x7E]/g, '');
  return result;
}

function hasUnicode(name) {
  return [...name].some(c => c.charCodeAt(0) > 127);
}

async function listFiles(folder) {
  const url = `https://${STORAGE_HOST}/${STORAGE_ZONE}/${folder}/`;
  const res = await fetch(url, { headers: { AccessKey: STORAGE_KEY } });
  return res.json();
}

async function copyFile(srcPath, dstPath) {
  // Bunny Storage: download from source, upload to destination
  const srcUrl = `https://${STORAGE_HOST}/${STORAGE_ZONE}/${srcPath}`;
  const dstUrl = `https://${STORAGE_HOST}/${STORAGE_ZONE}/${dstPath}`;

  // Stream download → upload
  const dlRes = await fetch(srcUrl, { headers: { AccessKey: STORAGE_KEY } });
  if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status} for ${srcPath}`);

  const upRes = await fetch(dstUrl, {
    method: 'PUT',
    headers: {
      AccessKey: STORAGE_KEY,
      'Content-Type': 'application/octet-stream',
    },
    body: dlRes.body, // stream body directly
    duplex: 'half',
  });
  if (!upRes.ok) {
    const text = await upRes.text();
    throw new Error(`Upload failed: ${upRes.status} ${text} for ${dstPath}`);
  }
}

async function deleteFile(path) {
  const url = `https://${STORAGE_HOST}/${STORAGE_ZONE}/${path}`;
  const res = await fetch(url, { method: 'DELETE', headers: { AccessKey: STORAGE_KEY } });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Delete failed: ${res.status} for ${path}`);
  }
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1. List all files in HTG-Month with Unicode chars
  const files = await listFiles('HTG-Month');
  const unicodeFiles = files.filter(f => !f.IsDirectory && hasUnicode(f.ObjectName));

  console.log(`Found ${unicodeFiles.length} files with Unicode characters\n`);

  // 2. Find matching DB records
  const { data: sessions } = await supabase
    .from('session_templates')
    .select('id, title, bunny_video_id')
    .like('bunny_video_id', 'HTG-Month/%');

  const dbMap = new Map();
  for (const s of sessions || []) {
    if (s.bunny_video_id) {
      const filename = s.bunny_video_id.replace('HTG-Month/', '');
      dbMap.set(filename, s);
    }
  }

  // Also check booking_recordings
  const { data: recordings } = await supabase
    .from('booking_recordings')
    .select('id, source_url')
    .like('source_url', 'HTG-Month/%');

  const recMap = new Map();
  for (const r of recordings || []) {
    if (r.source_url) {
      const filename = r.source_url.replace('HTG-Month/', '');
      recMap.set(filename, r);
    }
  }

  let renamed = 0;
  let errors = 0;

  for (const file of unicodeFiles) {
    const oldName = file.ObjectName;
    const newName = transliterate(oldName);
    const oldPath = `HTG-Month/${oldName}`;
    const newPath = `HTG-Month/${newName}`;
    const sizeMB = (file.Length / 1024 / 1024).toFixed(1);

    const dbRecord = dbMap.get(oldName);
    const recRecord = recMap.get(oldName);

    console.log(`[${sizeMB} MB] ${oldName}`);
    console.log(`       → ${newName}`);
    if (dbRecord) console.log(`       DB: session_templates.id=${dbRecord.id}`);
    if (recRecord) console.log(`       DB: booking_recordings.id=${recRecord.id}`);
    if (!dbRecord && !recRecord) console.log('       DB: NO MATCH (orphaned file)');

    if (!dryRun) {
      try {
        // Copy file
        process.stdout.write('       Copying... ');
        await copyFile(oldPath, newPath);
        console.log('OK');

        // Update DB
        if (dbRecord) {
          const { error } = await supabase
            .from('session_templates')
            .update({ bunny_video_id: newPath })
            .eq('id', dbRecord.id);
          if (error) throw new Error(`DB update failed: ${error.message}`);
          console.log('       DB session_templates updated');
        }
        if (recRecord) {
          const { error } = await supabase
            .from('booking_recordings')
            .update({ source_url: newPath })
            .eq('id', recRecord.id);
          if (error) throw new Error(`DB booking_recordings updated`);
          console.log('       DB booking_recordings updated');
        }

        // Delete old file
        await deleteFile(oldPath);
        console.log('       Old file deleted');

        renamed++;
      } catch (e) {
        console.error(`       ERROR: ${e.message}`);
        errors++;
      }
    }
    console.log();
  }

  console.log(`\n=== ${dryRun ? 'DRY RUN' : 'DONE'}: ${renamed} renamed, ${errors} errors, ${unicodeFiles.length} total ===`);
}

main().catch(console.error);

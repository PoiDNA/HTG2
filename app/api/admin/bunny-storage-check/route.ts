import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/roles';
import {
  isBackupStorageConfigured,
  getBackupStorageZone,
  uploadBackupFile,
  deleteBackupFile,
} from '@/lib/bunny-backup-storage';
import { signHtg2StorageUrl } from '@/lib/bunny';

/**
 * GET /api/admin/bunny-storage-check
 *
 * End-to-end healthcheck of the HTG2 recording storage pipeline.
 * Admin-only. Tests every component of the Bunny Storage + Pull Zone setup
 * without requiring a real live session.
 *
 * Steps:
 *   1. Verify all required env vars are set (upload side + read side)
 *   2. Upload a small test file to the storage zone
 *   3. Generate a signed URL via the HTG2 Pull Zone
 *   4. Fetch the signed URL and verify content matches what we uploaded
 *   5. Delete the test file
 *
 * Response shape:
 *   {
 *     ok: boolean,                 // true only if ALL steps passed
 *     steps: Array<{
 *       step: string,              // human-readable step name
 *       ok: boolean,
 *       message: string,           // error detail or success info
 *       durationMs?: number,
 *     }>,
 *     config: {                    // sanitized env var presence check (no secrets)
 *       uploadConfigured: boolean,
 *       storageZone: string | null,
 *       storageHostname: string,
 *       cdnUrl: string | null,
 *       cdnTokenConfigured: boolean,
 *     },
 *   }
 */
export async function GET(_request: NextRequest) {
  const steps: Array<{ step: string; ok: boolean; message: string; durationMs?: number }> = [];

  // ── Auth: admin only ─────────────────────────────────────────────────
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? '')) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }

  // ── Config snapshot (no secrets exposed) ─────────────────────────────
  const config = {
    uploadConfigured: isBackupStorageConfigured(),
    storageZone: getBackupStorageZone() || null,
    storageHostname: process.env.BUNNY_BACKUP_STORAGE_HOSTNAME ?? 'storage.bunnycdn.com',
    cdnUrl: process.env.BUNNY_HTG2_CDN_URL ?? null,
    cdnTokenConfigured: Boolean(process.env.BUNNY_HTG2_CDN_TOKEN_KEY),
  };

  // ── Step 1: env vars ─────────────────────────────────────────────────
  if (!config.uploadConfigured) {
    steps.push({
      step: 'env_vars_upload',
      ok: false,
      message: 'BUNNY_BACKUP_STORAGE_ZONE or BUNNY_BACKUP_STORAGE_API_KEY not set',
    });
    return NextResponse.json({ ok: false, steps, config }, { status: 200 });
  }
  steps.push({
    step: 'env_vars_upload',
    ok: true,
    message: `zone=${config.storageZone}, hostname=${config.storageHostname}`,
  });

  if (!config.cdnUrl || !config.cdnTokenConfigured) {
    steps.push({
      step: 'env_vars_cdn',
      ok: false,
      message: 'BUNNY_HTG2_CDN_URL or BUNNY_HTG2_CDN_TOKEN_KEY not set — playback will fail',
    });
    return NextResponse.json({ ok: false, steps, config }, { status: 200 });
  }
  steps.push({
    step: 'env_vars_cdn',
    ok: true,
    message: `cdn=${config.cdnUrl}`,
  });

  // ── Step 2: upload test file ─────────────────────────────────────────
  // Path uses a unique name so concurrent healthchecks don't collide.
  // Kept outside recordings/ to avoid interfering with real data listing.
  const testTimestamp = Date.now();
  const testPath = `_healthcheck/bunny-storage-check-${testTimestamp}.txt`;
  const testContent = `HTG2 bunny storage healthcheck\ntimestamp=${testTimestamp}\nadmin=${user.email}\n`;
  const testBuffer = new TextEncoder().encode(testContent).buffer as ArrayBuffer;

  const uploadStart = Date.now();
  try {
    await uploadBackupFile(testPath, testBuffer);
    steps.push({
      step: 'upload',
      ok: true,
      message: `uploaded ${testBuffer.byteLength} bytes to ${testPath}`,
      durationMs: Date.now() - uploadStart,
    });
  } catch (err) {
    steps.push({
      step: 'upload',
      ok: false,
      message: err instanceof Error ? err.message : 'unknown upload error',
      durationMs: Date.now() - uploadStart,
    });
    return NextResponse.json({ ok: false, steps, config }, { status: 200 });
  }

  // ── Step 3: sign URL ─────────────────────────────────────────────────
  const signedUrl = signHtg2StorageUrl(testPath, 300); // 5 min TTL
  if (!signedUrl) {
    steps.push({
      step: 'sign_url',
      ok: false,
      message: 'signHtg2StorageUrl returned null — BUNNY_HTG2_CDN_URL/TOKEN_KEY missing',
    });
    // Try to clean up the uploaded file before returning
    await deleteBackupFile(testPath).catch(() => {});
    return NextResponse.json({ ok: false, steps, config }, { status: 200 });
  }
  steps.push({
    step: 'sign_url',
    ok: true,
    message: `signed URL generated (TTL 5 min)`,
  });

  // ── Step 4: fetch via CDN + verify content ──────────────────────────
  // Bunny Pull Zone may take a few seconds to pick up newly uploaded files
  // (origin cache). Retry a couple of times with small delays.
  const fetchStart = Date.now();
  let fetchOk = false;
  let fetchMessage = '';
  let fetchedContent = '';
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(signedUrl, { cache: 'no-store' });
      if (res.ok) {
        fetchedContent = await res.text();
        if (fetchedContent === testContent) {
          fetchOk = true;
          fetchMessage = `fetched and content matches (attempt ${attempt}/${maxAttempts})`;
          break;
        } else {
          fetchMessage = `content mismatch — expected ${testBuffer.byteLength} bytes, got ${fetchedContent.length}`;
        }
      } else if (res.status === 403) {
        fetchMessage = `403 Forbidden — Pull Zone Token Auth key may not match BUNNY_HTG2_CDN_TOKEN_KEY`;
        break; // token mismatch — retry won't help
      } else if (res.status === 404 && attempt < maxAttempts) {
        // File not yet visible on CDN, wait and retry
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        fetchMessage = `404 on attempt ${attempt}/${maxAttempts}, retrying…`;
        continue;
      } else {
        fetchMessage = `HTTP ${res.status} ${res.statusText}`;
        break;
      }
    } catch (err) {
      fetchMessage = err instanceof Error ? err.message : 'fetch failed';
    }
  }

  steps.push({
    step: 'fetch_via_cdn',
    ok: fetchOk,
    message: fetchMessage,
    durationMs: Date.now() - fetchStart,
  });

  // ── Step 5: cleanup — delete test file ───────────────────────────────
  const deleteStart = Date.now();
  try {
    const deleted = await deleteBackupFile(testPath);
    steps.push({
      step: 'cleanup_delete',
      ok: deleted,
      message: deleted ? `deleted ${testPath}` : 'delete returned false',
      durationMs: Date.now() - deleteStart,
    });
  } catch (err) {
    steps.push({
      step: 'cleanup_delete',
      ok: false,
      message: err instanceof Error ? err.message : 'delete failed',
      durationMs: Date.now() - deleteStart,
    });
  }

  const allOk = steps.every((s) => s.ok);
  return NextResponse.json({ ok: allOk, steps, config }, { status: 200 });
}

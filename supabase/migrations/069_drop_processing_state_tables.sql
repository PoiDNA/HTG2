-- ═══════════════════════════════════════════════════════════════
-- 069: Drop processing state tables — moved to external service
--
-- Tabele stanu przetwarzania (processing_jobs, advisories, junction,
-- version counters, idempotency keys) przeniesione do osobnego
-- projektu Supabase (mroczek-p/ext-api). HTG2 zachowuje tylko:
-- - consent gate RPCs (mig 057-061)
-- - export endpoints (export-dossier, export-dossiers-batch)
-- - processing_export_subjects + audit (mig 066-067)
-- - processing_nonce_store (mig 068)
--
-- Te tabele były puste na produkcji (endpointy gated za
-- processing_export_enabled=false). DROP jest bezpieczny.
-- ═══════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS processing_job_advisories CASCADE;
DROP TABLE IF EXISTS version_reservations CASCADE;
DROP TABLE IF EXISTS advisory_version_counters CASCADE;
DROP TABLE IF EXISTS idempotency_keys CASCADE;
DROP TABLE IF EXISTS processing_advisories CASCADE;
DROP TABLE IF EXISTS processing_jobs CASCADE;

DROP FUNCTION IF EXISTS reserve_advisory_version(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS cleanup_idempotency_keys();
DROP FUNCTION IF EXISTS processing_jobs_touch_updated_at();

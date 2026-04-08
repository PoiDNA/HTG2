/* Migration 047: Backup pivot from Bunny Stream to Bunny Storage
   ============================================================================
   PR #250 (migration 046) introduced sesja recording backup to a separate
   Bunny Stream library. Decision reversed: Bunny Stream transcodes uploaded
   files into multi-bitrate HLS variants which 10x storage cost. Backups are
   archival (warm DR) — they don't need streaming, transcoding, or token auth.

   Pivot to Bunny Storage:
   - File copied from R2 → uploaded to Bunny Storage zone (HTG_BACKUP_SESSIONS)
   - No encoding step → backup_status goes straight from NULL to 'ready'
   - No hot failover in token endpoint — admin manually recovers from Bunny
     Storage panel if primary fails (warm DR, not hot replica)
   - 10x cheaper storage cost vs Stream library

   New columns:
   - backup_storage_path  — file path within the storage zone
   - backup_storage_zone  — storage zone name (for multi-zone scenarios)

   Old columns from migration 046 (deprecated, kept for now to avoid data loss
   if any test backups were already created in Stream — they would have NULL
   backup_storage_path and stale backup_bunny_video_id):
   - backup_bunny_video_id   (was Stream video GUID, now unused)
   - backup_bunny_library_id (was Stream library ID, now unused)

   Block comments (slash-star) used instead of -- for paste robustness. */

ALTER TABLE public.booking_recordings
  ADD COLUMN IF NOT EXISTS backup_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS backup_storage_zone TEXT;

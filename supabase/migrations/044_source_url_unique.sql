-- Unique constraint on source_url for idempotent import scanning.
-- Live recordings use R2 object keys, imports use Bunny Storage paths — disjoint formats.
CREATE UNIQUE INDEX IF NOT EXISTS uq_recording_source_url
  ON public.booking_recordings(source_url)
  WHERE source_url IS NOT NULL;

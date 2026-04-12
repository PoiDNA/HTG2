-- Add columns for YouTube playlist banner feature
-- source: 'manual' (existing /nagrania entries) vs 'playlist' (cron-discovered)
-- content_locale: required for playlist entries, NULL for manual
-- discovered_at: when the cron first saw this video (backfilled from created_at)

-- 1. Add columns (discovered_at nullable temporarily for backfill)
ALTER TABLE public.youtube_videos
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS content_locale TEXT,
  ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ;

-- 2. Backfill discovered_at from created_at for existing rows
UPDATE public.youtube_videos
  SET discovered_at = created_at
  WHERE discovered_at IS NULL;

-- 3. Set NOT NULL + DEFAULT for new rows
ALTER TABLE public.youtube_videos
  ALTER COLUMN discovered_at SET NOT NULL,
  ALTER COLUMN discovered_at SET DEFAULT now();

-- 4. CHECK: playlist requires content_locale, manual requires NULL
ALTER TABLE public.youtube_videos
  ADD CONSTRAINT youtube_source_locale_check
  CHECK (
    (source = 'playlist' AND content_locale IS NOT NULL)
    OR (source = 'manual' AND content_locale IS NULL)
  );

-- 5. Partial index for banner query performance
CREATE INDEX IF NOT EXISTS youtube_videos_banner_lookup
  ON public.youtube_videos (source, content_locale, discovered_at DESC)
  WHERE source = 'playlist';

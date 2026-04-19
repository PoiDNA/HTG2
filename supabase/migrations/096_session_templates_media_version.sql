-- 096 — media_version dla cache-bustingu Bunny CDN.
--
-- Bunny Pull Zone cache'uje po pełnym URL (path + query). signPrivateCdnUrl
-- generuje identyczny URL dla tej samej ścieżki, więc podmiana pliku pod
-- tym samym `bunny_video_id` pod Storage → CDN serwuje stary cache aż do TTL.
--
-- Rozwiązanie: `media_version` inkrementowany przy podmianie pliku, dodawany
-- jako `&v=<n>` do podpisanego URL (poza hashem tokenu — Bunny hashuje tylko
-- path). Bumping version dodatkowo wymusza unieważnienie `waveform_peaks_url`
-- i aktywnego importu transkrypcji (segmenty są dla starego audio).
--
-- Integracja z Bunny Purge API przyjdzie osobno.

ALTER TABLE session_templates
  ADD COLUMN IF NOT EXISTS media_version INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN session_templates.media_version IS
  'Inkrementowana przy podmianie pliku w Bunny Storage pod tą samą ścieżką. Dodawana jako &v=N do podpisanego URL (cache-busting).';

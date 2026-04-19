-- Migration 095: Dopuść 'archival_diarize' jako źródło speaker import
-- ====================================================================
-- Sesje archiwalne w pakietach miesięcznych (HTG-Month) nie są LiveKit —
-- ingest wprost z Bunny / HTG2 Storage przez gpt-4o-transcribe-diarize
-- potrzebuje osobnego source, żeby raporty/observability były czytelne.

ALTER TABLE public.session_speaker_imports
  DROP CONSTRAINT IF EXISTS session_speaker_imports_source_check;

ALTER TABLE public.session_speaker_imports
  ADD CONSTRAINT session_speaker_imports_source_check
  CHECK (source IN (
    'manual',
    'livekit_phase2_pertrack',
    'livekit_phase2_diarize',
    'archival_diarize'
  ));

COMMENT ON COLUMN public.session_speaker_imports.source IS
  'Źródło ingestu: manual | livekit_phase2_pertrack | livekit_phase2_diarize | archival_diarize.';

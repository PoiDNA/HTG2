-- Migration 097: Dopuść 'fireflies_diarize' jako źródło speaker import
-- =====================================================================
-- Fireflies.ai API zastępuje gpt-4o-transcribe-diarize dla sesji archiwalnych
-- HTG-Month — wyższa jakość diaryzacji, brak chunking, natywne pliki m4v.

ALTER TABLE public.session_speaker_imports
  DROP CONSTRAINT IF EXISTS session_speaker_imports_source_check;

ALTER TABLE public.session_speaker_imports
  ADD CONSTRAINT session_speaker_imports_source_check
  CHECK (source IN (
    'manual',
    'livekit_phase2_pertrack',
    'livekit_phase2_diarize',
    'archival_diarize',
    'fireflies_diarize'
  ));

COMMENT ON COLUMN public.session_speaker_imports.source IS
  'Źródło ingestu: manual | livekit_phase2_pertrack | livekit_phase2_diarize | archival_diarize | fireflies_diarize.';

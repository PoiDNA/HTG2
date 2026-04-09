-- ═══════════════════════════════════════════════════════════════
-- 058: app_settings — key/value store dla runtime feature flags
--
-- Motywacja z planu htg-processing §3.1:
--
-- Poprzedni plan używał `current_setting('app.client_analytics_enabled')`
-- w RPC. To zawodne w środowisku z Vercel serverless + connection pooling:
--   * session setting nie przenosi się między connection pool workers
--   * brak spójnego sposobu ustawienia go z aplikacji
--   * ryzyko "losowej" wartości między requestami
--
-- Rozwiązanie: dedykowana tabela app_settings czytana w tej samej transakcji
-- co consent gate. Jeden source of truth, zapisywany przez admina przez UI
-- lub bezpośrednio w bazie (Supabase Dashboard).
--
-- Klucze dla htg-processing (Phase 0):
--   * client_analytics_enabled — istniejący pipeline insights (był ENV flag)
--   * processing_export_enabled — nowy gate dla eksportu danych do processing service
--
-- Oba domyślnie false. Admin flipuje po zakończeniu legal green (PRE-2 + DPO).
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Tabela app_settings ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE public.app_settings IS
  'Runtime feature flags i konfiguracja aplikacji. Czytane w transakcji razem '
  'z consent gate — jeden source of truth, spójny między connection pool workers. '
  'Patrz: docs/processing-service-plan.md §3.1';


-- ── 2. Trigger: auto-update updated_at na każdy change ─────────

CREATE OR REPLACE FUNCTION public.app_settings_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS app_settings_touch ON public.app_settings;
CREATE TRIGGER app_settings_touch
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.app_settings_touch_updated_at();


-- ── 3. Seed: początkowe flagi dla htg-processing ───────────────
-- Oba false — legal green wymagany przed flip na prod.

INSERT INTO public.app_settings (key, value, description) VALUES
  (
    'client_analytics_enabled',
    'false'::jsonb,
    'Istniejący pipeline client-analysis (Sonnet 3.5 journey extraction + Whisper). '
    'Flip po PRE-2 legal review. Czytane przez check_processing_export_consent + '
    'check_processing_export_consent_meeting.'
  ),
  (
    'processing_export_enabled',
    'false'::jsonb,
    'Nowy eksport dossier do izolowanego serwisu htg-processing. Flip po legal green '
    '(osobny Anthropic workspace DPA, DPO opinia art. 9, encrypted audit bucket, ROPA). '
    'Czytane przez check_processing_export_consent + check_processing_export_consent_meeting.'
  )
ON CONFLICT (key) DO NOTHING;


-- ── 4. RLS: tylko service_role pisze, admin czyta ──────────────
-- Aplikacja używa service_role do odczytu w RPC. Admin UI (przyszłe) czyta
-- własną polityką. Klienci końcowi nie mają dostępu.

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_settings'
      AND policyname = 'service_all_app_settings'
  ) THEN
    CREATE POLICY "service_all_app_settings" ON public.app_settings
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_settings'
      AND policyname = 'admin_read_app_settings'
  ) THEN
    CREATE POLICY "admin_read_app_settings" ON public.app_settings
      FOR SELECT
      USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;


-- ── 5. Helper function: read boolean setting (STABLE, transakcja-safe) ──
-- Używane przez RPC consent gate — każdy call w ramach transakcji request
-- dostaje ten sam wynik (STABLE semantyka), bez ryzyka driftu między
-- wieloma odczytami z app_settings w jednej transakcji.

CREATE OR REPLACE FUNCTION public.app_setting_bool(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((value)::boolean, false)
    FROM public.app_settings
   WHERE key = p_key;
$$;

REVOKE EXECUTE ON FUNCTION public.app_setting_bool(TEXT) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.app_setting_bool(TEXT) TO service_role;

COMMENT ON FUNCTION public.app_setting_bool(TEXT) IS
  'Stable helper do odczytu boolean app_settings w consent gate RPCs. '
  'SECURITY DEFINER + explicit search_path chroni przed schema injection. '
  'Zwraca false dla nieistniejących kluczy (defensive — nigdy nie otwiera gate przez błąd klucza).';

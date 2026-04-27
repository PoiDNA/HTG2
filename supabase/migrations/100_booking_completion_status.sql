-- Dodaje śledzenie czy sesja się odbyła
-- completion_status = NULL → brak adnotacji (normalny przebieg)
-- completion_status = 'no_show'         → klient nie stawił się
-- completion_status = 'cancelled_by_htg' → sesja odwołana przez HTG

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS completion_status TEXT
    CHECK (completion_status IN ('no_show', 'cancelled_by_htg')),
  ADD COLUMN IF NOT EXISTS completion_notes TEXT;

COMMENT ON COLUMN public.bookings.completion_status IS
  'no_show = klient nie stawił się, cancelled_by_htg = odwołana przez HTG, NULL = brak adnotacji';
COMMENT ON COLUMN public.bookings.completion_notes IS
  'Opcjonalna notatka adminowa do statusu completion_status';

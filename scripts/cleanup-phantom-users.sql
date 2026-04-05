-- ============================================================
-- Raport: phantom users (report-only, NIE kasuje automatycznie)
--
-- Użycie: uruchom w Supabase SQL Editor (wymaga dostępu do auth.users)
-- Przejrzyj wyniki ręcznie przed podjęciem jakichkolwiek akcji.
-- ============================================================

SELECT
  u.id,
  u.email,
  u.created_at                      AS auth_created_at,
  u.last_sign_in_at,
  p.display_name,
  p.role,
  p.wix_member_id,
  p.created_at                      AS profile_created_at,
  -- Klasyfikacja powodu zakwalifikowania
  CASE
    WHEN u.last_sign_in_at IS NULL THEN 'never_signed_in'
    WHEN u.last_sign_in_at < u.created_at + INTERVAL '5 minutes'
         AND u.last_sign_in_at = (
           SELECT MAX(s.last_sign_in_at) FROM auth.users s WHERE s.id = u.id
         ) THEN 'signed_in_once_at_creation'
    ELSE 'no_activity'
  END                                AS phantom_reason
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE
  -- Tylko zwykli użytkownicy (nie admini/staff)
  (p.role IS NULL OR p.role = 'user')
  -- Konto starsze niż 7 dni (wykluczenie świeżo utworzonych przez admina)
  AND u.created_at < NOW() - INTERVAL '7 days'
  -- Wykluczenie użytkowników zmigrowanych z Wix
  AND (p.wix_member_id IS NULL)
  -- Brak dostępu do nagrań
  AND NOT EXISTS (
    SELECT 1 FROM public.booking_recording_access bra
    WHERE bra.user_id = u.id
  )
  -- Brak zgód RODO (poza auto-created przy logowaniu)
  AND NOT EXISTS (
    SELECT 1 FROM public.consent_records cr
    WHERE cr.user_id = u.id
  )
  -- Brak rezerwacji sesji
  AND NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.user_id = u.id
  )
  -- Brak zamówień
  AND NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.user_id = u.id
  )
  -- Brak passkeys
  AND NOT EXISTS (
    SELECT 1 FROM public.passkey_credentials pk
    WHERE pk.user_id = u.id
  )
ORDER BY u.created_at DESC;

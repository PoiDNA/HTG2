# HTG Platform — Architektura v2

## Przegląd
Platforma do sesji rozwoju duchowego prowadzonych przez Natalię HTG. VOD + sesje live + system rezerwacji + pipeline publikacji audio + spotkania wstępne.

**URL:** htgcyou.com | **Repo:** github.com/PoiDNA/HTG2

---

## Stack technologiczny

| Warstwa | Technologia |
|---------|-------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Next.js API Routes (serverless) |
| Baza danych | Supabase (PostgreSQL + Auth + Realtime + RLS) |
| Płatności | Stripe (Checkout + Webhooks + Invoicing) |
| Wideo live | LiveKit Cloud (WebRTC, Egress recording MP4) |
| VOD streaming | Bunny Stream (HLS + Token Auth) |
| Storage plików | Bunny Storage (WAV, MP3, assety) |
| Email | Resend (SMTP via Supabase Auth) |
| CDN/DNS | Cloudflare |
| Hosting | Vercel (serverless, Edge) |
| AI | OpenAI Whisper (transkrypcja), Claude (analiza) |

---

## Baza danych — 34 tabele

### Core
| Tabela | Opis |
|--------|------|
| `profiles` | Użytkownicy (role: user/admin/moderator/publikacja; is_blocked, blocked_reason, blocked_at) |
| `products` | Produkty (sesja, pakiet miesięczny, roczny, indywidualne) |
| `prices` | Ceny Stripe (stripe_price_id, amount, currency) |
| `orders` | Zamówienia (stripe/wix/manual) |
| `entitlements` | Uprawnienia VOD (session/monthly/yearly, valid_from/until) |

### Sesje VOD
| Tabela | Opis |
|--------|------|
| `session_templates` | Szablony sesji (95 sesji z blogów WIX) |
| `monthly_sets` | Zestawy miesięczne (33: Maj 2024 — Sty 2027) |
| `set_sessions` | Junction: zestaw <-> sesja |
| `youtube_videos` | 30 publicznych filmów YouTube |

### Rezerwacje
| Tabela | Opis |
|--------|------|
| `staff_members` | Natalia, Agata, Justyna (role, session_types) |
| `availability_rules` | Harmonogram tygodniowy (dzień + godziny) |
| `availability_exceptions` | Zablokowane dni |
| `booking_slots` | Konkretne sloty (data, czas, status, solo_locked; session_type obejmuje też pre_session) |
| `bookings` | Rezerwacje klientów (24h hold, confirm, transfer) |
| `acceleration_queue` | Kolejka przyspieszenia terminów |

### Sesje Live
| Tabela | Opis |
|--------|------|
| `live_sessions` | Pokoje LiveKit (8 faz, 3 egress ID, nagrania MP4) |
| `active_streams` | Concurrent stream limiter (1 urządzenie) |
| `session_sharing` | Udostępnianie sesji live (sharing_mode: open/favorites/invited, invited_emails[]) |
| `session_listeners` | Słuchacze towarzyszący listen-only (joined_at, left_at) |

### Publikacja
| Tabela | Opis |
|--------|------|
| `session_publications` | Pipeline: raw → editing → edited → mastering → published; live_session_id FK, UNIQUE |

### Spotkania wstępne
| Tabela | Opis |
|--------|------|
| `pre_session_settings` | Ustawienia asystentki (staff_member_id UNIQUE, is_enabled, duration_minutes=15, note_for_client) |
| `pre_session_eligibility` | Uprawnienia klientów (user_id+staff_member_id+source_booking_id UNIQUE, is_active, meeting_booked, pre_booking_id) |

### Społeczność
| Tabela | Opis |
|--------|------|
| `user_favorites` | Polubieni (user <-> user) |

### Audyt / Bezpieczeństwo
| Tabela | Opis |
|--------|------|
| `play_events` | Per-play audit log (user_id, session_id, device_id, ip_address, country_code, user_agent, play_duration_seconds, started_at, ended_at) |
| `user_flags` | Flagi naruszeń (flag_type: ip_diversity/high_frequency/concurrent_countries/mass_play/manual; severity: info/warning/critical; resolved_at, resolved_by) |

### RODO
| Tabela | Opis |
|--------|------|
| `consent_records` | Zgody RODO |
| `audit_logs` | Logi audytowe |

---

## Migracje

| Plik | Opis |
|------|------|
| `001–007` | Core schema: profiles, bookings, live_sessions, entitlements, publications, sharing, consent |
| `008_publication_system.sql` | System publikacji (session_publications, pipeline statusy) |
| `009_webhook_fixes.sql` | RPC `complete_session_track_egress()` z FOR UPDATE lock; UNIQUE na session_publications |
| `010_audit_log.sql` | play_events, user_flags, profiles.is_blocked/blocked_reason/blocked_at |
| `011_pre_session.sql` | pre_session_settings, pre_session_eligibility, booking_slots pre_session type; RPC `grant_pre_session_to_existing_bookings()` |

---

## Role i uprawnienia

| Rola | Panel | Opis |
|------|-------|------|
| `user` | /konto | Klient: VOD, rezerwacje, spotkania wstępne |
| `moderator` | /prowadzacy | Natalia/Asystentki: grafik (+ spotkania wstępne), sesje, klienci |
| `admin` | /konto/admin | Pełna kontrola + impersonacja prowadzących |
| `publikacja` | /publikacja | Edytorzy audio: DAW, upload WAV, pipeline AI |

### Admin impersonacja
Admin może "wejść" w widok dowolnej asystentki przez cookie `admin_view_as`.
Obsługiwane przez `getEffectiveStaffMember()` — wszystkie API routes `/api/staff/*` i `/api/pre-session/*` automatycznie respektują impersonację.

---

## Sesje Live — 8 faz

```
poczekalnia → wstep → przejscie_1 → sesja → przejscie_2 → podsumowanie → outro → ended
```

| Faza | Kamera | Mikrofon | Nagrywanie | Opis |
|------|--------|----------|------------|------|
| Poczekalnia | — | — | — | Klient czeka, animacja + muzyka |
| Wstep | ON | ON | MP4 | Video call, powitanie |
| Przejscie 1 | OFF | OFF | — | Animacja #1 + muzyka (15s fade) |
| **Sesja** | OFF | ON | MP4 | Audio-only, animacja cząsteczki |
| Przejscie 2 | ON | ON | — | Animacja #2 + muzyka (15s fade) |
| Podsumowanie | ON | ON | MP4 | Video call, dyskusja |
| Outro | — | — | — | Klient sam, 15 min, animacja + muzyka |

### Specjalne funkcje:
- **Rozmowa prywatna** — prowadzący rozmawiają bez klienta
- **Przerwa** — klient sygnalizuje przerwę (dźwięk + banner)
- **Suwak głośności** — klient reguluje głośność prowadzących
- **Udostępnianie** — klient może udostępnić fazę Sesja innym (listen-only)

### Egress recording:
- Format: MP4 (kompatybilny z Whisper API)
- 3 nagrania: wstep_mp4, sesja_mp4, podsumowanie_mp4
- Atomowy update via RPC `complete_session_track_egress()` z FOR UPDATE lock (brak race condition)
- Po zakończeniu wszystkich tracks: automatyczne tworzenie session_publication

---

## Spotkania wstępne (pre-session)

15-minutowe spotkania online asystentek z klientami przed sesją.

### Przepływ:
1. Asystentka włącza funkcję w Grafiku (zakładka Grafik → sekcja Spotkania wstępne)
2. Przy włączeniu: RPC automatycznie dodaje eligibility do istniejących rezerwacji klientów
3. Asystentka dodaje terminy (15-min sloty) w tym samym miejscu
4. Klient widzi zakładkę "Spotkanie wstępne" w /konto
5. Klient wybiera termin → rezerwacja nieodwołalna

### UI:
- **Asystentka**: sekcja "Spotkania wstępne (15 min)" na dole strony Grafiku — zwijana (accordion), lazy-load
- **Klient**: /konto/spotkanie-wstepne — slot picker + potwierdzenie

---

## Zabezpieczenia VOD

1. HLS streaming (brak jednego linka do pobrania)
2. Signed URLs (wygasają po 15 min, HMAC-SHA256)
3. Concurrent stream limit (1 urządzenie, heartbeat 30s)
4. Canvas watermark (email + userId na obrazie)
5. Web Audio API routing (utrudnia audio capture)
6. disablePictureInPicture, nodownload, noplaybackrate
7. Blokada PrintScreen

### Audyt i wykrywanie naruszeń

Per-play audit log z automatycznym flagowaniem:

| Scenariusz | Próg warning | Próg critical |
|------------|-------------|---------------|
| ip_diversity | 4 różne IP / 7 dni | 8 różnych IP / 7 dni |
| high_frequency | — | >20 odtworzeń / 7 dni |
| mass_play | — | >10 sesji / 1 dzień |
| concurrent_countries | — | różne kraje w oknie 30 min |

- Blokada konta: `profiles.is_blocked = true` → `/api/video/token` zwraca 403
- Panel: /konto/admin/naruszenia — flagi, historia odtworzeń, blokowanie/odblokowanie
- Deduplikacja flag: pomija jeśli ten sam typ unresolved z ostatnich 24h

---

## Pipeline publikacji audio

```
Surowe MP4 → Ekstrakcja WAV → Transkrypcja (Whisper) → Analiza (Claude) → Czyszczenie → Mix → Mastering → Publikacja
```

### Etapy AI:
1. **Whisper** — transkrypcja z word-level timestamps (PL)
2. **Claude haiku** — identyfikacja fillerów, artefaktów, ciszy
3. **Clean** — usunięcie segmentów, noise gate, normalizacja
4. **Mix** — stereo + intro/outro muzyczne z crossfade
5. **Master** — normalizacja -1dB, kompresja, limiter -0.5dB

### Edytor DAW (przeglądarka):
- Wielościeżkowy timeline z waveformami (Canvas)
- Synchronized cut — przycięcie = przycięcie wszystkich ścieżek
- Solo/Mute/Volume per track
- Fade in/out, Undo/Redo (Ctrl+Z)
- Export WAV (individual + mixed)
- Skróty: Space, Delete, Ctrl+X, Home/End, +/-

### LiveKit → Publikacja:
- /publikacja/nagrania — lista sesji z nagraniami, podgląd statusu
- Przycisk "Utwórz publikację" → POST /api/publikacja/from-live-session
- Mapowanie participantId → nazwa (staff_members + profiles, 3 równoległe zapytania)

---

## API Routes (55+)

### Auth
- POST /auth/callback — PKCE code exchange

### Stripe
- POST /api/stripe/checkout — tworzenie checkout session
- POST /api/stripe/webhook — checkout.completed, subscription.deleted

### Video VOD
- POST /api/video/token — signed Bunny URL + concurrent check + blokada is_blocked
- POST /api/video/heartbeat — keepalive (30s)
- POST /api/video/stop — cleanup stream
- POST /api/video/play-event — start/stop play audit (action: start|stop)

### Booking
- GET /api/booking/slots — dostępne sloty
- POST /api/booking/reserve — rezerwacja (24h hold)
- POST /api/booking/confirm — potwierdzenie
- POST /api/booking/transfer — przeniesienie na inny termin

### Staff (Grafik)
- GET/POST/DELETE /api/staff/availability — reguły tygodniowe
- GET/POST /api/staff/exceptions — zablokowane dni
- GET /api/staff/slots — sloty (practitioner: wszystkie; assistant: moje + dostępne)
- POST /api/staff/slots/join — asystentka dołącza do slotu
- POST /api/staff/slots/leave — asystentka opuszcza slot
- POST /api/staff/slots/swap — przekazanie slotu innej asystentce
- GET /api/staff/me — dane zalogowanej asystentki (respektuje impersonację)

### Pre-session meetings
- GET/POST /api/pre-session/settings — toggle ON/OFF + notatka dla klienta
- GET/POST/DELETE /api/pre-session/eligibility — zarządzanie uprawnieniami klientów
- GET/POST/DELETE /api/pre-session/slots — zarządzanie terminami 15-min
- POST /api/pre-session/book — klient rezerwuje termin

### Live Sessions
- POST /api/live/token — LiveKit JWT
- POST /api/live/create — utwórz room
- POST /api/live/phase — zmiana fazy (+ egress start/stop)
- POST /api/live/admit — wpuść klienta
- POST /api/live/webhook — LiveKit egress events (atomowy update via RPC)

### Publikacja
- GET/PATCH /api/publikacja/sessions — lista + update
- POST /api/publikacja/upload — WAV → Bunny Storage
- GET /api/publikacja/download/[...path] — proxy download
- POST /api/publikacja/auto-edit — uruchom pipeline AI
- GET /api/publikacja/auto-edit/status — status pipeline
- POST /api/publikacja/from-live-session — utwórz publikację z nagrania LiveKit

### Admin
- GET/POST /api/admin/staff — lista prowadzących
- PATCH /api/admin/flags — resolve flag, block/unblock user

### Sharing & Favorites
- POST /api/sharing/configure — ustaw tryb udostępniania
- GET /api/sharing/available — lista sesji do odsłuchu
- POST /api/sharing/join — dołącz jako listener
- POST /api/favorites/add — dodaj do polubionych
- DELETE /api/favorites/remove — usuń
- GET /api/favorites/list — lista polubionych + followers

---

## Strony (pages)

### Panel klienta (/konto)
| Ścieżka | Opis |
|---------|------|
| /konto | Dashboard: entitlements, nadchodzące rezerwacje |
| /konto/sesje-indywidualne | VOD sesji + rezerwacje |
| /konto/zestawy-miesięczne | VOD zestawów miesięcznych |
| /konto/youtube | Filmy YouTube |
| /konto/spotkanie-wstepne | Rezerwacja spotkania wstępnego (slot picker) |
| /konto/nagrania-klienta | Nagrania przed/po sesji |
| /konto/admin | Panel admina (użytkownicy, sloty, zestawy) |
| /konto/admin/naruszenia | Dashboard naruszeń (flagi, blokady, historia odtworzeń) |

### Panel prowadzącego (/prowadzacy)
| Ścieżka | Opis |
|---------|------|
| /prowadzacy | Dashboard |
| /prowadzacy/sesje | Lista sesji live |
| /prowadzacy/grafik | Grafik: Natalia (reguły+sloty) lub Asystentka (moje sloty + dostępne + spotkania wstępne) |
| /prowadzacy/klienci | Lista klientów |

### Sesje live (/live)
| Ścieżka | Opis |
|---------|------|
| /live/[sessionId] | Pokój LiveKit (8 faz) |

### Publikacja (/publikacja)
| Ścieżka | Opis |
|---------|------|
| /publikacja | Dashboard publikacji |
| /publikacja/sesje | Lista sesji do opublikowania |
| /publikacja/sesje/[id] | Edytor DAW + pipeline AI |
| /publikacja/archiwum | Opublikowane sesje |
| /publikacja/nagrania | Nagrania LiveKit → tworzenie publikacji |

---

## Wzorce deweloperskie

### Impersonacja (admin → asystentka)
- Cookie `admin_view_as` = staff_member.id
- `getEffectiveStaffMember()` — server component + API routes
- `requireStaff()` — wrapper dla API routes; korzysta z `getEffectiveStaffMember()`
- Wszystkie `/api/staff/*` i `/api/pre-session/*` automatycznie respektują impersonację

### Webhook atomowość
- LiveKit egress events mogą przyjść równolegle
- RPC `complete_session_track_egress()` z `FOR UPDATE` row lock → brak race condition na JSONB update

### Bezpieczeństwo SQL functions
- Wszystkie SECURITY DEFINER functions: `SET search_path = public`
- PostgREST .or() — nigdy nie interpoluj user input; używaj `.in()` z tablicą

---

## Migracja WIX

- 2150 użytkowników zmigrowanych do Supabase Auth (Email OTP)
- 2425 entitlements (bezterminowy dostęp do sesji)
- 1973 orders (audit trail z WIX)
- 95 session_templates z blogów WIX
- 33 monthly_sets (Maj 2024 — Sty 2027)
- 30 YouTube videos (publiczne)

---

## Env vars (18)

| Zmienna | Serwis |
|---------|--------|
| NEXT_PUBLIC_SUPABASE_URL | Supabase (auth.htg.cyou) |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase |
| SUPABASE_SERVICE_ROLE_KEY | Supabase (server) |
| STRIPE_SECRET_KEY | Stripe (sk_live_) |
| STRIPE_WEBHOOK_SECRET | Stripe (whsec_) |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY | Stripe (pk_live_) |
| BUNNY_TOKEN_KEY | Bunny Stream |
| BUNNY_API_KEY | Bunny Stream |
| BUNNY_LIBRARY_ID | Bunny Stream |
| BUNNY_STORAGE_API_KEY | Bunny Storage |
| BUNNY_STORAGE_HOSTNAME | Bunny Storage |
| BUNNY_STORAGE_ZONE | Bunny Storage |
| NEXT_PUBLIC_BUNNY_CDN_URL | Bunny CDN |
| LIVEKIT_URL | LiveKit Cloud |
| LIVEKIT_API_KEY | LiveKit |
| LIVEKIT_API_SECRET | LiveKit |
| OPENAI_API_KEY | Whisper |
| ANTHROPIC_API_KEY | Claude |

---

## Deploy

- Vercel — auto-deploy z main branch
- robots.txt — Disallow: / (staging)
- Domeny: htgcyou.com (prod), www → redirect, htg-2.vercel.app
- Supabase Auth: auth.htg.cyou (custom domain)

---

*Ostatnia aktualizacja: 2026-03-27*

# HTG Platform — Architektura v4

## Przegląd
Platforma do sesji rozwoju duchowego prowadzonych przez Natalię HTG. VOD + sesje live + system rezerwacji + pipeline publikacji audio + spotkania wstępne + spotkania grupowe + sesje dla par + prezenty sesyjne + Communication Hub (email/SMS) + Centrum Kontaktu (portal klient-obsługa).

**URL:** htgcyou.com | **Repo:** github.com/PoiDNA/HTG2

---

## Stack technologiczny

| Warstwa | Technologia |
|---------|-------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Next.js API Routes (serverless) |
| Baza danych | Supabase (PostgreSQL + Auth + Realtime + RLS) |
| Płatności | Stripe (Checkout + Webhooks + Invoicing) |
| Wideo live | LiveKit Cloud (WebRTC, Egress recording MP4 — composite + per-participant tracks) |
| Storage nagrań źródłowych | Cloudflare R2 (bucket `htg-rec`, S3-compat, presigned URLs 24h — permanentna druga kopia) |
| **Primary storage dla HTG2 live recordings** | **Bunny Storage zone `htg-backup-sessions` + Pull Zone `htg-backup-sessions.b-cdn.net` z Token Auth** (raw MP4, bez transcoding — 10× taniej niż Stream) |
| Legacy VOD streaming (pre-HTG2) | Bunny Stream (HLS + Token Auth) — tylko dla starych importów historycznego HTG |
| Storage plików (VOD, assety, publikacje) | Bunny Storage zone `htg2` (WAV, MP3, assety publikacje) |
| Email (wysyłka+odbiór) | Resend (outbound + inbound webhooks, Svix verify) |
| CDN/DNS | Cloudflare |
| Hosting | Vercel (serverless, Edge) |
| AI | OpenAI Whisper (transkrypcja), Claude Haiku (analiza audio + email AI) |

---

## Baza danych — 50+ tabel

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
| `live_sessions` | Pokoje LiveKit (8 faz, 3 composite egress ID, JSONB tracks per uczestnik, `recording_lock_until` lease lock, `last_retry_at` cooldown) |
| `active_streams` | Concurrent stream limiter (1 urządzenie) |
| `session_sharing` | Udostępnianie sesji live (sharing_mode: open/favorites/invited, invited_emails[]) |
| `session_listeners` | Słuchacze towarzyszący listen-only (joined_at, left_at) |
| `booking_recordings` | Pipeline R2→Bunny Storage per faza (`recording_phase`: wstep/sesja/podsumowanie; `backup_storage_path`, `backup_storage_zone`; status lifecycle; `expires_at` — NULL dla HTG2 = retencja off) |
| `booking_recording_access` | RLS: kto może odtwarzać które nagranie (granted_reason, revoked_at) |
| `booking_recording_audit` | Immutable audit trail (recording_created/bunny_*/backup_*/access_*/orphan_deleted) |

### Publikacja
| Tabela | Opis |
|--------|------|
| `session_publications` | Pipeline: raw → editing → edited → mastering → published; live_session_id FK, UNIQUE |

### Spotkania wstępne
| Tabela | Opis |
|--------|------|
| `pre_session_settings` | Ustawienia asystentki (staff_member_id UNIQUE, is_enabled, duration_minutes=15, note_for_client) |
| `pre_session_eligibility` | Uprawnienia klientów (user_id+staff_member_id+source_booking_id UNIQUE, is_active, meeting_booked, pre_booking_id) |

### Spotkania grupowe (HTG Meetings)
| Tabela | Opis |
|--------|------|
| `htg_meetings` | Definicje spotkań grupowych (self_register, max_participants) |
| `htg_meeting_sessions` | Sesje spotkań (status: waiting/active/ended, started_at) |
| `htg_meeting_participants` | Uczestnicy (status: registered/approved/joined/left) |
| `htg_meeting_speaking_events` | Logi mówienia (start/end, offset_seconds) — D2/D3 profil |
| `htg_meeting_recordings` | Nagrania spotkań |
| `participant_profiles` | Profile uczestników (score computation z speaking events) |

### Sesje dla par (natalia_para)
| Tabela | Opis |
|--------|------|
| `booking_companions` | Partner sesji (invite_token, accepted_at); booking_id FK |

### Prezenty sesyjne
| Tabela | Opis |
|--------|------|
| `session_gifts` | Podarowane sesje (entitlement_id, purchased_by, recipient_email, claim_token, status: pending/claimed/revoked) |

### Communication Hub (email + portal + przyszły SMS)
| Tabela | Opis |
|--------|------|
| `mailboxes` | Skrzynki odbiorcze (kontakt@, sesje@, htg@, natalia@, portal@htg.internal) |
| `mailbox_members` | Uprawnienia per skrzynka (user_id + role: owner/member) |
| `conversations` | Wątki — kanał-agnostyczne (channel: email/sms/internal/**portal**, status, priority, AI labels) |
| `messages` | Wiadomości (direction: inbound/outbound/internal, SMTP threading, attachments JSONB, processing queue, **read_at** per-message) |
| `message_templates` | Szablony wiadomości (multi-channel, created_by per user, **is_default_footer** dla stopek) |
| `autoresponders` | Autoresponders z trigger_conditions JSONB |
| `auto_reply_log` | Rate limiter + magic link cooldown |

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
| `012_pre_session_paid.sql` | Paid pre-session via Stripe |
| `013_session_timers_connect.sql` | Session timers + Stripe Connect |
| `014_playback_analytics.sql` | Playback analytics |
| `015_quick_calls.sql` | Quick calls |
| `016_htg_meetings.sql` | Spotkania grupowe (meetings, sessions, participants) |
| `017_meeting_queue.sql` | Kolejka spotkań |
| `018_meeting_recordings.sql` | Nagrania spotkań |
| `019_participant_profiles.sql` | Profile uczestników (scoring) |
| `020_session_para.sql` | Sesja dla par (natalia_para type, booking_companions) |
| `021_session_gifts.sql` | Prezenty sesyjne (session_gifts, claim_token) |
| `022_entitlement_type_booking.sql` | Extend entitlements.type → individual_booking |
| `023_communication_hub.sql` | Communication Hub: mailboxes, conversations, messages, templates, autoresponders, RPC (claim_pending_messages, get_customer_card) |
| `024–034` | Importy, płatności, community, auth, site_settings |
| `035_portal_messaging.sql` | Centrum Kontaktu: channel 'portal', RPC `create_portal_conversation()`, portal mailbox, indeksy, read_at |
| `035_booking_recordings.sql` | Pipeline R2→Bunny: `booking_recordings`, `booking_recording_access` (RLS), `booking_recording_audit` |
| `036_portal_rodo_onboarding.sql` | RODO: `delete_user_portal_data()`, `export_user_portal_data()`, trigger `auto_manage_portal_mailbox_member()` |
| `036_recording_security_fixes.sql` | Recording security: RPC `check_recording_consent()` z FOR UPDATE lock |
| `037_footer_templates.sql` | Stopki email: `is_default_footer` na message_templates, unique partial index |
| `046_recording_phase_and_backup.sql` | **3 fazy + lease lock**: `booking_recordings.recording_phase` (wstep/sesja/podsumowanie), `live_sessions.recording_lock_until` (lease 60s auto-expire), `last_retry_at` (retry cooldown), rozszerzone audit actions |
| `047_backup_storage_pivot.sql` | **Storage pivot**: `backup_storage_path`, `backup_storage_zone` — ścieżka pliku w Bunny Storage zone |

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

### Egress recording — pipeline R2 → Bunny Storage (3 fazy)

**Format źródłowy**: MP4 composite per faza (kompatybilny z Whisper API) + per-participant audio tracks dla fazy sesja.

**Pełna ścieżka flow**:
```
LiveKit egress
    ↓
Cloudflare R2 (bucket htg-rec, permanentna druga kopia — nic nie usuwane)
    ↓
Cron /api/cron/process-recordings (co 2 min, Section 1)
    ↓
Bunny Storage zone htg-backup-sessions
    └─ recordings/{YYYY-MM-DD}/{email}/{phase}-{session_type}-{short_id}.{ext}
    ↓
HTG2 Pull Zone htg-backup-sessions.b-cdn.net + Token Auth (15 min TTL)
    ↓
Klient słucha przez <audio> tag (MP4 z MIME audio/mp4)
```

**3 fazy recording_phase** (kolumna w `booking_recordings`):
| Faza | Composite MP4 | Per-participant tracks | Widoczność klienta |
|------|:-:|:-:|:-:|
| **wstep** (video+audio) | ✅ | ❌ | ❌ admin only |
| **sesja** (audio only) | ✅ | ✅ (do edycji/publikacji) | ✅ `/konto/nagrania-sesji` |
| **podsumowanie** (video+audio) | ✅ | ❌ | ❌ admin only |

**Klient widzi TYLKO sesja** (3 warstwy ochrony):
1. Cron Section 1: `grantAccessIfConsented` odpala się TYLKO dla `recording_phase='sesja'` — wstep/podsumowanie nigdy nie dostają access rows
2. UI (`nagrania-sesji/page.tsx` + `PrivateRecordingsSection.tsx`) ma defensywny filtr `recording_phase === 'sesja'`
3. Token endpoint: gdy `recording_phase !== 'sesja'`, blokuje wszystkich oprócz direct admina (bez impersonacji)

**Ścieżka w Bunny Storage — human-navigable** (migracja 047 + PR #253):
```
recordings/2026-04-08/jan.kowalski@example.com/sesja-natalia_solo-f7d9e2a5.mp4
recordings/2026-04-08/jan.kowalski@example.com/wstep-natalia_solo-a8b3c4d1.mp4
recordings/2026-04-08/jan.kowalski@example.com/podsumowanie-natalia_solo-e5f6a7b2.mp4
```
Po ściągnięciu na dysk: sortowanie chronologiczne przez `ls`, filtry przez `find -path "*email*"` i `find -name "sesja-*"`. Edge cases: polskie znaki w emailu sanitizowane (`Łukasz+test@...` → `_ukasz_test@...`).

**Webhook + race safety** (`app/api/live/webhook/route.ts`):
- `matchEgressPhase()` matchuje egress_id do `egress_wstep_id` / `egress_sesja_id` / `egress_podsumowanie_id`
- **Warunkowy UPSERT** w `egress_started` — chroni `duration_seconds`/`source_url`/`status` przed clobberem przy out-of-order webhooks
- **RETRY-SAFE `egress_ended`**: najpierw lookup w `booking_recordings.egress_id`, dopiero potem fallback do `live_sessions` — chroni stare segmenty po retry-recording przed osieroceniem
- Atomowy RPC `complete_session_track_egress()` z FOR UPDATE lock (sesja tracks)
- Po zakończeniu wszystkich tracks: automatyczne `session_publication`

**Monitoring nagrywania — real-time dla prowadzącego**:
- `GET /api/live/recording-status`: matchuje konkretny `egress_sesja_id` w `listEgress` (ignoruje track egressy), grace period 20s dla LiveKit cold start, zwraca `'unknown'` przy timeout (nie fałszywy alarm)
- LiveRoom polling co 30s + `visibilitychange` refresh (background tab fix) + anti-burst guard (`inFlight`)
- **4-stanowy REC badge**: REC (active) / OCZEKIWANIE (pending) / ⚠ BRAK NAGRYWANIA (error) / SPRAWDZANIE… (unknown)
- PhaseControls: warning "Rozważ przełączenie na Zoom" przy error
- `POST /api/live/retry-recording`: idempotent (sprawdza czy egress nadal działa), RODO consent re-check, restart composite + track egresses (post-produkcja!), DB cooldown 60s w `live_sessions.last_retry_at`, audit log

**Race condition fix — lease lock** (`lib/live/recording-lock.ts`):
- `phase` i `consent` mogły równolegle wywołać `startRoomCompositeEgress` → race
- `live_sessions.recording_lock_until`: lease timestamp z auto-expire 60s
- Atomowy UPDATE `WHERE recording_lock_until IS NULL OR recording_lock_until < NOW() AND egress_sesja_id IS NULL` — tylko pierwszy proces wygrywa
- Po crashu Vercel: lock auto-wygasa, zero stuck locks

**Retencja OFF dla HTG2**:
- Nowe rekordy HTG2: `expires_at = NULL` → retention query nie matchuje → nic nie jest kasowane
- Cron Sections 2/3/4/5 są **no-op** dla HTG2 (brak polling, brak retention expiry, brak orphan GC, brak R2 cleanup)
- R2 działa jako permanentna druga kopia obok Bunny Storage
- Section 7 (stuck egress) zostaje — tylko flaguje jako `failed`, nie usuwa

**Auth matrix — recording-status + retry-recording** (`lib/live/recording-auth.ts`):
- `isAdminEmail()` (globalny admin) **LUB**
- `isStaffEmail()` (Natalia/Agata/Justyna/Przemek) **LUB**
- Asystent przypisany do slota — JOIN przez `staff_members.user_id === auth.users.id` (bo `booking_slots.assistant_id` to FK do `staff_members.id`, NIE `auth.users.id`)

**Pre-existing fix — consent IDOR**:
- `POST /api/live/consent` wcześniej zapisywał consent dla dowolnego `bookingId` bez sprawdzenia właściciela
- Fix: weryfikacja `bookings.user_id === user.id OR booking_companions.user_id === user.id` przed zapisem (RODO)

**Dlaczego Bunny Storage zamiast Stream** (pivot w PR #252):
- HTG2 serwuje audio, nie wideo → HLS transcoding zbędny
- Bunny Stream: multi-bitrate HLS variants = 10× koszt
- Bunny Storage: raw MP4 = 1× koszt + prostsze (brak encoding step, brak polling)
- Stream zostaje tylko dla legacy historycznych importów pre-HTG2

**Env vars HTG2 recording pipeline**:
- `BUNNY_BACKUP_STORAGE_ZONE=htg-backup-sessions` — storage zone (write side)
- `BUNNY_BACKUP_STORAGE_API_KEY` — zone-specific password (FTP & API Access)
- `BUNNY_BACKUP_STORAGE_HOSTNAME=storage.bunnycdn.com` (lub regionalny endpoint)
- `BUNNY_HTG2_CDN_URL=https://htg-backup-sessions.b-cdn.net` — Pull Zone URL (read side)
- `BUNNY_HTG2_CDN_TOKEN_KEY` — Pull Zone Token Auth key

**Healthcheck**: `GET /api/admin/bunny-storage-check` — testuje env vars + upload + signed URL fetch + delete end-to-end bez czekania na sesję.

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
- POST /api/live/phase — zmiana fazy (+ egress start/stop, lease lock chroni przed race z consent)
- POST /api/live/admit — wpuść klienta
- POST /api/live/consent — RODO consent z IDOR fix (booking ownership check) + lease lock przy starcie egressu
- POST /api/live/webhook — LiveKit egress events: `matchEgressPhase` dla 3 faz + warunkowy UPSERT + RETRY-SAFE egress_ended (lookup po booking_recordings.egress_id)
- GET /api/live/recording-status — real-time status egress (admin/staff/asystent przez staff_members JOIN; grace period 20s; status: active/pending/error/unknown)
- POST /api/live/retry-recording — manual retry (idempotent + RODO consent re-check + restart composite + track egresses + DB cooldown 60s + audit log)

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
- GET /api/admin/bunny-storage-check — healthcheck Bunny Storage pipeline (env vars + upload + signed URL fetch + delete, end-to-end)
- POST /api/admin/import-recording — import archiwalnych nagrań z Bunny Storage do bazy

### Sharing & Favorites
- POST /api/sharing/configure — ustaw tryb udostępniania
- GET /api/sharing/available — lista sesji do odsłuchu
- POST /api/sharing/join — dołącz jako listener
- POST /api/favorites/add — dodaj do polubionych
- DELETE /api/favorites/remove — usuń
- GET /api/favorites/list — lista polubionych + followers

### HTG Meetings (spotkania grupowe)
- POST /api/htg-meeting/session/self-register — rejestracja uczestnika (+ DELETE cancel)
- POST /api/htg-meeting/session/[sessionId]/approve-participant — admin approve/reject
- GET /api/htg-meeting/session/my-active — aktywne sesje usera (polling 10s)
- POST /api/htg-meeting/session/[id]/speaking-event — log mówienia (start/end + offset)
- GET /api/htg-meeting/session/[id]/recording-check — sprawdź nagranie
- POST /api/htg-meeting/session/[id]/state — zmiana stanu sesji
- GET /api/htg-meeting/profiles — profile uczestników

### Companion (sesja dla par)
- POST /api/companion/invite — utwórz zaproszenie (invite_token) + DELETE usuń
- POST /api/companion/accept — partner akceptuje zaproszenie

### Gift Sessions (prezenty)
- POST /api/gift/claim — odbiorca klika token → przeniesienie entitlement
- POST /api/gift/transfer — Iwona ręcznie przekazuje po emailu
- POST /api/gift/revoke — Iwona odwołuje prezent
- POST /api/gift/link-pending — auto-link prezentów po logowaniu

### Communication Hub (email)
- POST /api/email/inbound — Resend webhook (Svix verify, anti-loop, 0 DB queries)
- POST /api/email/compose — nowa wiadomość (compose modal)
- POST /api/email/send — reply w wątku (SMTP threading: In-Reply-To + References)
- GET /api/email/threads — lista wątków (filtry: status, priority, category, mailbox)
- GET /api/email/threads/[id] — wątek + messages + customerCard
- POST /api/email/threads/[id]/close|assign|link-user|verify-link
- GET /api/email/templates — lista szablonów (own + global)
- POST /api/email/templates — utwórz szablon
- PUT/DELETE /api/email/templates/[id] — edytuj/usuń
- POST /api/email/upload — upload załączników → Bunny Storage
- GET /api/email/search-users — autocomplete (email/imię)
- GET /api/email/verify — magic link callback (weryfikacja powiązania konta)

### Centrum Kontaktu (portal klient→obsługa)
- GET /api/portal/conversations — lista konwersacji usera (cursor pagination, auto-refresh 15s)
- POST /api/portal/conversations — nowa konwersacja (atomic RPC, rate limit 5/24h)
- GET /api/portal/conversations/[id] — wątek + messages (pure read, 403 IDOR defense)
- POST /api/portal/conversations/[id]/messages — follow-up (rate limit 20/h, 409 na closed)
- POST /api/portal/conversations/[id]/read — mark outbound as read
- GET /api/portal/unread-count — nieprzeczytane konwersacje
- POST /api/portal/admin-reply — admin odpowiada (plain text, after() email notification)

### Email Notifications (Resend outbound)
- sendOrderConfirmation — po Stripe checkout
- sendBookingConfirmation — po rezerwacji slotu
- sendSessionReminder — cron D-1 (08:00)
- sendGiftNotification — powiadomienie odbiorcy prezentu z claim linkiem
- sendWelcomeEmail — po pierwszym logowaniu
- sendPaymentFailedNotification — po nieudanej płatności
- sendEarlierSlotNotification — wcześniejszy termin
- Portal reply notification — after() best-effort: "Masz nową wiadomość od zespołu HTG"

### Cron (Vercel)
- */5 * * * * — /api/cron/prepare-sessions (tworzenie live_sessions + expire slotów)
- 0 8 * * * — /api/cron/session-reminders (email D-1)
- * * * * * — /api/cron/process-messages (async email processing: fetch body, AI, attachments)

### Auth
- POST /api/auth/session — sync tokens to server cookies
- POST /api/auth/welcome — welcome email for new users

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
| /konto/spotkania-grupowe | Spotkania grupowe klienta |
| /konto/spotkania-grupowe/dostepne | Odkrywanie + rejestracja na spotkania |
| /konto/polubieni | Lista polubionych użytkowników |
| /konto/podarowane-sesje | Wysłane/otrzymane prezenty (claim, transfer, revoke) |
| /konto/odbierz-prezent/[token] | Strona odbioru prezentu (magic link) |
| /konto/sesje-indywidualne/dolacz-jako-partner/[token] | Akceptacja zaproszenia na sesję par |
| /konto/wiadomosci | **Centrum Kontaktu** — user UI: lista wątków, chat timeline, nowa wiadomość, auto-refresh 10/15s |
| /konto/admin | Panel admina (użytkownicy, sloty, zestawy) |
| /konto/admin/naruszenia | Dashboard naruszeń (flagi, blokady, historia odtworzeń) |
| /konto/admin/skrzynka | Communication Hub — fullscreen inbox, email+portal, channel filter, slideout CustomerCard, toolbar (bold/drukuj/preview/stopki) |

### Panel prowadzącego (/prowadzacy)
| Ścieżka | Opis |
|---------|------|
| /prowadzacy | Dashboard |
| /prowadzacy/sesje | Lista sesji live |
| /prowadzacy/grafik | Grafik: Natalia (reguły+sloty) lub Asystentka (moje sloty + dostępne + spotkania wstępne) |
| /prowadzacy/klienci | Lista klientów |

### Spotkania grupowe (/spotkanie)
| Ścieżka | Opis |
|---------|------|
| /spotkanie/[sessionId] | Pokój LiveKit spotkania (MeetingRoom: timer, speaking tracking, ended screen) |

### Sesje live (/live)
| Ścieżka | Opis |
|---------|------|
| /live/[sessionId] | Pokój LiveKit (8 faz) — obsługuje też companion (sesja par) |

### Publiczne
| Ścieżka | Opis |
|---------|------|
| /sesje-indywidualne | SessionPicker: 3 typy (solo 1200PLN, asysta 1600PLN, para 1600PLN) + gift toggle + slot calendar |
| /sesje | SessionCatalog: VOD catalog z floating cart + gift toggle |

### Publikacja (/publikacja)
| Ścieżka | Opis |
|---------|------|
| /publikacja | Dashboard publikacji |
| /publikacja/sesje | Lista sesji do opublikowania |
| /publikacja/sesje/[id] | Edytor DAW + pipeline AI |
| /publikacja/archiwum | Opublikowane sesje |
| /publikacja/nagrania | Nagrania LiveKit → tworzenie publikacji |

---

## Communication Hub — architektura

### Skrzynki i uprawnienia
| Skrzynka | Admin | Natalia | Asystentki |
|---|---|---|---|
| kontakt@htgcyou.com (domyślna) | owner | — | — |
| sesje@htgcyou.com | owner | member | na życzenie |
| htg@htg.cyou | owner | — | — |
| natalia@htg.cyou | owner | owner | — |
| portal@htg.internal (Centrum Kontaktu) | owner (auto-trigger) | member (ręcznie) | — |

### Przepływ inbound
```
Klient → Resend webhook → POST /api/email/inbound (Svix verify, 0 DB queries)
  → INSERT message (processing_status='pending') → 200 OK
  → Cron /process-messages (co 1 min, FOR UPDATE SKIP LOCKED):
    → Fetch body z Resend API
    → Upload załączników do Bunny
    → Customer Card (RPC, 1 zapytanie, 6-mies. okno)
    → Claude Haiku (analiza + spersonalizowana sugestia)
    → Update conversation z AI labels
```

### PII guard (3 warstwy)
1. **Auto-match (SPF/DKIM ok)** → `user_link_verified = true` → AI dostaje pełną kartę
2. **Manual link** → `verified = false` → AI bez danych wrażliwych, disclaimer w UI
3. **Magic link** → user klika weryfikację → `verified = true`

### Role-based inbox
- **Admin**: fullscreen inbox, channel filter (Email/HTG), slideout CustomerCard na żądanie, AI sugestie, toolbar (bold/drukuj/PDF/preview text/stopki)
- **Staff (z membership)**: 2-panel (lista + wątek), szablony, załączniki, bez AI
- **User**: Centrum Kontaktu (/konto/wiadomosci) — dedykowany UI, auto-refresh 10/15s

### Customer Card (RPC `get_customer_card`)
Jedno zapytanie SQL zwraca: profil, zamówienia (6 mies.), aktywne entitlements, nadchodzące rezerwacje, subskrypcja, poprzednie wątki.

### Szablony + Stopki
- Każdy user tworzy własne; admin widzi/edytuje globalne
- "Wstaw szablon" dropdown w compose/reply — wstawia tekst (nie zastępuje)
- CRUD: create, edit, delete via modal TemplateManager (tab Szablony | Stopki)
- **Stopki (sygnatury)**: category='footer', toggle ★ domyślna (is_default_footer), auto-append do nowej odpowiedzi
- **Bold**: `**tekst**` → `<b>tekst</b>` w HTML emaila
- **Preview text**: ukryty div na początku HTML — tekst widoczny obok tematu w Gmailu

### Zabezpieczenia
- Svix HMAC-SHA256 webhook verification
- Deduplikacja: UNIQUE(channel, provider_message_id)
- Anti-loop: Auto-Submitted + Precedence headers
- Spam pre-filter: >10/h z adresu → skip AI
- Rate-limiter: auto_reply_log (autoresponder + magic link cooldown 15 min)
- Zombie protection: locked_until + auto-reset
- Attachment: prywatne Bunny Storage paths

---

## Centrum Kontaktu (portal messaging)

Kanał `'portal'` w istniejącym Communication Hub. Klient pisze krótkie wiadomości z panelu konta, admin/Natalia odpowiadają w tej samej Skrzynce co email.

### Architektura
- **Zero nowych tabel** — reuse `conversations` + `messages` z channel='portal'
- **Osobne API endpointy** — `/api/portal/*` (nie branchowanie w email handlers)
- **Osobny admin-reply** — `/api/portal/admin-reply` (nie modyfikuje `/api/email/send`)
- **Plain text only** — brak HTML, brak attachmentów, auto-linkify w UI (whitelist: https/http/mailto)

### Bezpieczeństwo
- Auth: `user_id === auth.uid` w każdym endpoint (service role + code auth, spójne z resztą huba)
- IDOR defense: 403 (nie 404) na cudzych zasobach
- Rate limiting: 5 konwersacji/24h, 20 wiadomości/h (COUNT query per user_id)
- Walidacja: trim, min/max, UUID regex, channel allowlist
- RPC `create_portal_conversation()`: SECURITY DEFINER + search_path + walidacja wewnątrz

### Lifecycle statusów
| Status | Kto | Kiedy |
|--------|-----|-------|
| `open` | System | Nowa konwersacja lub user follow-up |
| `pending` | System | Admin odpowiedział |
| `closed` | Admin | Ręcznie (finalny dla usera → 409) |

### RODO
- `delete_user_portal_data(user_id)` — kasuje portal conversations + messages przed usunięciem konta
- `export_user_portal_data(user_id)` — eksportuje jako JSON
- Trigger `auto_manage_portal_mailbox_member()` — auto-dodaje adminów do portal mailbox

### User UI (`/konto/wiadomosci`)
- `PortalMessages.tsx` — lista, wątek (chat timeline), nowa wiadomość
- Auto-refresh: lista co 15s, otwarty wątek co 10s + auto mark-as-read
- Zamknięte wątki: disabled input + sugestia "Napisz nową wiadomość"

### Admin UI (w Skrzynce)
- Channel filter: "Wszystkie" | "Email" | "HTG"
- Badge kanału na wątkach (teal ikona MessageSquare)
- Slideout CustomerCard (przycisk "Klient" w nagłówku)
- Reply: plain textarea + "Odpowiedz (HTG)"
- Email notification via `after()` (best-effort, Resend)

### Skrzynka — toolbar
- **Bold** (B) — `**tekst**` → `<b>` w HTML emaila
- **Drukuj/PDF** — `window.print()` z @media print CSS
- **Preview text** (Eye) — tekst obok tematu w Gmailu (ukryty div)
- **Stopki** — domyślna auto-append, zarządzanie w TemplateManager (tab Stopki)
- **Expand** — textarea na pełną wysokość
- **Duży tekst** — toggle text-base
- **Załącznik** — upload pliku

---

## Sesja dla par (natalia_para)

- Typ: `natalia_para`, 1600 PLN, 120 min, prowadzi Natalia (bez asystentek)
- Stripe product: `prod_UENkxGoUs8gRir` / `price_1TFuyhKwJfb68PaVoKcaWPcz`
- Partner: zaproszenie via `booking_companions` (invite_token → accept → LiveKit access)
- LiveKit: `LiveVideoLayout.tsx` automatycznie obsługuje wielu klientów (remoteClients → circles)

---

## Prezenty sesyjne (session_gifts)

### Przepływ
1. Iwona kupuje sesję → zaznacza "Kup jako prezent" → wpisuje email syna
2. Stripe webhook: `gift_for_email` metadata → tworzy `session_gifts` z `claim_token`
3. Resend: automatyczny email do odbiorcy z linkiem claim
4. Syn tworzy konto → HTG auto-linkuje pending gifts po emailu → widzi w panelu
5. Klik "Odbierz" → entitlement przeniesiony na konto syna
6. Alternatywnie: Iwona klika "Przekaż ręcznie" → wpisuje email (odbiorca nie musi mieć konta)

### Statusy: pending → claimed | revoked

---

## Spotkania grupowe (HTG Meetings)

- Self-registration: klient rejestruje się na otwarte sesje
- Admin approve/reject uczestników
- Speaking event tracking: `isSpeaking` z LiveKit → POST offset_seconds → profile D2/D3
- Session timer (live elapsed), ended screen z countdown → redirect
- ActiveMeetingBanner: polling co 10s, zielony "Dołącz"

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

## Env vars (30+)

| Zmienna | Serwis |
|---------|--------|
| NEXT_PUBLIC_SUPABASE_URL | Supabase (auth.htg.cyou) |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase |
| SUPABASE_SERVICE_ROLE_KEY | Supabase (server) |
| STRIPE_SECRET_KEY | Stripe (sk_live_) |
| STRIPE_WEBHOOK_SECRET | Stripe (whsec_) |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY | Stripe (pk_live_) |
| BUNNY_TOKEN_KEY | Bunny Stream (legacy HTG) |
| BUNNY_API_KEY | Bunny Stream (legacy HTG) |
| BUNNY_LIBRARY_ID | Bunny Stream (legacy HTG library) |
| BUNNY_STORAGE_API_KEY | Bunny Storage `htg2` zone (publikacje, assety) |
| BUNNY_STORAGE_HOSTNAME | Bunny Storage |
| BUNNY_STORAGE_ZONE | Bunny Storage `htg2` zone |
| NEXT_PUBLIC_BUNNY_CDN_URL | Bunny CDN (`htg2-cdn.b-cdn.net`, publiczne assety) |
| BUNNY_PRIVATE_CDN_URL | Bunny CDN (`htg-private.b-cdn.net`, archiwalne importy) |
| BUNNY_PRIVATE_TOKEN_KEY | Bunny Pull Zone Token Auth (archiwalne importy) |
| **BUNNY_BACKUP_STORAGE_ZONE** | **HTG2 recording storage zone** (`htg-backup-sessions`) |
| **BUNNY_BACKUP_STORAGE_API_KEY** | **HTG2 storage zone password** (FTP & API Access) |
| **BUNNY_BACKUP_STORAGE_HOSTNAME** | **Bunny Storage endpoint** (`storage.bunnycdn.com` lub regionalny) |
| **BUNNY_HTG2_CDN_URL** | **HTG2 Pull Zone URL** (`https://htg-backup-sessions.b-cdn.net`) |
| **BUNNY_HTG2_CDN_TOKEN_KEY** | **HTG2 Pull Zone Token Auth key** (Security panel) |
| R2_ACCESS_KEY | Cloudflare R2 (LiveKit egress destination) |
| R2_SECRET_KEY | Cloudflare R2 |
| R2_ENDPOINT | Cloudflare R2 |
| R2_BUCKET | Cloudflare R2 bucket name (`htg-rec`) |
| LIVEKIT_URL | LiveKit Cloud |
| LIVEKIT_API_KEY | LiveKit |
| LIVEKIT_API_SECRET | LiveKit |
| OPENAI_API_KEY | Whisper |
| ANTHROPIC_API_KEY | Claude (audio analysis + email AI) |
| RESEND_API_KEY | Resend (outbound email) |
| RESEND_WEBHOOK_SECRET | Resend Svix (inbound webhook verify) |
| CRON_SECRET | Vercel Cron auth (Bearer token) |
| NEXT_PUBLIC_SITE_URL | https://htgcyou.com |

---

## Deploy

- Vercel — auto-deploy z main branch
- robots.txt — Disallow: / (staging)
- Domeny: htgcyou.com (prod), www → redirect, htg-2.vercel.app
- Supabase Auth: auth.htg.cyou (custom domain)
- Email domeny: htgcyou.com + htg.cyou (Resend — SPF/DKIM/DMARC + MX inbound)

### Vercel Cron Jobs
| Schedule | Endpoint | Opis |
|---|---|---|
| */5 * * * * | /api/cron/prepare-sessions | Tworzenie live_sessions + expire slotów |
| 0 8 * * * | /api/cron/session-reminders | Email D-1 reminder |
| * * * * * | /api/cron/process-messages | Async email processing (body, attachments, AI) |
| */5 * * * * | /api/cron/analyze-client | Pipeline analityki klienta — Whisper + Claude |

---

## Analityka klienta — pipeline insights

Stack: per-participant audio track egressy z LiveKit (każda z 3 faz osobno),
transkrypcja przez OpenAI Whisper, ekstrakcja insights przez Anthropic Claude
Sonnet 4.6, persystencja w `session_client_insights`. Cały pipeline za feature
flagiem `CLIENT_ANALYTICS_ENABLED` (default off).

### Tabele

- **`analytics_track_egresses`** (migracja 051) — znormalizowana tabela
  per-participant track egress per faza. Klucze: `live_session_id, phase,
  participant_identity, track_sid`. RLS: service_role only.
- **`session_client_insights`** (migracja 051) — jeden wiersz per
  `live_session_id`. Pola JSONB: `transcript`, `problems`, `emotional_states`,
  `life_events`, `goals`, `breakthroughs`, plus `journey_summary` i `summary`
  (TEXT). Status enum: `processing | ready | failed`. RLS: service_role only.
- **`session_client_insights_audit`** (migracja 054) — audit log każdego
  staff access do insights/transcript. Schemat mirror'uje
  `client_recording_audit` (050). Actions: `viewed_list, viewed_transcript,
  viewed_insights, downloaded_pdf`. Best-effort insert via
  `lib/audit/insights-audit.ts`.
- **`live_sessions`** dodane kolumny race-guard: `analytics_wstep_claimed_at`,
  `analytics_podsumowanie_claimed_at` (atomic claim flag dla cron + consent
  retroactive start).

### Pipeline runtime

1. **Start sesji** (`/api/live/admit` lub `/api/live/phase`):
   - Kompozytowy egress fazy (legacy session_publications) +
   - `startAllAnalyticsAudioTrackEgresses(roomName, phase, sessionId)` —
     osobne audio track egressy per uczestnik z `kind === AUDIO`
   - Race-guard: `analytics_*_claimed_at` UPDATE WHERE IS NULL

2. **Webhook** (`/api/live/webhook`):
   - Nowa gałąź: gdy egress kończy się i pasuje do `analytics_track_egresses`
     UPDATE `file_url` (URL R2 z prefiksem bucket'a stripped przez
     `extractR2ObjectKey()` z `lib/r2-presigned.ts`).

3. **Cron `/api/cron/analyze-client` (co 5 min)**:
   - `find_next_analytics_candidate()` RPC — wybiera sesję z grace period 2h
   - `claim_analytics_session()` RPC — atomic INSERT/UPDATE w
     `session_client_insights` (`status='processing'`)
   - `runClientAnalysis(db, sessionId)`:
     1. Download wszystkich `file_url` z R2 (signed URL via R2 client)
     2. `transcribeAudio()` — Whisper API z language='pl', verbose_json
     3. `identifySpeakers()` — Supabase lookup praktyk + companion
     4. `mergePhaseToSegments()` — pure func merging chronological per phase
     5. `analyzeSessionJourney()` — Claude API z system prompt + transcript
     6. UPDATE `session_client_insights` z transkryptem + ekstraktami,
        `status='ready'`

### Subprocessors (RODO)

- **OpenAI** (Whisper-1) — transkrypcja audio. DPA wymagana przed enable.
- **Anthropic** (Claude Sonnet 4.6) — ekstrakcja insights z tekstu. DPA
  wymagana. Tekst nie jest used for training (Claude API ToS).

Tekst zgody klienta (`session_recording_capture`) explicite wymienia obu
podprocesorów + 3 fazy + RODO art. 9 — patrz `app/api/live/consent/route.ts`.

### Admin viewer

Endpointy:
- `GET /api/admin/insights/[bookingId]` — JSON z transkryptem (allowlist:
  `canViewClientRecordings` = admin + Natalia). Audit `viewed_transcript`.
- `GET /api/admin/insights/[bookingId]/pdf` — PDF dump (pdfkit, server-side).
  Audit `downloaded_pdf`.

UI: akordeon w `/pl/konto/admin/nagrania-klientow` per wiersz nagrania,
widoczny tylko gdy `session_client_insights.status='ready'` (bulk-fetched
flag w server component).

### Agent API — stub (do wdrożenia)

**Status: zaplanowane, nie zaimplementowane.** Ten paragraf opisuje docelową
architekturę dostępu agentów AI do historii klienta (cross-session insights),
żeby kolejne PR-y miały spójny punkt odniesienia.

**Use case**: agent AI (np. preparation agent przed sesją Natalii) odpytuje
o historię klienta — wszystkie poprzednie `session_client_insights` z
ekstraktami problemów, celów i przełomów, posortowane chronologicznie.

**Proponowane endpointy** (planowane):

- `GET /api/admin/insights/by-user/[userId]` — wszystkie insights klienta
  z join przez `bookings.user_id` + `session_client_insights.booking_id`.
  Zwraca listę { booking_id, session_date, summary, problems, goals,
  breakthroughs }. Bez transkryptu (oszczędność payloadu — transkrypt
  pobierać per-session przez istniejący endpoint).
- `GET /api/admin/insights/by-user/[userId]/timeline` — chronologiczna oś
  problemów i celów (aggregation na poziomie SQL — RPC z window functions).
- `POST /api/admin/insights/search` — semantic search po journey_summary +
  problems[].quote (wymaga pgvector — feature na później).

**Autoryzacja**: ten sam allowlist co viewer (`canViewClientRecordings`).
Każdy odczyt audytowany jako `viewed_insights` z details `{ scope: 'by_user',
target_user_id: ... }`.

**Format dla agenta**: zwracana struktura ma być flat JSON łatwy do wstrzyknięcia
w prompt (bez nested objects głębiej niż 1 poziom). Proposal: każdy insights
record renderowany jako sekcja Markdown z headerem `## Sesja [data]`, listy
bullet point dla problemów/celów/przełomów, osobny paragraf dla
journey_summary.

**Rate limiting / cost guard**: agent może poprosić maksymalnie o 20 ostatnich
sesji per użytkownik per request, żeby uniknąć eksplozji tokenów. Starsze
trzeba paginować.

**Cache invalidation**: insights są immutable po `status='ready'` (poza
manual reanalysis przez admin). Agent może cache'ować response na poziomie
sesji bez ryzyka stale data — invalidation tylko gdy nowy `session_client_insights`
record dla użytkownika lub re-run analizy.

**Decyzja: implementacja po pierwszym konkretnym agent use case**. Schemat
DB i tabele już gotowe (booking_id → user_id join działa). Endpoint to ~50
linii kodu + audit log. Zostawić jako follow-up żeby uniknąć przedwczesnej
abstrakcji.

---

*Ostatnia aktualizacja: 2026-04-09*

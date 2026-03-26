# HTG Platform — Architektura v1

## Przegląd
Platforma do sesji rozwoju duchowego prowadzonych przez Natalię HTG. VOD + sesje live + system rezerwacji + pipeline publikacji audio.

**URL:** htgcyou.com | **Repo:** github.com/PoiDNA/HTG2

---

## Stack technologiczny

| Warstwa | Technologia |
|---------|-------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Next.js API Routes (serverless) |
| Baza danych | Supabase (PostgreSQL + Auth + Realtime + RLS) |
| Płatności | Stripe (Checkout + Webhooks + Invoicing) |
| Wideo live | LiveKit Cloud (WebRTC, Egress recording) |
| VOD streaming | Bunny Stream (HLS + Token Auth) |
| Storage plików | Bunny Storage (WAV, MP3, assety) |
| Email | Resend (SMTP via Supabase Auth) |
| CDN/DNS | Cloudflare |
| Hosting | Vercel (serverless, Edge) |
| AI | OpenAI Whisper (transkrypcja), Claude (analiza) |

---

## Baza danych — 23 tabele

### Core
| Tabela | Opis |
|--------|------|
| `profiles` | Użytkownicy (role: user/admin/moderator/publikacja) |
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
| `booking_slots` | Konkretne sloty (data, czas, status, solo_locked) |
| `bookings` | Rezerwacje klientów (24h hold, confirm, transfer) |
| `acceleration_queue` | Kolejka przyspieszenia terminów |

### Sesje Live
| Tabela | Opis |
|--------|------|
| `live_sessions` | Pokoje LiveKit (8 faz, 3 egress ID, nagrania WAV) |
| `active_streams` | Concurrent stream limiter (1 urządzenie) |

### Publikacja
| Tabela | Opis |
|--------|------|
| `session_publications` | Pipeline: raw -> editing -> edited -> mastering -> published |

### Społeczność
| Tabela | Opis |
|--------|------|
| `user_favorites` | Polubieni (user <-> user) |
| `session_sharing` | Udostępnianie sesji (open/favorites/invited) |
| `session_listeners` | Słuchacze towarzyszący (listen-only) |

### RODO
| Tabela | Opis |
|--------|------|
| `consent_records` | Zgody RODO |
| `audit_logs` | Logi audytowe |

---

## Role i uprawnienia

| Rola | Panel | Opis |
|------|-------|------|
| `user` | /konto | Klient: VOD, rezerwacje, polubieni |
| `moderator` | /prowadzacy | Natalia/Asystentki: grafik, sesje, klienci |
| `admin` | /konto/admin | Pelna kontrola: uzytkownicy, sloty, sesje, zestawy |
| `publikacja` | /publikacja | Edytorzy audio: DAW, upload WAV, pipeline AI |

---

## Sesje Live — 8 faz

```
poczekalnia -> wstep -> przejscie_1 -> sesja -> przejscie_2 -> podsumowanie -> outro -> ended
```

| Faza | Kamera | Mikrofon | Nagrywanie | Opis |
|------|--------|----------|------------|------|
| Poczekalnia | -- | -- | -- | Klient czeka, animacja + muzyka |
| Wstep | ON | ON | MP4 | Video call, powitanie |
| Przejscie 1 | OFF | OFF | -- | Animacja #1 + muzyka (15s fade) |
| **Sesja** | OFF | ON | MP4 + WAV | Audio-only, animacja czasteczki |
| Przejscie 2 | ON | ON | -- | Animacja #2 + muzyka (15s fade) |
| Podsumowanie | ON | ON | MP4 | Video call, dyskusja |
| Outro | -- | -- | -- | Klient sam, 15 min, animacja + muzyka |

### Specjalne funkcje:
- **Rozmowa prywatna** — prowadzacy rozmawiaja bez klienta
- **Przerwa** — klient sygnalizuje przerwe (dzwiek + banner)
- **Suwak glosnosci** — klient reguluje glosnosc prowadzacych
- **Udostepnianie** — klient moze udostepnic faze Sesja innym (listen-only)

---

## Zabezpieczenia VOD

1. HLS streaming (brak jednego linka do pobrania)
2. Signed URLs (wygasaja po 15 min, HMAC-SHA256)
3. Concurrent stream limit (1 urzadzenie, heartbeat 30s)
4. Canvas watermark (email + userId na obrazie)
5. Web Audio API routing (utrudnia audio capture)
6. disablePictureInPicture, nodownload, noplaybackrate
7. Blokada PrintScreen

---

## Pipeline publikacji audio

```
Surowe WAV -> Transkrypcja (Whisper) -> Analiza (Claude) -> Czyszczenie -> Mix -> Mastering -> Publikacja
```

### Etapy AI:
1. **Whisper** — transkrypcja z word-level timestamps (PL)
2. **Claude haiku** — identyfikacja fillerow, artefaktow, ciszy
3. **Clean** — usuniecie segmentow, noise gate, normalizacja
4. **Mix** — stereo + intro/outro muzyczne z crossfade
5. **Master** — normalizacja -1dB, kompresja, limiter -0.5dB

### Edytor DAW (przegladarka):
- Wielosciezkowy timeline z waveformami (Canvas)
- Synchronized cut — przyciecie = przyciecie wszystkich sciezek
- Solo/Mute/Volume per track
- Fade in/out, Undo/Redo (Ctrl+Z)
- Export WAV (individual + mixed)
- Skroty: Space, Delete, Ctrl+X, Home/End, +/-

---

## API Routes (40+)

### Auth
- POST /auth/callback — PKCE code exchange

### Stripe
- POST /api/stripe/checkout — tworzenie checkout session (quantity + metadata)
- POST /api/stripe/webhook — obsluga: checkout.completed, subscription.deleted

### Video VOD
- POST /api/video/token — signed Bunny URL + concurrent check
- POST /api/video/heartbeat — keepalive (30s)
- POST /api/video/stop — cleanup stream

### Booking
- GET /api/booking/slots — dostepne sloty
- POST /api/booking/reserve — rezerwacja (24h hold)
- POST /api/booking/confirm — potwierdzenie
- POST /api/booking/transfer — przeniesienie na inny termin

### Live Sessions
- POST /api/live/token — LiveKit JWT
- POST /api/live/create — utworz room
- POST /api/live/phase — zmiana fazy (+ egress start/stop)
- POST /api/live/admit — wpusc klienta
- POST /api/live/webhook — LiveKit egress events

### Publikacja
- GET/PATCH /api/publikacja/sessions — lista + update
- POST /api/publikacja/upload — WAV -> Bunny Storage
- GET /api/publikacja/download/[...path] — proxy download
- POST /api/publikacja/auto-edit — uruchom pipeline AI
- GET /api/publikacja/auto-edit/status — status pipeline

### Sharing & Favorites
- POST /api/sharing/configure — ustaw tryb udostepniania
- GET /api/sharing/available — lista sesji do odsluchu
- POST /api/sharing/join — dolacz jako listener
- POST /api/favorites/add — dodaj do polubionych
- DELETE /api/favorites/remove — usun
- GET /api/favorites/list — lista polubionych + followers

---

## Migracja WIX

- 2150 uzytkownikow zmigrowanych do Supabase Auth (Email OTP)
- 2425 entitlements (bezterminowy dostep do sesji)
- 1973 orders (audit trail z WIX)
- 95 session_templates z blogow WIX
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
- Domeny: htgcyou.com (prod), www -> redirect, htg-2.vercel.app
- Supabase Auth: auth.htg.cyou (custom domain)

---

*Ostatnia aktualizacja: 2026-03-26*

# HTG — Hacking The Game | Architektura Systemu v1.0

> Platforma sesji rozwoju duchowego prowadzonych przez Natalię HTG.
> VOD, sesje live 1:1, system rezerwacji, edycja audio, AI pipeline.

---

## Tech Stack

| Warstwa | Technologia |
|---------|-------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind 4 |
| Auth + DB | Supabase (Email OTP, PostgreSQL, Realtime, RLS) |
| Payments | Stripe (Checkout, Webhooks, Invoicing) |
| Live Sessions | LiveKit Cloud (WebRTC, Egress recording) |
| VOD | Bunny Stream (HLS, Token Auth) |
| Storage | Bunny Storage (WAV, MP3, assets) |
| Email | Resend (SMTP via sesje@htgcyou.com) |
| AI | OpenAI Whisper (transkrypcja), Anthropic Claude (analiza) |
| Hosting | Vercel (serverless, Edge) |
| DNS | Cloudflare |

---

## Infrastructure

```
                          ┌──────────────┐
                          │   Klient     │
                          │  (Browser)   │
                          └──────┬───────┘
                                 │
                          ┌──────▼───────┐
                          │   Vercel     │
                          │  (Next.js)   │
                          │  htgcyou.com │
                          └──┬──┬──┬──┬──┘
                             │  │  │  │
              ┌──────────────┘  │  │  └──────────────┐
              │                 │  │                  │
       ┌──────▼──────┐  ┌──────▼──▼──────┐   ┌──────▼──────┐
       │  Supabase   │  │   LiveKit      │   │   Bunny     │
       │ auth.htg.cyou│  │   Cloud        │   │  CDN/Stream │
       │ Auth + DB   │  │   WebRTC       │   │  Storage    │
       │ Realtime    │  │   Egress       │   │             │
       └─────────────┘  └───────────────┘   └─────────────┘
              │
       ┌──────┴──────────────────┐
       │                         │
┌──────▼──────┐          ┌──────▼──────┐
│   Stripe    │          │   Resend    │
│  Payments   │          │   Email     │
└─────────────┘          └─────────────┘
       │
┌──────▼──────────────────┐
│   OpenAI + Anthropic    │
│   Whisper + Claude      │
│   (Auto-edit pipeline)  │
└─────────────────────────┘
```

---

## Database Schema (Supabase PostgreSQL)

### Users & Roles

```
profiles
├── id (UUID, FK → auth.users)
├── email, display_name
├── role: 'user' | 'admin' | 'moderator' | 'publikacja'
├── wix_member_id, wix_migrated_at
└── phone, avatar_url
```

### Products & Pricing

```
products (6 records)
├── id, name, slug, description, type
├── stripe_product_id
└── is_active

prices (6 records)
├── id, product_id (FK → products)
├── stripe_price_id
├── amount (grosze), currency, interval
└── is_active
```

**Produkty:**
| Slug | Cena | Typ |
|------|------|-----|
| sesja-pojedyncza | 30 PLN | one-time |
| pakiet-miesieczny | 99 PLN | one-time |
| pakiet-roczny | 999 PLN/rok | subscription |
| sesja-natalia | 1 200 PLN | one-time |
| sesja-natalia-agata | 1 600 PLN | one-time |
| sesja-natalia-justyna | 1 600 PLN | one-time |

### Content

```
monthly_sets (33 records: Maj 2024 → Sty 2027)
├── id, product_id, title, slug
├── month_label (YYYY-MM), description
├── cover_image_url
└── is_published

session_templates (95 records)
├── id, title, slug, description
├── bunny_video_id, bunny_library_id
├── is_published, sort_order
└── duration_seconds

set_sessions (95 records — junction)
├── set_id (FK → monthly_sets)
├── session_id (FK → session_templates)
└── sort_order

youtube_videos (30 records)
├── id, youtube_id, title
├── is_visible, sort_order
```

### Orders & Access

```
orders (~2000 records)
├── id, user_id
├── status, total_amount, currency
├── stripe_session_id, stripe_subscription_id
├── wix_order_id, wix_plan_name
└── source: 'stripe' | 'wix' | 'manual' | 'migration'

entitlements (~2500 records)
├── id, user_id, product_id
├── type: 'session' | 'monthly' | 'yearly'
├── scope_month, monthly_set_id, session_id
├── valid_from, valid_until, is_active
├── stripe_subscription_id
└── source: 'stripe' | 'wix' | 'manual' | 'migration'

active_streams
├── id, user_id, device_id
├── session_id, started_at, last_heartbeat
```

### Booking System

```
staff_members (3 records)
├── id, user_id (FK → auth.users)
├── name, slug, role: 'practitioner' | 'assistant'
├── session_types[], email, is_active

availability_rules (11 records)
├── id, staff_id
├── day_of_week (0-6), start_time, end_time
├── solo_only, is_active

availability_exceptions
├── id, staff_id, exception_date
├── all_day, start_time, end_time

booking_slots (88 records, 8 tygodni)
├── id, session_type, slot_date
├── start_time, end_time
├── status: 'available' | 'held' | 'booked' | 'completed' | 'cancelled'
├── held_for_user, held_until
├── assistant_id (FK → staff_members)
├── solo_locked, is_extra, is_private

bookings
├── id, user_id, slot_id
├── session_type, status
├── topics, assigned_at, confirmed_at, expires_at
├── live_session_id

acceleration_queue
├── id, user_id, session_type
├── booking_id, priority, status
├── offered_slot_id, offered_at
```

### Live Sessions

```
live_sessions
├── id, booking_id, slot_id
├── room_name (unique), room_sid
├── phase: 'poczekalnia' | 'wstep' | 'przejscie_1' | 'sesja' |
│          'przejscie_2' | 'podsumowanie' | 'outro' | 'ended'
├── phase_changed_at
├── egress_wstep_id, egress_sesja_id, egress_podsumowanie_id
├── recording_wstep_url (MP4, admin)
├── recording_sesja_url (MP4, klient + admin)
├── recording_sesja_tracks (JSONB: WAV per uczestnik, admin)
├── recording_podsumowanie_url (MP4, admin)
├── bunny_sesja_video_id
└── notes, metadata
```

### Publication

```
session_publications
├── id, live_session_id, session_template_id, monthly_set_id
├── status: 'raw' | 'editing' | 'edited' | 'mastering' | 'published'
├── source_composite_url, source_tracks (JSONB)
├── edited_tracks (JSONB), edited_composite_url
├── mastered_url, mastered_bunny_video_id
├── auto_cleaned_tracks (JSONB), auto_mixed_url
├── auto_edit_status: 'none' | 'processing' | 'done' | 'failed'
├── assigned_editor_id
├── marked_ready_at/by, published_at/by
└── editor_notes, admin_notes
```

### GDPR

```
consent_records
├── id, user_id, consent_type, granted
└── ip_address, user_agent

audit_logs
├── id, user_id, action, entity_type
├── entity_id, metadata
```

---

## Roles & Permissions

| Rola | Konta | Dostęp |
|------|-------|--------|
| **admin** | htg@htg.cyou | Wszystko: panele, użytkownicy, kalendarz, sloty, publikacja, podgląd |
| **moderator** | natalia@, agata@, justyna@htg.cyou | Panel prowadzącego, grafik, moje sesje, klienci |
| **publikacja** | marta@, ania@, dominika@htg.cyou | Panel publikacji, edytor DAW, auto-edit AI |
| **user** | 2150+ kont | Panel klienta, VOD, rezerwacje, profil |

---

## Authentication

```
Email OTP Flow:
1. User wpisuje email → POST signInWithOtp()
2. Supabase wysyła 6-cyfrowy kod przez Resend SMTP
3. User wpisuje kod → verifyOtp() → PKCE code
4. Redirect /auth/callback?code=xxx
5. Middleware: exchangeCodeForSession() → cookies set
6. Redirect → /konto (lub /prowadzacy, /admin)
```

Custom domain: `auth.htg.cyou`

---

## Pages & Routes

### Publiczne (bez auth)
| Route | Opis |
|-------|------|
| `/` | Landing page (hero, sesje, CTA) |
| `/sesje` | Katalog sesji grupowych |
| `/sesje-indywidualne` | Sesje 1:1 z Natalią |
| `/subskrypcje` | Plany cenowe (30/99/999 PLN) |
| `/nagrania` | YouTube publiczne (30 filmów) |
| `/login` | Email OTP login |
| `/regulamin` | Regulamin |
| `/prywatnosc` | Polityka prywatności |

### Panel klienta (`/konto`, auth: user)
| Route | Opis |
|-------|------|
| `/konto` | Moje sesje VOD |
| `/konto/sesje-indywidualne` | Sesje indywidualne + kalendarz |
| `/konto/subskrypcje` | Moje aktywne subskrypcje |
| `/konto/zamowienia` | Zamówienia i faktury |
| `/konto/profil` | Profil + dane |

### Panel admina (`/konto/admin`, auth: admin)
| Route | Opis |
|-------|------|
| `/konto/admin` | Dashboard |
| `/konto/admin/kalendarz` | Kalendarz sesji |
| `/konto/admin/kolejka` | Kolejka przyspieszenia |
| `/konto/admin/sloty` | Zarządzanie slotami |
| `/konto/admin/uzytkownicy` | Lista użytkowników |
| `/konto/admin/subskrypcje` | Wszystkie subskrypcje |
| `/konto/admin/sesje` | Szablony sesji |
| `/konto/admin/zestawy` | Zestawy miesięczne |

### Panel prowadzącego (`/prowadzacy`, auth: moderator)
| Route | Opis |
|-------|------|
| `/prowadzacy` | Dashboard |
| `/prowadzacy/grafik` | Harmonogram + wyjątki + terminy prywatne |
| `/prowadzacy/sesje` | Moje sesje (upcoming + history) |
| `/prowadzacy/klienci` | Moi klienci |

### Panel publikacji (`/publikacja`, auth: publikacja/admin)
| Route | Opis |
|-------|------|
| `/publikacja` | Dashboard (statystyki) |
| `/publikacja/sesje` | Sesje do edycji (grouped by month) |
| `/publikacja/sesje/[id]` | Szczegóły sesji + upload/download |
| `/publikacja/moje` | Moje przypisane sesje |
| `/publikacja/archiwum` | Opublikowane |
| `/publikacja/dodaj` | Dodaj sesję ręcznie (upload WAV) |
| `/publikacja/edytor/[id]` | Edytor DAW (wielośćieżkowy) |

### Sesje live (`/live`, auth: booking participant)
| Route | Opis |
|-------|------|
| `/live/[sessionId]` | Pokój sesji WebRTC (8 faz) |

---

## API Routes (25+ endpoints)

### Stripe (`/api/stripe/`)
| Method | Route | Opis |
|--------|-------|------|
| POST | `/api/stripe/checkout` | Tworzenie Stripe Checkout session |
| POST | `/api/stripe/webhook` | Webhook: payment → order → entitlement |

### Video VOD (`/api/video/`)
| Method | Route | Opis |
|--------|-------|------|
| POST | `/api/video/token` | Signed Bunny URL + concurrent check |
| POST | `/api/video/heartbeat` | 30s keepalive (1 device limit) |
| POST | `/api/video/stop` | Cleanup on unload |

### Booking (`/api/booking/`)
| Method | Route | Opis |
|--------|-------|------|
| GET | `/api/booking/slots` | Available slots |
| POST | `/api/booking/reserve` | Reserve slot (24h hold) |
| POST | `/api/booking/confirm` | Confirm booking |

### Live Sessions (`/api/live/`)
| Method | Route | Opis |
|--------|-------|------|
| POST | `/api/live/token` | LiveKit JWT |
| POST | `/api/live/create` | Create room from booking |
| POST | `/api/live/phase` | Phase transition (staff only) |
| POST | `/api/live/admit` | Admit client from waiting room |
| POST | `/api/live/webhook` | LiveKit Egress webhook |

### Publikacja (`/api/publikacja/`)
| Method | Route | Opis |
|--------|-------|------|
| GET | `/api/publikacja/sessions` | List with filters |
| GET/PATCH | `/api/publikacja/sessions/[id]` | Detail + update |
| POST | `/api/publikacja/upload` | Upload WAV to Bunny Storage |
| GET | `/api/publikacja/download/[...path]` | Proxy download (auth) |
| POST | `/api/publikacja/create` | Manual session creation |
| POST | `/api/publikacja/auto-edit` | Trigger AI pipeline |
| GET | `/api/publikacja/auto-edit/status` | Pipeline progress |

---

## Key Systems

### 1. System rezerwacji

```
Natalia ustawia godziny (co 15min, max 4/dzień)
  → Oznacza: 1:1 (solo_locked) vs Otwarta
    → Asystentki dołączają do otwartych slotów
      → System generuje booking_slots na 8 tygodni
        → Klient rezerwuje (24h hold → confirm)
          → Kolejka przyspieszenia (wcześniejsze terminy)
            → Transfer na wolny termin
```

### 2. Sesje live (LiveKit WebRTC)

```
8 faz sesji:

poczekalnia    → Klient czeka (animacja #0 + muzyka #0)
                 Prowadzący wpuszczają klienta
wstep          → Wideo + audio (nagrywanie MP4)
przejscie_1   → Auto: wideo off, muzyka #1 + animacja #1, fade 15s
sesja          → Audio only (nagrywanie MP4 + WAV per uczestnik)
                 Animacja cząsteczki, break request, prywatna rozmowa
przejscie_2   → Muzyka #2 + animacja #2, auto wideo on, fade 15s
podsumowanie   → Wideo + audio (nagrywanie MP4)
outro          → Po wyjściu prowadzących: animacja #3 + muzyka #3, 15 min
ended          → Sesja zakończona
```

### 3. Zabezpieczenia VOD

| Warstwa | Mechanizm |
|---------|-----------|
| Transport | HLS streaming (brak jednego linka) |
| Autoryzacja | Signed URLs (wygasają po 15 min) |
| Limit | 1 urządzenie na raz (heartbeat 30s) |
| Identyfikacja | Canvas watermark (email + userId) |
| Anti-capture | Web Audio API routing (loopback → cisza) |
| UI | No download, no PiP, no context menu |

### 4. Pipeline publikacji

```
Status flow: raw → editing → edited → mastering → published

Ścieżka ręczna:
  Editor pobiera WAV → edytuje w DAW (browser) → upload → mark ready

Ścieżka AI (auto-edit):
  1. Whisper → transkrypcja PL z timestampami
  2. Claude → plan edycji (co wyciąć/skrócić/zostawić)
  3. Clean → usuwanie fillerów, noise gate, normalizacja
  4. Mix → łączenie ścieżek + intro/outro muzyczne
  5. Master → normalize -1dB, compression, limiter
```

### 5. Edytor DAW (browser)

- Wielośćieżkowy timeline z waveformami (Web Audio API)
- Synchronized cut — przycięcie jednego = przycięcie wszystkich
- Solo/Mute/Volume per ścieżka
- Fade in/out, Undo/Redo (Ctrl+Z)
- Export: WAV indywidualny lub mixed
- Upload do Bunny Storage

### 6. Migracja WIX

- 2150 użytkowników z WIX Contacts + Members API
- ~2500 entitlements z subskrypcji (monthly + yearly)
- 95 sesji z opisami z WIX Blog
- 33 zestawy miesięczne (Maj 2024 → Sty 2027)
- Mapowanie: `member_id` → `customer.memberId`

---

## Environment Variables

### Supabase
```
NEXT_PUBLIC_SUPABASE_URL=https://auth.htg.cyou
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Stripe
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### LiveKit
```
LIVEKIT_URL=wss://deeplab-staging-ksoldpu1.livekit.cloud
LIVEKIT_API_KEY=API5MB9syqQY4yn
LIVEKIT_API_SECRET=WYHLrnbftES...
```

### Bunny
```
BUNNY_TOKEN_KEY=...          # Stream token auth
BUNNY_API_KEY=...            # Stream API
BUNNY_LIBRARY_ID=...         # Stream library
BUNNY_STORAGE_API_KEY=...    # Storage zone key
BUNNY_STORAGE_HOSTNAME=storage.bunnycdn.com
BUNNY_STORAGE_ZONE=htg2
NEXT_PUBLIC_BUNNY_CDN_URL=https://htg2-cdn.b-cdn.net
```

### AI
```
OPENAI_API_KEY=sk-proj-...   # Whisper
ANTHROPIC_API_KEY=sk-ant-... # Claude (auto-edit analysis)
```

---

## File Structure

```
HTG2/
├── app/
│   ├── [locale]/
│   │   ├── page.tsx                    # Landing
│   │   ├── login/                      # Email OTP
│   │   ├── sesje/                      # Katalog
│   │   ├── sesje-indywidualne/         # 1:1
│   │   ├── subskrypcje/               # Pricing
│   │   ├── nagrania/                   # YouTube
│   │   ├── konto/                      # User panel (6 stron)
│   │   │   └── admin/                  # Admin panel (8 stron)
│   │   ├── prowadzacy/                 # Staff panel (4 strony)
│   │   ├── publikacja/                 # Publication (8 stron)
│   │   │   └── edytor/[id]/           # DAW editor
│   │   ├── live/[sessionId]/          # Live session
│   │   └── auth/callback/             # PKCE callback
│   ├── api/
│   │   ├── stripe/                     # checkout, webhook
│   │   ├── video/                      # token, heartbeat, stop
│   │   ├── booking/                    # slots, reserve, confirm
│   │   ├── live/                       # token, phase, admit, create, webhook
│   │   └── publikacja/                 # sessions, upload, download, auto-edit
│   └── robots.ts, sitemap.ts
├── components/
│   ├── live/          (13)             # Sesje live WebRTC
│   ├── video/         (2)              # VOD player + watermark
│   ├── daw/           (9)              # DAW editor
│   ├── publikacja/    (11)             # Publication panel
│   ├── SiteNav.tsx                     # Main navigation
│   ├── ThemeToggle.tsx                 # Dark/light mode
│   └── CheckoutButton.tsx              # Stripe checkout
├── lib/
│   ├── live/          (3)              # LiveKit helpers
│   ├── daw/           (2)              # Editor state + WAV encoder
│   ├── auto-edit/     (8)              # AI pipeline
│   ├── booking/       (2)              # Types + constants
│   ├── publication/   (2)              # Types + auth
│   ├── supabase/      (2)              # Server + browser clients
│   ├── bunny.ts                        # Stream URL signing
│   └── bunny-storage.ts               # Storage upload/download
├── supabase/migrations/
│   ├── 001_htg_schema.sql              # Core tables
│   ├── 002_roles_wix_migration.sql     # Roles + WIX fields
│   ├── 003_booking_system.sql          # Booking + staff
│   ├── 004_slot_model.sql              # Slot generation
│   └── 005_live_sessions.sql           # Live + publications
├── messages/
│   ├── pl.json                         # Polski (primary)
│   └── en.json                         # English
├── ARCHITECTURE.md                     # Ten plik
└── CLAUDE.md                           # AI assistant context
```

---

## Deployment

| Element | Serwis | URL |
|---------|--------|-----|
| Frontend | Vercel | htgcyou.com (staging) |
| Database | Supabase | auth.htg.cyou |
| DNS | Cloudflare | htgcyou.com |
| Repo | GitHub | github.com/PoiDNA/HTG2 |

**Staging:** `htgcyou.com` | **Produkcja (docelowo):** `htg.cyou`

Indexing zablokowany (`robots.txt: Disallow /`) do czasu produkcji.

---

## Known Limitations & Future Work

### Blokery przed produkcją
- [ ] Bunny Stream — upload prawdziwych nagrań sesji
- [ ] Stripe live mode (obecnie test)
- [ ] Domena htg.cyou (czekamy na przeniesienie z WIX)
- [ ] Regulamin + Polityka prywatności (treść gotowa)
- [ ] Pliki audio sesji (muzyka #0-#3)
- [ ] Vercel Cron (expire_held_slots)
- [ ] Test E2E: zakup → VOD playback
- [ ] Test E2E: sesja live z 2 urządzeniami

### Faza 2 (po uruchomieniu)
- [ ] PWA / Mobile app
- [ ] DRM Widevine/FairPlay (Bunny add-on)
- [ ] Formularz zagadnień przed sesją
- [ ] Feedback po sesji
- [ ] Email: przypomnienia 24h przed sesją
- [ ] Retencja nagrań (kasowanie po 24 mies.)
- [ ] Cal.com integracja (Collective Routing)

---

*Dokument wygenerowany: 2026-03-26 | Wersja: 1.0*

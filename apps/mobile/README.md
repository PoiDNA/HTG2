# HTG Mobile — Expo / React Native

Native iOS and Android client for HTG. Reuses shared types, schemas, i18n, and API contracts from `packages/shared` and talks to the existing HTG2 backend via bearer-authenticated mobile endpoints.

> **Status:** spike scaffold. Do NOT ship without closing [MOB-SPIKE-01..06](https://github.com/PoiDNA/HTG2/milestone/1).

---

## Architecture

```
apps/mobile/
├── app.config.ts          # Expo config (permissions, plugins, deep links)
├── eas.json               # EAS build profiles: development / preview / production
├── app/                   # expo-router
│   ├── _layout.tsx        # Root: auth gate, deep-link handler, player service
│   ├── (auth)/            # Login screens (magic link + Apple Sign-In)
│   ├── (tabs)/            # Sessions / Library / Moments / Profile
│   ├── session/[id].tsx   # Session detail + HLS player
│   └── live/[roomId].tsx  # LiveKit audio-only room
├── components/            # SessionCard, PlayerControls, TabBarIcon
├── lib/
│   ├── supabase.ts        # Supabase client with SecureStore chunked adapter
│   ├── auth/              # session, magic link, Apple Sign-In
│   ├── api/               # bearer-authenticated fetch client
│   ├── player/            # react-native-track-player service + hook
│   ├── livekit/           # Room hook with connection-state lifecycle
│   ├── i18n/              # locale detection, t()
│   ├── env.ts             # EXPO_PUBLIC_* validation
│   └── theme.ts           # Design tokens
└── assets/                # icons, splash (add before first build)
```

Shared code lives in [`packages/shared`](../../packages/shared) — types, Zod schemas, i18n messages. No Next/DOM deps.

---

## Prerequisites

- Node 20+
- Xcode 16 + iOS 16+ device (simulator does not cover background audio / LiveKit)
- Android Studio with an API 31+ device
- `npm install -g eas-cli`
- Apple Developer account ($99/yr) for real-device builds
- Google Play Console account ($25 once)

---

## Setup

1. Install deps from repo root:
   ```bash
   npm install
   ```
2. Copy env:
   ```bash
   cp apps/mobile/.env.example apps/mobile/.env
   ```
   Fill in `EXPO_PUBLIC_*` values. **These are public** — they ship in the JS bundle. Only anon/publishable keys belong here.
3. Configure EAS project:
   ```bash
   cd apps/mobile
   eas login
   eas init
   ```
4. First dev build (installs on physical device):
   ```bash
   npm run eas:dev:ios       # or eas:dev:android
   ```
5. Start Metro:
   ```bash
   npm run start
   ```
   Open the dev client on your device.

---

## Backend contract (mobile endpoints)

Mobile calls the following bearer-authenticated endpoints. See [MOB-SPIKE-04](https://github.com/PoiDNA/HTG2/issues/558) for the audit of which ones need to be added:

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/mobile/sessions`               | List sessions (entitlement filtered) |
| `GET`  | `/api/mobile/sessions/:id`           | Session detail + speakers + last position |
| `GET`  | `/api/mobile/sessions/:id/playback`  | Signed HLS URL + expiry + media version |
| `POST` | `/api/mobile/sessions/:id/position`  | Resume position heartbeat (10s interval) |
| `GET`  | `/api/mobile/sessions/:id/moments`   | Session moments |
| `POST` | `/api/mobile/live/:roomId/token`     | LiveKit room token |

All return JSON. All expect `Authorization: Bearer <supabase-access-token>`.

---

## Auth flow

- **Magic link:** Supabase `signInWithOtp` → email → deep link `htg://auth/callback?code=...` → `exchangeCodeForSession`
- **Apple Sign-In:** iOS only, uses `expo-apple-authentication` → `signInWithIdToken({ provider: "apple" })`
- Tokens stored in `expo-secure-store` with transparent chunking (SecureStore has a 2KB-per-key limit; Supabase sessions exceed it)
- `AuthGate` in `app/_layout.tsx` redirects unauthenticated users to `/(auth)/login`

---

## Player

`react-native-track-player` chosen as the baseline (per [MOB-SPIKE-03](https://github.com/PoiDNA/HTG2/issues/557)) because:
- Lockscreen + Control Center + Notification media controls built-in
- Background audio through iOS `audio` background mode + Android foreground service
- Queue + Now Playing metadata
- `expo-av` is deprecated in SDK 55

**Signed URL refresh:** `usePlayer.scheduleRefresh` polls `sessionsApi.playbackUrl` 60s before `expiresAt` and calls `TrackPlayer.load()` with the fresh URL at the current position. No audible gap in our target scenario (Bunny HLS with `~10min TTL`).

**Resume position:** persisted every 10s via `Event.PlaybackActiveTrackChanged` handler in `playbackService`.

---

## LiveKit

- `@livekit/react-native` with Expo config plugin (no Expo Go — requires EAS dev client)
- Audio-only, max bitrate 32kbps, adaptive stream
- `useLiveRoom` hook exposes `{ status, participants, muted, toggleMute, leave }`
- Connection state mapped to i18n strings: `connecting / connected / reconnecting / disconnected`
- `expo-keep-awake` active while in the room screen

iOS background mode = `audio`. **CallKit / VoIP push is NOT enabled** — [MOB-SPIKE-02](https://github.com/PoiDNA/HTG2/issues/556) will determine whether it's needed.

---

## Payments

**Status: undecided.** Blocked by [MOB-SPIKE-05](https://github.com/PoiDNA/HTG2/issues/559).

This scaffold assumes **Path A (read-only)**: `isEntitled` is computed server-side from existing Stripe web subscriptions, and the mobile app redirects users to `htgcyou.com` for subscription management. No IAP/Play Billing code is present.

---

## Build profiles

| Profile | Distribution | Use |
|---|---|---|
| `development` | internal, dev client | daily development on device |
| `preview`     | internal            | QA builds, TestFlight internal, Play internal track |
| `production`  | store              | App Store / Play Store submission |

```bash
npm run eas:dev:ios
npm run eas:preview
npm run eas:production
```

---

## Deep links

- Scheme: `htg://`
- Universal links: `https://htgcyou.com/m/*` (iOS `associatedDomains` + Android `autoVerify`)
- Auth callback: `htg://auth/callback` (matches Supabase redirect URL)

---

## Next steps (post-spike)

Tracked in [Mobile Spike milestone](https://github.com/PoiDNA/HTG2/milestone/1). Implementation tickets open after [MOB-SPIKE-06](https://github.com/PoiDNA/HTG2/issues/560) report.

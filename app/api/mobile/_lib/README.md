# Mobile API (`/api/mobile/*`)

Bearer-authenticated endpoints for the Expo mobile client. Mirrors the contract in [docs/mobile/api-contract.md](../../../../docs/mobile/api-contract.md).

## Assumptions

This PR assumes the following schema elements exist (or will exist). The mobile client does NOT use these endpoints until they're verified against live data — see [MOB-SPIKE-04](https://github.com/PoiDNA/HTG2/issues/558).

- `sessions(id, slug, title, description, long_description, cover_url, duration_sec, kind, status, starts_at, published_at, required_tier, locale, live_room_id, bunny_library_id, bunny_video_id, media_version)`
- `speakers(id, name, avatar_url, role)` + join `session_speakers(session_id, speaker_id)`
- `moments(id, session_id, title, category, start_sec, end_sec, transcript_excerpt, speaker_name, published_at)`
- `session_progress(user_id, session_id, position_sec, updated_at)` with unique (user_id, session_id)
- `stripe_subscriptions(id, user_id, status, ...)`

Any missing column becomes a ticket in [MOB-SPIKE-04](https://github.com/PoiDNA/HTG2/issues/558) and a migration PR.

## Required env

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (existing)
- `BUNNY_CDN_HOSTNAME` — e.g. `htg.b-cdn.net`
- `BUNNY_TOKEN_KEY` — Bunny token auth secret key
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (existing)

## Auth model

All endpoints require `Authorization: Bearer <supabase-access-token>`. Token is validated by calling `supabase.auth.getUser(token)` with service role. Web cookie auth is NOT accepted here — mobile only.

## Entitlement

Placeholder implementation in [`_lib/entitlement.ts`](./entitlement.ts). Paid sessions require any active Stripe subscription (`active | trialing`). Replace with `user_effective_tier()` function from [ADR 001](../../../../docs/adr/001-mobile-payments.md) once the `entitlements` table lands.

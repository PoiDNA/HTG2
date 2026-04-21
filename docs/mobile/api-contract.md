# Mobile API contract

Living document. Source of truth for mobile ↔ backend endpoints.

All endpoints under `/api/mobile/*`. Expect `Authorization: Bearer <supabase-access-token>`. Return JSON.

## Auth model

Mobile uses Supabase access tokens (short-lived, auto-refreshed by `@supabase/supabase-js`). Backend must accept bearer auth in parallel with existing `@supabase/ssr` cookie auth. See [MOB-SPIKE-04](https://github.com/PoiDNA/HTG2/issues/558) for the audit of endpoints that currently assume cookie-only.

Recommended server helper (Next.js route handler):

```ts
// app/api/mobile/_lib/auth.ts
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export async function requireBearer(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) throw new Response("Unauthorized", { status: 401 });
  const token = auth.slice(7);
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Response("Unauthorized", { status: 401 });
  return { user: data.user, token };
}
```

## Endpoints

### `GET /api/mobile/sessions`
Query: `?locale=pl&cursor=<opaque>`
```json
{
  "items": [ SessionSummary, ... ],
  "nextCursor": "string | null"
}
```

### `GET /api/mobile/sessions/:id`
```json
SessionDetail
```

### `GET /api/mobile/sessions/:id/playback`
```json
{
  "url": "https://bunny.../master.m3u8?token=...",
  "expiresAt": "2026-04-21T12:34:56Z",
  "mediaVersion": 3,
  "mimeType": "application/vnd.apple.mpegurl"
}
```
- `expiresAt` must be ≥ 5 min in the future. Mobile refreshes 60s before expiry.
- `mediaVersion` lets the client invalidate cached artwork/metadata when re-encoded.

### `POST /api/mobile/sessions/:id/position`
```json
{ "positionSec": 1234.5 }
```
- Called every 10s while playing. Idempotent.

### `GET /api/mobile/sessions/:id/moments`
```json
{ "items": [ Moment, ... ] }
```

### `POST /api/mobile/live/:roomId/token`
```json
{
  "wsUrl": "wss://....livekit.cloud",
  "token": "eyJ...",
  "roomId": "string",
  "identity": "user_<supabase-uid>",
  "expiresAt": "2026-04-21T13:00:00Z"
}
```
- Server mints LiveKit token with audio publish/subscribe grants based on entitlement + role.

## Types

All request/response shapes are in [`packages/shared/src/types`](../../packages/shared/src/types) and validated with Zod schemas in [`packages/shared/src/schemas`](../../packages/shared/src/schemas). Reuse them on the server to keep the contract honest.

# ADR 001 — Mobile payments & entitlement sync

- **Status:** DRAFT — awaits coordinator decision
- **Date:** 2026-04-21
- **Related:** [MOB-SPIKE-05](https://github.com/PoiDNA/HTG2/issues/559), [MOB-SPIKE-06](https://github.com/PoiDNA/HTG2/issues/560)
- **Decision owner:** @PoiDNA

## Context

HTG2 today sells subscriptions via Stripe on the web. The mobile apps (iOS + Android) need a monetization model that (a) survives Apple App Store / Google Play Store review, (b) doesn't split the subscriber base into incompatible web/mobile tiers, and (c) can be implemented inside the 2-week spike without blocking shipping.

Store rules (as of 2026-04):

- **Apple Guideline 3.1.1** — digital goods consumed in-app on iOS must use In-App Purchase (IAP). External links to web checkout are allowed under the "reader" rules and the Dutch/EU DMA carve-outs, but carry review risk for general-audience apps.
- **Google Play Billing policy** — digital content in apps distributed on Play must use Play Billing, with narrow exceptions for purely informational apps.
- **Stripe digital goods (iOS external checkout)** — supported in some regions (US, EU under DMA, Netherlands dating carve-out) with strict UI rules; not a universal escape hatch.

## Options

### A) Read-only mobile (no in-app purchase)

- Mobile app shows only content the user is already entitled to from their web subscription.
- New subscriptions must be started on web (Safari/Chrome/desktop).
- App UI says "Manage subscription at htgcyou.com"; links open in external browser.
- Entitlements flow: Stripe webhook → Supabase `entitlements` row → mobile reads on session open.

**Pros**
- Fastest to ship (no Apple/Google billing integration).
- No platform fee (15–30%).
- Compliant out of the box — Apple and Google treat this as a "reader" app that doesn't sell digital goods in-app.
- Existing subscribers migrate seamlessly: same Stripe subscription, now visible on mobile.

**Cons**
- Conversion friction for users who discover HTG via the mobile app — they must open a browser to subscribe.
- Marketing can't deep-link to "buy" inside the app.
- Some users may never bridge the gap and churn.

### B) Native IAP / Play Billing only

- iOS uses StoreKit 2 IAP; Android uses Google Play Billing.
- New SKU set (likely RevenueCat to unify both stores + webhook to Supabase).
- Apple takes 15% (after Small Business Program, year 1) or 30%; Google 15% after first $1M then 30%.
- Existing web subscribers: separate flow to "restore purchases" or grant grandfathered entitlement.

**Pros**
- Best mobile conversion — frictionless in-app subscription.
- Standard UX that users expect.
- Apple/Google provide subscription management, receipts, refund flows out of the box.

**Cons**
- 15–30% platform fee on every mobile-originated subscription.
- Two separate subscriber ledgers (Stripe for web, App Store Connect + Play for mobile) — must reconcile in Supabase.
- Users who subscribe on iOS and want to cancel must do it in iOS Settings, not on htgcyou.com (confusing for staff support).
- Price parity risk: Apple enforces their price tiers; can't perfectly match web prices.
- Longer spike: RevenueCat integration + server webhooks + "restore purchases" UX + tests.

### C) Hybrid

- Existing web subscribers see their entitlement on mobile (like Path A).
- New mobile users subscribe via IAP/Play Billing (like Path B).
- Server is the source of truth: `entitlements.source` distinguishes `web_stripe | ios_iap | android_billing | grant`.

**Pros**
- Best of both: existing subscribers don't pay platform fee, new mobile users get frictionless in-app purchase.
- Flexible — can disable one path later without breaking the other.

**Cons**
- Most complex. Full cost of Path B plus cross-source reconciliation and double-subscription prevention (user subscribes on web AND on iOS — which wins?).
- Customer-facing confusion: two subscription management surfaces.
- Audit/finance overhead: revenue recognition across three billing sources.

## Recommendation

**Ship Path A first. Revisit Path C after 3 months of mobile usage data.**

Rationale:
1. Unknown mobile conversion rate — building IAP before validating demand risks wasting 2–3 weeks of engineering on a low-impact surface.
2. Store review risk is lowest for Path A (well-understood "reader app" precedent).
3. Stripe remains the single revenue system; finance/legal don't need new processes.
4. Path A is forward-compatible with Path C — the `entitlements` table is designed to accept additional sources later.

The spike tickets should be closed assuming Path A; Path C becomes a Q3 initiative if conversion data justifies it.

## Entitlement schema

Applies to all three paths. New/extended table:

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_entitlements.sql
create type entitlement_source as enum (
  'web_stripe',
  'ios_iap',
  'android_billing',
  'grant'
);

create type entitlement_tier as enum (
  'free',
  'basic',
  'premium',
  'patron'
);

create table if not exists public.entitlements (
  user_id         uuid not null references auth.users(id) on delete cascade,
  source          entitlement_source not null,
  tier            entitlement_tier not null,
  external_id     text not null,  -- Stripe sub id / App Store original_transaction_id / Play purchaseToken
  active_until    timestamptz,
  renews_at       timestamptz,
  is_active       boolean not null generated always as (
    active_until is null or active_until > now()
  ) stored,
  raw             jsonb not null default '{}'::jsonb,  -- full provider payload for audit
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, source, external_id)
);

create index entitlements_user_active_idx
  on public.entitlements (user_id)
  where is_active;

alter table public.entitlements enable row level security;

create policy "users read own entitlements"
  on public.entitlements for select
  using (auth.uid() = user_id);

-- Writes go through service role only (webhooks).
```

**Effective tier resolution** (for a user with multiple active entitlements):
```sql
create or replace function public.user_effective_tier(p_user_id uuid)
returns entitlement_tier
language sql stable as $$
  select tier from public.entitlements
  where user_id = p_user_id and is_active
  order by array_position(
    array['patron','premium','basic','free']::entitlement_tier[], tier
  )
  limit 1;
$$;
```

## Webhook flow (Path A)

```
Stripe subscription.created/updated/deleted
    → existing /api/webhooks/stripe handler
    → upsert into entitlements (source='web_stripe', external_id=sub.id)
    → on mobile open: GET /api/mobile/sessions returns SessionSummary.isEntitled
```

Reuses the existing Stripe webhook infrastructure; only the DB write target changes (write entitlement row in addition to the existing subscription state).

## Store compliance checklist (Path A)

- [ ] Apple Sign-In implemented (required because Google social login is present)
- [ ] Privacy labels declared in App Store Connect (auth email, playback analytics, crash reports)
- [ ] Google Play Data Safety form filled out
- [ ] Account deletion flow in-app (Apple requirement since June 2022)
- [ ] "Manage subscription" link to htgcyou.com (external browser, per Apple external-link entitlement if used, or simple `Linking.openURL` for Path A)
- [ ] No price mentions in-app (safest for Apple review of reader apps)
- [ ] Push notification consent prompt before first push

## Open questions

1. **Do we want Apple/Google subscription management** even under Path A? E.g., sell a one-time "patron" tier on iOS as a consumable, while subscriptions remain web-only. Verdict: no — adds complexity for negligible gain.
2. **Family sharing** — if web subscriber has children also using the app, can they share entitlement? Today: no (Stripe sub is single-user). Post-launch decision.
3. **Gift subscriptions** — web-only for now; would require Path C to support on mobile.

## Decision

Pending sign-off by @PoiDNA. Once signed, update the Status field, open follow-up tickets:

- [ ] Implement `entitlements` table migration + effective-tier function
- [ ] Extend Stripe webhook handler to populate `entitlements`
- [ ] Update `/api/mobile/sessions` endpoint to filter/annotate `isEntitled` from effective tier
- [ ] Add "Manage subscription" button to mobile Profile tab linking to htgcyou.com
- [ ] Store submission prep (privacy labels, account deletion, Apple Sign-In)

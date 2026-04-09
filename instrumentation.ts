// Sentry instrumentation hook for Next.js 15 (App Router).
//
// Server (nodejs runtime) only — edge runtime is intentionally NOT
// initialized here because Sentry's edge integration needs withSentryConfig
// in next.config.ts to wire up correctly. next.config.ts is in CODEOWNERS;
// to keep this PR's scope limited and avoid the review hop, we skip the
// edge runtime entirely.
//
// Impact: middleware.ts (which runs in edge) won't capture errors via
// Sentry. The rate-limit helper (lib/rate-limit/check.ts) runs in nodejs
// runtime (route handlers + server actions), so its console.error calls
// and explicit Sentry.captureException calls work as designed.
//
// Follow-up: if edge observability is needed later, add withSentryConfig
// to next.config.ts in a separate PR (CODEOWNERS hop).

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
}

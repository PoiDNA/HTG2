import * as Sentry from '@sentry/nextjs';

// Server-side Sentry init.
//
// DSN is read from NEXT_PUBLIC_SENTRY_DSN. If unset (e.g. local dev without
// a Sentry project), Sentry.init becomes a no-op — code paths that call
// Sentry.captureException still work, they just don't send anything.
//
// captureConsoleIntegration mirrors console.error → Sentry.captureMessage so
// the rate-limit helper's `console.error('[rate-limit] ...')` calls land in
// Sentry without any code change in the helper. Explicit
// Sentry.captureException in the helper is a backup path.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Adjust as needed; 0.1 keeps cost low for HTG traffic levels.
  tracesSampleRate: 0.1,
  // Don't send PII by default — rate-limit logs include userId which is
  // already not PII (UUID), but be conservative.
  sendDefaultPii: false,
  integrations: [
    Sentry.captureConsoleIntegration({ levels: ['error'] }),
  ],
});

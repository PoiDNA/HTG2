import * as Sentry from '@sentry/nextjs';

// Edge runtime Sentry init. The rate-limit helper runs in Node runtime
// (server actions + route handlers), so edge does NOT need
// captureConsoleIntegration for that purpose. Kept minimal — just basic
// error capture for any edge code (currently middleware.ts).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});

import * as Sentry from '@sentry/nextjs';

// Client-side Sentry init. Minimal — no tracing, no replay, no console
// capture (client errors are caught by browser default error handlers).
// Rate-limit helpers never run on the client.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

const nextConfig: NextConfig = {
  output: "standalone",

  async redirects() {
    return [
      {
        source: '/:locale/konto/sesje',
        destination: '/:locale/konto',
        permanent: true,
      },
      {
        source: '/:locale/konto/profil',
        destination: '/:locale/konto/aktualizacja',
        permanent: false,
      },
    ];
  },

  async rewrites() {
    return [
      {
        source: '/favicon.ico',
        has: [{ type: 'header', key: 'host', value: '(pilot\\.place|www\\.pilot\\.place|pilot\\.localhost.*)' }],
        destination: '/pilot-favicon.png',
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);

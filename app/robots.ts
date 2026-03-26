import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  // STAGING: block all indexing until production
  return {
    rules: [
      {
        userAgent: '*',
        disallow: '/',
      },
    ],
  };
}

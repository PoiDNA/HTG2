import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/konto/', '/prowadzacy/', '/publikacja/', '/admin/', '/api/', '/auth/'],
      },
    ],
    sitemap: 'https://htg.cyou/sitemap.xml',
  };
}

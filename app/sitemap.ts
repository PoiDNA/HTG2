import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = 'https://htgcyou.com';
const LOCALES = ['pl', 'en'] as const;

// Static public pages
const STATIC_PATHS = [
  '/',
  '/sesje',
  '/sesje-indywidualne',
  '/subskrypcje',
  '/nagrania',
  '/privacy',
  '/terms',
  '/login',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  // Static pages with locale variants
  for (const path of STATIC_PATHS) {
    for (const locale of LOCALES) {
      const url = `${BASE_URL}/${locale}${path === '/' ? '' : path}`;
      entries.push({
        url,
        lastModified: new Date(),
        changeFrequency: path === '/' ? 'weekly' : 'monthly',
        priority: path === '/' ? 1.0 : 0.8,
      });
    }
  }

  // Dynamic pages from Supabase (monthly sets and sessions)
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    // Fetch published monthly sets
    const { data: sets } = await supabase
      .from('monthly_sets')
      .select('slug, updated_at')
      .eq('is_published', true);

    if (sets) {
      for (const set of sets) {
        for (const locale of LOCALES) {
          entries.push({
            url: `${BASE_URL}/${locale}/sesje/${set.slug}`,
            lastModified: set.updated_at ? new Date(set.updated_at) : new Date(),
            changeFrequency: 'monthly',
            priority: 0.7,
          });
        }
      }
    }

    // Fetch published session templates
    const { data: sessions } = await supabase
      .from('session_templates')
      .select('slug, updated_at')
      .eq('is_published', true);

    if (sessions) {
      for (const session of sessions) {
        for (const locale of LOCALES) {
          entries.push({
            url: `${BASE_URL}/${locale}/sesje/${session.slug}`,
            lastModified: session.updated_at ? new Date(session.updated_at) : new Date(),
            changeFrequency: 'monthly',
            priority: 0.6,
          });
        }
      }
    }
  } catch (error) {
    console.error('Sitemap: failed to fetch dynamic data', error);
  }

  return entries;
}

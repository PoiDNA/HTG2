import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HTG — Hacking The Game',
    short_name: 'HTG',
    description: 'Sesje indywidualne i grupowe HTG',
    start_url: '/pl',
    display: 'standalone',
    background_color: '#FDF5F0',
    theme_color: '#9B4A5C',
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: 'https://htg2-cdn.b-cdn.net/images/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: 'https://htg2-cdn.b-cdn.net/images/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}

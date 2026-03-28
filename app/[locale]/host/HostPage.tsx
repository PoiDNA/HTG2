'use client';

import dynamic from 'next/dynamic';
import { BG_COLORS } from '@/components/hero/constants';

const HeroHostOnly = dynamic(() => import('@/components/hero/HeroHostOnly'), {
  ssr: false,
  loading: () => (
    <div
      className="h-screen w-full"
      style={{ backgroundColor: BG_COLORS.initial }}
    />
  ),
});

/**
 * /host — full-screen animation without header, footer, text, or CTA.
 * Just the animated figure on dark background.
 */
export default function HostPage() {
  return (
    <div
      className="fixed inset-0 w-full h-full"
      style={{ backgroundColor: BG_COLORS.initial }}
    >
      <HeroHostOnly />
    </div>
  );
}

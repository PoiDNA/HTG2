'use client';

import dynamic from 'next/dynamic';
import { BG_COLORS } from '@/components/hero/constants';

const HeroHostV4 = dynamic(() => import('@/components/hero/HeroHostV4'), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-full" style={{ backgroundColor: BG_COLORS.initial }} />
  ),
});

export default function HostPageV4() {
  return (
    <div className="fixed inset-0 w-full h-full" style={{ backgroundColor: BG_COLORS.initial }}>
      <HeroHostV4 />
    </div>
  );
}

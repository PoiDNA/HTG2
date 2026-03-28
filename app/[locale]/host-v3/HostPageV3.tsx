'use client';

import dynamic from 'next/dynamic';
import { BG_COLORS } from '@/components/hero/constants';

const HeroHostV3 = dynamic(() => import('@/components/hero/HeroHostV3'), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-full" style={{ backgroundColor: BG_COLORS.initial }} />
  ),
});

export default function HostPageV3() {
  return (
    <div className="fixed inset-0 w-full h-full" style={{ backgroundColor: BG_COLORS.initial }}>
      <HeroHostV3 />
    </div>
  );
}

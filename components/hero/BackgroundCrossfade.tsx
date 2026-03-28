'use client';

import { useTransform, m, type MotionValue } from 'framer-motion';
import { BG_COLORS, Z } from './constants';

interface Props {
  activePhaseValue: MotionValue<number>;
}

export default function BackgroundCrossfade({ activePhaseValue }: Props) {
  const finalOpacity = useTransform(activePhaseValue, [2, 4], [0, 1]);

  return (
    <>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: BG_COLORS.initial, zIndex: Z.background }}
      />
      <m.div
        className="absolute inset-0"
        style={{
          backgroundColor: BG_COLORS.final,
          opacity: finalOpacity,
          zIndex: Z.background,
        }}
      />
    </>
  );
}

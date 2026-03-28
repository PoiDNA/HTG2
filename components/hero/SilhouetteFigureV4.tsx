'use client';

import { useTransform, m, type MotionValue } from 'framer-motion';
import { MASK_COLORS, MASK_DESAT, SOUL_COLORS } from './constants';
import SkeletalBody from './SkeletalBody';
import type { JointName, FillMap } from './jointDefinitions';

interface Props {
  joints: Record<JointName, MotionValue<number>>;
  activePhaseValue: MotionValue<number>;
}

// ─── Fill maps for the 3 layers (static, no re-computation) ───────────────

const SOUL_FILLS: FillMap = {
  thighL: SOUL_COLORS.secondary, thighR: SOUL_COLORS.secondary,
  shinL: SOUL_COLORS.secondary, shinR: SOUL_COLORS.secondary,
  footL: SOUL_COLORS.depth, footR: SOUL_COLORS.depth,
  torsoLow: SOUL_COLORS.fabric, torsoUp: SOUL_COLORS.fabric,
  upperArmL: SOUL_COLORS.primary, upperArmR: SOUL_COLORS.primary,
  forearmL: SOUL_COLORS.primary, forearmR: SOUL_COLORS.primary,
  handL: SOUL_COLORS.accent, handR: SOUL_COLORS.accent,
  neck: SOUL_COLORS.secondary,
  head: SOUL_COLORS.primary, headGlow: SOUL_COLORS.glow,
};

const DESAT_FILLS: FillMap = {
  thighL: MASK_DESAT.dark, thighR: MASK_DESAT.dark,
  shinL: MASK_DESAT.dark, shinR: MASK_DESAT.dark,
  footL: MASK_DESAT.dark, footR: MASK_DESAT.dark,
  torsoLow: MASK_DESAT.secondary, torsoUp: MASK_DESAT.secondary,
  upperArmL: MASK_DESAT.tertiary, upperArmR: MASK_DESAT.tertiary,
  forearmL: MASK_DESAT.tertiary, forearmR: MASK_DESAT.tertiary,
  handL: MASK_DESAT.mid, handR: MASK_DESAT.mid,
  neck: MASK_DESAT.mid,
  head: MASK_DESAT.primary, headGlow: MASK_DESAT.primary,
};

const NEON_FILLS: FillMap = {
  thighL: MASK_COLORS.tertiary, thighR: MASK_COLORS.primary,
  shinL: MASK_COLORS.tertiary, shinR: MASK_COLORS.primary,
  footL: MASK_COLORS.secondary, footR: MASK_COLORS.secondary,
  torsoLow: MASK_COLORS.primary, torsoUp: MASK_COLORS.tertiary,
  upperArmL: MASK_COLORS.secondary, upperArmR: MASK_COLORS.tertiary,
  forearmL: MASK_COLORS.secondary, forearmR: MASK_COLORS.tertiary,
  handL: MASK_COLORS.primary, handR: MASK_COLORS.primary,
  neck: MASK_COLORS.secondary,
  head: MASK_COLORS.primary, headGlow: MASK_COLORS.secondary,
};

/**
 * V4 Skeletal Figure — 3 layers sharing the same joint MotionValues.
 * Cracks expand from pelvis center via clipPath.
 */
export default function SilhouetteFigureV4({ joints, activePhaseValue }: Props) {
  // Layer opacities
  const soulOpacity      = useTransform(activePhaseValue, [0, 1, 2, 3, 4], [0, 0.1, 0.3, 0.6, 1]);
  const baseMaskOpacity  = useTransform(activePhaseValue, [0, 3, 4], [1, 0.4, 0]);
  const maskColorOpacity = useTransform(activePhaseValue, [0, 1, 2, 3, 4], [1, 0.9, 0.6, 0.3, 0]);

  // Crack
  const crackRadius  = useTransform(activePhaseValue, [0, 0.5, 1, 2, 3, 4], [0, 0, 60, 180, 350, 500]);
  const crackOpacity = useTransform(activePhaseValue, [0, 0.5, 1, 3.5, 4], [0, 0, 1, 1, 0]);

  return (
    <svg
      viewBox="-200 -200 800 1000"
      overflow="visible"
      shapeRendering="geometricPrecision"
      aria-hidden="true"
      className="w-full h-full"
      style={{
        contain: 'layout style',
        userSelect: 'none',
        WebkitUserDrag: 'none',
        WebkitTouchCallout: 'none',
      } as React.CSSProperties}
    >
      {/* Center the skeleton at pelvis origin ≈ (200, 290) */}
      <g transform="translate(200, 290)">

        {/* ═══════ SOUL LAYER (bottom) ═══════ */}
        <SkeletalBody joints={joints} fills={SOUL_FILLS} opacity={soulOpacity} />

        {/* ═══════ MASK DESAT LAYER ═══════ */}
        <SkeletalBody joints={joints} fills={DESAT_FILLS} opacity={baseMaskOpacity} />

        {/* ═══════ MASK COLOR LAYER (top) ═══════ */}
        <SkeletalBody joints={joints} fills={NEON_FILLS} opacity={maskColorOpacity} />

        {/* ═══════ CRACK OVERLAY ═══════ */}
        <m.g style={{
          opacity: crackOpacity,
          clipPath: useTransform(crackRadius, (r) => `circle(${r}px at 0px 0px)`),
        }}>
          <path d="M0 -380 L5 -320 L-2 -230 L3 -140 L-3 -40 L2 60 L0 210"
            fill="none" stroke={MASK_COLORS.crack} strokeWidth="3" />
          <path d="M0 -230 L-40 -190 L-60 -140"
            fill="none" stroke={MASK_COLORS.crack} strokeWidth="2" />
          <path d="M0 -230 L40 -200 L70 -150"
            fill="none" stroke={MASK_COLORS.crack} strokeWidth="2" />
          <path d="M0 -140 L-50 -90 L-80 -20"
            fill="none" stroke={MASK_COLORS.crack} strokeWidth="2" />
          <path d="M0 -140 L50 -100 L90 -30"
            fill="none" stroke={MASK_COLORS.crack} strokeWidth="2" />
          <path d="M0 -40 L-40 0 L-70 60"
            fill="none" stroke={MASK_COLORS.crack} strokeWidth="1.5" />
          <path d="M0 -40 L40 -10 L80 50"
            fill="none" stroke={MASK_COLORS.crack} strokeWidth="1.5" />
          <path d="M0 60 L-30 110 L-50 170"
            fill="none" stroke={MASK_COLORS.crack} strokeWidth="1.5" />
          <path d="M0 60 L30 120 L50 180"
            fill="none" stroke={MASK_COLORS.crack} strokeWidth="1.5" />
        </m.g>

      </g>
    </svg>
  );
}

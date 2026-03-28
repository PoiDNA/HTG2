'use client';

import { useTransform, m, type MotionValue } from 'framer-motion';
import { MASK_COLORS, MASK_DESAT, SOUL_COLORS } from './constants';

interface Props {
  activePhaseValue: MotionValue<number>;
  isInView?: boolean;
}

/**
 * SVG figure with mask (neon armor) + soul (warm fabric) layers.
 * Geometry in <defs>, colors on <use> tags, base mask covers AA gaps.
 * Soul layer underneath, revealed as mask fades.
 */
export default function SilhouetteFigure({ activePhaseValue, isInView = true }: Props) {
  // Mask color opacity: 1 at phase 0, fading through phases, 0 at phase 4
  const maskColorOpacity = useTransform(activePhaseValue, [0, 1, 2, 3, 4], [1, 0.9, 0.6, 0.3, 0]);
  // Soul opacity: inverse
  const soulOpacity = useTransform(activePhaseValue, [0, 1, 2, 3, 4], [0, 0.1, 0.3, 0.6, 1]);
  // Crack radius from chest center (200, 300)
  const crackRadius = useTransform(activePhaseValue, [0, 0.5, 1, 2, 3, 4], [0, 0, 60, 180, 350, 500]);
  // Base mask opacity (disappears at phase 4)
  const baseMaskOpacity = useTransform(activePhaseValue, [0, 3, 4], [1, 0.4, 0]);
  // Crack opacity: visible during phases 1-3, fades at phase 4
  const crackOpacity = useTransform(activePhaseValue, [0, 0.5, 1, 3.5, 4], [0, 0, 1, 1, 0]);

  // ─── Posture transforms ───
  // Head tilt: raised (arrogant -8deg) → bowed (humble 12deg)
  const headRotate = useTransform(activePhaseValue, [0, 1, 2, 3, 4], [-8, -5, 0, 5, 12]);
  // Shoulder tension: raised (-8px) → dropped (0)
  const shoulderY = useTransform(activePhaseValue, [0, 1, 2, 3, 4], [-8, -5, -2, 0, 4]);
  // Arm openness: crossed (0deg) → open (25deg)
  const leftArmRotate = useTransform(activePhaseValue, [0, 1, 2, 3, 4], [15, 10, 5, -5, -25]);
  const rightArmRotate = useTransform(activePhaseValue, [0, 1, 2, 3, 4], [-15, -10, -5, 5, 25]);
  // Body lean: back (-5px) → centered (0) → slightly forward (3px)
  const bodyLeanY = useTransform(activePhaseValue, [0, 1, 2, 3, 4], [-5, -3, 0, 2, 3]);

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
      {/* ─── Neon gradient for visor ─── */}
      <defs>
        <linearGradient id="neon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={MASK_COLORS.primary} />
          <stop offset="50%" stopColor={MASK_COLORS.secondary} />
          <stop offset="100%" stopColor={MASK_COLORS.tertiary} />
        </linearGradient>

        {/* ─── GEOMETRY (no fill) ─── */}
        {/* Head — angular helmet */}
        <path id="geom-visor"
          d="M155 -90 L245 -90 L260 -40 L250 10 L200 30 L150 10 L140 -40 Z" />
        <path id="geom-head-left"
          d="M140 -40 L155 -90 L200 -100 L200 -40 L150 10 L140 -40 Z" />
        <path id="geom-head-right"
          d="M260 -40 L245 -90 L200 -100 L200 -40 L250 10 L260 -40 Z" />

        {/* Shoulders — angular armor plates */}
        <path id="geom-shoulder-left"
          d="M100 60 L165 50 L170 120 L90 130 Z" />
        <path id="geom-shoulder-right"
          d="M300 60 L235 50 L230 120 L310 130 Z" />

        {/* Chest — angular breastplate */}
        <path id="geom-chest-upper"
          d="M165 50 L235 50 L240 160 L200 170 L160 160 Z" />
        <path id="geom-chest-lower"
          d="M160 160 L240 160 L250 280 L200 290 L150 280 Z" />

        {/* Arms */}
        <path id="geom-arm-left"
          d="M90 130 L140 120 L130 280 L70 300 L50 250 Z" />
        <path id="geom-arm-right"
          d="M310 130 L260 120 L270 280 L330 300 L350 250 Z" />

        {/* Hips */}
        <path id="geom-hip-left"
          d="M150 280 L200 290 L195 380 L135 370 Z" />
        <path id="geom-hip-right"
          d="M250 280 L200 290 L205 380 L265 370 Z" />

        {/* Legs */}
        <path id="geom-leg-left"
          d="M135 370 L195 380 L185 570 L125 580 Z" />
        <path id="geom-leg-right"
          d="M265 370 L205 380 L215 570 L275 580 Z" />
      </defs>

      {/* ═══════ SOUL LAYER (underneath) ═══════ */}
      <m.g style={{ opacity: soulOpacity }}>
        <g
          id="soul"
          style={{
            transformOrigin: '200px 300px',
            animation: isInView ? 'hero-breathe 4s ease-in-out infinite' : 'none',
          }}
        >
          {/* Head — smooth warm oval */}
          <ellipse cx="200" cy="-30" rx="58" ry="70" fill={SOUL_COLORS.primary} />
          {/* Inner glow placeholder */}
          <ellipse cx="200" cy="-30" rx="35" ry="45" fill={SOUL_COLORS.glow} opacity="0.35" />
          {/* Neck */}
          <rect x="182" y="38" width="36" height="30" rx="8" fill={SOUL_COLORS.secondary} />
          {/* Torso — flowing robe */}
          <path
            d="M130 68 Q130 58 155 52 L245 52 Q270 58 270 68 L280 370 Q280 390 260 400 L140 400 Q120 390 120 370 Z"
            fill={SOUL_COLORS.fabric}
          />
          {/* Robe folds */}
          <path d="M165 100 Q200 140 185 240 Q180 300 175 370"
            fill="none" stroke={SOUL_COLORS.depth} strokeWidth="1.5" opacity="0.25" />
          <path d="M235 100 Q200 150 215 250 Q220 310 225 370"
            fill="none" stroke={SOUL_COLORS.depth} strokeWidth="1.5" opacity="0.25" />
          {/* Arms — open, palms up */}
          <path d="M130 75 Q85 110 55 210 Q45 250 65 268 L82 258 Q92 230 115 170 L130 120"
            fill={SOUL_COLORS.primary} />
          <path d="M270 75 Q315 110 345 210 Q355 250 335 268 L318 258 Q308 230 285 170 L270 120"
            fill={SOUL_COLORS.primary} />
          {/* Palms */}
          <ellipse cx="60" cy="268" rx="20" ry="13" fill={SOUL_COLORS.accent} />
          <ellipse cx="340" cy="268" rx="20" ry="13" fill={SOUL_COLORS.accent} />
          {/* Legs */}
          <rect x="152" y="392" width="42" height="170" rx="14" fill={SOUL_COLORS.secondary} />
          <rect x="208" y="392" width="42" height="170" rx="14" fill={SOUL_COLORS.secondary} />
          {/* Feet */}
          <ellipse cx="173" cy="562" rx="28" ry="10" fill={SOUL_COLORS.depth} />
          <ellipse cx="229" cy="562" rx="28" ry="10" fill={SOUL_COLORS.depth} />
        </g>
      </m.g>

      {/* ═══════ BASE MASK LAYER (covers AA gaps) ═══════ */}
      <m.g style={{ opacity: baseMaskOpacity }}>
        <path
          d="M100 -100 L300 -100 L350 250 L330 300 L270 580 L130 580 L70 300 L50 250 Z"
          fill={MASK_COLORS.crack}
        />
      </m.g>

      {/* ═══════ MASK DESAT (static, underneath color) ═══════ */}
      <m.g style={{ opacity: baseMaskOpacity }}>
        <m.g style={{ translateY: bodyLeanY }}>
          {/* Head group with tilt */}
          <m.g style={{ rotate: headRotate, transformOrigin: '200px -30px' }}>
            <use href="#geom-visor" fill={MASK_DESAT.primary} />
            <use href="#geom-head-left" fill={MASK_DESAT.dark} />
            <use href="#geom-head-right" fill={MASK_DESAT.dark} />
          </m.g>
          {/* Shoulders with tension */}
          <m.g style={{ translateY: shoulderY }}>
            <use href="#geom-shoulder-left" fill={MASK_DESAT.mid} />
            <use href="#geom-shoulder-right" fill={MASK_DESAT.mid} />
          </m.g>
          {/* Chest */}
          <use href="#geom-chest-upper" fill={MASK_DESAT.secondary} />
          <use href="#geom-chest-lower" fill={MASK_DESAT.secondary} />
          {/* Arms with openness */}
          <m.g style={{ rotate: leftArmRotate, transformOrigin: '110px 120px' }}>
            <use href="#geom-arm-left" fill={MASK_DESAT.tertiary} />
          </m.g>
          <m.g style={{ rotate: rightArmRotate, transformOrigin: '290px 120px' }}>
            <use href="#geom-arm-right" fill={MASK_DESAT.tertiary} />
          </m.g>
          {/* Hips + legs */}
          <use href="#geom-hip-left" fill={MASK_DESAT.mid} />
          <use href="#geom-hip-right" fill={MASK_DESAT.mid} />
          <use href="#geom-leg-left" fill={MASK_DESAT.dark} />
          <use href="#geom-leg-right" fill={MASK_DESAT.dark} />
        </m.g>
      </m.g>

      {/* ═══════ MASK COLOR (animated opacity cross-fade) ═══════ */}
      <m.g style={{ opacity: maskColorOpacity }}>
        <m.g style={{ translateY: bodyLeanY }}>
          {/* Head with tilt */}
          <m.g style={{ rotate: headRotate, transformOrigin: '200px -30px' }}>
            <use href="#geom-visor" fill="url(#neon-gradient)" />
            <use href="#geom-head-left" fill={MASK_COLORS.primary} />
            <use href="#geom-head-right" fill={MASK_COLORS.secondary} />
          </m.g>
          {/* Shoulders */}
          <m.g style={{ translateY: shoulderY }}>
            <use href="#geom-shoulder-left" fill={MASK_COLORS.primary} />
            <use href="#geom-shoulder-right" fill={MASK_COLORS.secondary} />
          </m.g>
          {/* Chest */}
          <use href="#geom-chest-upper" fill={MASK_COLORS.tertiary} />
          <use href="#geom-chest-lower" fill={MASK_COLORS.primary} />
          {/* Arms */}
          <m.g style={{ rotate: leftArmRotate, transformOrigin: '110px 120px' }}>
            <use href="#geom-arm-left" fill={MASK_COLORS.secondary} />
          </m.g>
          <m.g style={{ rotate: rightArmRotate, transformOrigin: '290px 120px' }}>
            <use href="#geom-arm-right" fill={MASK_COLORS.tertiary} />
          </m.g>
          {/* Hips + legs */}
          <use href="#geom-hip-left" fill={MASK_COLORS.primary} />
          <use href="#geom-hip-right" fill={MASK_COLORS.secondary} />
          <use href="#geom-leg-left" fill={MASK_COLORS.tertiary} />
          <use href="#geom-leg-right" fill={MASK_COLORS.primary} />
        </m.g>
      </m.g>

      {/* ═══════ CRACK OVERLAY ═══════ */}
      <m.g style={{ opacity: crackOpacity, clipPath: useTransform(crackRadius, (r) => `circle(${r}px at 200px 300px)`) }}>
        <g id="cracks-full">
          {/* Main vertical crack */}
          <path d="M200 -80 L205 -20 L198 60 L203 150 L197 250 L202 350 L200 500"
            fill="none" stroke={MASK_COLORS.crack} strokeWidth="3" />
          {/* Branching cracks */}
          <path d="M200 60 L160 100 L140 150" fill="none" stroke={MASK_COLORS.crack} strokeWidth="2" />
          <path d="M200 60 L240 90 L270 140" fill="none" stroke={MASK_COLORS.crack} strokeWidth="2" />
          <path d="M200 150 L150 200 L120 270" fill="none" stroke={MASK_COLORS.crack} strokeWidth="2" />
          <path d="M200 150 L250 190 L290 260" fill="none" stroke={MASK_COLORS.crack} strokeWidth="2" />
          <path d="M200 250 L160 290 L130 350" fill="none" stroke={MASK_COLORS.crack} strokeWidth="1.5" />
          <path d="M200 250 L240 280 L280 340" fill="none" stroke={MASK_COLORS.crack} strokeWidth="1.5" />
          {/* Fine secondary cracks */}
          <path d="M160 100 L130 80" fill="none" stroke={MASK_COLORS.crack} strokeWidth="1" />
          <path d="M240 90 L270 70" fill="none" stroke={MASK_COLORS.crack} strokeWidth="1" />
          <path d="M150 200 L110 190" fill="none" stroke={MASK_COLORS.crack} strokeWidth="1" />
          <path d="M250 190 L300 200" fill="none" stroke={MASK_COLORS.crack} strokeWidth="1" />
          <path d="M200 350 L170 400 L150 460" fill="none" stroke={MASK_COLORS.crack} strokeWidth="1.5" />
          <path d="M200 350 L230 410 L250 470" fill="none" stroke={MASK_COLORS.crack} strokeWidth="1.5" />
        </g>
      </m.g>
    </svg>
  );
}

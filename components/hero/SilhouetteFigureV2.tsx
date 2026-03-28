'use client';

import { useTransform, m, type MotionValue } from 'framer-motion';
import { MASK_COLORS, MASK_DESAT, SOUL_COLORS } from './constants';

interface Props {
  activePhaseValue: MotionValue<number>;
  isInView?: boolean;
}

/**
 * V2: Figure with defensive postures.
 * Phase 0: power pose (head high, arms wide, scale > 1 — presence fills the frame)
 * Phases 1-3: defensive retreat (arms shield body, head ducks, figure shrinks back)
 * Phase 4: soul revealed — open, calm, breathes
 */
export default function SilhouetteFigureV2({ activePhaseValue, isInView = true }: Props) {
  // Mask fade
  const maskColorOpacity = useTransform(activePhaseValue, [0, 1, 2, 3, 4], [1, 0.9, 0.6, 0.3, 0]);
  const soulOpacity      = useTransform(activePhaseValue, [0, 1, 2, 3, 4], [0, 0.1, 0.3, 0.6, 1]);
  const baseMaskOpacity  = useTransform(activePhaseValue, [0, 3, 4], [1, 0.4, 0]);

  // Crack
  const crackRadius  = useTransform(activePhaseValue, [0, 0.5, 1, 2, 3, 4], [0, 0, 60, 180, 350, 500]);
  const crackOpacity = useTransform(activePhaseValue, [0, 0.5, 1, 3.5, 4], [0, 0, 1, 1, 0]);

  // ─── V2 Posture: ego → defense → soul ───────────────────────────
  // Head: raised arrogance → ducking to hide → peaceful bow in phase 4
  const headRotate = useTransform(activePhaseValue,
    [0, 0.5, 1, 2, 3, 4],
    [-12, -14, 0, 14, 22, 10]
  );
  // Shoulders: hoisted with pride → hunched defensively → released
  const shoulderY = useTransform(activePhaseValue,
    [0, 1, 2, 3, 4],
    [-12, -16, -10, -4, 5]
  );
  // Arms V2: wide open display (phase 0) → shoot up to shield face (phase 2-3) → open soul (phase 4)
  const leftArmRotate = useTransform(activePhaseValue,
    [0, 0.5, 1, 2, 3, 4],
    [30, 28, 5, -40, -65, -28]
  );
  const rightArmRotate = useTransform(activePhaseValue,
    [0, 0.5, 1, 2, 3, 4],
    [-30, -28, -5, 40, 65, 28]
  );
  // Body lean: leaning back confidently → curling down (fetal defense) → forward open
  const bodyLeanY = useTransform(activePhaseValue,
    [0, 1, 2, 3, 4],
    [-10, 0, 8, 14, 3]
  );
  // Defense scale: figure looms (phase 0) → retreats into distance (phases 1-3) → fully returns (phase 4)
  const defenseScale = useTransform(activePhaseValue,
    [0, 1, 2, 3, 4],
    [1.08, 0.96, 0.87, 0.80, 1.0]
  );

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
      <defs>
        <linearGradient id="neon-gradient-v2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={MASK_COLORS.primary} />
          <stop offset="50%" stopColor={MASK_COLORS.secondary} />
          <stop offset="100%" stopColor={MASK_COLORS.tertiary} />
        </linearGradient>

        {/* ─── GEOMETRY ─── */}
        <path id="v2-visor"         d="M155 -90 L245 -90 L260 -40 L250 10 L200 30 L150 10 L140 -40 Z" />
        <path id="v2-head-left"     d="M140 -40 L155 -90 L200 -100 L200 -40 L150 10 L140 -40 Z" />
        <path id="v2-head-right"    d="M260 -40 L245 -90 L200 -100 L200 -40 L250 10 L260 -40 Z" />
        <path id="v2-shoulder-left" d="M100 60 L165 50 L170 120 L90 130 Z" />
        <path id="v2-shoulder-right"d="M300 60 L235 50 L230 120 L310 130 Z" />
        <path id="v2-chest-upper"   d="M165 50 L235 50 L240 160 L200 170 L160 160 Z" />
        <path id="v2-chest-lower"   d="M160 160 L240 160 L250 280 L200 290 L150 280 Z" />
        <path id="v2-arm-left"      d="M90 130 L140 120 L130 280 L70 300 L50 250 Z" />
        <path id="v2-arm-right"     d="M310 130 L260 120 L270 280 L330 300 L350 250 Z" />
        <path id="v2-hip-left"      d="M150 280 L200 290 L195 380 L135 370 Z" />
        <path id="v2-hip-right"     d="M250 280 L200 290 L205 380 L265 370 Z" />
        <path id="v2-leg-left"      d="M135 370 L195 380 L185 570 L125 580 Z" />
        <path id="v2-leg-right"     d="M265 370 L205 380 L215 570 L275 580 Z" />
      </defs>

      {/* Outer scale wrapper — defense retreat */}
      <m.g style={{ scale: defenseScale, transformOrigin: '200px 200px' }}>

        {/* ═══════ SOUL LAYER ═══════ */}
        <m.g style={{ opacity: soulOpacity }}>
          <g
            style={{
              transformOrigin: '200px 300px',
              animation: isInView ? 'hero-breathe 4s ease-in-out infinite' : 'none',
            }}
          >
            <ellipse cx="200" cy="-30" rx="58" ry="70" fill={SOUL_COLORS.primary} />
            <ellipse cx="200" cy="-30" rx="35" ry="45" fill={SOUL_COLORS.glow} opacity="0.35" />
            <rect x="182" y="38" width="36" height="30" rx="8" fill={SOUL_COLORS.secondary} />
            <path
              d="M130 68 Q130 58 155 52 L245 52 Q270 58 270 68 L280 370 Q280 390 260 400 L140 400 Q120 390 120 370 Z"
              fill={SOUL_COLORS.fabric}
            />
            <path d="M165 100 Q200 140 185 240 Q180 300 175 370"
              fill="none" stroke={SOUL_COLORS.depth} strokeWidth="1.5" opacity="0.25" />
            <path d="M235 100 Q200 150 215 250 Q220 310 225 370"
              fill="none" stroke={SOUL_COLORS.depth} strokeWidth="1.5" opacity="0.25" />
            <path d="M130 75 Q85 110 55 210 Q45 250 65 268 L82 258 Q92 230 115 170 L130 120"
              fill={SOUL_COLORS.primary} />
            <path d="M270 75 Q315 110 345 210 Q355 250 335 268 L318 258 Q308 230 285 170 L270 120"
              fill={SOUL_COLORS.primary} />
            <ellipse cx="60"  cy="268" rx="20" ry="13" fill={SOUL_COLORS.accent} />
            <ellipse cx="340" cy="268" rx="20" ry="13" fill={SOUL_COLORS.accent} />
            <rect x="152" y="392" width="42" height="170" rx="14" fill={SOUL_COLORS.secondary} />
            <rect x="208" y="392" width="42" height="170" rx="14" fill={SOUL_COLORS.secondary} />
            <ellipse cx="173" cy="562" rx="28" ry="10" fill={SOUL_COLORS.depth} />
            <ellipse cx="229" cy="562" rx="28" ry="10" fill={SOUL_COLORS.depth} />
          </g>
        </m.g>

        {/* ═══════ BASE MASK ═══════ */}
        <m.g style={{ opacity: baseMaskOpacity }}>
          <path
            d="M100 -100 L300 -100 L350 250 L330 300 L270 580 L130 580 L70 300 L50 250 Z"
            fill={MASK_COLORS.crack}
          />
        </m.g>

        {/* ═══════ MASK DESAT ═══════ */}
        <m.g style={{ opacity: baseMaskOpacity }}>
          <m.g style={{ translateY: bodyLeanY }}>
            <m.g style={{ rotate: headRotate, transformOrigin: '200px -30px' }}>
              <use href="#v2-visor"      fill={MASK_DESAT.primary} />
              <use href="#v2-head-left"  fill={MASK_DESAT.dark} />
              <use href="#v2-head-right" fill={MASK_DESAT.dark} />
            </m.g>
            <m.g style={{ translateY: shoulderY }}>
              <use href="#v2-shoulder-left"  fill={MASK_DESAT.mid} />
              <use href="#v2-shoulder-right" fill={MASK_DESAT.mid} />
            </m.g>
            <use href="#v2-chest-upper" fill={MASK_DESAT.secondary} />
            <use href="#v2-chest-lower" fill={MASK_DESAT.secondary} />
            <m.g style={{ rotate: leftArmRotate,  transformOrigin: '110px 120px' }}>
              <use href="#v2-arm-left" fill={MASK_DESAT.tertiary} />
            </m.g>
            <m.g style={{ rotate: rightArmRotate, transformOrigin: '290px 120px' }}>
              <use href="#v2-arm-right" fill={MASK_DESAT.tertiary} />
            </m.g>
            <use href="#v2-hip-left"  fill={MASK_DESAT.mid} />
            <use href="#v2-hip-right" fill={MASK_DESAT.mid} />
            <use href="#v2-leg-left"  fill={MASK_DESAT.dark} />
            <use href="#v2-leg-right" fill={MASK_DESAT.dark} />
          </m.g>
        </m.g>

        {/* ═══════ MASK COLOR ═══════ */}
        <m.g style={{ opacity: maskColorOpacity }}>
          <m.g style={{ translateY: bodyLeanY }}>
            <m.g style={{ rotate: headRotate, transformOrigin: '200px -30px' }}>
              <use href="#v2-visor"      fill="url(#neon-gradient-v2)" />
              <use href="#v2-head-left"  fill={MASK_COLORS.primary} />
              <use href="#v2-head-right" fill={MASK_COLORS.secondary} />
            </m.g>
            <m.g style={{ translateY: shoulderY }}>
              <use href="#v2-shoulder-left"  fill={MASK_COLORS.primary} />
              <use href="#v2-shoulder-right" fill={MASK_COLORS.secondary} />
            </m.g>
            <use href="#v2-chest-upper" fill={MASK_COLORS.tertiary} />
            <use href="#v2-chest-lower" fill={MASK_COLORS.primary} />
            <m.g style={{ rotate: leftArmRotate,  transformOrigin: '110px 120px' }}>
              <use href="#v2-arm-left" fill={MASK_COLORS.secondary} />
            </m.g>
            <m.g style={{ rotate: rightArmRotate, transformOrigin: '290px 120px' }}>
              <use href="#v2-arm-right" fill={MASK_COLORS.tertiary} />
            </m.g>
            <use href="#v2-hip-left"  fill={MASK_COLORS.primary} />
            <use href="#v2-hip-right" fill={MASK_COLORS.secondary} />
            <use href="#v2-leg-left"  fill={MASK_COLORS.tertiary} />
            <use href="#v2-leg-right" fill={MASK_COLORS.primary} />
          </m.g>
        </m.g>

        {/* ═══════ CRACK OVERLAY ═══════ */}
        <m.g style={{
          opacity: crackOpacity,
          clipPath: useTransform(crackRadius, (r) => `circle(${r}px at 200px 300px)`)
        }}>
          <path d="M200 -80 L205 -20 L198 60 L203 150 L197 250 L202 350 L200 500"
            fill="none" stroke={MASK_COLORS.crack} strokeWidth="3" />
          <path d="M200 60 L160 100 L140 150"   fill="none" stroke={MASK_COLORS.crack} strokeWidth="2" />
          <path d="M200 60 L240 90 L270 140"    fill="none" stroke={MASK_COLORS.crack} strokeWidth="2" />
          <path d="M200 150 L150 200 L120 270"  fill="none" stroke={MASK_COLORS.crack} strokeWidth="2" />
          <path d="M200 150 L250 190 L290 260"  fill="none" stroke={MASK_COLORS.crack} strokeWidth="2" />
          <path d="M200 250 L160 290 L130 350"  fill="none" stroke={MASK_COLORS.crack} strokeWidth="1.5" />
          <path d="M200 250 L240 280 L280 340"  fill="none" stroke={MASK_COLORS.crack} strokeWidth="1.5" />
          <path d="M160 100 L130 80"            fill="none" stroke={MASK_COLORS.crack} strokeWidth="1" />
          <path d="M240 90 L270 70"             fill="none" stroke={MASK_COLORS.crack} strokeWidth="1" />
          <path d="M150 200 L110 190"           fill="none" stroke={MASK_COLORS.crack} strokeWidth="1" />
          <path d="M250 190 L300 200"           fill="none" stroke={MASK_COLORS.crack} strokeWidth="1" />
          <path d="M200 350 L170 400 L150 460"  fill="none" stroke={MASK_COLORS.crack} strokeWidth="1.5" />
          <path d="M200 350 L230 410 L250 470"  fill="none" stroke={MASK_COLORS.crack} strokeWidth="1.5" />
        </m.g>

      </m.g>
    </svg>
  );
}

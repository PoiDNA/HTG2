'use client';

import { SOUL_COLORS, BG_COLORS } from './constants';

/**
 * Static fallback hero — variant B for A/B test + ErrorBoundary fallback.
 * Shows the revealed soul figure with CTA immediately.
 */
export default function HeroStatic() {
  return (
    <section
      className="relative flex flex-col items-center justify-center min-h-screen px-6 overflow-hidden"
      style={{
        background: BG_COLORS.final,
        colorScheme: 'light',
        isolation: 'isolate',
      }}
    >
      {/* Soul figure — simplified static version */}
      <div className="relative w-full max-w-[400px] aspect-[4/6] mx-auto mb-8">
        <svg
          viewBox="-200 -200 800 1000"
          overflow="visible"
          shapeRendering="geometricPrecision"
          aria-hidden="true"
          className="w-full h-full"
          style={{ contain: 'layout style', userSelect: 'none' }}
        >
          {/* Soul silhouette — warm, soft, grounded */}
          <g id="soul-static">
            {/* Head — smooth oval */}
            <ellipse cx="200" cy="-20" rx="65" ry="78" fill={SOUL_COLORS.primary} />
            {/* Inner glow on face */}
            <ellipse cx="200" cy="-20" rx="40" ry="50" fill={SOUL_COLORS.glow} opacity="0.4" />
            {/* Neck */}
            <rect x="180" y="55" width="40" height="35" rx="8" fill={SOUL_COLORS.secondary} />
            {/* Torso — soft flowing robe */}
            <path
              d="M120 90 Q120 80 140 75 L260 75 Q280 80 280 90 L290 380 Q290 400 270 410 L130 410 Q110 400 110 380 Z"
              fill={SOUL_COLORS.fabric}
            />
            {/* Robe folds */}
            <path
              d="M160 120 Q200 160 180 250 Q175 300 170 380"
              fill="none" stroke={SOUL_COLORS.depth} strokeWidth="2" opacity="0.3"
            />
            <path
              d="M240 120 Q200 170 220 260 Q225 310 230 380"
              fill="none" stroke={SOUL_COLORS.depth} strokeWidth="2" opacity="0.3"
            />
            {/* Left arm — open palm */}
            <path
              d="M120 100 Q80 130 50 220 Q40 260 60 280 L80 270 Q90 240 110 180 L120 140"
              fill={SOUL_COLORS.primary}
            />
            {/* Right arm — open palm */}
            <path
              d="M280 100 Q320 130 350 220 Q360 260 340 280 L320 270 Q310 240 290 180 L280 140"
              fill={SOUL_COLORS.primary}
            />
            {/* Left hand — palm up */}
            <ellipse cx="55" cy="280" rx="22" ry="15" fill={SOUL_COLORS.accent} />
            {/* Right hand — palm up */}
            <ellipse cx="345" cy="280" rx="22" ry="15" fill={SOUL_COLORS.accent} />
            {/* Legs */}
            <rect x="150" y="400" width="45" height="180" rx="15" fill={SOUL_COLORS.secondary} />
            <rect x="210" y="400" width="45" height="180" rx="15" fill={SOUL_COLORS.secondary} />
            {/* Feet */}
            <ellipse cx="172" cy="580" rx="30" ry="12" fill={SOUL_COLORS.depth} />
            <ellipse cx="232" cy="580" rx="30" ry="12" fill={SOUL_COLORS.depth} />
          </g>
        </svg>
      </div>

      {/* CTA block */}
      <div className="text-center space-y-4">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-white">
          Spotkajmy się bez masek
        </h1>
        <a
          href="/sesje"
          className="inline-block bg-[#C4956A] hover:bg-[#D4A574] text-white px-8 py-4 rounded-xl text-lg font-semibold transition-colors shadow-lg"
        >
          Poznaj sesje transpersonalne
        </a>
      </div>
    </section>
  );
}

import { Link } from '@/i18n-config';
import { ChevronRight, ChevronLeft } from 'lucide-react';

type GearPalette = {
  light: string;
  base: string;
  dark: string;
  recess: string;
};

const VIOLET: GearPalette = {
  light: '#d4c4fd',
  base: '#a78bfa',
  dark: '#7c5fd6',
  recess: '#5a3fa3',
};

const SAGE: GearPalette = {
  light: '#9cbd8f',
  base: '#5A8A4E',
  dark: '#3D6B32',
  recess: '#2a4a22',
};

function Gear({
  id,
  palette,
  spinClass,
  phaseDelay,
}: {
  id: string;
  palette: GearPalette;
  spinClass: 'gear-spin-cw' | 'gear-spin-ccw';
  phaseDelay: number;
}) {
  const bodyGrad = `${id}-body`;
  const hubGrad  = `${id}-hub`;

  return (
    <svg viewBox="-50 -50 100 100" className="w-full h-full block" aria-hidden>
      <defs>
        <radialGradient id={bodyGrad} cx="30%" cy="25%" r="85%">
          <stop offset="0%"   stopColor={palette.light} />
          <stop offset="55%"  stopColor={palette.base}  />
          <stop offset="100%" stopColor={palette.dark}  />
        </radialGradient>
        <radialGradient id={hubGrad} cx="35%" cy="30%" r="90%">
          <stop offset="0%"   stopColor={palette.base}   />
          <stop offset="100%" stopColor={palette.recess} />
        </radialGradient>
      </defs>

      <g
        className={spinClass}
        style={{ animationDelay: phaseDelay !== 0 ? `${phaseDelay}s` : undefined }}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <rect
            key={i}
            x="-5" y="-49" width="10" height="11"
            rx="3.5" ry="3.5"
            fill={`url(#${bodyGrad})`}
            transform={`rotate(${i * 30})`}
          />
        ))}

        <circle r="42" fill={`url(#${bodyGrad})`} />
        <circle r="42" fill="none" stroke={palette.dark} strokeWidth="0.6" opacity="0.45" />

        {Array.from({ length: 3 }).map((_, i) => (
          <ellipse
            key={i}
            cx="0" cy="-27" rx="5.5" ry="10"
            fill={palette.recess} opacity="0.28"
            transform={`rotate(${i * 120})`}
          />
        ))}

        <circle r="16" fill={`url(#${hubGrad})`} />
        <circle r="16" fill="none" stroke={palette.recess} strokeWidth="0.8" opacity="0.55" />
      </g>
    </svg>
  );
}

function Label({ text }: { text: string }) {
  return (
    <span className="text-3xl sm:text-5xl font-serif font-bold leading-none text-htg-fg">
      {text}
    </span>
  );
}

function GearBadge({
  palette,
  gearId,
  spinClass,
  phaseDelay,
  counterClass,
  chevron,
}: {
  palette: GearPalette;
  gearId: string;
  spinClass: 'gear-spin-cw' | 'gear-spin-ccw';
  phaseDelay: number;
  counterClass: 'gear-counter-cw' | 'gear-counter-ccw';
  chevron: 'left' | 'right';
}) {
  const Chevron = chevron === 'right' ? ChevronRight : ChevronLeft;

  return (
    <div
      className="relative shrink-0 w-[72px] h-[72px] sm:w-24 sm:h-24"
      style={{
        filter: `drop-shadow(0 10px 18px ${palette.dark}55)`,
        transform: 'perspective(400px) rotateX(10deg)',
        willChange: 'transform',
      }}
    >
      <Gear
        id={gearId}
        palette={palette}
        spinClass={spinClass}
        phaseDelay={phaseDelay}
      />
      <Chevron
        className={`absolute inset-0 m-auto w-7 h-7 sm:w-8 sm:h-8 text-white pointer-events-none ${counterClass}`}
        style={{
          animationDelay: phaseDelay !== 0 ? `${phaseDelay}s` : undefined,
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
        }}
        strokeWidth={2.6}
        aria-hidden
      />
    </div>
  );
}

const ctaClasses =
  'group flex items-center gap-3 sm:gap-4 select-none transition-transform duration-150 active:scale-[0.97]';

export default function MomentsSessionsCta() {
  return (
    <div className="gear-pair flex items-center justify-center">
      {/* Sesje — sage, CW, left side */}
      <Link href="/konto/sluchaj" aria-label="Sesje" className={ctaClasses}>
        <Label text="Sesje" />
        <GearBadge
          palette={SAGE}
          gearId="gear-sessions"
          spinClass="gear-spin-cw"
          phaseDelay={0}
          counterClass="gear-counter-cw"
          chevron="right"
        />
      </Link>

      {/* Momenty — violet, CCW, right side — teeth offset by half-tooth (0.75 s into anim) */}
      <div className="-ml-3 sm:-ml-4">
        <Link href="/konto/momenty" aria-label="Momenty" className={ctaClasses}>
          <GearBadge
            palette={VIOLET}
            gearId="gear-moments"
            spinClass="gear-spin-ccw"
            phaseDelay={-0.75}
            counterClass="gear-counter-ccw"
            chevron="left"
          />
          <Label text="Momenty" />
        </Link>
      </div>
    </div>
  );
}

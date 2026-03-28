// ─── Colors ───
export const MASK_COLORS = {
  primary:   '#FF2D9B',  // magenta neon
  secondary: '#00F0FF',  // cyan neon
  tertiary:  '#FFD700',  // gold
  shimmer:   '#FFFFFF80', // white shimmer 50%
  crack:     '#1A1A2E',  // dark navy
  mirror:    '#C0C0C0',  // mirror silver (visor)
} as const;

export const MASK_DESAT = {
  primary:   '#7A6B75',  // magenta → desat
  secondary: '#6B8A8E',  // cyan → desat
  tertiary:  '#8A8060',  // gold → desat
  mirror:    '#8A8A8A',  // silver → desat
  dark:      '#6B5E68',
  mid:       '#7A7070',
} as const;

export const SOUL_COLORS = {
  primary:     '#C4956A',  // warm amber
  secondary:   '#8B7355',  // olive beige
  glow:        '#FFE4B5',  // honey glow
  glowStrong:  '#FFCC66',  // golden glow (pulsing)
  accent:      '#D4A574',  // terracotta
  depth:       '#5C4033',  // dark brown (shadows)
  firefly:     '#FFD7A0',  // firefly
  fabric:      '#B8956A',  // fabric/robe
} as const;

export const BG_COLORS = {
  initial: '#0D0D1A',  // very dark navy
  final:   '#1A1510',  // warm dark brown
} as const;

// ─── Springs (desktop click-driven) ───
export const SPRINGS = {
  recoil:       { type: 'spring' as const, stiffness: 300, damping: 15 },
  settle:       { type: 'spring' as const, stiffness: 200, damping: 25 },
  fragmentFall: { type: 'spring' as const, stiffness: 100, damping: 12, mass: 1.5 },
  surrender:    { duration: 0.8, ease: 'easeInOut' as const },
  posture:      { type: 'spring' as const, stiffness: 50, damping: 30 },
  breathe:      { duration: 4, repeat: Infinity, ease: 'easeInOut' as const },
  revert:       { duration: 2.5, ease: 'easeInOut' as const },
} as const;

// ─── Scroll phase mapping ───
export const SCROLL_BREAKPOINTS = [0, 0.12, 0.25, 0.45, 0.65, 0.85, 1] as const;
export const PHASE_VALUES       = [0, 0,    1,    2,    3,    4,    4] as const;

// ─── Timing ───
export const THROTTLE_MS = 400;
export const AUTO_REVERT_MS = 10_000;
export const NUDGE_DELAY_MS = 4_000;
export const CTA_UNLATCH_THRESHOLD = 0.45;

// ─── Particle counts ───
export const PARTICLE_COUNTS = {
  fireflies: { desktop: 25, tablet: 12, mobile: 8 },
  shimmer:   { desktop: 50, tablet: 1,  mobile: 1 },
} as const;

// ─── Z-index stack ───
export const Z = {
  background: 0,
  figure:     10,
  hitZone:    20,
  particles:  30,
  hints:      40,
  cta:        50,
} as const;

// ─── Fragment fall config (which fragments fall in which phase) ───
export const FRAGMENT_SCHEDULE: Record<1 | 2 | 3, string[]> = {
  1: ['chest-upper', 'shoulder-left'],
  2: ['shoulder-right', 'arm-left', 'arm-right', 'chest-lower', 'hip-left'],
  3: ['visor', 'head-left', 'head-right', 'hip-right', 'leg-left', 'leg-right'],
};

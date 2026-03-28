// ─── Joint Definitions for V4 Skeletal Figure ─────────────────────────────
// All geometry computed once at module load. No runtime path generation.

export type JointName =
  | 'pelvis' | 'spineLower' | 'spineUpper'
  | 'hipL' | 'hipR' | 'kneeL' | 'kneeR' | 'ankleL' | 'ankleR'
  | 'shoulderL' | 'shoulderR' | 'elbowL' | 'elbowR'
  | 'neck' | 'head'
  | 'rootTX' | 'rootTY';

export type LimbName =
  | 'thighL' | 'thighR' | 'shinL' | 'shinR' | 'footL' | 'footR'
  | 'torsoLow' | 'torsoUp'
  | 'upperArmL' | 'upperArmR' | 'forearmL' | 'forearmR'
  | 'handL' | 'handR' | 'neck';

// ─── Bone dimensions ──────────────────────────────────────────────────────

export const BONES = {
  thigh:    { length: 115, wTop: 40, wBot: 30, curve: 6 },
  shin:     { length: 120, wTop: 28, wBot: 20, curve: 4 },
  foot:     { length: 30,  wTop: 20, wBot: 28, curve: 0 },
  torsoLow: { length: 120, wTop: 80, wBot: 70, curve: 8 },
  torsoUp:  { length: 90,  wTop: 70, wBot: 60, curve: 6 },
  upperArm: { length: 100, wTop: 26, wBot: 20, curve: 5 },
  forearm:  { length: 95,  wTop: 20, wBot: 14, curve: 3 },
  hand:     { length: 20,  wTop: 14, wBot: 10, curve: 0 },
  neck:     { length: 40,  wTop: 18, wBot: 24, curve: 0 },
} as const;

// ─── Limb path generator (symmetric bezier along Y-axis) ──────────────────
// Draws from (0,0) downward to (0, length), tapered from wTop to wBot.

function limbPath(len: number, wT: number, wB: number, c: number): string {
  const htT = wT / 2;
  const htB = wB / 2;
  const y1 = Math.round(len * 0.33);
  const y2 = Math.round(len * 0.67);
  return [
    `M ${-htT} 0`,
    `C ${-htT + c} ${y1} ${-htB - c} ${y2} ${-htB} ${len}`,
    `L ${htB} ${len}`,
    `C ${htB + c} ${y2} ${htT - c} ${y1} ${htT} 0`,
    'Z',
  ].join(' ');
}

// ─── Static limb path strings (computed once at module load) ──────────────

export const LIMB_PATHS: Record<LimbName, string> = {
  thighL:    limbPath(BONES.thigh.length, BONES.thigh.wTop, BONES.thigh.wBot, BONES.thigh.curve),
  thighR:    limbPath(BONES.thigh.length, BONES.thigh.wTop, BONES.thigh.wBot, -BONES.thigh.curve),
  shinL:     limbPath(BONES.shin.length, BONES.shin.wTop, BONES.shin.wBot, BONES.shin.curve),
  shinR:     limbPath(BONES.shin.length, BONES.shin.wTop, BONES.shin.wBot, -BONES.shin.curve),
  footL:     limbPath(BONES.foot.length, BONES.foot.wTop, BONES.foot.wBot, BONES.foot.curve),
  footR:     limbPath(BONES.foot.length, BONES.foot.wTop, BONES.foot.wBot, BONES.foot.curve),
  torsoLow:  limbPath(BONES.torsoLow.length, BONES.torsoLow.wTop, BONES.torsoLow.wBot, BONES.torsoLow.curve),
  torsoUp:   limbPath(BONES.torsoUp.length, BONES.torsoUp.wTop, BONES.torsoUp.wBot, BONES.torsoUp.curve),
  upperArmL: limbPath(BONES.upperArm.length, BONES.upperArm.wTop, BONES.upperArm.wBot, BONES.upperArm.curve),
  upperArmR: limbPath(BONES.upperArm.length, BONES.upperArm.wTop, BONES.upperArm.wBot, -BONES.upperArm.curve),
  forearmL:  limbPath(BONES.forearm.length, BONES.forearm.wTop, BONES.forearm.wBot, BONES.forearm.curve),
  forearmR:  limbPath(BONES.forearm.length, BONES.forearm.wTop, BONES.forearm.wBot, -BONES.forearm.curve),
  handL:     limbPath(BONES.hand.length, BONES.hand.wTop, BONES.hand.wBot, BONES.hand.curve),
  handR:     limbPath(BONES.hand.length, BONES.hand.wTop, BONES.hand.wBot, BONES.hand.curve),
  neck:      limbPath(BONES.neck.length, BONES.neck.wTop, BONES.neck.wBot, BONES.neck.curve),
};

// ─── Joint offsets (relative to parent joint, in SVG pixels) ──────────────

export const JOINT_OFFSETS: Record<string, { x: number; y: number }> = {
  hipL:        { x: -25, y: 0 },
  hipR:        { x: 25,  y: 0 },
  spineLower:  { x: 0,   y: -30 },
  spineUpper:  { x: 0,   y: -BONES.torsoLow.length },   // -120
  shoulderL:   { x: -70, y: 0 },
  shoulderR:   { x: 70,  y: 0 },
  neck:        { x: 0,   y: -BONES.torsoUp.length },     // -90
  kneeL:       { x: 0,   y: BONES.thigh.length },        // 115
  kneeR:       { x: 0,   y: BONES.thigh.length },
  ankleL:      { x: 0,   y: BONES.shin.length },         // 120
  ankleR:      { x: 0,   y: BONES.shin.length },
  elbowL:      { x: 0,   y: BONES.upperArm.length },     // 100
  elbowR:      { x: 0,   y: BONES.upperArm.length },
  handL:       { x: 0,   y: BONES.forearm.length },      // 95
  handR:       { x: 0,   y: BONES.forearm.length },
  head:        { x: 0,   y: -BONES.neck.length },        // -40
};

// ─── Phase posture angles (degrees) ──────────────────────────────────────
// [phase0, phase1(dodge), phase2(pain), phase3(collapse), phase4(soul)]

export const PHASE_POSTURES: Record<JointName, readonly number[]> = {
  pelvis:      [0,   -4,   6,   10,   0],
  spineLower:  [0,   -8,   25,  40,   0],
  spineUpper:  [0,   -10,  18,  25,   0],
  hipL:        [0,   10,   -5,  -15,  0],
  hipR:        [0,   -15,  -5,  -20,  0],
  kneeL:       [0,   -10,  -15, -35,  0],
  kneeR:       [0,   -25,  -15, -40,  0],
  ankleL:      [0,   5,    8,   12,   0],
  ankleR:      [0,   10,   8,   15,   0],
  shoulderL:   [0,   -45,  -20, 5,    -35],
  shoulderR:   [0,   25,   20,  -8,   35],
  elbowL:      [0,   -60,  -50, -20,  -15],
  elbowR:      [0,   -15,  -45, -40,  -15],
  neck:        [0,   -5,   12,  20,   8],
  head:        [-8,  -15,  10,  18,   5],
  rootTX:      [0,   -35,  0,   0,    0],
  rootTY:      [0,   -8,   8,   18,   0],
};

// ─── Walk cycle amplitudes (max degrees per joint) ────────────────────────
// Used by useWalkCycle. sign/phase handled in the hook.

export const WALK_AMPS = {
  hip: 25,
  knee: 35,        // only bends on forward swing
  ankle: 8,
  shoulder: 15,    // opposite to hip
  elbow: 12,       // only bends on forward swing
  pelvis: 2,
  spineLower: 1.5,
  spineUpper: 1,   // counter-rotates
  neck: 2,
  rootBounce: 5,   // px, 2× frequency
} as const;

export const WALK_PERIOD_MS = 1400;

// ─── Head dimensions for ellipse rendering ────────────────────────────────
export const HEAD = { rx: 55, ry: 65 } as const;

// ─── Color fill maps for the 3 layers ─────────────────────────────────────

export type FillMap = Record<LimbName | 'head' | 'headGlow', string>;

// Imported from constants.ts at usage site — not duplicated here.
// Each layer (soul / maskDesat / maskColor) provides its own FillMap.

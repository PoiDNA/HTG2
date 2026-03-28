'use client';

import {
  useTime,
  useTransform,
  useSpring,
  useMotionValue,
  type MotionValue,
} from 'framer-motion';
import {
  IDLE_AMPS, FLEE_AMPS,
  IDLE_PERIOD_MS, FLEE_PERIOD_MS,
  PHASE_POSTURES,
  type JointName,
} from './jointDefinitions';

const TWO_PI = Math.PI * 2;
const FOUR_PI = Math.PI * 4;

/**
 * Two-mode walk cycle:
 *  - Phase 0: idle sway (subtle confident stance, slow period)
 *  - Phases 1-2: flee cycle (frantic lateral escape, fast period)
 *  - Phase 3+: collapsed, no movement
 *
 * Both modes blend via spring-smoothed amplitude multipliers.
 * Uses useTime() — zero React re-renders.
 */
export function useWalkCycle(
  activePhaseValue: MotionValue<number>,
) {
  const time = useTime();

  // ─── Amplitude curves (spring-smoothed) ───────────────────────────
  // Idle: active in phase 0, fades out by phase 0.5
  const idleAmpRaw = useTransform(activePhaseValue, [0, 0.3, 0.6], [1, 0.5, 0]);
  const idleAmp = useSpring(idleAmpRaw, { stiffness: 80, damping: 20 });

  // Flee: ramps up at phase 0.6, full at phase 1, fades at phase 2.5
  const fleeAmpRaw = useTransform(activePhaseValue, [0.5, 0.8, 1, 2.5, 3], [0, 0.3, 1, 0.6, 0]);
  const fleeAmp = useSpring(fleeAmpRaw, { stiffness: 60, damping: 18 });

  // ─── Sinusoids for idle (slow) ────────────────────────────────────
  const idleSinL = useTransform(time, (t) =>
    Math.sin(((t % IDLE_PERIOD_MS) / IDLE_PERIOD_MS) * TWO_PI)
  );

  // ─── Sinusoids for flee (fast) ────────────────────────────────────
  const fleeSinL = useTransform(time, (t) =>
    Math.sin(((t % FLEE_PERIOD_MS) / FLEE_PERIOD_MS) * TWO_PI)
  );
  const fleeSinR = useTransform(time, (t) =>
    Math.sin(((t % FLEE_PERIOD_MS) / FLEE_PERIOD_MS) * TWO_PI + Math.PI)
  );

  // ─── Phase posture MotionValues ───────────────────────────────────
  const phasePostures = {} as Record<JointName, MotionValue<number>>;
  const jointNames = Object.keys(PHASE_POSTURES) as JointName[];
  for (const name of jointNames) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    phasePostures[name] = useTransform(
      activePhaseValue,
      [0, 1, 2, 3, 4],
      PHASE_POSTURES[name] as unknown as number[]
    );
  }

  // ─── Combined walk targets (idle + flee) per joint ────────────────
  // Helper: idle contribution + flee contribution
  function makeJoint(
    idleFn: (s: number) => number,
    fleeFnL: (s: number) => number,
    fleeFnR?: (s: number) => number,
    side?: 'L' | 'R'
  ): MotionValue<number> {
    const fleeFn = side === 'R' && fleeFnR ? fleeFnR : fleeFnL;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useTransform(
      [idleSinL, side === 'R' ? fleeSinR : fleeSinL, side === 'R' ? fleeSinR : fleeSinL, idleAmp, fleeAmp],
      ([iSin, fSin, _unused, iAmp, fAmp]: number[]) =>
        idleFn(iSin) * iAmp + fleeFn(fSin) * fAmp
    );
  }

  // Hips
  const walkHipL = makeJoint(
    s => s * IDLE_AMPS.hip,
    s => s * FLEE_AMPS.hip,
    undefined, 'L'
  );
  const walkHipR = makeJoint(
    s => s * IDLE_AMPS.hip,
    s => s * FLEE_AMPS.hip,
    s => s * FLEE_AMPS.hip, 'R'
  );

  // Knees (bend only on forward swing)
  const walkKneeL = makeJoint(
    () => 0,
    s => s > 0 ? -s * FLEE_AMPS.knee : 0,
    undefined, 'L'
  );
  const walkKneeR = makeJoint(
    () => 0,
    s => s > 0 ? -s * FLEE_AMPS.knee : 0,
    s => s > 0 ? -s * FLEE_AMPS.knee : 0, 'R'
  );

  // Ankles
  const walkAnkleL = makeJoint(
    s => s * IDLE_AMPS.ankle,
    s => s * FLEE_AMPS.ankle,
    undefined, 'L'
  );
  const walkAnkleR = makeJoint(
    s => s * IDLE_AMPS.ankle,
    s => s * FLEE_AMPS.ankle,
    s => s * FLEE_AMPS.ankle, 'R'
  );

  // Shoulders (opposite to legs)
  const walkShoulderL = makeJoint(
    s => -s * IDLE_AMPS.shoulder,
    s => -s * FLEE_AMPS.shoulder,
    undefined, 'L'
  );
  const walkShoulderR = makeJoint(
    s => -s * IDLE_AMPS.shoulder,
    s => -s * FLEE_AMPS.shoulder,
    s => -s * FLEE_AMPS.shoulder, 'R'
  );

  // Elbows (bend on forward swing during flee)
  const walkElbowL = makeJoint(
    () => 0,
    s => s > 0 ? -s * FLEE_AMPS.elbow : 0,
    undefined, 'L'
  );
  const walkElbowR = makeJoint(
    () => 0,
    s => s > 0 ? -s * FLEE_AMPS.elbow : 0,
    s => s > 0 ? -s * FLEE_AMPS.elbow : 0, 'R'
  );

  // Spine / pelvis / neck
  const walkPelvis = makeJoint(
    s => s * IDLE_AMPS.pelvis,
    s => s * FLEE_AMPS.pelvis
  );
  const walkSpineLower = makeJoint(
    s => s * IDLE_AMPS.spineLower,
    s => s * FLEE_AMPS.spineLower
  );
  const walkSpineUpper = makeJoint(
    s => -s * IDLE_AMPS.spineUpper,
    s => -s * FLEE_AMPS.spineUpper
  );
  const walkNeck = makeJoint(
    s => s * IDLE_AMPS.neck,
    s => s * FLEE_AMPS.neck
  );

  // Root lateral sway (idle: subtle, flee: big lateral escape)
  const walkRootTX = useTransform(
    [idleSinL, fleeSinL, idleAmp, fleeAmp],
    ([iSin, fSin, iA, fA]: number[]) =>
      iSin * IDLE_AMPS.rootSwayX * iA + fSin * FLEE_AMPS.rootSwayX * fA
  );

  // Root bounce (idle: subtle, flee: dramatic)
  const bounce = useTransform(
    [time, idleAmp, fleeAmp],
    ([t, iA, fA]: number[]) => {
      const idleBounce = Math.abs(Math.sin(((t % IDLE_PERIOD_MS) / IDLE_PERIOD_MS) * FOUR_PI)) * IDLE_AMPS.rootBounce;
      const fleeBounce = Math.abs(Math.sin(((t % FLEE_PERIOD_MS) / FLEE_PERIOD_MS) * FOUR_PI)) * FLEE_AMPS.rootBounce;
      return idleBounce * iA + fleeBounce * fA;
    }
  );

  const zero = useMotionValue(0);

  // ─── Walk target map ──────────────────────────────────────────────
  const walkTargets: Record<JointName, MotionValue<number>> = {
    pelvis: walkPelvis,
    spineLower: walkSpineLower,
    spineUpper: walkSpineUpper,
    hipL: walkHipL,
    hipR: walkHipR,
    kneeL: walkKneeL,
    kneeR: walkKneeR,
    ankleL: walkAnkleL,
    ankleR: walkAnkleR,
    shoulderL: walkShoulderL,
    shoulderR: walkShoulderR,
    elbowL: walkElbowL,
    elbowR: walkElbowR,
    neck: walkNeck,
    head: zero,
    rootTX: walkRootTX,   // lateral sway/flee
    rootTY: zero,         // bounce handled separately
  };

  // ─── Final blend: posture + walk ──────────────────────────────────
  const finalJoints = {} as Record<JointName, MotionValue<number>>;
  for (const name of jointNames) {
    if (name === 'rootTY') {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      finalJoints[name] = useTransform(
        [phasePostures[name], bounce],
        ([posture, b]: number[]) => posture + b
      );
    } else if (name === 'rootTX') {
      // rootTX: phase posture (escape direction) + walk lateral sway
      // eslint-disable-next-line react-hooks/rules-of-hooks
      finalJoints[name] = useTransform(
        [walkTargets[name], phasePostures[name]],
        ([walk, posture]: number[]) => posture + walk
      );
    } else {
      // All other joints: posture + walk (walk already includes idle/flee blend)
      // eslint-disable-next-line react-hooks/rules-of-hooks
      finalJoints[name] = useTransform(
        [walkTargets[name], phasePostures[name]],
        ([walk, posture]: number[]) => posture + walk
      );
    }
  }

  return finalJoints;
}

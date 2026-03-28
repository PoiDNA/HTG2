'use client';

import {
  useTime,
  useTransform,
  useSpring,
  useMotionValue,
  type MotionValue,
} from 'framer-motion';
import { WALK_AMPS, WALK_PERIOD_MS, PHASE_POSTURES, type JointName } from './jointDefinitions';

const TWO_PI = Math.PI * 2;
const FOUR_PI = Math.PI * 4;

/**
 * Walk cycle driven by framer-motion's useTime() — no rAF, no React re-renders.
 *
 * Returns finalJoints: Record<JointName, MotionValue<number>>
 * Each joint = phasePosture + (walkTarget × walkAmplitude)
 *
 * walkAmplitude is spring-smoothed to avoid mid-stride snapping.
 */
export function useWalkCycle(
  activePhaseValue: MotionValue<number>,
) {
  const time = useTime();

  // ─── Walk amplitude with spring smoothing ─────────────────────────
  const walkAmpRaw = useTransform(activePhaseValue, [0, 0.3, 0.8], [1, 0.5, 0]);
  const walkAmplitude = useSpring(walkAmpRaw, { stiffness: 80, damping: 20 });

  // ─── Walk sinusoids per joint ─────────────────────────────────────
  // Left side phase
  const sinL = useTransform(time, (t) => {
    return Math.sin(((t % WALK_PERIOD_MS) / WALK_PERIOD_MS) * TWO_PI);
  });
  // Right side = left + π (half cycle behind)
  const sinR = useTransform(time, (t) => {
    return Math.sin(((t % WALK_PERIOD_MS) / WALK_PERIOD_MS) * TWO_PI + Math.PI);
  });
  // Root bounce at 2× frequency
  const bounce = useTransform(time, (t) => {
    return Math.abs(Math.sin(((t % WALK_PERIOD_MS) / WALK_PERIOD_MS) * FOUR_PI)) * WALK_AMPS.rootBounce;
  });

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

  // ─── Walk targets per joint ───────────────────────────────────────
  // Hip: sin * amplitude
  const walkHipL = useTransform(sinL, (s) => s * WALK_AMPS.hip);
  const walkHipR = useTransform(sinR, (s) => s * WALK_AMPS.hip);

  // Knee: bends ONLY on forward swing (sin > 0)
  const walkKneeL = useTransform(sinL, (s) => (s > 0 ? -s * WALK_AMPS.knee : 0));
  const walkKneeR = useTransform(sinR, (s) => (s > 0 ? -s * WALK_AMPS.knee : 0));

  // Ankle: slight counter-flex
  const walkAnkleL = useTransform(sinL, (s) => s * WALK_AMPS.ankle);
  const walkAnkleR = useTransform(sinR, (s) => s * WALK_AMPS.ankle);

  // Shoulders: opposite to hips
  const walkShoulderL = useTransform(sinL, (s) => -s * WALK_AMPS.shoulder);
  const walkShoulderR = useTransform(sinR, (s) => -s * WALK_AMPS.shoulder);

  // Elbows: bend on forward swing
  const walkElbowL = useTransform(sinL, (s) => (s > 0 ? -s * WALK_AMPS.elbow : 0));
  const walkElbowR = useTransform(sinR, (s) => (s > 0 ? -s * WALK_AMPS.elbow : 0));

  // Spine / pelvis / neck
  const walkPelvis     = useTransform(sinL, (s) => s * WALK_AMPS.pelvis);
  const walkSpineLower = useTransform(sinL, (s) => s * WALK_AMPS.spineLower);
  const walkSpineUpper = useTransform(sinL, (s) => -s * WALK_AMPS.spineUpper); // counter
  const walkNeck       = useTransform(sinL, (s) => s * WALK_AMPS.neck);

  // Zero walk for joints without walk contribution
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
    head: zero,      // head posture only, no walk
    rootTX: zero,    // root translation = posture only
    rootTY: zero,    // root bounce handled separately
  };

  // ─── Final blend: posture + (walk × amplitude) ────────────────────
  const finalJoints = {} as Record<JointName, MotionValue<number>>;
  for (const name of jointNames) {
    if (name === 'rootTY') {
      // Root Y = phase posture + walk bounce × amplitude
      // eslint-disable-next-line react-hooks/rules-of-hooks
      finalJoints[name] = useTransform(
        [phasePostures[name], bounce, walkAmplitude],
        ([posture, b, amp]: number[]) => posture + b * amp
      );
    } else {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      finalJoints[name] = useTransform(
        [walkTargets[name], phasePostures[name], walkAmplitude],
        ([walk, posture, amp]: number[]) => posture + walk * amp
      );
    }
  }

  return finalJoints;
}

'use client';

import { m, type MotionValue } from 'framer-motion';
import {
  LIMB_PATHS,
  JOINT_OFFSETS,
  HEAD,
  BONES,
  type JointName,
  type FillMap,
} from './jointDefinitions';

interface Props {
  joints: Record<JointName, MotionValue<number>>;
  fills: FillMap;
  opacity: MotionValue<number>;
}

/**
 * Skeletal SVG body with Forward Kinematics.
 * All joints use transformOrigin: "0 0" in local coordinates.
 * Z-depth ordering: back limbs → torso → front limbs.
 * Rendered 3× (soul / mask-desat / mask-color) with different fill maps.
 */
export default function SkeletalBody({ joints, fills, opacity }: Props) {
  const off = JOINT_OFFSETS;

  return (
    <m.g style={{ opacity }}>
      {/* ROOT — world position + bounce */}
      <m.g style={{
        translateX: joints.rootTX,
        translateY: joints.rootTY,
      }}>
        {/* PELVIS */}
        <m.g style={{ rotate: joints.pelvis, transformOrigin: '0px 0px' }}>

          {/* ─── RIGHT LEG (BACK — rendered first) ─── */}
          <m.g style={{
            translateX: off.hipR.x,
            translateY: off.hipR.y,
          }}>
            <m.g style={{ rotate: joints.hipR, transformOrigin: '0px 0px' }}>
              <path d={LIMB_PATHS.thighR} fill={fills.thighR} />
              <m.g style={{
                translateX: off.kneeR.x,
                translateY: off.kneeR.y,
              }}>
                <m.g style={{ rotate: joints.kneeR, transformOrigin: '0px 0px' }}>
                  <path d={LIMB_PATHS.shinR} fill={fills.shinR} />
                  <m.g style={{
                    translateX: off.ankleR.x,
                    translateY: off.ankleR.y,
                  }}>
                    <m.g style={{ rotate: joints.ankleR, transformOrigin: '0px 0px' }}>
                      <path d={LIMB_PATHS.footR} fill={fills.footR} />
                    </m.g>
                  </m.g>
                </m.g>
              </m.g>
            </m.g>
          </m.g>

          {/* ─── LOWER TORSO (MIDDLE) ─── */}
          <m.g style={{
            translateX: off.spineLower.x,
            translateY: off.spineLower.y,
          }}>
            <m.g style={{ rotate: joints.spineLower, transformOrigin: '0px 0px' }}>
              {/* Torso lower draws upward (negative Y), so we flip */}
              <g transform={`scale(1,-1)`}>
                <path d={LIMB_PATHS.torsoLow} fill={fills.torsoLow} />
              </g>

              {/* ─── UPPER TORSO ─── */}
              <m.g style={{
                translateX: off.spineUpper.x,
                translateY: off.spineUpper.y,
              }}>
                <m.g style={{ rotate: joints.spineUpper, transformOrigin: '0px 0px' }}>

                  {/* RIGHT ARM (BACK — behind torso) */}
                  <m.g style={{
                    translateX: off.shoulderR.x,
                    translateY: off.shoulderR.y,
                  }}>
                    <m.g style={{ rotate: joints.shoulderR, transformOrigin: '0px 0px' }}>
                      <path d={LIMB_PATHS.upperArmR} fill={fills.upperArmR} />
                      <m.g style={{
                        translateX: off.elbowR.x,
                        translateY: off.elbowR.y,
                      }}>
                        <m.g style={{ rotate: joints.elbowR, transformOrigin: '0px 0px' }}>
                          <path d={LIMB_PATHS.forearmR} fill={fills.forearmR} />
                          <m.g style={{
                            translateX: off.handR.x,
                            translateY: off.handR.y,
                          }}>
                            <path d={LIMB_PATHS.handR} fill={fills.handR} />
                          </m.g>
                        </m.g>
                      </m.g>
                    </m.g>
                  </m.g>

                  {/* UPPER TORSO SHAPE (draws upward) */}
                  <g transform={`scale(1,-1)`}>
                    <path d={LIMB_PATHS.torsoUp} fill={fills.torsoUp} />
                  </g>

                  {/* NECK + HEAD */}
                  <m.g style={{
                    translateX: off.neck.x,
                    translateY: off.neck.y,
                  }}>
                    <m.g style={{ rotate: joints.neck, transformOrigin: '0px 0px' }}>
                      {/* Neck draws upward */}
                      <g transform="scale(1,-1)">
                        <path d={LIMB_PATHS.neck} fill={fills.neck} />
                      </g>
                      {/* Head */}
                      <m.g style={{
                        translateX: off.head.x,
                        translateY: off.head.y,
                      }}>
                        <m.g style={{ rotate: joints.head, transformOrigin: '0px 0px' }}>
                          <ellipse cx={0} cy={0} rx={HEAD.rx} ry={HEAD.ry} fill={fills.head} />
                          {/* Inner glow on head */}
                          <ellipse cx={0} cy={0} rx={HEAD.rx * 0.6} ry={HEAD.ry * 0.7}
                            fill={fills.headGlow} opacity={0.35} />
                        </m.g>
                      </m.g>
                    </m.g>
                  </m.g>

                  {/* LEFT ARM (FRONT — on top of torso) */}
                  <m.g style={{
                    translateX: off.shoulderL.x,
                    translateY: off.shoulderL.y,
                  }}>
                    <m.g style={{ rotate: joints.shoulderL, transformOrigin: '0px 0px' }}>
                      <path d={LIMB_PATHS.upperArmL} fill={fills.upperArmL} />
                      <m.g style={{
                        translateX: off.elbowL.x,
                        translateY: off.elbowL.y,
                      }}>
                        <m.g style={{ rotate: joints.elbowL, transformOrigin: '0px 0px' }}>
                          <path d={LIMB_PATHS.forearmL} fill={fills.forearmL} />
                          <m.g style={{
                            translateX: off.handL.x,
                            translateY: off.handL.y,
                          }}>
                            <path d={LIMB_PATHS.handL} fill={fills.handL} />
                          </m.g>
                        </m.g>
                      </m.g>
                    </m.g>
                  </m.g>

                </m.g>
              </m.g>
            </m.g>
          </m.g>

          {/* ─── LEFT LEG (FRONT — rendered last) ─── */}
          <m.g style={{
            translateX: off.hipL.x,
            translateY: off.hipL.y,
          }}>
            <m.g style={{ rotate: joints.hipL, transformOrigin: '0px 0px' }}>
              <path d={LIMB_PATHS.thighL} fill={fills.thighL} />
              <m.g style={{
                translateX: off.kneeL.x,
                translateY: off.kneeL.y,
              }}>
                <m.g style={{ rotate: joints.kneeL, transformOrigin: '0px 0px' }}>
                  <path d={LIMB_PATHS.shinL} fill={fills.shinL} />
                  <m.g style={{
                    translateX: off.ankleL.x,
                    translateY: off.ankleL.y,
                  }}>
                    <m.g style={{ rotate: joints.ankleL, transformOrigin: '0px 0px' }}>
                      <path d={LIMB_PATHS.footL} fill={fills.footL} />
                    </m.g>
                  </m.g>
                </m.g>
              </m.g>
            </m.g>
          </m.g>

        </m.g>
      </m.g>
    </m.g>
  );
}

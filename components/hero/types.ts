export type AnimationPhase = 0 | 1 | 2 | 3 | 4;

export type FragmentId =
  | 'visor'
  | 'head-left'
  | 'head-right'
  | 'shoulder-left'
  | 'shoulder-right'
  | 'chest-upper'
  | 'chest-lower'
  | 'arm-left'
  | 'arm-right'
  | 'hip-left'
  | 'hip-right'
  | 'leg-left'
  | 'leg-right';

export interface PostureValues {
  headTilt: number;        // 0=raised (arrogance) → 1=bowed (humility)
  shoulderTension: number; // 0=tense/raised → 1=loose/dropped
  armOpenness: number;     // 0=crossed → 1=open (palms up)
  bodyLean: number;        // 0=leaning back → 1=centered
  formSoftness: number;    // 0=angular armor → 1=soft fabric
}

export interface FragmentState {
  id: FragmentId;
  fallen: boolean;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
}

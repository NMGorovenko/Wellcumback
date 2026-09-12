import type { GameState } from './engine.ts';

export type StagePoint = { x: number; y: number; z: number };
export type StagedWorker = StagePoint & {
  rotation: number;
  crouch: number;
  lean: number;
};
export type StagedStool = StagePoint & {
  rotation: number;
  lean: number;
  scaleY: number;
  visible: boolean;
};
export type DrillStagingState = Pick<
  GameState,
  | 'chairs'
  | 'chairX'
  | 'drillMode'
  | 'climb'
  | 'fallHeight'
  | 'fallProgress'
  | 'balance'
  | 'aim'
>;
export type DrillStage = {
  stools: [StagedStool, StagedStool];
  workers: [StagedWorker, StagedWorker, StagedWorker];
  handoffTarget: StagePoint;
  wallTarget: StagePoint;
  seatTop: number;
};

/** Shared render/test dimensions, in apartment metres. The upper chair is shorter
 * than the bar stool: its feet actually rest on the lower seat, below the ceiling. */
export const DRILL_STAGE = {
  scale: 0.49,
  transportZ: -2.35,
  workZ: -2.66,
  seatTop: 0.895,
  shoeBottom: 0.009,
  upperScaleY: 0.75,
  upperBaseY: 0.8662058340754317,
  upperOffsetZ: -0.12,
  wallFaceZ: -3.26,
} as const;
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smooth = (v: number) => {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const point = (x: number, y: number, z: number): StagePoint => ({ x, y, z });

/** Body origins follow an exterior ascent: park, climb outside the chair's right
 * side, then step across only after both soles clear the seat. Descending uses
 * the identical path in reverse. No renderer interpolation may cut this path. */
export function drillStaging(s: DrillStagingState): DrillStage {
  const two = s.chairs === 2,
    cx = s.chairX * DRILL_STAGE.scale;
  const seatTop = two
    ? DRILL_STAGE.upperBaseY + DRILL_STAGE.seatTop * DRILL_STAGE.upperScaleY
    : DRILL_STAGE.seatTop;
  const topY = seatTop - DRILL_STAGE.shoeBottom;
  const crouch = two ? 0.65 : 0.38;
  const progress =
    s.drillMode === 'position'
      ? 0
      : s.drillMode === 'fallen'
        ? clamp(s.fallHeight)
        : clamp(s.climb);
  const park = smooth(progress / 0.16);
  const fallen = s.drillMode === 'fallen',
    fall = fallen ? clamp(s.fallProgress) : 0;
  const chairZ = mix(
    DRILL_STAGE.transportZ,
    DRILL_STAGE.workZ,
    park * (1 - smooth((fall - 0.72) / 0.28)),
  );
  const lean =
    s.drillMode === 'position' || fallen ? 0 : clamp(s.balance, -1, 1) * 0.045;
  const sine = Math.sin(lean),
    cosine = Math.cos(lean);
  const climbPose = (p: number): StagedWorker => {
    const rise = smooth((p - 0.16) / 0.54),
      step = smooth((p - 0.7) / 0.3);
    return {
      x: mix(cx + 0.68, cx - topY * sine, step),
      y: topY * cosine * rise,
      z: mix(
        -2.25,
        DRILL_STAGE.workZ - (two ? 0.04 : 0.02),
        smooth((p - 0.16) / 0.54),
      ),
      rotation: Math.PI,
      crouch: mix(0.65 * rise, crouch, step),
      lean: -lean * step,
    };
  };
  let climber = climbPose(progress);
  if (s.drillMode === 'drill') climber.crouch = 0;
  if (fallen) {
    // Clear the seat sideways before losing height; falling vertically would
    // push knees and shoes through the same geometry as the old climbing bug.
    const clear = smooth(fall / 0.3),
      down = smooth((fall - 0.3) / 0.7);
    climber = {
      x: mix(climber.x, cx + 0.68, clear),
      y: Math.max(
        0,
        climber.y * (1 - down) +
          Math.sin(Math.PI * Math.min(1, fall / 0.3)) * 0.09,
      ),
      z: mix(climber.z, -2.25, down),
      rotation: Math.PI,
      crouch: mix(climber.crouch, 0, clear),
      lean: 0.38 * Math.sin(Math.PI * fall),
    };
  }
  if (fallen && fall === 1) climber = climbPose(0);
  const assistant: StagedWorker = {
    x: cx - 0.6,
    y: 0,
    z: mix(-2.25, -2.35, smooth((progress - 0.7) / 0.3) * (1 - smooth(fall))),
    rotation: Math.PI,
    crouch: 0,
    lean: 0,
  };
  const third: StagedWorker = {
    x: Math.min(3.5, cx + 1.5),
    y: 0,
    z: -2.5,
    rotation: Math.PI,
    crouch: 0,
    lean: 0,
  };
  return {
    stools: [
      { x: cx, y: 0, z: chairZ, rotation: 0, lean, scaleY: 1, visible: true },
      {
        x: cx - DRILL_STAGE.upperBaseY * sine,
        y: DRILL_STAGE.upperBaseY * cosine,
        z: chairZ + DRILL_STAGE.upperOffsetZ,
        rotation: 0,
        lean,
        scaleY: DRILL_STAGE.upperScaleY,
        visible: two,
      },
    ],
    workers: [assistant, climber, third],
    handoffTarget: point(cx - 0.02, two ? 1.91 : 1.5, -2.48),
    wallTarget: point(cx, 2.7 + (s.aim - 2.6) * 0.13, DRILL_STAGE.wallFaceZ),
    seatTop,
  };
}

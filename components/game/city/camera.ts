import { CITY_TOP_SPEED } from '../../../lib/game/city/powertrain.ts';
import {
  CITY_BOUNDS,
  CITY_SCENERY_BOUNDS,
  cityBuildings,
  type CityBuilding,
} from '../../../lib/game/city/layout.ts';
import type { CityState } from '../../../lib/game/city/engine.ts';

export type CityCameraMode = 'drive' | 'cruise' | 'map' | 'faces';
export const CITY_CAMERA_MODES: CityCameraMode[] = [
  'drive',
  'cruise',
  'map',
  'faces',
];

type CameraPoint = { x: number; y: number; z: number };

/** A perspective camera near roof height gives the street a distant vanishing
 * point. The boom opens gradually at speed; sideways motion leads the view
 * without spinning the camera away from the driver's heading during a drift. */
export function cityCruiseCamera(
  state: Pick<CityState, 'x' | 'z' | 'vx' | 'vz' | 'heading' | 'speed'>,
  aspect: number,
) {
  const speed = Math.max(0, Math.min(CITY_TOP_SPEED, state.speed));
  const fx = Math.sin(state.heading),
    fz = -Math.cos(state.heading);
  const lead = 7 + speed * 0.32;
  const portrait = Math.max(1, 0.85 / Math.max(0.3, aspect));
  const distance = (10 + speed * 0.2) * portrait;
  const height = (3.7 + speed * 0.065) * Math.sqrt(portrait);
  const driftLead = Math.min(speed * 0.14, 3.5);
  const dx = speed > 0.4 ? state.vx / Math.max(state.speed, 0.4) : fx;
  const dz = speed > 0.4 ? state.vz / Math.max(state.speed, 0.4) : fz;
  return {
    position: {
      x: state.x - fx * distance,
      y: height,
      z: state.z - fz * distance,
    },
    look: {
      x: state.x + fx * lead + dx * driftLead,
      y: 1.05,
      z: state.z + fz * lead + dz * driftLead,
    },
    fov: 58 + (speed / CITY_TOP_SPEED) * 6,
  };
}

/** Retract the camera boom before a facade rather than entering the building.
 * In a very tight corner, sit above the car until a normal rear view is clear.
 * This is applied after smoothing, so interpolation cannot tunnel through walls. */
export function clearCityCruiseCamera(
  desired: CameraPoint,
  car: Pick<CityState, 'x' | 'z'>,
  buildings: readonly Pick<
    CityBuilding,
    'x' | 'z' | 'w' | 'd' | 'h'
  >[] = cityBuildings,
): CameraPoint {
  const anchor = { x: car.x, y: 1.25, z: car.z };
  const delta = {
    x: desired.x - anchor.x,
    y: Math.max(2.5, desired.y) - anchor.y,
    z: desired.z - anchor.z,
  };
  const distance = Math.hypot(delta.x, delta.y, delta.z);
  const minX = Math.min(anchor.x, desired.x) - 0.65,
    maxX = Math.max(anchor.x, desired.x) + 0.65,
    minZ = Math.min(anchor.z, desired.z) - 0.65,
    maxZ = Math.max(anchor.z, desired.z) + 0.65;
  let closest = 1;
  for (const b of buildings) {
    if (
      b.x + b.w / 2 < minX ||
      b.x - b.w / 2 > maxX ||
      b.z + b.d / 2 < minZ ||
      b.z - b.d / 2 > maxZ
    )
      continue;
    let enter = 0,
      leave = 1;
    for (const [origin, direction, low, high] of [
      [anchor.x, delta.x, b.x - b.w / 2 - 0.65, b.x + b.w / 2 + 0.65],
      [anchor.y, delta.y, -1, b.h + 1.1],
      [anchor.z, delta.z, b.z - b.d / 2 - 0.65, b.z + b.d / 2 + 0.65],
    ]) {
      if (Math.abs(direction) < 1e-7) {
        if (origin < low || origin > high) {
          enter = 2;
          break;
        }
      } else {
        const a = (low - origin) / direction,
          c = (high - origin) / direction;
        enter = Math.max(enter, Math.min(a, c));
        leave = Math.min(leave, Math.max(a, c));
      }
    }
    if (enter <= leave && leave >= 0 && enter <= 1)
      closest = Math.min(closest, enter);
  }
  if (closest === 1) return { ...desired, y: Math.max(2.5, desired.y) };
  const fraction = Math.max(0, closest - 0.3 / Math.max(distance, 0.01));
  if (fraction * Math.hypot(delta.x, delta.z) < 4.5)
    return { x: car.x, y: Math.max(6, desired.y), z: car.z };
  return {
    x: anchor.x + delta.x * fraction,
    y: Math.max(2.5, anchor.y + delta.y * fraction),
    z: anchor.z + delta.z * fraction,
  };
}

/** Rear chase view: the bonnet points into the road, with enough room to
 * read the next corner. Drift leads the camera along velocity, not the nose. */
export function cityDriveCamera(
  state: Pick<CityState, 'x' | 'z' | 'vx' | 'vz' | 'heading' | 'speed'>,
  aspect: number,
) {
  const speed = Math.max(0, Math.min(CITY_TOP_SPEED, state.speed));
  const lead = 2.8 + speed * 0.43;
  const fx = Math.sin(state.heading),
    fz = -Math.cos(state.heading);
  const moving = speed > 0.4;
  const dx = moving ? state.vx / Math.max(state.speed, 0.4) : fx;
  const dz = moving ? state.vz / Math.max(state.speed, 0.4) : fz;
  const length = Math.hypot(1, 0.68);
  return {
    look: { x: state.x + dx * lead, y: 0.6, z: state.z + dz * lead },
    outward: { x: -fx / length, y: 0.68 / length, z: -fz / length },
    halfHeight: Math.max(
      7.5 + speed * 0.4,
      (5 + lead * Math.abs(dx * -fz + dz * fx)) / Math.max(0.3, aspect),
    ),
  };
}

/** Unwrap across north and damp orientation independently of translation. */
export function followCityHeading(current: number, target: number, dt: number) {
  const difference = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  return (
    current +
    difference * (1 - Math.exp(-Math.min(Math.max(dt, 0), 0.05) * 3.5))
  );
}

/** A front-quarter cutaway view shows the real cabin faces. The target leads
 * actual travel, including lateral drift and reverse, rather than only the bonnet. */
export function cityFaceCamera(
  state: Pick<CityState, 'x' | 'z' | 'vx' | 'vz' | 'heading' | 'speed'>,
  aspect: number,
) {
  const speed = Math.max(0, Math.min(CITY_TOP_SPEED, state.speed));
  const lead = 0.65 + speed * 0.16;
  const travelX =
    speed > 0.4
      ? state.vx / Math.max(state.speed, 0.4)
      : Math.sin(state.heading);
  const travelZ =
    speed > 0.4
      ? state.vz / Math.max(state.speed, 0.4)
      : -Math.cos(state.heading);
  const x = 0.45,
    y = 1.5,
    z = -0.86;
  const length = Math.hypot(x, y, z);
  const outwardX =
    (x * Math.cos(state.heading) - z * Math.sin(state.heading)) / length;
  const outwardZ =
    (x * Math.sin(state.heading) + z * Math.cos(state.heading)) / length;
  const horizontalLength = Math.hypot(outwardX, outwardZ);
  // A sideways slide needs extra horizontal room on portrait displays.
  const acrossView = Math.abs(
    (travelX * outwardZ - travelZ * outwardX) / horizontalLength,
  );
  const halfWidth = 3.15 + lead * acrossView;
  return {
    look: { x: state.x + travelX * lead, y: 0.72, z: state.z + travelZ * lead },
    outward: {
      x: outwardX,
      y: y / length,
      z: outwardZ,
    },
    halfHeight: Math.max(3.75 + speed * 0.1, halfWidth / Math.max(0.3, aspect)),
  };
}

/** Full-city overview has its own fit and clipping range; zooming out never
 * changes the comfortable driving scale. The scenic southern ridges fit too. */
export function cityOverviewCamera(aspect: number) {
  const look = { x: 0, y: 0, z: 3 };
  const norm = Math.hypot(0.39, 0.75, 0.55);
  const outward = { x: 0.39 / norm, y: 0.75 / norm, z: 0.55 / norm };
  const horizontal = Math.hypot(outward.x, outward.z);
  let extentX = 0,
    extentY = 0;
  for (const x of [CITY_SCENERY_BOUNDS.minX, CITY_SCENERY_BOUNDS.maxX])
    for (const z of [CITY_SCENERY_BOUNDS.minZ, CITY_SCENERY_BOUNDS.maxZ])
      for (const y of [0, CITY_SCENERY_BOUNDS.maxY]) {
        const dz = z - look.z;
        const cameraX = (x * outward.z - dz * outward.x) / horizontal;
        const cameraY =
          (-x * outward.x * outward.y) / horizontal +
          y * horizontal -
          (dz * outward.z * outward.y) / horizontal;
        extentX = Math.max(extentX, Math.abs(cameraX));
        extentY = Math.max(extentY, Math.abs(cameraY));
      }
  const distance =
    Math.hypot(
      CITY_BOUNDS.maxX - CITY_BOUNDS.minX,
      CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ,
    ) + 45;
  return {
    look,
    outward,
    distance,
    far: distance * 2,
    halfHeight: Math.max(extentY, extentX / Math.max(0.25, aspect)) * 1.045,
  };
}

import {
  CITY_BOUNDS,
  CITY_SCENERY_BOUNDS,
} from '../../../lib/game/city/layout.ts';
import type { CityState } from '../../../lib/game/city/engine.ts';

export type CityCameraMode = 'drive' | 'map' | 'faces';
export const CITY_CAMERA_MODES: CityCameraMode[] = ['drive', 'map', 'faces'];

/** Rear chase view: the bonnet points into the road, with enough room to
 * read the next corner. Drift leads the camera along velocity, not the nose. */
export function cityDriveCamera(
  state: Pick<CityState, 'x' | 'z' | 'vx' | 'vz' | 'heading' | 'speed'>,
  aspect: number,
) {
  const speed = Math.max(0, Math.min(18, state.speed));
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
  const speed = Math.max(0, Math.min(18, state.speed));
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
    halfHeight: Math.max(
      4.25 + speed * 0.055,
      halfWidth / Math.max(0.3, aspect),
    ),
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

import { CITY_TOP_SPEED } from '../../../lib/game/city/powertrain.ts';
import {
  CITY_BOUNDS,
  CITY_SCENERY_BOUNDS,
  cityBuildings,
  type CityBuilding,
} from '../../../lib/game/city/layout.ts';
import type { CityState } from '../../../lib/game/city/engine.ts';
import {
  CITY_DECK_THICKNESS,
  cityGroundHeight,
  cityOverpassClearance,
  citySurfaceHeight,
} from '../../../lib/game/city/surface.ts';
import { forEachCityFoliageNear } from './foliage-occlusion.ts';

export type CityCameraMode = 'drive' | 'cruise' | 'map' | 'faces';
export const CITY_CAMERA_MODES: CityCameraMode[] = [
  'drive',
  'cruise',
  'map',
  'faces',
];

type CameraPoint = { x: number; y: number; z: number };
export type CityCameraOccluder = {
  active?: boolean;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};
type CameraCar = Pick<CityState, 'x' | 'z'> & {
  elevation?: number;
  pitch?: number;
  surfaceId?: string;
};
type DrivingCameraCar = Pick<
  CityState,
  'x' | 'z' | 'vx' | 'vz' | 'heading' | 'speed'
> &
  CameraCar;
export type CityCameraSurface = {
  heightAt: (x: number, z: number, car: CameraCar) => number;
  ceilingAt: (x: number, z: number) => number | null;
  buildingBaseAt: (x: number, z: number) => number;
};
const cityCameraSurface: CityCameraSurface = {
  heightAt: (x, z, car) =>
    citySurfaceHeight(x, z, 0, car.elevation, car.surfaceId),
  ceilingAt: cityOverpassClearance,
  buildingBaseAt: cityGroundHeight,
};
// Clearance runs synchronously for each viewport; its second pass can reuse the
// exact same terrain samples instead of selecting every bridge layer twice.
const clearanceFloors = new Float64Array(241),
  clearanceCeilings = new Float64Array(241);

/** A perspective camera near roof height gives the street a distant vanishing
 * point. The boom opens gradually at speed; sideways motion leads the view
 * without spinning the camera away from the driver's heading during a drift. */
export function cityCruiseCamera(state: DrivingCameraCar, aspect: number) {
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
      y: (state.elevation ?? 0) + height,
      z: state.z - fz * distance,
    },
    look: {
      x: state.x + fx * lead + dx * driftLead,
      y:
        (state.elevation ?? 0) +
        1.05 +
        Math.sin(state.pitch ?? 0) * lead * 0.65,
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
  car: CameraCar,
  buildings: readonly Pick<
    CityBuilding,
    'x' | 'z' | 'w' | 'd' | 'h'
  >[] = cityBuildings,
  surface: CityCameraSurface = cityCameraSurface,
  foliage: readonly CityCameraOccluder[] = [],
): CameraPoint {
  const elevation = car.elevation ?? 0;
  const anchor = { x: car.x, y: elevation + 1.25, z: car.z };
  const ceilingAt = (
    x: number,
    z: number,
    floor = surface.heightAt(x, z, car),
  ) => {
    const deck = surface.ceilingAt(x, z);
    // Compare against the selected surface here, not the car's height farther
    // down the hill: an uphill section of the same deck is never a ceiling.
    return deck !== null && floor < deck - 2.5
      ? deck - CITY_DECK_THICKNESS - 0.85
      : Infinity;
  };
  let eyeY = Math.max(
    elevation + 2.5,
    desired.y,
    surface.heightAt(desired.x, desired.z, car) + 1,
  );
  const planar = Math.hypot(desired.x - car.x, desired.z - car.z);
  const steps = Math.max(8, Math.min(240, Math.ceil(planar / 0.8)));
  let maximumY = Infinity;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = car.x + (desired.x - car.x) * t,
      z = car.z + (desired.z - car.z) * t;
    const floor = surface.heightAt(x, z, car);
    const ceiling = ceilingAt(x, z, floor);
    clearanceFloors[i] = floor;
    clearanceCeilings[i] = ceiling;
    eyeY = Math.max(eyeY, anchor.y + (floor + 0.55 - anchor.y) / t);
    maximumY = Math.min(maximumY, anchor.y + (ceiling - anchor.y) / t);
  }
  eyeY = Math.min(eyeY, maximumY);
  const delta = {
    x: desired.x - anchor.x,
    y: eyeY - anchor.y,
    z: desired.z - anchor.z,
  };
  const distance = Math.hypot(delta.x, delta.y, delta.z);
  const minX = Math.min(anchor.x, desired.x) - 0.65,
    maxX = Math.max(anchor.x, desired.x) + 0.65,
    minZ = Math.min(anchor.z, desired.z) - 0.65,
    maxZ = Math.max(anchor.z, desired.z) + 0.65;
  let closest = 1;
  // If a hill and a bridge ceiling leave no unobstructed long boom, retract
  // before the first obstruction instead of jumping the camera onto the deck.
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const y = anchor.y + delta.y * t;
    if (y < clearanceFloors[i] + 0.35 || y > clearanceCeilings[i]) {
      closest = Math.max(0, (i - 1) / steps);
      break;
    }
  }
  const checkBox = (box: CityCameraOccluder) => {
    if (
      box.maxX < minX ||
      box.minX > maxX ||
      box.maxZ < minZ ||
      box.minZ > maxZ
    )
      return;
    let enter = 0,
      leave = 1;
    for (const [origin, direction, low, high] of [
      [anchor.x, delta.x, box.minX - 0.65, box.maxX + 0.65],
      [anchor.y, delta.y, box.minY - 0.3, box.maxY + 0.3],
      [anchor.z, delta.z, box.minZ - 0.65, box.maxZ + 0.65],
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
  };
  for (const b of buildings) {
    if (
      b.x + b.w / 2 < minX ||
      b.x - b.w / 2 > maxX ||
      b.z + b.d / 2 < minZ ||
      b.z - b.d / 2 > maxZ
    )
      continue;
    const base = surface.buildingBaseAt(b.x, b.z);
    checkBox({
      minX: b.x - b.w / 2,
      maxX: b.x + b.w / 2,
      minY: base - 0.7,
      maxY: base + b.h + 0.8,
      minZ: b.z - b.d / 2,
      maxZ: b.z + b.d / 2,
    });
  }
  const hardClosest = closest;
  const margin = 0.3 / Math.max(distance, 0.01);
  const hardFraction = Math.max(0, hardClosest - margin);
  if (hardClosest < 1 && hardFraction * planar < 4.5)
    return {
      x: car.x,
      // A ceiling farther along the blocked boom must not discard the desired
      // portrait height when the fallback sits directly above the car.
      y: Math.min(
        Math.max(elevation + 6, desired.y, eyeY),
        ceilingAt(car.x, car.z),
      ),
      z: car.z,
    };
  closest = 1;
  forEachCityFoliageNear(foliage, minX, minZ, maxX, maxZ, checkBox);
  let foliageFraction = 1;
  if (closest < 1) {
    // Branches touching the car cannot supply a clear camera-to-car segment.
    // Ease their influence away within one car length instead of switching to
    // the overhead wall fallback; a tree impact keeps the road ahead in view.
    const nearby = Math.min(1, (closest * planar) / 4.5);
    const weight = nearby * nearby * (3 - 2 * nearby);
    foliageFraction = Math.max(
      Math.min(1, 4.5 / Math.max(planar, 0.01)),
      1 - (1 - Math.max(0, closest - margin)) * weight,
      delta.y > 0 ? Math.min(1, 1.25 / delta.y) : 0,
    );
  }
  const fraction = Math.min(
    hardClosest < 1 ? hardFraction : 1,
    foliageFraction,
  );
  if (fraction === 1) return { ...desired, y: eyeY };
  return {
    x: anchor.x + delta.x * fraction,
    y: anchor.y + delta.y * fraction,
    z: anchor.z + delta.z * fraction,
  };
}

/** A retracted boom cannot retain its long look-ahead: the car would slip
 * behind the camera. Ease the target back to the cabin as clearance intervenes. */
export function cityCameraFocus(
  desiredLook: CameraPoint,
  desiredEye: CameraPoint,
  clearEye: CameraPoint,
  car: CameraCar,
): CameraPoint {
  const blend =
    Math.hypot(clearEye.x - car.x, clearEye.z - car.z) < 4.5
      ? 1
      : Math.min(
          1,
          Math.hypot(
            desiredEye.x - clearEye.x,
            desiredEye.y - clearEye.y,
            desiredEye.z - clearEye.z,
          ) / 2,
        );
  return {
    x: desiredLook.x + (car.x - desiredLook.x) * blend,
    y: desiredLook.y + ((car.elevation ?? 0) + 0.8 - desiredLook.y) * blend,
    z: desiredLook.z + (car.z - desiredLook.z) * blend,
  };
}

/** Rear chase view: the bonnet points into the road, with enough room to
 * read the next corner. Drift leads the camera along velocity, not the nose. */
export function cityDriveCamera(state: DrivingCameraCar, aspect: number) {
  const speed = Math.max(0, Math.min(CITY_TOP_SPEED, state.speed));
  const lead = 2.8 + speed * 0.43;
  const fx = Math.sin(state.heading),
    fz = -Math.cos(state.heading);
  const moving = speed > 0.4;
  const dx = moving ? state.vx / Math.max(state.speed, 0.4) : fx;
  const dz = moving ? state.vz / Math.max(state.speed, 0.4) : fz;
  const length = Math.hypot(1, 0.68);
  return {
    look: {
      x: state.x + dx * lead,
      y: (state.elevation ?? 0) + 0.6,
      z: state.z + dz * lead,
    },
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
export function cityFaceCamera(state: DrivingCameraCar, aspect: number) {
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
  const verticalLead =
    (Math.abs(travelX * outwardX + travelZ * outwardZ) / horizontalLength) *
    (y / length) *
    lead;
  const halfWidth = 3.15 + lead * acrossView;
  return {
    look: {
      x: state.x + travelX * lead,
      y: (state.elevation ?? 0) + 0.72,
      z: state.z + travelZ * lead,
    },
    outward: {
      x: outwardX,
      y: y / length,
      z: outwardZ,
    },
    halfHeight: Math.max(
      3.75 + speed * 0.1,
      3.15 + verticalLead,
      halfWidth / Math.max(0.3, aspect),
    ),
  };
}

/** Full-city overview has its own fit and clipping range; zooming out never
 * changes the comfortable driving scale. The scenic southern ridges fit too. */
export function cityOverviewCamera(aspect: number) {
  const look = { x: 0, y: 0, z: 3 };
  const maxSceneY = Math.max(
    CITY_SCENERY_BOUNDS.maxY,
    ...cityBuildings.map((b) => cityGroundHeight(b.x, b.z) + b.h + 8),
  );
  const norm = Math.hypot(0.39, 0.75, 0.55);
  const outward = { x: 0.39 / norm, y: 0.75 / norm, z: 0.55 / norm };
  const horizontal = Math.hypot(outward.x, outward.z);
  let extentX = 0,
    extentY = 0;
  for (const x of [CITY_SCENERY_BOUNDS.minX, CITY_SCENERY_BOUNDS.maxX])
    for (const z of [CITY_SCENERY_BOUNDS.minZ, CITY_SCENERY_BOUNDS.maxZ])
      for (const y of [0, maxSceneY]) {
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

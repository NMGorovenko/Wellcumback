import type { CityState } from './engine.ts';

export type VehiclePose = Pick<
  CityState,
  'x' | 'z' | 'vx' | 'vz' | 'heading' | 'steering' | 'speed' | 'elapsed'
> & {
  elevation: number;
  pitch: number;
  roll: number;
  suspensionOffset: number;
};
type History = {
  previous: VehiclePose;
  current: VehiclePose;
  step: number;
  remainder: number;
};
// Presentation metadata never enters saved games, JSON or room snapshots.
const history = new WeakMap<CityState, History>();
export function vehiclePose(
  car: CityState,
  elevation = car.elevation ?? 0,
  pitch = car.pitch ?? 0,
): VehiclePose {
  const { x, z, vx, vz, heading, steering, speed, elapsed } = car;
  return {
    x,
    z,
    vx,
    vz,
    heading,
    steering,
    speed,
    elapsed,
    elevation,
    pitch,
    roll: car.roll ?? 0,
    suspensionOffset: car.flight?.suspension?.offset ?? 0,
  };
}
export function resetVehiclePresentation(car: CityState) {
  history.delete(car);
}
export function rememberVehicleStep(
  car: CityState,
  previous: VehiclePose,
  current: VehiclePose,
  step: number,
  discontinuity = false,
) {
  if (
    discontinuity ||
    current.elapsed < previous.elapsed ||
    Math.hypot(current.x - previous.x, current.z - previous.z) >
      Math.max(2, Math.max(previous.speed, current.speed) * step * 3)
  ) {
    history.delete(car);
    return;
  }
  history.set(car, { previous, current, step, remainder: 0 });
}
/** Use the actual engine remainder, or the host's outer batch remainder. */
export function setVehicleRemainder(
  car: CityState,
  remainder: number,
  paused = false,
) {
  if (paused) {
    history.delete(car);
    return;
  }
  const entry = history.get(car);
  if (entry) entry.remainder = Math.max(0, Math.min(entry.step, remainder));
}
export function presentedVehicle(
  car: CityState,
  elevation = car.elevation ?? 0,
  pitch = car.pitch ?? 0,
  paused = car.paused,
) {
  const entry = history.get(car);
  const actual = vehiclePose(car, elevation, pitch);
  if (
    paused ||
    !entry ||
    Object.keys(actual).some(
      (key) =>
        actual[key as keyof VehiclePose] !==
        entry.current[key as keyof VehiclePose],
    )
  ) {
    // A reset, restore or direct authoritative correction must never sweep
    // through an obsolete pose, including teleports shorter than one car.
    history.delete(car);
    return { car, elevation, pitch, roll: car.roll ?? 0 };
  }
  const alpha = entry.remainder / entry.step;
  const pose = { ...entry.current };
  for (const key of Object.keys(pose) as (keyof VehiclePose)[]) {
    const delta = entry.current[key] - entry.previous[key];
    pose[key] =
      entry.previous[key] +
      (key === 'heading'
        ? Math.atan2(Math.sin(delta), Math.cos(delta))
        : delta) *
        alpha;
  }
  const {
    elevation: renderedElevation,
    pitch: renderedPitch,
    roll: renderedRoll,
    suspensionOffset,
    ...motion
  } = pose;
  return {
    car: {
      ...car,
      ...motion,
      elevation: renderedElevation,
      pitch: renderedPitch,
      roll: renderedRoll,
      ...(car.flight?.suspension
        ? {
            flight: {
              ...car.flight,
              suspension: {
                ...car.flight.suspension,
                offset: suspensionOffset,
              },
            },
          }
        : {}),
    },
    elevation: renderedElevation,
    pitch: renderedPitch,
    roll: renderedRoll,
  };
}

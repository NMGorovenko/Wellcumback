import { resolveDrive, type DriveAxes } from '../input/drive.ts';
import {
  BRIDGES,
  CITY_BOUNDS,
  CITY_SPAWN,
  ROUNDABOUT,
  cityBarriers,
  riverDistance,
  RIVER_HALF_WIDTH,
  cityBuildings,
  cityStops,
} from './layout.ts';
export type CityState = {
  paused: boolean;
  players: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  steering: number;
  speed: number;
  drifting: boolean;
  /** Automatic cornering slip; the handbrake adds stronger oversteer. */
  driftBlend?: number;
  elapsed: number;
  bumps: number;
  bumpCooldown: number;
  driftDistance: number;
  nearStop: number;
  interaction: string | null;
  previousAction: boolean;
  /** Optional for compatibility with older network snapshots. */
  previousHorn?: boolean;
  accumulator: number;
  radio: string;
  radioUntil: number;
};
export const freshCity = (): CityState => ({
  paused: false,
  players: 1,
  x: CITY_SPAWN.x,
  z: CITY_SPAWN.z,
  vx: 0,
  vz: 0,
  heading: CITY_SPAWN.heading,
  steering: 0,
  speed: 0,
  drifting: false,
  driftBlend: 0,
  elapsed: 0,
  bumps: 0,
  bumpCooldown: 0,
  driftDistance: 0,
  nearStop: -1,
  interaction: null,
  previousAction: false,
  previousHorn: false,
  accumulator: 0,
  radio: 'Никита: Все сели? Поехали вспоминать этот год.',
  radioUntil: 7,
});
const blockers = [...cityBuildings, ...cityBarriers];
const RADIUS = 0.85,
  STEP = 1 / 60;
export function cityBlocked(x: number, z: number) {
  if (
    x < CITY_BOUNDS.minX + RADIUS ||
    x > CITY_BOUNDS.maxX - RADIUS ||
    z < CITY_BOUNDS.minZ + RADIUS ||
    z > CITY_BOUNDS.maxZ - RADIUS
  )
    return true;
  if (
    Math.abs(riverDistance(x, z)) < RIVER_HALF_WIDTH + RADIUS &&
    !BRIDGES.some(
      (bridge) =>
        Math.abs(x - bridge.x) < bridge.w / 2 - RADIUS &&
        Math.abs(z - bridge.z) < bridge.d / 2 - RADIUS,
    )
  )
    return true;
  if (
    Math.hypot(x - ROUNDABOUT.x, z - ROUNDABOUT.z) <
    ROUNDABOUT.innerRadius + RADIUS
  )
    return true;
  return blockers.some(
    (b) =>
      Math.abs(x - b.x) < b.w / 2 + RADIUS &&
      Math.abs(z - b.z) < b.d / 2 + RADIUS,
  );
}
/** Three circles approximate the coupe body, including its long bonnet. */
export function cityCarBlocked(x: number, z: number, heading: number) {
  return [-1.2, 0, 1.2].some((offset) =>
    cityBlocked(x + Math.sin(heading) * offset, z - Math.cos(heading) * offset),
  );
}
export function resetCityCar(s: CityState) {
  Object.assign(s, {
    x: CITY_SPAWN.x,
    z: CITY_SPAWN.z,
    vx: 0,
    vz: 0,
    speed: 0,
    heading: CITY_SPAWN.heading,
    steering: 0,
    drifting: false,
    driftBlend: 0,
    nearStop: -1,
    interaction: null,
  });
  s.radio = 'Ярик: Развернулись. Так и было задумано.';
  s.radioUntil = s.elapsed + 5;
}
function step(s: CityState, keys: ReadonlySet<string>, axes?: DriveAxes) {
  s.elapsed += STEP;
  s.bumpCooldown = Math.max(0, s.bumpCooldown - STEP);
  const horn = keys.has('KeyQ');
  if (horn && !s.previousHorn) {
    s.radio = 'Ярик: Бип-бип! Мы вообще-то переезжаем.';
    s.radioUntil = s.elapsed + 4;
  }
  s.previousHorn = horn;
  const { throttle: gas, steer: steering } = resolveDrive(keys, axes);
  const handbrake = keys.has('ShiftLeft');
  let fx = Math.sin(s.heading),
    fz = -Math.cos(s.heading);
  const forward = s.vx * fx + s.vz * fz;
  s.steering += (steering - s.steering) * (1 - Math.exp(-STEP * 12));
  // The Mustang is playful on every corner without holding a drift button.
  // Preserve grip at parking speeds, under braking and while reversing.
  const speedFactor = Math.max(0, Math.min(1, (forward - 2.5) / 5.5));
  const turnFactor = Math.max(
    0,
    Math.min(1, (Math.abs(s.steering) - 0.12) / 0.7),
  );
  const automaticSlip = gas < 0 ? 0 : 0.52 * speedFactor * turnFactor;
  const targetSlip = handbrake ? 1 : automaticSlip;
  const blend = s.driftBlend ?? 0;
  s.driftBlend =
    blend +
    (targetSlip - blend) *
      (1 - Math.exp(-STEP * (targetSlip > blend ? 11 : 2.8)));

  const turnSpeed = Math.min(1, Math.abs(forward) / 2.2);
  const nextHeading =
    s.heading +
    s.steering *
      (1.7 + s.driftBlend * 1.1) *
      turnSpeed *
      Math.sign(forward) *
      STEP;
  if (!cityCarBlocked(s.x, s.z, nextHeading)) s.heading = nextHeading;
  fx = Math.sin(s.heading);
  fz = -Math.cos(s.heading);
  const lateral = s.vx * -fz + s.vz * fx;
  const grip = 7.5 + (0.55 - 7.5) * s.driftBlend;
  const opposing = gas * forward < 0 && Math.abs(forward) > 0.35;
  // Keep small analog inputs gentle; full throttle gets the stronger engine.
  const acceleration = opposing ? 24 : gas < 0 ? 10 : 14.5 + 8.5 * gas * gas;
  // Rolling resistance is mild: lifting the accelerator preserves momentum,
  // while an opposite pedal gives controllable braking before reversing.
  const speed = Math.hypot(s.vx, s.vz);
  const resistance = 0.2 + 0.25 / Math.max(speed, 0.3);
  s.vx +=
    (gas * fx * acceleration - s.vx * resistance - lateral * -fz * grip) * STEP;
  s.vz +=
    (gas * fz * acceleration - s.vz * resistance - lateral * fx * grip) * STEP;
  if (!gas && Math.hypot(s.vx, s.vz) < 0.08) s.vx = s.vz = 0;
  const magnitude = Math.hypot(s.vx, s.vz),
    // A brake request does not turn forward motion into reverse motion.
    // Apply the reverse cap only after the car actually starts moving back.
    maxSpeed = s.vx * fx + s.vz * fz < 0 ? 6 : 18;
  if (magnitude > maxSpeed) {
    s.vx *= maxSpeed / magnitude;
    s.vz *= maxSpeed / magnitude;
  }
  let hit = false;
  if (!cityCarBlocked(s.x + s.vx * STEP, s.z, s.heading)) s.x += s.vx * STEP;
  else {
    s.vx *= -0.3;
    hit = true;
  }
  if (!cityCarBlocked(s.x, s.z + s.vz * STEP, s.heading)) s.z += s.vz * STEP;
  else {
    s.vz *= -0.3;
    hit = true;
  }
  if (hit && !s.bumpCooldown && magnitude > 1) {
    s.bumps++;
    s.bumpCooldown = 1.5;
    s.radio = [
      'Ярик: Бордюр сам вышел.',
      'Рома: Я год ждал, чтобы так припарковаться?',
      'Никита: Это не удар. Это проверка подвески.',
    ][s.bumps % 3];
    s.radioUntil = s.elapsed + 5;
  }
  s.speed = Math.hypot(s.vx, s.vz);
  const finalLateral = s.vx * Math.cos(s.heading) + s.vz * Math.sin(s.heading);
  s.drifting =
    s.driftBlend > 0.08 && Math.abs(finalLateral) > 0.8 && s.speed > 2.4;
  if (s.drifting) s.driftDistance += s.speed * STEP;
  s.nearStop = cityStops.findIndex(
    (p) => Math.hypot(s.x - p.x, s.z - p.z) < 2.8,
  );
  const action = keys.has('KeyE');
  if (action && !s.previousAction && s.nearStop >= 0) {
    if (s.speed < 2.3) {
      const stop = cityStops[s.nearStop];
      if (stop.mission) {
        s.interaction = stop.mission;
        s.vx = s.vz = s.speed = 0;
      } else {
        s.radio = 'Ярик: Вот сюда всё и везём. Как оно вообще там помещалось?';
        s.radioUntil = s.elapsed + 6;
      }
    } else {
      s.radio = 'Никита: Сначала остановись. Мы не на ходу выходим.';
      s.radioUntil = s.elapsed + 4;
    }
  }
  s.previousAction = action;
}
/** Fixed steps keep grip/collisions consistent on 30, 60 and 144 Hz displays. */
export function tickCity(
  s: CityState,
  dt: number,
  keys: ReadonlySet<string>,
  axes?: DriveAxes,
) {
  if (s.paused || !Number.isFinite(dt) || dt <= 0) return;
  s.accumulator += Math.min(dt, 0.1);
  while (s.accumulator + 1e-9 >= STEP) {
    step(s, keys, axes);
    s.accumulator = Math.max(0, s.accumulator - STEP);
  }
}

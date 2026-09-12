import {
  BRIDGES,
  CITY_BOUNDS,
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
  elapsed: number;
  bumps: number;
  bumpCooldown: number;
  driftDistance: number;
  nearStop: number;
  interaction: string | null;
  previousAction: boolean;
  accumulator: number;
  radio: string;
  radioUntil: number;
};
export const freshCity = (): CityState => ({
  paused: false,
  players: 1,
  x: -12,
  z: 14,
  vx: 0,
  vz: 0,
  heading: 0,
  steering: 0,
  speed: 0,
  drifting: false,
  elapsed: 0,
  bumps: 0,
  bumpCooldown: 0,
  driftDistance: 0,
  nearStop: -1,
  interaction: null,
  previousAction: false,
  accumulator: 0,
  radio: 'Никита: Все сели? Поехали вспоминать этот год.',
  radioUntil: 7,
});
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
    Math.abs(x) < RIVER_HALF_WIDTH + RADIUS &&
    !BRIDGES.some((bridge) => Math.abs(z - bridge) < 2.6 - RADIUS)
  )
    return true;
  return cityBuildings.some(
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
    x: -12,
    z: 14,
    vx: 0,
    vz: 0,
    speed: 0,
    heading: 0,
    steering: 0,
    drifting: false,
    nearStop: -1,
    interaction: null,
  });
  s.radio = 'Ярик: Развернулись. Так и было задумано.';
  s.radioUntil = s.elapsed + 5;
}
function step(s: CityState, keys: ReadonlySet<string>) {
  s.elapsed += STEP;
  s.bumpCooldown = Math.max(0, s.bumpCooldown - STEP);
  const gas = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const steering = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const drift = keys.has('ShiftLeft');
  let fx = Math.sin(s.heading),
    fz = -Math.cos(s.heading);
  const forward = s.vx * fx + s.vz * fz;
  s.steering += (steering - s.steering) * 0.16;
  const turnSpeed = Math.min(1, Math.abs(forward) / 2.5);
  const nextHeading =
    s.heading +
    s.steering * (drift ? 1.9 : 1.45) * turnSpeed * Math.sign(forward) * STEP;
  if (!cityCarBlocked(s.x, s.z, nextHeading)) s.heading = nextHeading;
  fx = Math.sin(s.heading);
  fz = -Math.cos(s.heading);
  const lateral = s.vx * -fz + s.vz * fx;
  const grip = drift ? 1.2 : 7;
  s.vx += (gas * fx * 8.8 - s.vx * 0.68 - lateral * -fz * grip) * STEP;
  s.vz += (gas * fz * 8.8 - s.vz * 0.68 - lateral * fx * grip) * STEP;
  if (gas && gas * forward < -1) {
    s.vx *= 0.963;
    s.vz *= 0.963;
  }
  const magnitude = Math.hypot(s.vx, s.vz),
    maxSpeed = gas < 0 ? 6 : 12;
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
  s.drifting = drift && Math.abs(lateral) > 1.2 && s.speed > 3;
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
export function tickCity(s: CityState, dt: number, keys: ReadonlySet<string>) {
  if (s.paused || !Number.isFinite(dt) || dt <= 0) return;
  s.accumulator += Math.min(dt, 0.1);
  while (s.accumulator >= STEP) {
    step(s, keys);
    s.accumulator -= STEP;
  }
}

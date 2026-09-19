import {
  vehiclePose,
  rememberVehicleStep,
  setVehicleRemainder,
  resetVehiclePresentation,
} from './vehicle-presentation.ts';
import { stepCar } from './car-physics.ts';
import { freshPowertrain, type PowertrainState } from './powertrain.ts';
import { resolveDrive, type DriveAxes } from '../input/drive.ts';
import {
  advanceCityConversation,
  freshCityConversation,
  type CityConversation,
} from './dialogue.ts';
import {
  cityRoads,
  distanceToRoad,
  inCityWater,
  CITY_BOUNDS,
  CITY_SPAWN,
  CITY_PARKING,
  ROUNDABOUT,
  cityBarriers,
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
  /** Authoritative pedal load also drives remote engine audio. */
  throttle?: number;
  /** Optional so saved/older snapshots acquire a gearbox on their next tick. */
  powertrain?: PowertrainState;
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
  /** A snapshot discontinuity; map clients use it for arrival transitions. */
  travelRevision?: number;
  radio: string;
  radioUntil: number;
  conversation?: CityConversation;
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
  powertrain: freshPowertrain(),
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
  conversation: freshCityConversation(),
});
const blockers = [...cityBuildings, ...cityBarriers];
// Static spatial index keeps a city drive independent of the number of distant houses.
const BLOCK_CELL = 64,
  blockerGrid = new Map<string, typeof blockers>();
for (const b of blockers) {
  const a = b.angle ?? 0,
    rx = (Math.abs(Math.cos(a)) * b.w + Math.abs(Math.sin(a)) * b.d) / 2 + 2,
    rz = (Math.abs(Math.sin(a)) * b.w + Math.abs(Math.cos(a)) * b.d) / 2 + 2;
  for (
    let x = Math.floor((b.x - rx) / BLOCK_CELL);
    x <= Math.floor((b.x + rx) / BLOCK_CELL);
    x++
  )
    for (
      let z = Math.floor((b.z - rz) / BLOCK_CELL);
      z <= Math.floor((b.z + rz) / BLOCK_CELL);
      z++
    ) {
      const key = `${x}:${z}`,
        cell = blockerGrid.get(key) ?? [];
      cell.push(b);
      blockerGrid.set(key, cell);
    }
}

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
    inCityWater(x, z, RADIUS) &&
    !cityRoads.some(
      (r) => r.bridge && distanceToRoad(x, z, r) < r.width / 2 - RADIUS,
    )
  )
    return true;
  if (
    Math.hypot(x - ROUNDABOUT.x, z - ROUNDABOUT.z) <
    ROUNDABOUT.innerRadius + RADIUS
  )
    return true;
  return (
    blockerGrid.get(
      `${Math.floor(x / BLOCK_CELL)}:${Math.floor(z / BLOCK_CELL)}`,
    ) ?? []
  ).some((b) => {
    const angle = b.angle ?? 0,
      dx = x - b.x,
      dz = z - b.z;
    const localX = dx * Math.cos(angle) - dz * Math.sin(angle),
      localZ = dx * Math.sin(angle) + dz * Math.cos(angle);
    return (
      Math.abs(localX) < b.w / 2 + RADIUS && Math.abs(localZ) < b.d / 2 + RADIUS
    );
  });
}
/** Three circles approximate the coupe body, including its long bonnet. */
export function cityCarBlocked(x: number, z: number, heading: number) {
  return [-1.2, 0, 1.2].some((offset) =>
    cityBlocked(x + Math.sin(heading) * offset, z - Math.cos(heading) * offset),
  );
}
/** Resolve only canonical destinations, then choose a clear pose on their road. */
export function cityTravelArrival(stopId: string) {
  const index = cityStops.findIndex((stop) => stop.id === stopId);
  if (index < 0) return null;
  const stop = cityStops[index];
  const candidates = cityRoads
    .flatMap((road) => {
      const dx = road.to.x - road.from.x,
        dz = road.to.z - road.from.z;
      const length = Math.hypot(dx, dz);
      const along = Math.max(
        0,
        Math.min(
          length,
          ((stop.x - road.from.x) * dx + (stop.z - road.from.z) * dz) / length,
        ),
      );
      return [0, -4, 4, -10, 10].map((offset) => {
        const t = Math.max(0, Math.min(length, along + offset)) / length;
        // Face toward the longer part of this road, away from its dead end.
        const direction = t <= 0.5 ? 1 : -1;
        return {
          x: road.from.x + dx * t,
          z: road.from.z + dz * t,
          heading: Math.atan2(dx * direction, -dz * direction),
          index,
        };
      });
    })
    .sort(
      (a, b) =>
        Math.hypot(a.x - stop.x, a.z - stop.z) -
        Math.hypot(b.x - stop.x, b.z - stop.z),
    );
  const clearExit = (pose: { x: number; z: number; heading: number }) => {
    for (let distance = 0; distance <= 25; distance += 0.5)
      if (
        cityCarBlocked(
          pose.x + Math.sin(pose.heading) * distance,
          pose.z - Math.cos(pose.heading) * distance,
          pose.heading,
        )
      )
        return false;
    return true;
  };
  const heading = candidates[0]?.heading ?? 0;
  if (
    CITY_PARKING.some(
      (parking) =>
        Math.abs(stop.x - parking.x) < parking.w / 2 - 3 &&
        Math.abs(stop.z - parking.z) < parking.d / 2 - 3,
    ) &&
    clearExit({ x: stop.x, z: stop.z, heading })
  )
    return { x: stop.x, z: stop.z, heading, index };
  return (
    candidates.find(
      (p) => Math.hypot(p.x - stop.x, p.z - stop.z) < 100 && clearExit(p),
    ) ?? null
  );
}
/** A discontinuity clears motion memory while preserving this trip's progress. */
export function teleportCityCar(s: CityState, stopId: string) {
  const arrival = cityTravelArrival(stopId);
  if (!arrival) return false;
  Object.assign(s, {
    x: arrival.x,
    z: arrival.z,
    heading: arrival.heading,
    travelRevision: (s.travelRevision ?? 0) + 1,
    vx: 0,
    vz: 0,
    speed: 0,
    steering: 0,
    drifting: false,
    throttle: 0,
    driftBlend: 0,
    powertrain: freshPowertrain(),
    accumulator: 0,
    bumpCooldown: 0,
    previousAction: false,
    previousHorn: false,
    interaction: null,
    radio: '',
    radioUntil: s.elapsed,
    nearStop:
      Math.hypot(
        arrival.x - cityStops[arrival.index].x,
        arrival.z - cityStops[arrival.index].z,
      ) < 2.8
        ? arrival.index
        : -1,
  });
  if (s.conversation) s.conversation.bridge = null;
  resetVehiclePresentation(s);
  return true;
}
export function resetCityCar(s: CityState) {
  resetVehiclePresentation(s);
  Object.assign(s, {
    x: CITY_SPAWN.x,
    z: CITY_SPAWN.z,
    vx: 0,
    vz: 0,
    speed: 0,
    heading: CITY_SPAWN.heading,
    steering: 0,
    drifting: false,
    throttle: 0,
    driftBlend: 0,
    powertrain: freshPowertrain(),
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
  const { worldContact: hit } = stepCar(
    s,
    {
      ...resolveDrive(keys, axes),
      handbrake: keys.has('ShiftLeft'),
    },
    STEP,
    cityCarBlocked,
  );
  const magnitude = s.speed;
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
  advanceCityConversation(s);
}
/** Fixed steps keep grip/collisions consistent on 30, 60 and 144 Hz displays. */
export function tickCity(
  s: CityState,
  dt: number,
  keys: ReadonlySet<string>,
  axes?: DriveAxes,
) {
  if (s.paused) {
    resetVehiclePresentation(s);
    return;
  }
  if (!Number.isFinite(dt) || dt <= 0) return;
  s.accumulator += Math.min(dt, 0.1);
  while (s.accumulator + 1e-9 >= STEP) {
    const previous = vehiclePose(s);
    step(s, keys, axes);
    rememberVehicleStep(s, previous, vehiclePose(s), STEP);
    s.accumulator = Math.max(0, s.accumulator - STEP);
  }
  setVehicleRemainder(s, s.accumulator);
}

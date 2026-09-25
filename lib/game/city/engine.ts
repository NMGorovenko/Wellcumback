import {
  cityRoofForBuilding,
  cityRoofHeight,
  cityRoofSlabBlocked,
  cityRoofSurfaces,
  cityRoofSupportElevation,
} from './roofs.ts';
import { fuelSolids } from './right-bank.ts';
import {
  freshFlight,
  advanceCitySuspension,
  compressCitySuspension,
  roadVerticalMotion,
  CITY_FLIGHT_GRAVITY,
  CITY_SUSPENSION_EXTENSION,
  type CityFlight,
} from './flight.ts';
import { inKachaWater, sampleKacha } from './kacha.ts';
import { onKachaStreetDeck, cityKachaRailBlocked } from './kacha-decks.ts';
import {
  cityBreakablesAt,
  breakableObjects,
  freshCityDamage,
  isCityObjectBroken,
  strikeCityObject,
  type CityDamage,
} from './destruction.ts';
import { cityBarriers } from './barriers.ts';
import {
  vehiclePose,
  rememberVehicleStep,
  setVehicleRemainder,
  resetVehiclePresentation,
} from './vehicle-presentation.ts';
import { stepCar, type CarInput, type VehicleTuning } from './car-physics.ts';
import {
  citySurfacePose,
  cityCeilingHit,
  cityRoadHeight,
  cityGroundHeight,
  cityKubaturaWallBlocked,
} from './surface.ts';
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
  CITY_ROUNDABOUTS,
  cityBuildings,
  cityStops,
} from './layout.ts';
export type CityState = {
  flight?: CityFlight;
  damage?: CityDamage;
  elevation?: number;
  pitch?: number;
  roll?: number;
  surfaceId?: string;
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
  ...citySurfacePose(CITY_SPAWN.x, CITY_SPAWN.z, CITY_SPAWN.heading),
  paused: false,
  damage: freshCityDamage(),
  flight: freshFlight(),
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
const roadsBySurface = new Map(
  cityRoads.map((road) => [`road:${road.id}`, road]),
);
const buildingIds = new Map<object, number>(
  cityBuildings.map((b, i) => [b, i]),
);
const barrierIds = new Map(cityBarriers.map((b, i) => [b, i]));
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
export function cityBlocked(
  x: number,
  z: number,
  elevation?: number,
  damage?: CityDamage,
  allowFalling = false,
) {
  if (cityKubaturaWallBlocked(x, z, RADIUS, elevation)) return true;
  if (
    cityKachaRailBlocked(
      x,
      z,
      elevation ?? citySurfacePose(x, z, 0).elevation,
      RADIUS,
      cityRoadHeight,
    )
  )
    return true;
  if (
    x < CITY_BOUNDS.minX + RADIUS ||
    x > CITY_BOUNDS.maxX - RADIUS ||
    z < CITY_BOUNDS.minZ + RADIUS ||
    z > CITY_BOUNDS.maxZ - RADIUS
  )
    return true;
  if (
    !allowFalling &&
    inCityWater(x, z, RADIUS) &&
    !cityRoads.some(
      (r) =>
        (r.bridge || onKachaStreetDeck(r, x, z)) &&
        distanceToRoad(x, z, r) < r.width / 2 - RADIUS,
    )
  )
    return true;
  if (
    CITY_ROUNDABOUTS.some(
      (ring) => Math.hypot(x - ring.x, z - ring.z) < ring.innerRadius + RADIUS,
    )
  )
    return true;
  if (
    cityBreakablesAt(
      x,
      z,
      elevation ?? citySurfacePose(x, z, 0).elevation,
      damage,
    ).some((id) => breakableObjects[id].kind === 'tree')
  )
    return true;
  return (
    blockerGrid.get(
      `${Math.floor(x / BLOCK_CELL)}:${Math.floor(z / BLOCK_CELL)}`,
    ) ?? []
  ).some((b) => {
    const id = barrierIds.get(b);
    if (id !== undefined && isCityObjectBroken(damage, id)) return false;
    const angle = b.angle ?? 0,
      dx = x - b.x,
      dz = z - b.z;
    const localX = dx * Math.cos(angle) - dz * Math.sin(angle),
      localZ = dx * Math.sin(angle) + dz * Math.cos(angle);
    if (
      Math.abs(localX) >= b.w / 2 + RADIUS ||
      Math.abs(localZ) >= b.d / 2 + RADIUS
    )
      return false;
    const buildingIndex = buildingIds.get(b);
    if (elevation !== undefined && buildingIndex !== undefined) {
      const roof = cityRoofForBuilding(buildingIndex, x, z, cityGroundHeight);
      if (roof && elevation >= roof.elevation - 0.06) return false;
    }
    if ('kind' in b && b.kind === 'fuel') {
      const y =
        (elevation ?? cityGroundHeight(b.x, b.z)) - cityGroundHeight(b.x, b.z);
      return (
        (buildingIndex !== undefined &&
          cityRoofSlabBlocked(
            buildingIndex,
            x,
            z,
            elevation ?? cityGroundHeight(b.x, b.z),
            cityGroundHeight,
          )) ||
        fuelSolids(b).some(
          (solid) =>
            y < solid.h &&
            y + 1.5 > 0 &&
            Math.abs(localX - solid.x) < solid.w / 2 + RADIUS &&
            Math.abs(localZ - solid.z) < solid.d / 2 + RADIUS,
        )
      );
    }
    if (elevation !== undefined && !b.roadId && 'h' in b) {
      const base = cityGroundHeight(b.x, b.z);
      const roof =
        buildingIndex !== undefined
          ? cityRoofForBuilding(buildingIndex, x, z, cityGroundHeight)
          : null;
      if (
        elevation > (roof?.elevation ?? base + Number(b.h)) ||
        elevation + 1.5 < base
      )
        return false;
    }
    if (elevation !== undefined && b.roadId) {
      const road = cityRoads.find((r) => r.id === b.roadId)!;
      if (Math.abs(cityRoadHeight(road, x, z) - elevation) > 2.5) return false;
    }
    return true;
  });
}
/** Three circles approximate the coupe body, including its long bonnet. */
export function cityCarBlocked(
  x: number,
  z: number,
  heading: number,
  elevation = citySurfacePose(x, z, heading).elevation,
  damage?: CityDamage,
  allowFalling = false,
  supportPitch?: number,
) {
  // The bonnet may meet a higher roof tier before any longitudinal circle
  // reaches its wall. Do not let the surface selector's reach limit hide it.
  if (
    cityRoofSurfaces(x, z, cityGroundHeight).some(
      (roof) =>
        roof.elevation <= elevation + 0.35 &&
        cityRoofSupportElevation(roof, x, z, heading, cityGroundHeight) >
          elevation + 0.35,
    )
  )
    return true;
  const support =
    supportPitch === undefined
      ? citySurfacePose(x, z, heading, elevation)
      : null;
  const pitch =
    supportPitch ??
    (support?.surfaceId.startsWith('roof:') &&
    Math.abs(support.elevation - elevation) < 0.35
      ? support.pitch
      : 0);
  return [-1.2, 0, 1.2].some((offset) =>
    cityBlocked(
      x + Math.sin(heading) * offset,
      z - Math.cos(heading) * offset,
      elevation + offset * Math.tan(pitch),
      damage,
      allowFalling,
    ),
  );
}
/** Shared city/race terrain step. The surface history selects the correct
 * deck at a crossing; steep ledges are solid instead of vertical teleports. */
export function stepCityCar(
  s: CityState,
  input: CarInput,
  dt: number,
  tuning?: VehicleTuning,
  damage = (s.damage ??= freshCityDamage()),
) {
  const flight = (s.flight ??= freshFlight());
  const startedGrounded = !flight.airborne;
  if (startedGrounded)
    flight.launchCooldown = Math.max(0, (flight.launchCooldown ?? 0) - dt);
  flight.landing = Math.max(0, flight.landing - dt * 2.5);
  if (flight.waterTime > 0) {
    advanceCitySuspension(flight, 0, dt);
    flight.waterTime += dt;
    s.vx = s.vz = s.speed = 0;
    s.drifting = false;
    return { worldContact: false, needsRecovery: flight.waterTime >= 1.3 };
  }
  const prior = citySurfacePose(s.x, s.z, s.heading, s.elevation, s.surfaceId);
  if (!flight.airborne) Object.assign(s, prior);
  const oldY = s.elevation ?? prior.elevation;
  const road = roadsBySurface.get(prior.surfaceId);
  const motion = flight.airborne
    ? { velocity: 0, acceleration: 0 }
    : roadVerticalMotion(
        road
          ? (x, z) => cityRoadHeight(road, x, z)
          : prior.surfaceId.startsWith('roof:')
            ? (x, z) =>
                cityRoofHeight(prior.surfaceId, x, z, cityGroundHeight) ??
                prior.elevation
            : cityGroundHeight,
        s.x,
        s.z,
        s.vx,
        s.vz,
        prior.elevation,
      );
  advanceCitySuspension(flight, flight.airborne ? 0 : motion.acceleration, dt);
  // Short road seams unload the suspension without throwing all four wheels
  // into the air. A sustained crest releases them once its extension is spent.
  if (
    !flight.airborne &&
    flight.suspension!.offset >= CITY_SUSPENSION_EXTENSION &&
    motion.acceleration < -CITY_FLIGHT_GRAVITY - 0.5
  ) {
    // A real crest can release wheel contact; the arcade kick is applied only
    // after actual movement below, never from a look-ahead sample alone.
    flight.airborne = true;
  }
  if (!flight.airborne && s.speed > 0.5) {
    const gravity = Math.sin(prior.pitch) * 9.81 * 0.45 * dt;
    s.vx -= Math.sin(s.heading) * gravity;
    s.vz += Math.cos(s.heading) * gravity;
  }
  if (!flight.airborne && prior.surfaceId.startsWith('road:')) {
    if (
      road &&
      distanceToRoad(s.x, s.z, road) < road.width / 2 - 3 &&
      !cityCarBlocked(s.x, s.z, s.heading, oldY, damage)
    )
      flight.safe = {
        x: s.x,
        z: s.z,
        heading: s.heading,
        elevation: oldY,
        surfaceId: prior.surfaceId,
      };
  }
  const before = { x: s.x, z: s.z };
  let destructiveContact = false;
  const oldDriftDistance = s.driftDistance;
  const wasAirborne = flight.airborne;
  const result = stepCar(
    s,
    input,
    dt,
    (x, z, heading) => {
      const travel = Math.hypot(x - before.x, z - before.z);
      const pose = citySurfacePose(
        x,
        z,
        heading,
        oldY,
        prior.surfaceId,
        flight.airborne ? oldY + 0.3 : Infinity,
      );
      const contactY = flight.airborne ? oldY : Math.max(oldY, pose.elevation);
      for (const offset of [-1.2, 0, 1.2]) {
        const ids = cityBreakablesAt(
          x + Math.sin(heading) * offset,
          z - Math.cos(heading) * offset,
          contactY,
          damage,
        );
        for (const id of ids)
          if (strikeCityObject(damage, id, s.vx, s.vz, s.elapsed))
            destructiveContact = true;
      }
      // An upward ledge is a collision; a downward ledge is a take-off.
      return (
        pose.elevation - oldY > 0.3 + travel * 0.22 ||
        cityCarBlocked(
          x,
          z,
          heading,
          contactY,
          damage,
          true,
          !flight.airborne && prior.surfaceId.startsWith('roof:')
            ? prior.pitch
            : 0,
        )
      );
    },
    tuning,
    !flight.airborne,
  );
  const pose = citySurfacePose(
    s.x,
    s.z,
    s.heading,
    oldY,
    prior.surfaceId,
    flight.airborne ? oldY + 0.3 : Infinity,
  );
  const travel = Math.hypot(s.x - before.x, s.z - before.z);
  let projectedY = oldY + flight.vy * dt - 0.5 * CITY_FLIGHT_GRAVITY * dt * dt;
  if (
    !flight.airborne &&
    (oldY - pose.elevation > 0.32 + travel * 0.3 ||
      (s.speed > 9 && projectedY - pose.elevation > 0.1))
  )
    flight.airborne = true;
  // One small arcade hop at a genuine moving take-off. Landing must settle
  // before it can rearm; holding throttle cannot repeatedly boost in mid-air.
  if (
    startedGrounded &&
    flight.airborne &&
    s.speed >= 11 &&
    travel > 0.02 &&
    (flight.launchCooldown ?? 0) === 0
  ) {
    flight.vy = Math.max(flight.vy, Math.min(5.5, 3 + (s.speed - 11) * 0.1));
    flight.launchCooldown = 0.25;
    projectedY = oldY + flight.vy * dt - 0.5 * CITY_FLIGHT_GRAVITY * dt * dt;
  }
  const waterAtCar = inCityWater(s.x, s.z);
  const waterHeight = inKachaWater(s.x, s.z)
    ? sampleKacha(s.x, s.z).waterHeight
    : 0;
  if (waterAtCar && pose.elevation < waterHeight && oldY <= waterHeight + 0.35)
    flight.airborne = true;
  let landed = false;
  if (flight.airborne) {
    flight.vy = Math.max(-80, flight.vy - CITY_FLIGHT_GRAVITY * dt);
    const ceiling = cityCeilingHit(
      s.x,
      s.z,
      oldY,
      projectedY,
      s.heading,
      s.pitch ?? 0,
      s.roll ?? 0,
    );
    s.elevation = ceiling ?? projectedY;
    if (ceiling !== null) flight.vy = -Math.abs(flight.vy) * 0.2;
    const water = inCityWater(s.x, s.z);
    const waterY = inKachaWater(s.x, s.z)
      ? sampleKacha(s.x, s.z).waterHeight
      : 0;
    const waterFirst = water && pose.elevation < waterY;
    if (waterFirst && s.elevation <= waterY + 0.15) {
      s.elevation = waterY - 0.65;
      flight.waterTime = dt;
      flight.vy = 0;
      s.vx *= 0.1;
      s.vz *= 0.1;
      s.speed *= 0.1;
      s.radio = 'Ярик: Ну всё, теперь катер.';
      s.radioUntil = s.elapsed + 4;
    } else if (
      flight.vy <= 0 &&
      s.elevation <= pose.elevation &&
      oldY >= pose.elevation - 0.35
    ) {
      const impact = Math.abs(flight.vy);
      Object.assign(s, pose);
      flight.airborne = false;
      flight.launchCooldown = 0.25;
      flight.vy = 0;
      flight.landing = Math.min(1, impact / 18);
      compressCitySuspension(flight, impact);
      const loss = Math.max(0.55, 1 - impact * 0.018);
      s.vx *= loss;
      s.vz *= loss;
      s.speed *= loss;
      landed = impact > 4;
    } else {
      s.pitch =
        (s.pitch ?? 0) +
        (Math.max(
          -0.5,
          Math.min(0.4, Math.atan2(flight.vy, Math.max(8, s.speed))),
        ) -
          (s.pitch ?? 0)) *
          (1 - Math.exp(-dt * 2));
    }
    if (flight.airborne) s.roll = (s.roll ?? 0) * Math.exp(-dt * 2);
    s.drifting = false;
    if (wasAirborne) s.driftDistance = oldDriftDistance;
  } else {
    flight.vy = Math.max(-16, Math.min(16, (pose.elevation - oldY) / dt));
    Object.assign(s, pose);
  }
  if (destructiveContact) {
    s.vx *= 0.76;
    s.vz *= 0.76;
    s.speed = Math.hypot(s.vx, s.vz);
  }
  return {
    worldContact: result.worldContact || destructiveContact || landed,
    needsRecovery: false,
  };
}
/** A water fall returns to the last stable road pose, preserving trip progress. */
export function recoverCityCar(s: CityState) {
  const safe = s.flight?.safe;
  if (
    safe &&
    !cityCarBlocked(safe.x, safe.z, safe.heading, safe.elevation, s.damage)
  ) {
    Object.assign(s, safe, {
      vx: 0,
      vz: 0,
      speed: 0,
      pitch: 0,
      roll: 0,
      steering: 0,
      drifting: false,
      driftBlend: 0,
      throttle: 0,
      flight: freshFlight(),
      travelRevision: (s.travelRevision ?? 0) + 1,
    });
  } else resetCityCar(s);
  resetVehiclePresentation(s);
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
    ...citySurfacePose(arrival.x, arrival.z, arrival.heading),
    x: arrival.x,
    z: arrival.z,
    heading: arrival.heading,
    travelRevision: (s.travelRevision ?? 0) + 1,
    flight: freshFlight(),
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
    ...citySurfacePose(CITY_SPAWN.x, CITY_SPAWN.z, CITY_SPAWN.heading),
    flight: freshFlight(),
    travelRevision: (s.travelRevision ?? 0) + 1,
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
  const { worldContact: hit, needsRecovery } = stepCityCar(
    s,
    {
      ...resolveDrive(keys, axes),
      handbrake: keys.has('ShiftLeft'),
    },
    STEP,
  );
  if (needsRecovery) recoverCityCar(s);
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
  s.nearStop = s.flight?.airborne
    ? -1
    : cityStops.findIndex((p) => Math.hypot(s.x - p.x, s.z - p.z) < 2.8);
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
    const revision = s.travelRevision;
    step(s, keys, axes);
    rememberVehicleStep(
      s,
      previous,
      vehiclePose(s),
      STEP,
      revision !== s.travelRevision,
    );
    s.accumulator = Math.max(0, s.accumulator - STEP);
  }
  setVehicleRemainder(s, s.accumulator);
}

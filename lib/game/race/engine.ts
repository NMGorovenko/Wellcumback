import { freshFlight } from '../city/flight.ts';
import { freshCityDamage } from '../city/destruction.ts';
import { citySurfacePose } from '../city/surface.ts';
import {
  vehiclePose,
  rememberVehicleStep,
  setVehicleRemainder,
  resetVehiclePresentation,
} from '../city/vehicle-presentation.ts';
import { cityCarBlocked, freshCity, stepCityCar } from '../city/engine.ts';
import { stepCar } from '../city/car-physics.ts';
import { crossedGate, raceBoundaryHalfWidth, type Course } from './course.ts';
import {
  CAR_COLORS,
  vehicleTuning,
  type ColorId,
  type VehicleId,
} from './vehicles.ts';
import {
  neutralRaceInput,
  type Racer,
  type RaceInput,
  type RaceState,
} from './types.ts';
export const RACE_STEP = 1 / 120;
export const RACE_TIME_LIMIT = 597; // Ten minutes including the three-second grid countdown.
export const racerId = (memberSlot: number, localIndex: number) =>
  `${memberSlot}:${localIndex}`;
export function freshRacer(
  memberSlot: number,
  localIndex: number,
  name: string,
  colorId: ColorId,
): Racer {
  const car = freshCity();
  car.radio = '';
  car.radioUntil = 0;
  return {
    id: racerId(memberSlot, localIndex),
    memberSlot,
    localIndex,
    name,
    vehicleId: 'mustang',
    colorId,
    ready: false,
    car,
    elevation: 0,
    pitch: 0,
    started: false,
    laps: 0,
    nextGate: 0,
    passedGates: 0,
    lapStart: 0,
    bestLap: null,
    finishTime: null,
    score: 0,
    combo: 0,
    comboDuration: 0,
    straightTime: 0,
    feedback: '',
    feedbackUntil: 0,
    respawns: 0,
    previousReset: false,
  };
}
export function freshRace(): RaceState {
  return {
    paused: true,
    players: 1,
    phase: 'lobby',
    damage: freshCityDamage(),
    trackId: 'krasnoyarsk',
    mode: 'circuit',
    laps: 3,
    racers: [freshRacer(0, 0, 'Игрок 1', 'red')],
    elapsed: 0,
    countdown: 3,
    accumulator: 0,
    revision: 0,
  };
}
export function changeLocalRacers(
  s: RaceState,
  slot: number,
  count: 1 | 2 | 3,
  name: string,
) {
  if (
    s.phase !== 'lobby' ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= 3 ||
    (count !== 1 && count !== 2 && count !== 3)
  )
    return;
  s.racers = s.racers.filter(
    (r) => r.memberSlot !== slot || r.localIndex < count,
  );
  for (let i = 0; i < count; i++) {
    let r = s.racers.find((r) => r.id === racerId(slot, i));
    if (!r) {
      const color = CAR_COLORS.find(
        (c) => !s.racers.some((r) => r.colorId === c.id),
      )!;
      r = freshRacer(slot, i, name, color.id);
      s.racers.push(r);
    }
    r.name = count === 1 ? name : `${name} · ${i + 1}`;
  }
  s.racers.sort(
    (a, b) => a.memberSlot - b.memberSlot || a.localIndex - b.localIndex,
  );
  resetReady(s);
}
export function resetReady(s: RaceState) {
  s.revision++;
  s.racers.forEach((r) => (r.ready = false));
  s.players = s.racers.length;
}
export function configureCar(
  s: RaceState,
  slot: number,
  localIndex: number,
  vehicleId: VehicleId,
  colorId: ColorId,
) {
  if (s.phase !== 'lobby') return false;
  const r = s.racers.find((r) => r.id === racerId(slot, localIndex));
  if (!r || s.racers.some((other) => other !== r && other.colorId === colorId))
    return false;
  r.vehicleId = vehicleId;
  r.colorId = colorId;
  resetReady(s);
  return true;
}
export function carBlocked(
  course: Course,
  x: number,
  z: number,
  heading: number,
) {
  if (course.id === 'krasnoyarsk') return cityCarBlocked(x, z, heading);
  return [-1.2, 0, 1.2].some(
    (offset) =>
      course.closest(
        x + Math.sin(heading) * offset,
        z - Math.cos(heading) * offset,
      ).lateral >
      raceBoundaryHalfWidth(course) - 0.88,
  );
}
export function startRace(s: RaceState, course: Course) {
  if (s.phase !== 'lobby' || !s.racers.length || s.racers.some((r) => !r.ready))
    return false;
  s.phase = 'countdown';
  s.damage = freshCityDamage();
  s.countdown = 3;
  s.elapsed = 0;
  s.accumulator = 0;
  s.paused = false;
  s.racers.forEach((r, i) => {
    const config = {
      memberSlot: r.memberSlot,
      localIndex: r.localIndex,
      name: r.name,
      colorId: r.colorId,
      vehicleId: r.vehicleId,
    };
    Object.assign(
      r,
      freshRacer(r.memberSlot, r.localIndex, r.name, r.colorId),
      config,
      { ready: true },
    );
    const point = course.sample(-6 - Math.floor(i / 2) * 6),
      side = i % 2 === 0 ? -1.8 : 1.8;
    Object.assign(r.car, {
      x: point.x - point.dz * side,
      z: point.z + point.dx * side,
      heading: Math.atan2(point.dx, -point.dz),
    });
    if (course.id === 'krasnoyarsk')
      Object.assign(r.car, citySurfacePose(r.car.x, r.car.z, r.car.heading));
    else
      Object.assign(r.car, {
        elevation: point.y,
        pitch: 0,
        roll: 0,
        surfaceId: undefined,
      });
    r.elevation = r.car.elevation!;
    r.pitch = r.car.pitch!;
  });
  return true;
}
export function returnToLobby(s: RaceState) {
  s.phase = 'lobby';
  s.paused = true;
  resetReady(s);
}
function feedback(s: RaceState, r: Racer, text: string) {
  r.feedback = text;
  r.feedbackUntil = s.elapsed + 2;
}
export function respawnRacer(s: RaceState, r: Racer, course: Course) {
  if (r.finishTime !== null) return;
  const last =
    course.gates[(r.nextGate + course.gates.length - 1) % course.gates.length];
  const distance = r.passedGates === 0 ? -6 : last.distance + 5;
  let p = course.sample(distance),
    lateral = 0,
    found = false;
  // Search backwards from earned progress. Never teleport on top of another car.
  for (let back = 0; back <= 60 && !found; back += 6)
    for (const candidate of [0, -2, 2]) {
      const q = course.sample(distance - back),
        x = q.x - q.dz * candidate,
        z = q.z + q.dx * candidate;
      if (
        !carBlocked(course, x, z, Math.atan2(q.dx, -q.dz)) &&
        !s.racers.some(
          (o) => o !== r && Math.hypot(o.car.x - x, o.car.z - z) < 4.6,
        )
      ) {
        p = q;
        lateral = candidate;
        found = true;
        break;
      }
    }
  if (!found) {
    feedback(s, r, 'Подожди, трасса занята');
    return;
  }
  Object.assign(r.car, {
    x: p.x - p.dz * lateral,
    z: p.z + p.dx * lateral,
    vx: 0,
    vz: 0,
    speed: 0,
    heading: Math.atan2(p.dx, -p.dz),
    steering: 0,
    drifting: false,
    driftBlend: 0,
    flight: freshFlight(),
  });
  if (course.id === 'krasnoyarsk')
    Object.assign(r.car, citySurfacePose(r.car.x, r.car.z, r.car.heading));
  else
    Object.assign(r.car, {
      elevation: p.y,
      pitch: 0,
      roll: 0,
      surfaceId: undefined,
    });
  r.elevation = r.car.elevation!;
  r.pitch = r.car.pitch!;
  r.combo = 0;
  r.comboDuration = 0;
  r.straightTime = 0;
  r.respawns++;
  feedback(s, r, 'Снова на трассе');
}
/** Full body sweep prevents two fast cars from swapping sides in one step. */
export function resolveCarContacts(
  s: RaceState,
  course: Course,
  previous: { x: number; z: number; heading: number }[],
): Set<string> {
  const contacts = new Set<string>();
  const cars = s.racers;
  for (let i = 0; i < cars.length; i++)
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i],
        b = cars[j];
      if (
        a.finishTime !== null ||
        b.finishTime !== null ||
        Math.abs(
          (a.car.elevation ?? a.elevation) - (b.car.elevation ?? b.elevation),
        ) > 2.5
      )
        continue;
      const pa = previous[i],
        pb = previous[j];
      const travel =
        Math.hypot(a.car.x - pa.x, a.car.z - pa.z) +
        Math.hypot(b.car.x - pb.x, b.car.z - pb.z);
      const samples = Math.max(1, Math.ceil(travel / 0.6));
      let hit = false;
      for (let t = 1; t <= samples && !hit; t++) {
        const k = t / samples;
        for (const oa of [-1.2, 0, 1.2])
          for (const ob of [-1.2, 0, 1.2]) {
            const ax =
                pa.x + (a.car.x - pa.x) * k + Math.sin(a.car.heading) * oa,
              az = pa.z + (a.car.z - pa.z) * k - Math.cos(a.car.heading) * oa;
            const bx =
                pb.x + (b.car.x - pb.x) * k + Math.sin(b.car.heading) * ob,
              bz = pb.z + (b.car.z - pb.z) * k - Math.cos(b.car.heading) * ob;
            if (Math.hypot(ax - bx, az - bz) < 1.7) hit = true;
          }
      }
      if (!hit) continue;
      contacts.add(a.id);
      contacts.add(b.id);
      const dx = pb.x - pa.x,
        dz = pb.z - pa.z,
        len = Math.hypot(dx, dz);
      const nx = len > 1e-6 ? dx / len : Math.cos(a.car.heading),
        nz = len > 1e-6 ? dz / len : Math.sin(a.car.heading);
      const relative = (a.car.vx - b.car.vx) * nx + (a.car.vz - b.car.vz) * nz;
      if (relative > 0) {
        const impulse = relative * 0.65;
        a.car.vx -= nx * impulse;
        a.car.vz -= nz * impulse;
        b.car.vx += nx * impulse;
        b.car.vz += nz * impulse;
      }
      for (const [r, p, sign] of [
        [a, pa, -1],
        [b, pb, 1],
      ] as const) {
        r.car.x = p.x;
        r.car.z = p.z;
        r.car.heading = p.heading;
        const x = p.x + nx * sign * 0.025,
          z = p.z + nz * sign * 0.025;
        if (!carBlocked(course, x, z, p.heading)) {
          r.car.x = x;
          r.car.z = z;
        }
        r.car.speed = Math.hypot(r.car.vx, r.car.vz);
      }
    }
  return contacts;
}
export function advanceGates(
  s: RaceState,
  r: Racer,
  course: Course,
  previous: { x: number; z: number },
) {
  if (
    r.finishTime !== null ||
    !crossedGate(previous, r.car, course.gates[r.nextGate])
  )
    return;
  r.passedGates++;
  if (r.nextGate === 0) {
    if (r.started) {
      const lap = s.elapsed - r.lapStart;
      r.bestLap = r.bestLap === null ? lap : Math.min(r.bestLap, lap);
      r.laps++;
    }
    r.started = true;
    r.lapStart = s.elapsed;
    if (r.laps >= s.laps) {
      r.finishTime = s.elapsed;
      r.car.vx = r.car.vz = r.car.speed = 0;
      feedback(s, r, 'Финиш!');
    } else
      feedback(
        s,
        r,
        r.laps === s.laps - 1
          ? 'Последний круг'
          : `Круг ${r.laps + 1} / ${s.laps}`,
      );
  }
  r.nextGate = (r.nextGate + 1) % course.gates.length;
}
export function advanceDrift(
  s: RaceState,
  r: Racer,
  contact: boolean,
  dt: number,
) {
  if (contact) {
    if (r.combo > 1) feedback(s, r, 'Удар · серия потеряна');
    r.combo = r.comboDuration = r.straightTime = 0;
    return;
  }
  const car = r.car,
    forward = car.vx * Math.sin(car.heading) - car.vz * Math.cos(car.heading);
  const lateral = Math.abs(
    car.vx * Math.cos(car.heading) + car.vz * Math.sin(car.heading),
  );
  const angle = Math.atan2(lateral, Math.max(0.001, forward));
  const drifting =
    car.drifting &&
    car.speed > 4 &&
    forward > 2 &&
    angle > 0.12 &&
    angle < 1.3 &&
    r.finishTime === null;
  if (drifting) {
    r.straightTime = 0;
    r.comboDuration += dt;
    r.combo +=
      car.speed * angle * 10 * (1 + Math.min(2, r.comboDuration / 5)) * dt;
  } else if (r.combo > 0) {
    r.straightTime += dt;
    if (r.straightTime >= 0.45 || r.finishTime !== null) {
      const bank = Math.floor(r.combo);
      r.score += bank;
      r.combo = r.comboDuration = r.straightTime = 0;
      if (bank > 0) feedback(s, r, `+${bank}`);
    }
  }
}
export function raceStandings(s: RaceState, course: Course) {
  const progress = (r: Racer) =>
    r.passedGates * 100000 -
    Math.hypot(
      r.car.x - course.gates[r.nextGate].x,
      r.car.z - course.gates[r.nextGate].z,
    );
  return [...s.racers].sort((a, b) => {
    if (s.mode === 'drift' && a.score !== b.score) return b.score - a.score;
    if (a.finishTime !== null || b.finishTime !== null)
      return (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity);
    return progress(b) - progress(a) || a.id.localeCompare(b.id);
  });
}
function step(
  s: RaceState,
  dt: number,
  inputs: ReadonlyMap<string, RaceInput>,
  course: Course,
) {
  if (s.phase === 'countdown') {
    // A held reset during the lights is not a fresh reset on green. Throttle
    // stays available on the first racing step; no simulation runs before it.
    for (const r of s.racers)
      r.previousReset = inputs.get(r.id)?.reset ?? false;
    s.countdown = Math.max(0, s.countdown - dt);
    if (s.countdown < 1e-8) s.phase = 'racing';
    return;
  }
  if (s.phase !== 'racing') return;
  s.elapsed += dt;
  const previous = s.racers.map((r) => ({
    x: r.car.x,
    z: r.car.z,
    heading: r.car.heading,
  }));
  const contacts = new Set<string>();
  const resets = new Set<string>();
  s.racers.forEach((r) => {
    const input = inputs.get(r.id) ?? neutralRaceInput();
    if (input.reset && !r.previousReset) {
      respawnRacer(s, r, course);
      resets.add(r.id);
    }
    r.previousReset = input.reset;
    if (r.finishTime !== null || resets.has(r.id)) return;
    r.car.elapsed += dt;
    const hit =
      course.id === 'krasnoyarsk'
        ? stepCityCar(
            r.car,
            input,
            dt,
            vehicleTuning(r.vehicleId, true),
            (s.damage ??= freshCityDamage()),
          )
        : stepCar(
            r.car,
            input,
            dt,
            (x, z, h) => carBlocked(course, x, z, h),
            vehicleTuning(r.vehicleId, false),
          );
    if ('needsRecovery' in hit && hit.needsRecovery) {
      respawnRacer(s, r, course);
      resets.add(r.id);
    }
    if (hit.worldContact) contacts.add(r.id);
  });
  // Reset is a teleport, never sweep its old position or award a crossed gate.
  resets.forEach((id) => {
    const i = s.racers.findIndex((r) => r.id === id),
      c = s.racers[i].car;
    previous[i] = { x: c.x, z: c.z, heading: c.heading };
  });
  resolveCarContacts(s, course, previous).forEach((id) => contacts.add(id));
  if (course.id === 'krasnoyarsk')
    s.racers.forEach((r) => {
      if (!r.car.flight?.airborne)
        Object.assign(
          r.car,
          citySurfacePose(
            r.car.x,
            r.car.z,
            r.car.heading,
            r.car.elevation,
            r.car.surfaceId,
          ),
        );
      r.elevation = r.car.elevation!;
      r.pitch = r.car.pitch!;
    });
  else
    s.racers.forEach((r) => {
      const c = r.car,
        dx = Math.sin(c.heading) * 1.35,
        dz = -Math.cos(c.heading) * 1.35;
      r.elevation = course.closest(c.x, c.z).y;
      r.pitch = Math.atan2(
        course.closest(c.x + dx, c.z + dz).y -
          course.closest(c.x - dx, c.z - dz).y,
        2.7,
      );
      Object.assign(c, {
        elevation: r.elevation,
        pitch: r.pitch,
        surfaceId: undefined,
      });
    });
  s.racers.forEach((r, i) => {
    if (!resets.has(r.id) && !r.car.flight?.airborne)
      advanceGates(s, r, course, previous[i]);
    advanceDrift(s, r, contacts.has(r.id), dt);
  });
  if (
    s.elapsed >= RACE_TIME_LIMIT ||
    s.racers.every((r) => r.finishTime !== null)
  ) {
    s.elapsed = Math.min(s.elapsed, RACE_TIME_LIMIT);
    s.racers.forEach((r) => {
      r.car.vx = r.car.vz = r.car.speed = 0;
      r.combo = r.comboDuration = r.straightTime = 0;
    });
    s.phase = 'result';
    s.paused = true;
  }
}
export function tickRace(
  s: RaceState,
  dt: number,
  inputs: ReadonlyMap<string, RaceInput>,
  course: Course,
) {
  if (s.paused) {
    s.racers.forEach((r) => resetVehiclePresentation(r.car));
    return;
  }
  if (!Number.isFinite(dt) || dt <= 0) return;
  s.accumulator += Math.min(0.1, dt);
  while (s.accumulator + 1e-9 >= RACE_STEP && !s.paused) {
    const previous = s.racers.map((r) => ({
      pose: vehiclePose(r.car, r.elevation, r.pitch),
      respawns: r.respawns,
    }));
    const phase = s.phase;
    step(s, RACE_STEP, inputs, course);
    s.racers.forEach((r, i) =>
      rememberVehicleStep(
        r.car,
        previous[i].pose,
        vehiclePose(r.car, r.elevation, r.pitch),
        RACE_STEP,
        phase !== 'racing' ||
          s.phase !== 'racing' ||
          r.respawns !== previous[i].respawns,
      ),
    );
    s.accumulator = Math.max(0, s.accumulator - RACE_STEP);
  }
  s.racers.forEach((r) => setVehicleRemainder(r.car, s.accumulator, s.paused));
}

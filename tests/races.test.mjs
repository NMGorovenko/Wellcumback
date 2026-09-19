import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshRace,
  changeLocalRacers,
  configureCar,
  startRace,
  tickRace,
  advanceGates,
  advanceDrift,
  raceStandings,
  respawnRacer,
  resolveCarContacts,
  carBlocked,
} from '../lib/game/race/engine.ts';
import { raceCourse, crossedGate } from '../lib/game/race/course.ts';
import { neutralRaceInput } from '../lib/game/race/types.ts';
import { vehicleTuning } from '../lib/game/race/vehicles.ts';
import {
  advancePowertrain,
  freshPowertrain,
} from '../lib/game/city/powertrain.ts';
const city = raceCourse('krasnoyarsk');
function ready(count = 1) {
  const s = freshRace();
  changeLocalRacers(s, 0, count, 'Друг');
  s.racers.forEach((r) => (r.ready = true));
  assert.equal(startRace(s, city), true);
  return s;
}
function pass(s, r, index) {
  const g = city.gates[index];
  const before = { x: g.x - g.dx, z: g.z - g.dz };
  r.car.x = g.x + g.dx;
  r.car.z = g.z + g.dz;
  s.elapsed += 10;
  advanceGates(s, r, city, before);
}
await test('six unique cars, per-device configuration and readiness invalidation', () => {
  const s = freshRace();
  for (let i = 0; i < 3; i++) changeLocalRacers(s, i, 2, `Друг${i}`);
  assert.equal(s.racers.length, 6);
  assert.equal(new Set(s.racers.map((r) => r.colorId)).size, 6);
  s.racers.forEach((r) => (r.ready = true));
  assert.equal(configureCar(s, 1, 1, 'amg-gt', s.racers[3].colorId), true);
  assert.equal(s.racers[3].vehicleId, 'amg-gt');
  assert(s.racers.every((r) => !r.ready));
  assert.equal(configureCar(s, 1, 1, 'amg-gt', s.racers[0].colorId), false);
});
await test('start and ordered gates require three complete laps; reverse and skipped gates give nothing', () => {
  const s = ready(),
    r = s.racers[0];
  s.phase = 'racing';
  pass(s, r, 2);
  assert.equal(r.passedGates, 0);
  pass(s, r, 0);
  assert.equal(r.laps, 0);
  const g = city.gates[1];
  assert.equal(
    crossedGate(
      { x: g.x + g.dx, z: g.z + g.dz },
      { x: g.x - g.dx, z: g.z - g.dz },
      g,
    ),
    false,
  );
  for (let lap = 0; lap < 3; lap++) {
    for (let i = 1; i < city.gates.length; i++) pass(s, r, i);
    pass(s, r, 0);
    assert.equal(r.laps, lap + 1);
  }
  assert.notEqual(r.finishTime, null);
  assert.equal(r.passedGates, city.gates.length * 3 + 1);
});
await test('a collision burns an unbanked combo even on the banking step; repeated impacts also burn', () => {
  const s = ready(),
    r = s.racers[0];
  s.mode = 'drift';
  r.score = 200;
  Object.assign(r, { combo: 100, straightTime: 0.44 });
  advanceDrift(s, r, true, 0.02);
  assert.equal(r.combo, 0);
  assert.equal(r.score, 200);
  r.combo = 70;
  advanceDrift(s, r, true, 0.02);
  assert.equal(r.combo, 0);
  r.combo = 123.9;
  advanceDrift(s, r, false, 0.46);
  assert.equal(r.score, 323);
  advanceDrift(s, r, false, 1);
  assert.equal(r.score, 323);
});
await test('drift live standings rank banked points first', () => {
  const s = ready(2);
  s.mode = 'drift';
  s.phase = 'racing';
  s.racers[1].passedGates = 5;
  s.racers[0].score = 50;
  assert.equal(raceStandings(s, city)[0].id, s.racers[0].id);
});
await test('respawn uses earned gates, never shortcuts ahead and finds space behind an occupied position', () => {
  const s = ready(2),
    r = s.racers[0];
  pass(s, r, 0);
  const occupied = city.sample(5);
  Object.assign(s.racers[1].car, occupied);
  Object.assign(r.car, city.sample(city.gates[1].distance + 50));
  respawnRacer(s, r, city);
  const returned = city.closest(r.car.x, r.car.z).distance;
  const earnedProgress =
    returned > city.length - 60 ? returned - city.length : returned;
  assert(
    earnedProgress <= 5 && earnedProgress >= -55,
    'respawn backs up from the earned first gate, never the unearned second gate',
  );
  assert.equal(r.nextGate, 1);
  assert.equal(r.passedGates, 1);
  assert(
    Math.hypot(r.car.x - s.racers[1].car.x, r.car.z - s.racers[1].car.z) >= 4.6,
  );
});
await test('head-on cars cannot tunnel through one another; separation cannot push through world walls', () => {
  const s = ready(2),
    [a, b] = s.racers;
  const line = city.sample(100),
    start = { x: line.x, z: line.z };
  const heading = Math.atan2(line.dx, -line.dz);
  Object.assign(a.car, {
    ...start,
    heading,
    vx: line.dx * 80,
    vz: line.dz * 80,
  });
  Object.assign(b.car, {
    x: start.x + line.dx * 5,
    z: start.z + line.dz * 5,
    heading: heading + Math.PI,
    vx: -line.dx * 80,
    vz: -line.dz * 80,
  });
  const prev = s.racers.map((r) => ({ ...r.car }));
  a.car.x += line.dx * 6;
  a.car.z += line.dz * 6;
  b.car.x -= line.dx * 6;
  b.car.z -= line.dz * 6;
  const contacts = resolveCarContacts(s, city, prev);
  assert.equal(contacts.size, 2);
  assert((b.car.x - a.car.x) * line.dx + (b.car.z - a.car.z) * line.dz > 0);
  assert(
    s.racers.every((r) => !carBlocked(city, r.car.x, r.car.z, r.car.heading)),
  );
});
await test('fixed race clock/physics match across 30,60,144 Hz and JSON pause preserves all racers', () => {
  const states = [30, 60, 144].map((hz) => {
    const s = ready(2);
    for (let i = 0; i < hz * 5; i++)
      tickRace(
        s,
        1 / hz,
        new Map(
          s.racers.map((r) => [r.id, { ...neutralRaceInput(), throttle: 0.3 }]),
        ),
        city,
      );
    return s;
  });
  for (const s of states.slice(1))
    for (let i = 0; i < 2; i++) {
      assert(Math.abs(s.racers[i].car.x - states[0].racers[i].car.x) < 1e-7);
      assert(Math.abs(s.elapsed - states[0].elapsed) < 1e-7);
    }
  const s = JSON.parse(JSON.stringify(states[0]));
  s.paused = true;
  const before = JSON.stringify(s);
  tickRace(s, 1, new Map(), city);
  assert.equal(JSON.stringify(s), before);
});
await test('compressed Nordschleife has a closed, metric route and real elevation; AMG downshifts', () => {
  const c = raceCourse('nordschleife');
  assert(c.length > 3700 && c.length < 3850);
  assert.deepEqual(c.points[0], c.points.at(-1));
  assert(c.points.every((p) => Number.isFinite(p.x + p.y + p.z)));
  const ys = c.points.map((p) => p.y);
  assert(Math.max(...ys) - Math.min(...ys) > 50);
  const t = vehicleTuning('amg-gt', false).transmission,
    m = freshPowertrain();
  assert.equal(t.ratios.length, 9);
  m.gear = 9;
  m.rpm = 6500;
  for (let i = 0; i < 600; i++) advancePowertrain(m, 4, 0.3, 1 / 60, t);
  assert(m.gear < 4);
});

await test('ten minute race cap produces standings without inventing finishes or banking an unfinished slide', () => {
  const s = freshRace();
  s.mode = 'drift';
  s.racers[0].ready = true;
  startRace(s, city);
  s.phase = 'racing';
  s.countdown = 0;
  s.elapsed = 596.999;
  s.racers[0].score = 42;
  s.racers[0].combo = 200;
  tickRace(s, 1 / 60, new Map(), city);
  assert.equal(s.phase, 'result');
  assert.equal(s.paused, true);
  assert.equal(s.elapsed, 597);
  assert.equal(s.racers[0].finishTime, null);
  assert.equal(s.racers[0].score, 42);
  assert.equal(s.racers[0].combo, 0);
});

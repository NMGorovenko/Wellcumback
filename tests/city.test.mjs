import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cityBlocked,
  cityCarBlocked,
  freshCity,
  tickCity,
  resetCityCar,
} from '../lib/game/city/engine.ts';
import {
  cityStops,
  CITY_SPAWN,
  BRIDGES,
  CITY_ROUTES,
  cityRoads,
  CITY_PARKING,
  cityBuildings,
  riverBankZ,
  riverZ,
  distanceToRoad,
} from '../lib/game/city/layout.ts';
const advance = (s, seconds, keys, rate = 60) => {
  for (let n = 0; n < seconds * rate; n++) tickCity(s, 1 / rate, new Set(keys));
};
void test('all stops are connected by drivable streets, parking and bridges', () => {
  // A bounded search on the road corridors replaces the old 1 m flood-fill of
  // the entire landscape. Every edge still checks the complete physical car.
  const spacing = 6,
    start = [CITY_SPAWN.x, CITY_SPAWN.z];
  const segmentClear = (ax, az, bx, bz) => {
    const length = Math.hypot(bx - ax, bz - az),
      steps = Math.max(1, Math.ceil(length / 2));
    const heading = Math.atan2(bx - ax, az - bz);
    for (let i = 0; i <= steps; i++)
      if (
        cityCarBlocked(
          ax + ((bx - ax) * i) / steps,
          az + ((bz - az) * i) / steps,
          heading,
        )
      )
        return false;
    return true;
  };
  const corridor = (x, z) =>
    cityRoads.some((r) => distanceToRoad(x, z, r) < r.width / 2 + 3) ||
    CITY_PARKING.some(
      (p) => Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2,
    ) ||
    cityStops.some((p) => Math.hypot(x - p.x, z - p.z) < 8);
  const visited = new Set(['0,0']),
    queue = [[0, 0]],
    reached = new Set();
  for (let i = 0; i < queue.length && reached.size < cityStops.length; i++) {
    assert.ok(
      queue.length < 150000,
      'route search remains bounded to street corridors',
    );
    const [gx, gz] = queue[i],
      cx = start[0] + gx * spacing,
      cz = start[1] + gz * spacing;
    for (const stop of cityStops)
      if (
        !reached.has(stop.id) &&
        Math.hypot(cx - stop.x, cz - stop.z) < 12 &&
        segmentClear(cx, cz, stop.x, stop.z)
      )
        reached.add(stop.id);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const nx = gx + dx,
        nz = gz + dz,
        key = `${nx},${nz}`;
      if (visited.has(key)) continue;
      const x = start[0] + nx * spacing,
        z = start[1] + nz * spacing;
      if (!corridor(x, z)) {
        visited.add(key);
        continue;
      }
      if (!segmentClear(cx, cz, x, z)) continue;
      visited.add(key);
      queue.push([nx, nz]);
    }
  }
  assert.deepEqual(
    cityStops.filter((stop) => !reached.has(stop.id)).map((stop) => stop.id),
    [],
  );
  const bankX = CITY_ROUTES.western.at(-1).x;
  assert.ok(cityBlocked(bankX, riverZ(bankX)));
  assert.ok(!cityBlocked(BRIDGES[0].x, BRIDGES[0].z));
});
void test('driving is fixed-step; handbrake gives real lateral slip and recorded drift distance', () => {
  const a = freshCity(),
    b = freshCity();
  advance(a, 0.6, ['KeyW'], 30);
  advance(b, 0.6, ['KeyW'], 144);
  assert.ok(Math.abs(a.x - b.x) < 0.05 && Math.abs(a.z - b.z) < 0.1);
  const drift = freshCity(),
    grip = freshCity();
  for (const s of [drift, grip]) {
    s.x = CITY_SPAWN.x;
    s.z = CITY_SPAWN.z;
    s.vz = -7;
  }
  advance(drift, 0.5, ['KeyW', 'KeyD', 'ShiftLeft']);
  advance(grip, 0.5, ['KeyW', 'KeyD']);
  const slip = (s) =>
    Math.abs(s.vx * Math.cos(s.heading) + s.vz * Math.sin(s.heading));
  assert.ok(slip(drift) > slip(grip) + 0.8);
  assert.ok(drift.driftDistance > 0);
});
void test('high speed cannot tunnel through walls; the river admits a fall with explicit recovery', () => {
  const s = freshCity();
  const building = cityBuildings.find((b) => b.kind === 'borisova');
  s.x = building.x + building.w / 2 + 8;
  s.z = building.z;
  s.heading = -Math.PI / 2;
  s.vx = -12;
  advance(s, 2, ['KeyW']);
  assert.ok(!cityCarBlocked(s.x, s.z, s.heading));
  assert.ok(s.x > building.x + building.w / 2);
  assert.ok(s.bumps > 0);
  const bankX = CITY_ROUTES.western.at(-1).x;
  s.x = bankX;
  s.z = riverBankZ(bankX, -1) - 12;
  s.heading = Math.PI;
  s.vz = 12;
  s.vx = 0;
  advance(s, 2, ['KeyW']);
  assert.ok(
    s.flight.airborne || s.flight.waterTime > 0 || s.travelRevision > 0,
  );
  assert.ok(Number.isFinite(s.elevation));
  resetCityCar(s);
  assert.ok(!cityCarBlocked(s.x, s.z, s.heading));
});
void test('a mission needs an explicit action near a stop at low speed; no drift key autostarts', () => {
  const s = freshCity();
  s.x = cityStops[0].x;
  s.z = cityStops[0].z;
  advance(s, 0.1, ['ShiftLeft']);
  assert.equal(s.interaction, null);
  advance(s, 0.1, ['KeyE']);
  assert.equal(s.interaction, 'screen');
  s.interaction = null;
  advance(s, 0.1, ['KeyE']);
  assert.equal(s.interaction, null, 'held E is not repeated');
  const fast = freshCity();
  fast.x = cityStops[0].x;
  fast.z = cityStops[0].z;
  fast.vz = -8;
  advance(fast, 0.02, ['KeyE']);
  assert.equal(fast.interaction, null);
  const distant = freshCity();
  advance(distant, 0.1, ['KeyE']);
  assert.equal(distant.interaction, null);
});
void test('paused and invalid time cannot move the car', () => {
  const s = freshCity();
  s.paused = true;
  const before = structuredClone(s);
  tickCity(s, 1, new Set(['KeyW']));
  assert.deepEqual(s, before);
  s.paused = false;
  tickCity(s, NaN, new Set(['KeyW']));
  assert.equal(s.z, CITY_SPAWN.z);
});

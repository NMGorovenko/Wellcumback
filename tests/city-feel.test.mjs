import { CITY_TOP_SPEED } from '../lib/game/city/powertrain.ts';
import {
  CITY_ROUTES,
  BRIDGES,
  cityBuildings,
  cityRoads,
  riverBankZ,
} from '../lib/game/city/layout.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cityCarBlocked,
  freshCity,
  resetCityCar,
  tickCity,
} from '../lib/game/city/engine.ts';

const straightStart = CITY_ROUTES.studPlaneta.at(-2);
const streetCity = () => ({ ...freshCity(), ...straightStart, heading: 0 });
const advance = (s, seconds, keys = []) => {
  for (let i = 0; i < Math.round(seconds * 60); i++)
    tickCity(s, 1 / 60, new Set(keys));
};
const slip = (s) =>
  Math.abs(s.vx * Math.cos(s.heading) + s.vz * Math.sin(s.heading));

void test('Mustang accelerates promptly, coasts naturally, and brakes before reversing', () => {
  const accelerating = streetCity();
  advance(accelerating, 1, ['KeyW']);
  assert.ok(accelerating.speed > 8 && accelerating.speed <= 11);
  assert.equal(accelerating.bumps, 0);
  const coast = { ...streetCity(), vz: -10, speed: 10 };
  advance(coast, 1);
  assert.ok(
    coast.speed > 7.5 && coast.speed < 10,
    'lifting the throttle retains useful momentum',
  );
  assert.ok(
    straightStart.z - coast.z > 8,
    'the retained velocity actually moves the car',
  );
  const braking = { ...streetCity(), vz: -10, speed: 10 };
  let frames = 0;
  while (braking.vz < 0 && frames < 60) {
    tickCity(braking, 1 / 60, new Set(['KeyS']));
    frames++;
  }
  assert.ok(
    frames > 10 && frames < 36,
    'braking is progressive but stops within 0.6 seconds',
  );
  assert.ok(
    straightStart.z - braking.z < 3,
    'brakes remain useful near a story stop',
  );
  assert.ok(braking.speed < 0.5, 'reverse begins from near zero');
  const reverse = { ...streetCity() };
  advance(reverse, 1.5, ['KeyS']);
  assert.ok(
    reverse.vz > 5 && reverse.speed <= 6,
    'faster forwards does not increase reverse speed',
  );
  const rolling = { ...streetCity(), vz: -0.25, speed: 0.25 };
  advance(rolling, 4);
  assert.equal(
    rolling.speed,
    0,
    'rolling resistance eventually settles at rest',
  );
});

void test('a moderate-speed handbrake turn builds real lateral slip and releases smoothly', () => {
  const drifting = { ...streetCity(), vz: -4, speed: 4 };
  const gripping = structuredClone(drifting);
  advance(drifting, 0.4, ['KeyW', 'KeyD', 'ShiftLeft']);
  advance(gripping, 0.4, ['KeyW', 'KeyD']);
  assert.ok(drifting.drifting && drifting.driftDistance > 0);
  assert.ok(
    slip(drifting) > slip(gripping) + 2,
    'the drift is sideways motion, not only a visual flag',
  );
  assert.equal(drifting.bumps, 0);
  const prior = structuredClone(drifting);
  tickCity(drifting, 1 / 60, new Set());
  assert.ok(
    slip(drifting) > slip(prior) * 0.8,
    'releasing Space cannot snap velocity into the bonnet direction',
  );
  assert.ok(Math.hypot(drifting.vx - prior.vx, drifting.vz - prior.vz) < 0.5);
  assert.ok(
    drifting.drifting,
    'the visible slide survives the first released frame',
  );
  advance(drifting, 0.8);
  assert.ok(slip(drifting) < 0.3, 'rear grip recovers naturally');
  assert.ok(drifting.speed > 4, 'recovering grip does not stop the car');
  assert.equal(drifting.drifting, false);
  assert.equal(
    drifting.bumps,
    0,
    'this recovery runs in real unobstructed map space',
  );
  resetCityCar(drifting);
  assert.equal(drifting.driftBlend, 0);
});

void test('the higher forward limit cannot tunnel through buildings, banks, or bridge rails', () => {
  const straight = streetCity();
  advance(straight, 1.7, ['KeyW']);
  assert.ok(straight.speed > 13 && straight.speed <= CITY_TOP_SPEED);
  assert.equal(straight.bumps, 0);
  const building = cityBuildings.find((b) => b.kind === 'borisova');
  const bankX = CITY_ROUTES.western.at(-1).x;
  const [a, b] = BRIDGES[0].points;
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const nx = (b.z - a.z) / length,
    nz = -(b.x - a.x) / length;
  for (const state of [
    {
      x: building.x + building.w / 2 + 8,
      z: building.z,
      heading: -Math.PI / 2,
      vx: -CITY_TOP_SPEED,
      vz: 0,
    },
    {
      x: bankX,
      z: riverBankZ(bankX, -1) - 12,
      heading: Math.PI,
      vx: 0,
      vz: CITY_TOP_SPEED,
    },
    {
      x: (a.x + b.x) / 2,
      z: (a.z + b.z) / 2,
      heading: Math.atan2(nx, -nz),
      vx: nx * CITY_TOP_SPEED,
      vz: nz * CITY_TOP_SPEED,
    },
  ]) {
    const s = { ...streetCity(), ...state, speed: CITY_TOP_SPEED };
    for (let i = 0; i < 120; i++) {
      tickCity(s, 1 / 60, new Set(['KeyW']));
      assert.equal(
        cityCarBlocked(s.x, s.z, s.heading),
        false,
        'the complete car stays outside blockers on every step',
      );
      assert.ok(s.speed <= CITY_TOP_SPEED + 1e-8);
    }
    assert.ok(s.bumps > 0);
  }
});

void test('every confident forward turn enters a real automatic drift; Space amplifies it', () => {
  const make = () => ({ ...streetCity(), vz: -7, speed: 7 });
  const auto = make(),
    stronger = make(),
    straight = make();
  advance(auto, 0.6, ['KeyW', 'KeyD']);
  advance(stronger, 0.6, ['KeyW', 'KeyD', 'ShiftLeft']);
  advance(straight, 0.6, ['KeyW']);
  assert.ok(auto.drifting && auto.driftDistance > 3 && slip(auto) > 3);
  assert.ok(
    slip(stronger) > slip(auto) * 1.5,
    'handbrake still has a clear purpose',
  );
  assert.equal(straight.driftDistance, 0);
  assert.equal(straight.drifting, false);
  assert.equal(auto.bumps, 0);
  const before = slip(auto);
  tickCity(auto, 1 / 60, new Set());
  assert.ok(slip(auto) > before * 0.8, 'release never snaps the car straight');
  advance(auto, 1.2);
  assert.ok(
    slip(auto) < 0.3,
    'centred steering progressively catches the slide',
  );
});
void test('parking, reverse and small analog corrections retain precision', () => {
  for (const config of [
    { forward: -3, throttle: -1, steer: 1 },
    { forward: 1, throttle: 0, steer: 1 },
    { forward: 7, throttle: 1, steer: 0.1 },
  ]) {
    const s = {
      ...streetCity(),
      vz: -config.forward,
      speed: Math.abs(config.forward),
    };
    for (let i = 0; i < 24; i++) tickCity(s, 1 / 60, new Set(), config);
    assert.equal(s.driftBlend, 0);
    assert.equal(s.drifting, false);
    assert.equal(s.bumps, 0);
  }
});
void test('automatic drift trajectories match on 30, 60 and 144Hz displays', () => {
  const states = [30, 60, 144].map((hz) => {
    const s = { ...streetCity(), vz: -7, speed: 7 };
    for (let i = 0; i < hz; i++) tickCity(s, 1 / hz, new Set(['KeyW', 'KeyD']));
    return s;
  });
  for (const s of states) {
    assert.ok(s.drifting);
    assert.equal(s.bumps, 0);
    assert.ok(Math.hypot(s.x - states[0].x, s.z - states[0].z) < 0.3);
  }
});

void test('six-speed full throttle keeps pulling beyond the old ceiling while partial triggers stay gentle', () => {
  const road = cityRoads.find((r) => r.id === 'left-quay:1');
  const dx = road.to.x - road.from.x,
    dz = road.to.z - road.from.z,
    length = Math.hypot(dx, dz);
  const full = {
      ...streetCity(),
      x: road.from.x + (dx / length) * 15,
      z: road.from.z + (dz / length) * 15,
      heading: Math.atan2(dx, -dz),
    },
    partial = streetCity();
  const marks = new Map();
  for (let i = 0; i < 1500; i++) {
    tickCity(full, 1 / 60, new Set(['KeyW']));
    if (i < 30)
      tickCity(partial, 1 / 60, new Set(), { throttle: 0.25, steer: 0 });
    for (const speed of [18, 100 / 3.6, 200 / 3.6, CITY_TOP_SPEED - 0.01])
      if (full.speed >= speed && !marks.has(speed))
        marks.set(speed, (i + 1) / 60);
  }
  assert.ok(
    partial.speed < 2,
    'a quarter trigger remains suitable for parking',
  );
  assert.ok(
    marks.get(18) > 2 && marks.get(18) < 2.8,
    'launch still reaches the former 65 km/h ceiling quickly',
  );
  assert.ok(
    marks.get(100 / 3.6) > 3.5 && marks.get(100 / 3.6) < 4.5,
    'sustained torque reaches 100 km/h with readable shift pauses',
  );
  assert.ok(
    marks.get(200 / 3.6) > 9 && marks.get(200 / 3.6) < 12,
    '200 km/h needs a sustained straight after the strong launch',
  );
  assert.ok(
    marks.get(CITY_TOP_SPEED - 0.01) > 22 &&
      marks.get(CITY_TOP_SPEED - 0.01) < 30,
    '300 km/h builds progressively rather than arriving instantly',
  );
  assert.equal(CITY_TOP_SPEED * 3.6, 300);
  assert.equal(full.powertrain.gear, 6);
  assert.equal(full.bumps, 0);
});
void test('fractional refresh periods cannot silently lose a city simulation tick', () => {
  const states = [30, 60, 144].map((hz) => {
    const s = streetCity();
    for (let i = 0; i < hz * 2; i++) tickCity(s, 1 / hz, new Set(['KeyW']));
    return s;
  });
  for (const s of states) {
    assert.ok(Math.abs(s.elapsed - 2) < 1e-9);
    assert.ok(Math.abs(s.z - states[0].z) < 1e-8);
    assert.ok(s.accumulator >= 0 && s.accumulator < 1 / 60);
  }
});

void test('higher speed power limiting never makes a partial trigger stronger than full throttle', () => {
  for (const speed of [24, 30, 55, 75, CITY_TOP_SPEED - 0.1]) {
    const accelerations = [0.25, 0.5, 0.75, 0.9, 1].map((throttle) => {
      const s = {
        ...streetCity(),
        vx: 0,
        vz: -speed,
        speed,
      };
      s.powertrain.gear = 6;
      s.powertrain.shiftReadyAt = 100;
      tickCity(s, 1 / 60, new Set(), { throttle, steer: 0 });
      return (-s.vz - speed) * 60;
    });
    for (let i = 1; i < accelerations.length; i++)
      assert.ok(accelerations[i] >= accelerations[i - 1]);
  }
});

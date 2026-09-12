import { CITY_SPAWN, BRIDGES } from '../lib/game/city/layout.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cityCarBlocked,
  freshCity,
  resetCityCar,
  tickCity,
} from '../lib/game/city/engine.ts';

const advance = (s, seconds, keys = []) => {
  for (let i = 0; i < Math.round(seconds * 60); i++)
    tickCity(s, 1 / 60, new Set(keys));
};
const slip = (s) =>
  Math.abs(s.vx * Math.cos(s.heading) + s.vz * Math.sin(s.heading));

void test('Mustang accelerates promptly, coasts naturally, and brakes before reversing', () => {
  const accelerating = freshCity();
  advance(accelerating, 1, ['KeyW']);
  assert.ok(accelerating.speed > 11 && accelerating.speed <= 18);
  assert.equal(accelerating.bumps, 0);
  const coast = { ...freshCity(), vz: -10, speed: 10 };
  advance(coast, 1);
  assert.ok(
    coast.speed > 7.5 && coast.speed < 10,
    'lifting the throttle retains useful momentum',
  );
  assert.ok(
    CITY_SPAWN.z - coast.z > 8,
    'the retained velocity actually moves the car',
  );
  const braking = { ...freshCity(), vz: -10, speed: 10 };
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
    CITY_SPAWN.z - braking.z < 3,
    'brakes remain useful near a story stop',
  );
  assert.ok(braking.speed < 0.5, 'reverse begins from near zero');
  const reverse = { ...freshCity(), z: 0 };
  advance(reverse, 1.5, ['KeyS']);
  assert.ok(
    reverse.vz > 5 && reverse.speed <= 6,
    'faster forwards does not increase reverse speed',
  );
  const rolling = { ...freshCity(), z: 0, vz: -0.25, speed: 0.25 };
  advance(rolling, 4);
  assert.equal(
    rolling.speed,
    0,
    'rolling resistance eventually settles at rest',
  );
});

void test('a moderate-speed handbrake turn builds real lateral slip and releases smoothly', () => {
  const drifting = { ...freshCity(), vz: -4, speed: 4 };
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
  const straight = freshCity();
  advance(straight, 1.7, ['KeyW']);
  assert.ok(straight.speed > 17 && straight.speed <= 18);
  assert.equal(straight.bumps, 0);
  for (const state of [
    { x: -92, z: -16, heading: -Math.PI / 2, vx: -18, vz: 0 },
    { x: 0, z: 25, heading: 0, vx: 0, vz: -18 },
    { x: BRIDGES[0].x, z: BRIDGES[0].z, heading: Math.PI / 2, vx: 18, vz: 0 },
  ]) {
    const s = { ...freshCity(), ...state, speed: 18 };
    for (let i = 0; i < 120; i++) {
      tickCity(s, 1 / 60, new Set(['KeyW']));
      assert.equal(
        cityCarBlocked(s.x, s.z, s.heading),
        false,
        'the complete car stays outside blockers on every step',
      );
      assert.ok(s.speed <= 18 + 1e-8);
    }
    assert.ok(s.bumps > 0);
  }
});

void test('every confident forward turn enters a real automatic drift; Space amplifies it', () => {
  const make = () => ({ ...freshCity(), z: 0, vz: -7, speed: 7 });
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
      ...freshCity(),
      z: 0,
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
    const s = { ...freshCity(), z: 0, vz: -7, speed: 7 };
    for (let i = 0; i < hz; i++) tickCity(s, 1 / hz, new Set(['KeyW', 'KeyD']));
    return s;
  });
  for (const s of states) {
    assert.ok(s.drifting);
    assert.equal(s.bumps, 0);
    assert.ok(Math.hypot(s.x - states[0].x, s.z - states[0].z) < 0.3);
  }
});

void test('full throttle reaches the stronger launch while partial triggers stay gentle', () => {
  const full = freshCity(),
    partial = freshCity();
  for (let i = 0; i < 30; i++) {
    tickCity(full, 1 / 60, new Set(['KeyW']));
    tickCity(partial, 1 / 60, new Set(), { throttle: 0.25, steer: 0 });
  }
  assert.ok(
    full.speed > 10.5 && full.speed < 11.3,
    'strong launch after half a second',
  );
  assert.ok(
    partial.speed < 2,
    'a quarter trigger remains suitable for parking',
  );
  for (let i = 0; i < 24; i++) tickCity(full, 1 / 60, new Set(['KeyW']));
  assert.ok(
    full.speed >= 17.9 && full.speed <= 18,
    'full speed in under a second',
  );
});
void test('fractional refresh periods cannot silently lose a city simulation tick', () => {
  const states = [30, 60, 144].map((hz) => {
    const s = freshCity();
    for (let i = 0; i < hz * 2; i++) tickCity(s, 1 / hz, new Set(['KeyW']));
    return s;
  });
  for (const s of states) {
    assert.ok(Math.abs(s.elapsed - 2) < 1e-9);
    assert.ok(Math.abs(s.z - states[0].z) < 1e-8);
    assert.ok(s.accumulator >= 0 && s.accumulator < 1 / 60);
  }
});

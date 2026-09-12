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

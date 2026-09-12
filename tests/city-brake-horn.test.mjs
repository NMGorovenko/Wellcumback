import test from 'node:test';
import assert from 'node:assert/strict';
import { freshCity, tickCity } from '../lib/game/city/engine.ts';
import { createPadInput, mapGamepads } from '../lib/game/input/gamepads.ts';

const movingForward = () => ({ ...freshCity(), vz: -12, speed: 12 });
void test('a light brake request slows forward motion smoothly instead of imposing the reverse speed cap', () => {
  const coast = movingForward(),
    light = movingForward(),
    strong = movingForward();
  tickCity(coast, 1 / 60, new Set(), { throttle: 0, steer: 0 });
  tickCity(light, 1 / 60, new Set(), { throttle: -0.001, steer: 0 });
  tickCity(strong, 1 / 60, new Set(), { throttle: -0.5, steer: 0 });
  assert.ok(light.speed < coast.speed);
  assert.ok(
    coast.speed - light.speed < 0.01,
    'barely touching the trigger causes only a small braking change',
  );
  assert.ok(
    strong.speed < light.speed,
    'a stronger trigger press brakes harder',
  );
  assert.ok(
    strong.speed > 10,
    'braking forward cannot instantly cut speed to the reverse limit',
  );
  assert.ok(light.vz < 0 && strong.vz < 0);
});
void test('moving backwards keeps the reverse speed cap even after releasing the brake trigger', () => {
  for (const throttle of [-1, 0, 1]) {
    const city = { ...freshCity(), z: 0, vz: 6.5, speed: 6.5 };
    tickCity(city, 1 / 60, new Set(), { throttle, steer: 0 });
    assert.ok(city.vz > 0);
    assert.ok(
      city.speed <= 6 + 1e-8,
      'actual backwards movement stays limited regardless of pedal sign',
    );
  }
});
void test('local keyboard horn fires once per press, pauses safely, and rearms after release', () => {
  const city = freshCity();
  tickCity(city, 1 / 60, new Set(['KeyQ']));
  assert.match(city.radio, /Бип-бип/);
  const until = city.radioUntil;
  tickCity(city, 0.1, new Set(['KeyQ']));
  assert.equal(
    city.radioUntil,
    until,
    'holding the horn does not refresh the radio every frame',
  );
  tickCity(city, 1 / 60, new Set());
  city.paused = true;
  tickCity(city, 0.1, new Set(['KeyQ']));
  assert.equal(city.radioUntil, until);
  city.paused = false;
  tickCity(city, 1 / 60, new Set(['KeyQ']));
  assert.ok(city.radioUntil > until);
});
void test('a standard controller horn reaches the same engine action, including an older snapshot', () => {
  const pad = (pressed = false) => ({
    id: 'DualSense',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: i === 5 && pressed,
      value: Number(i === 5 && pressed),
    })),
  });
  const memory = createPadInput();
  mapGamepads(memory, [pad()], 1, 'city');
  const input = mapGamepads(memory, [pad(true)], 1, 'city');
  const city = freshCity();
  delete city.previousHorn;
  tickCity(city, 1 / 60, input.keys, input.drive);
  assert.equal(city.previousHorn, true);
  assert.match(city.radio, /Бип-бип/);
  assert.equal(city.speed, 0);
});

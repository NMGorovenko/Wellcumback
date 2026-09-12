import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultControlSettings,
  mapPhysicalKeys,
  rebindControl,
  parseControlSettings,
} from '../lib/game/input/settings.ts';
import {
  createPadInput,
  mapGamepads,
  resetPadInput,
  gamepadPrompt,
  keyboardPrompt,
} from '../lib/game/input/gamepads.ts';
import { resolveDrive } from '../lib/game/input/drive.ts';
import { freshCity, tickCity } from '../lib/game/city/engine.ts';
import { readPeerPacket } from '../lib/game/network/protocol.ts';
const pad = (buttons = {}, axes = [0, 0], id = 'DualSense', index = 0) => ({
  id,
  index,
  connected: true,
  mapping: 'standard',
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({
    pressed: (buttons[i] ?? 0) > 0.5,
    value: buttons[i] ?? 0,
  })),
});
const driveFrame = (raw) => {
  const memory = createPadInput();
  mapGamepads(memory, [pad({}, [0, 0], raw.id, raw.index)], 1, 'city');
  return mapGamepads(memory, [raw], 1, 'city');
};
void test('Space drifts on the map and never enters a nearby mission; game action alias is preserved', () => {
  const settings = defaultControlSettings();
  const keys = mapPhysicalKeys(settings, ['Space'], 'city');
  assert.deepEqual([...keys], ['ShiftLeft']);
  assert.equal(mapPhysicalKeys(settings, ['ShiftLeft'], 'city').size, 0);
  assert.deepEqual([...mapPhysicalKeys(settings, ['Space'])], ['KeyE']);
  const city = freshCity();
  city.z = 10;
  tickCity(city, 0.1, keys);
  assert.equal(city.interaction, null);
  tickCity(city, 0.1, mapPhysicalKeys(settings, ['KeyE'], 'city'));
  assert.equal(city.interaction, 'screen');
});
void test('vehicle settings migrate independently and cannot silently overwrite game bindings', () => {
  const defaults = defaultControlSettings();
  const old = {
    version: 1,
    keys: { ...defaults.keys, KeyE: 'KeyZ' },
    showWorldPrompts: false,
  };
  const migrated = parseControlSettings(JSON.stringify(old));
  assert.equal(migrated.keys.KeyE, 'KeyZ');
  assert.equal(migrated.cityKeys.ShiftLeft, 'Space');
  assert.equal(rebindControl(migrated, 'ShiftLeft', 'KeyE', 'city').ok, false);
  const changed = rebindControl(migrated, 'ShiftLeft', 'ShiftLeft', 'city');
  assert.equal(changed.ok, true);
  assert.equal(changed.settings.keys.ShiftLeft, 'ShiftLeft');
  assert.deepEqual(
    [...mapPhysicalKeys(changed.settings, ['ShiftLeft'], 'city')],
    ['ShiftLeft'],
  );
  const broken = parseControlSettings(
    JSON.stringify({ ...changed.settings, cityKeys: { KeyE: 'broken' } }),
  );
  assert.equal(broken.keys.KeyE, 'KeyZ');
  assert.deepEqual(broken.cityKeys, defaults.cityKeys);
});
void test('car uses analog triggers and steering, square/X drift, south action and correct labels', () => {
  const frame = driveFrame(pad({ 7: 0.35, 2: 1, 0: 1 }, [0.5, -0.9]));
  assert.ok(frame.drive.throttle > 0.3 && frame.drive.throttle < 0.4);
  assert.ok(frame.drive.steer > 0.4 && frame.drive.steer < 0.5);
  assert.deepEqual([...frame.keys].sort(), ['KeyE', 'ShiftLeft']);
  assert.equal(gamepadPrompt(frame, 0, 'secondary', 'city'), '□');
  assert.equal(gamepadPrompt(frame, 0, 'vertical', 'city'), 'R2 / L2');
  assert.equal(keyboardPrompt(0, 'secondary', 'city'), 'Пробел');
  const xbox = driveFrame(pad({ 6: 0.7 }, [0, 0], 'Xbox Wireless Controller'));
  assert.ok(xbox.drive.throttle < -0.6);
  assert.equal(gamepadPrompt(xbox, 0, 'secondary', 'city'), 'X');
  const s = freshCity(),
    full = freshCity();
  for (let i = 0; i < 40; i++) {
    tickCity(s, 1 / 60, new Set(), { throttle: 0.35, steer: 0 });
    tickCity(full, 1 / 60, new Set(), { throttle: 1, steer: 0 });
  }
  assert.ok(full.speed > s.speed * 2);
  assert.ok(s.speed > 0);
});
void test('hotplug and resumed car need neutral triggers/stick; jitter cannot move the car', () => {
  const memory = createPadInput();
  for (const held of [
    pad({ 7: 0.2 }),
    pad({ 6: 0.2 }),
    pad({}, [0.2, 0]),
    pad({ 2: 1 }),
  ]) {
    resetPadInput(memory);
    const frame = mapGamepads(memory, [held], 1, 'city');
    assert.equal(frame.assignments[0].ready, false);
    assert.deepEqual(frame.drive, { throttle: 0, steer: 0 });
  }
  mapGamepads(memory, [pad({}, [0.1, 0])], 1, 'city');
  const ready = mapGamepads(
    memory,
    [pad({ 7: 0.03, 6: 0.02 }, [0.1, 0])],
    1,
    'city',
  );
  assert.deepEqual(ready.drive, { throttle: 0, steer: 0 });
  assert.ok(mapGamepads(memory, [pad({ 7: 1 })], 1, 'city').drive.throttle > 0);
  assert.deepEqual(mapGamepads(memory, [], 1, 'city').drive, {
    throttle: 0,
    steer: 0,
  });
});
void test('neutral pad does not cancel keyboard axes and simultaneous opposite keys stop that axis', () => {
  assert.deepEqual(
    resolveDrive(new Set(['KeyW']), { throttle: 0, steer: 0.4 }),
    { throttle: 1, steer: 0.4 },
  );
  assert.deepEqual(
    resolveDrive(new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD']), {
      throttle: 1,
      steer: 1,
    }),
    { throttle: 0, steer: 0 },
  );
});
void test('network accepts bounded analog axes and rejects malformed driving values', () => {
  const packet = {
    type: 'input',
    version: 1,
    seq: 2,
    epoch: 1,
    keys: [],
    drive: { throttle: 0.35, steer: -0.4 },
  };
  assert.deepEqual(readPeerPacket(JSON.stringify(packet)).drive, packet.drive);
  for (const drive of [
    { throttle: 1.01, steer: 0 },
    { throttle: 0, steer: '1' },
    null,
    [],
    { throttle: 0 },
  ])
    assert.equal(readPeerPacket(JSON.stringify({ ...packet, drive })), null);
});

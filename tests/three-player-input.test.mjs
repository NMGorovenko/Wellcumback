import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYER_BINDINGS,
  createPadInput,
  mapGamepads,
  keyboardPrompt,
} from '../lib/game/input/gamepads.ts';
import {
  RACE_KEYS,
  defaultControlSettings,
  parseControlSettings,
  canonicalKeyForPhysical,
  mapPhysicalKeys,
  rebindControl,
  bindingName,
} from '../lib/game/input/settings.ts';
const firstTwo = PLAYER_BINDINGS.slice(0, 2).flatMap((b) => Object.values(b));
const third = Object.values(PLAYER_BINDINGS[2]);
const legacy = () => {
  const saved = defaultControlSettings();
  saved.raceKeys = Object.fromEntries(
    firstTwo.map((key) => [key, saved.raceKeys[key]]),
  );
  return saved;
};
const pad = (index, buttons = [], axes = [0, 0], id = `pad-${index}`) => ({
  index,
  id,
  mapping: 'standard',
  connected: true,
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({
    pressed: buttons.includes(i),
    value: buttons.includes(i) ? 1 : 0,
  })),
});
void test('three race keyboard layouts stay isolated and name all third-player controls correctly', () => {
  const s = defaultControlSettings();
  assert.equal(RACE_KEYS.length, 18);
  assert.deepEqual(
    [
      ...mapPhysicalKeys(
        s,
        ['KeyI', 'KeyJ', 'KeyK', 'KeyL', 'KeyO', 'KeyU'],
        'race',
      ),
    ].sort(),
    [...third].sort(),
  );
  for (const key of firstTwo)
    assert.equal(canonicalKeyForPhysical(s, s.raceKeys[key], 'race'), key);
  assert.equal(bindingName('KeyO', 'race'), 'Игрок 3 · Вернуться на трассу');
  assert.equal(bindingName('KeyU', 'race'), 'Игрок 3 · Дрифт');
  assert.equal(keyboardPrompt(2, 'vertical', 'race'), 'I/K');
  const edited = rebindControl(s, 'KeyO', 'KeyZ', 'race');
  assert.equal(edited.ok, true);
  assert.equal(
    canonicalKeyForPhysical(edited.settings, 'KeyZ', 'race'),
    'KeyO',
  );
  assert.equal(canonicalKeyForPhysical(edited.settings, 'KeyO', 'race'), null);
  const conflict = rebindControl(s, 'KeyO', 'KeyW', 'race');
  assert.equal(conflict.ok, false);
  assert.equal(conflict.conflict, 'KeyW');
  assert.match(conflict.reason, /Игрок 1/);
});
void test('a legacy two-player race save keeps both custom layouts and gains normal third-player keys', () => {
  const saved = legacy();
  saved.raceKeys.KeyE = 'KeyZ';
  saved.raceKeys.Enter = 'KeyX';
  saved.padGlyphs = ['playstation', 'xbox', 'generic'];
  saved.showWorldPrompts = false;
  saved.showFps = true;
  const parsed = parseControlSettings(JSON.stringify(saved));
  for (const key of firstTwo)
    assert.equal(parsed.raceKeys[key], saved.raceKeys[key], key);
  for (const key of third) assert.equal(parsed.raceKeys[key], key, key);
  assert.deepEqual(parsed.keys, saved.keys);
  assert.deepEqual(parsed.cityKeys, saved.cityKeys);
  assert.deepEqual(parsed.padGlyphs, saved.padGlyphs);
  assert.equal(parsed.showWorldPrompts, false);
  assert.equal(parsed.showFps, true);
  assert.deepEqual(
    parseControlSettings(JSON.stringify(parsed)),
    parsed,
    'save/load after migration is stable',
  );
});
void test('legacy bindings using every IJKL/O/U key win; added controls receive unique usable fallbacks', () => {
  const saved = legacy();
  Object.values(PLAYER_BINDINGS[0]).forEach(
    (key, i) => (saved.raceKeys[key] = third[i]),
  );
  const parsed = parseControlSettings(JSON.stringify(saved));
  for (const key of firstTwo)
    assert.equal(parsed.raceKeys[key], saved.raceKeys[key], key);
  assert.equal(new Set(Object.values(parsed.raceKeys)).size, 18);
  assert.deepEqual(
    [
      ...mapPhysicalKeys(
        parsed,
        third.map((key) => parsed.raceKeys[key]),
        'race',
      ),
    ].sort(),
    [...third].sort(),
  );
  for (const key of third) assert.notEqual(parsed.raceKeys[key], key);
  assert.deepEqual(parseControlSettings(JSON.stringify(parsed)), parsed);
});
void test('valid saved third controls survive reload, corrupt third controls do not erase players one and two', () => {
  const saved = defaultControlSettings();
  saved.raceKeys.KeyE = 'KeyZ';
  saved.raceKeys.KeyO = 'KeyX';
  assert.deepEqual(parseControlSettings(JSON.stringify(saved)), saved);
  const corrupt = structuredClone(saved);
  corrupt.raceKeys.KeyO = 'Escape';
  const parsed = parseControlSettings(JSON.stringify(corrupt));
  for (const key of firstTwo)
    assert.equal(parsed.raceKeys[key], saved.raceKeys[key]);
  assert.equal(parsed.raceKeys.KeyO, 'KeyO');
  assert.equal(new Set(Object.values(parsed.raceKeys)).size, 18);
});
void test('third sparse pad owns only third race axes, reset and handbrake; disconnect cannot leave held input', () => {
  const memory = createPadInput();
  mapGamepads(memory, [pad(2), pad(8), pad(17)], 3, 'race');
  const f = mapGamepads(
    memory,
    [pad(2), pad(8), pad(17, [7, 2, 3], [-1, 0])],
    3,
    'race',
  );
  assert.deepEqual(
    f.assignments.map((p) => [p.index, p.player]),
    [
      [2, 0],
      [8, 1],
      [17, 2],
    ],
  );
  assert.deepEqual(f.raceDrives, [
    { throttle: 0, steer: 0 },
    { throttle: 0, steer: 0 },
    { throttle: 1, steer: -1 },
  ]);
  assert.deepEqual([...f.keys].sort(), ['KeyO', 'KeyU']);
  const gone = mapGamepads(memory, [pad(2), pad(8)], 3, 'race');
  assert.deepEqual(gone.raceDrives[2], { throttle: 0, steer: 0 });
  assert.equal(gone.keys.size, 0);
  const held = mapGamepads(
    memory,
    [pad(2), pad(8), pad(17, [7, 2, 3], [-1, 0], 'new')],
    3,
    'race',
  );
  assert.equal(held.assignments[2].ready, false);
  assert.equal(held.keys.size, 0);
  assert.deepEqual(held.raceDrives[2], { throttle: 0, steer: 0 });
  mapGamepads(memory, [pad(2), pad(8), pad(17, [], [0, 0], 'new')], 3, 'race');
  assert.equal(
    mapGamepads(
      memory,
      [pad(2), pad(8), pad(17, [7], [0, 0], 'new')],
      3,
      'race',
    ).raceDrives[2].throttle,
    1,
  );
});
void test('one pad remains keyboard player one’s partner when three racers are configured', () => {
  const memory = createPadInput();
  mapGamepads(memory, [pad(17)], 3, 'race');
  const f = mapGamepads(memory, [pad(17, [7])], 3, 'race');
  assert.equal(f.assignments[0].player, 1);
  assert.deepEqual(f.raceDrives, [
    { throttle: 0, steer: 0 },
    { throttle: 1, steer: 0 },
    { throttle: 0, steer: 0 },
  ]);
});

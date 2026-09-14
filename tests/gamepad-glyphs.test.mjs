import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTROL_STORAGE_KEY,
  defaultControlSettings,
  loadControlSettings,
  parseControlSettings,
  rebindControl,
  saveControlSettings,
} from '../lib/game/input/settings.ts';
import {
  getControlSettings,
  initializeControlSettings,
  resetControlSettings,
  setPadGlyphPreference,
  subscribeControlSettings,
} from '../lib/game/input/settings-store.ts';
import {
  createPadInput,
  gamepadPrompt,
  identifyGamepad,
  mapGamepads,
} from '../lib/game/input/gamepads.ts';

const pad = (index, id, buttons = [], mapping = 'standard') => ({
  index,
  id,
  mapping,
  connected: true,
  axes: [0, 0],
  buttons: Array.from({ length: 17 }, (_, i) => ({
    pressed: buttons.includes(i),
    value: Number(buttons.includes(i)),
  })),
});
const xbox =
  'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
const sony =
  'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';

test.afterEach(() => resetControlSettings());

await test('auto glyphs follow browser-reported Xbox and PlayStation identities, with a positional fallback', () => {
  for (const [id, brand, action] of [
    [xbox, 'xbox', 'A'],
    ['Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'xbox', 'A'],
    ['045e-0b20-Controller', 'xbox', 'A'],
    ['Xbox Elite Wireless Controller Series 2', 'xbox', 'A'],
    [sony, 'playstation', '×'],
    ['054c-09cc-Wireless Controller', 'playstation', '×'],
    ['DualSense Edge Wireless Controller', 'playstation', '×'],
    ['Wireless Controller', 'generic', 'нижняя кнопка'],
    ['8BitDo Pro 2', 'generic', 'нижняя кнопка'],
  ]) {
    assert.equal(identifyGamepad(id).brand, brand);
    const frame = mapGamepads(createPadInput(), [pad(9, id)]);
    assert.equal(gamepadPrompt(frame, 0, 'action'), action, id);
  }
});

await test('three local players can choose different glyphs without changing detected device identity', () => {
  const frame = mapGamepads(
    createPadInput(),
    [pad(18, 'Unknown USB pad'), pad(7, xbox), pad(12, sony)],
    3,
  );
  const identities = structuredClone(frame.assignments);
  assert.deepEqual(
    [0, 1, 2].map((p) => gamepadPrompt(frame, p, 'action')),
    ['A', '×', 'нижняя кнопка'],
  );
  assert.equal(setPadGlyphPreference(0, 'playstation'), true);
  assert.equal(setPadGlyphPreference(1, 'xbox'), true);
  assert.equal(setPadGlyphPreference(2, 'generic'), true);
  assert.deepEqual(
    [0, 1, 2].map((p) => gamepadPrompt(frame, p, 'action')),
    ['×', 'A', 'нижняя кнопка'],
  );
  assert.equal(gamepadPrompt(frame, 0, 'action', 'race'), '△');
  assert.equal(gamepadPrompt(frame, 1, 'action', 'race'), 'Y');
  assert.equal(gamepadPrompt(frame, 0, 'vertical', 'city'), 'R2 / L2');
  assert.equal(gamepadPrompt(frame, 1, 'secondary', 'race'), 'X');
  assert.deepEqual(
    frame.assignments,
    identities,
    'manual labels do not claim a different detected device',
  );
  setPadGlyphPreference(0, 'auto');
  assert.equal(
    gamepadPrompt(frame, 0, 'action'),
    'A',
    'auto restores detection immediately',
  );
});

await test('override follows the playable local slot rather than a sparse browser index', () => {
  setPadGlyphPreference(0, 'xbox');
  setPadGlyphPreference(1, 'playstation');
  const frame = mapGamepads(
    createPadInput(),
    [pad(14, 'Wireless Controller')],
    2,
  );
  assert.equal(frame.assignments[0].player, 1);
  assert.equal(gamepadPrompt(frame, 1, 'action'), '×');
  assert.equal(
    gamepadPrompt(frame, 0, 'action'),
    null,
    'keyboard player does not acquire an imaginary pad',
  );
  const afterSwap = mapGamepads(createPadInput(), [pad(3, xbox)], 2);
  setPadGlyphPreference(1, 'auto');
  assert.equal(
    gamepadPrompt(afterSwap, 1, 'action'),
    'A',
    'auto follows a replacement device',
  );
});

await test('glyph changes do not alter standard button mapping or driving axes in any profile', () => {
  for (const profile of ['game', 'city', 'race']) {
    const sample = (preference) => {
      setPadGlyphPreference(0, preference);
      setPadGlyphPreference(1, preference);
      const input = createPadInput();
      const players = profile === 'city' ? 1 : 2;
      mapGamepads(input, [pad(0, xbox), pad(8, sony)], players, profile);
      return mapGamepads(
        input,
        [
          pad(0, xbox, [0, 2, 3, 5, 6, 7, 15]),
          pad(8, sony, [0, 2, 3, 5, 6, 7, 14]),
        ],
        players,
        profile,
      );
    };
    const detected = sample('auto'),
      overridden = sample('playstation');
    assert.deepEqual(overridden.keys, detected.keys, profile);
    assert.deepEqual(overridden.drive, detected.drive, profile);
    assert.deepEqual(overridden.raceDrives, detected.raceDrives, profile);
    assert.equal(
      overridden.primaryActionPressed,
      detected.primaryActionPressed,
      profile,
    );
    assert.deepEqual(overridden.assignments, detected.assignments, profile);
  }
});

await test('manual glyphs never make a nonstandard or disconnected controller supported', () => {
  setPadGlyphPreference(0, 'xbox');
  const unsupported = mapGamepads(createPadInput(), [pad(4, sony, [0], '')]);
  assert.deepEqual(unsupported.unsupported, [4]);
  assert.equal(unsupported.keys.size, 0);
  assert.equal(gamepadPrompt(unsupported, 0, 'action'), null);
  const disconnected = mapGamepads(createPadInput(), [
    { ...pad(4, xbox), connected: false },
  ]);
  assert.equal(gamepadPrompt(disconnected, 0, 'action'), null);
});

await test('v1 saves retain keyboard preferences and validate each of the three glyph entries independently', () => {
  const changed = rebindControl(defaultControlSettings(), 'KeyE', 'KeyZ');
  assert.equal(changed.ok, true);
  const legacy = { ...changed.settings, showWorldPrompts: false };
  delete legacy.padGlyphs;
  const migrated = parseControlSettings(JSON.stringify(legacy));
  assert.deepEqual(migrated.padGlyphs, ['auto', 'auto', 'auto']);
  assert.equal(migrated.keys.KeyE, 'KeyZ');
  assert.equal(migrated.showWorldPrompts, false);
  const partial = parseControlSettings(
    JSON.stringify({
      ...legacy,
      padGlyphs: ['playstation', 'dualsense', 'xbox', 'generic'],
    }),
  );
  assert.deepEqual(partial.padGlyphs, ['playstation', 'auto', 'xbox']);
  assert.deepEqual(partial.keys, migrated.keys);
  for (const malformed of [null, 'xbox', { 0: 'xbox' }, [false, {}, 7]]) {
    const recovered = parseControlSettings(
      JSON.stringify({ ...legacy, padGlyphs: malformed }),
    );
    assert.deepEqual(recovered.padGlyphs, ['auto', 'auto', 'auto']);
    assert.deepEqual(recovered.cityKeys, migrated.cityKeys);
    assert.deepEqual(recovered.raceKeys, migrated.raceKeys);
  }
});

await test('glyph choices persist through the settings store and storage events update labels', () => {
  let raw = JSON.stringify(defaultControlSettings());
  const storage = {
    getItem: (key) => {
      assert.equal(key, CONTROL_STORAGE_KEY);
      return raw;
    },
    setItem: (key, value) => {
      assert.equal(key, CONTROL_STORAGE_KEY);
      raw = value;
    },
  };
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const events = new Map();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: storage,
      addEventListener: (name, fn) => events.set(name, fn),
    },
  });
  const unsubscribe = subscribeControlSettings(() => {});
  try {
    initializeControlSettings();
    setPadGlyphPreference(0, 'generic');
    setPadGlyphPreference(1, 'playstation');
    setPadGlyphPreference(2, 'xbox');
    assert.deepEqual(loadControlSettings(storage).settings.padGlyphs, [
      'generic',
      'playstation',
      'xbox',
    ]);
    assert.equal(saveControlSettings(storage, getControlSettings()), null);
    const frame = mapGamepads(createPadInput(), [pad(0, xbox)]);
    assert.equal(gamepadPrompt(frame, 0, 'action'), 'нижняя кнопка');
    events.get('storage')({
      key: CONTROL_STORAGE_KEY,
      newValue: JSON.stringify({
        ...getControlSettings(),
        padGlyphs: ['playstation', 'xbox', 'generic'],
      }),
    });
    assert.equal(gamepadPrompt(frame, 0, 'action'), '×');
    assert.deepEqual(getControlSettings().padGlyphs, [
      'playstation',
      'xbox',
      'generic',
    ]);
  } finally {
    unsubscribe();
    if (originalWindow)
      Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  }
});

await test('invalid glyph settings cannot mutate another player or keyboard mappings', () => {
  const before = getControlSettings();
  for (const player of [-1, 3, 0.5, NaN, Infinity])
    assert.equal(setPadGlyphPreference(player, 'xbox'), false);
  for (const preference of ['Auto', 'dualsense', null, {}, 0])
    assert.equal(setPadGlyphPreference(0, preference), false);
  assert.equal(getControlSettings(), before);
  setPadGlyphPreference(1, 'xbox');
  assert.deepEqual(getControlSettings().keys, before.keys);
  assert.deepEqual(getControlSettings().cityKeys, before.cityKeys);
  assert.deepEqual(getControlSettings().raceKeys, before.raceKeys);
  assert.deepEqual(getControlSettings().padGlyphs, ['auto', 'xbox', 'auto']);
  assert.deepEqual(
    before.padGlyphs,
    ['auto', 'auto', 'auto'],
    'published settings are immutable',
  );
});

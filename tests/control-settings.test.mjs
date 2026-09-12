import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_KEYS,
  CONTROL_STORAGE_KEY,
  defaultControlSettings,
  rebindControl,
  canonicalKeyForPhysical,
  mapPhysicalKeys,
  parseControlSettings,
  loadControlSettings,
  saveControlSettings,
  physicalKeyLabel,
} from '../lib/game/input/settings.ts';
import {
  acquireControlInputBlock,
  isControlInputBlocked,
  setControlBinding,
  resetControlSettings,
  setWorldPrompts,
  getControlSettings,
} from '../lib/game/input/settings-store.ts';
import {
  createPadInput,
  mapGamepads,
  mergeInputKeys,
  keyPrompt,
  keyboardPrompt,
} from '../lib/game/input/gamepads.ts';
import { screenPromptInput } from '../lib/game/screen/prompts.ts';
import { createScreenEpisode } from '../lib/game/screen/episodes.ts';
import { tick } from '../lib/game/screen/engine.ts';
const rebound = (settings, canonical, physical) => {
  const result = rebindControl(settings, canonical, physical);
  assert.equal(result.ok, true, result.reason);
  return result.settings;
};

void test('a remapped key replaces the old key instead of falling through to canonical engine commands', () => {
  let settings = rebound(defaultControlSettings(), 'KeyE', 'KeyZ');
  assert.equal(canonicalKeyForPhysical(settings, 'KeyZ'), 'KeyE');
  assert.equal(canonicalKeyForPhysical(settings, 'KeyE'), null);
  assert.equal(canonicalKeyForPhysical(settings, 'Space'), 'KeyE');
  settings = rebound(settings, 'KeyQ', 'KeyE');
  assert.equal(canonicalKeyForPhysical(settings, 'KeyE'), 'KeyQ');
  assert.equal(canonicalKeyForPhysical(settings, 'KeyQ'), null);
  for (const code of [
    'Escape',
    'KeyF',
    'Tab',
    'MetaLeft',
    'F12',
    'Unidentified',
  ])
    assert.equal(canonicalKeyForPhysical(settings, code), null);
  assert.equal(physicalKeyLabel('Backslash'), '\\');
});

void test('conflicts identify the other player; reserved and unsupported keys cannot corrupt a valid mapping', () => {
  const defaults = defaultControlSettings();
  const conflict = rebindControl(defaults, 'KeyE', 'Enter');
  assert.equal(conflict.ok, false);
  assert.equal(conflict.conflict, 'Enter');
  assert.match(conflict.reason, /Игрок 2/);
  for (const key of [
    'KeyF',
    'Escape',
    'Tab',
    'MetaLeft',
    'AltRight',
    'ControlLeft',
    'CapsLock',
    'F1',
    'Unidentified',
  ])
    assert.equal(rebindControl(defaults, 'KeyE', key).ok, false, key);
  assert.equal(rebindControl(defaults, 'KeyQ', 'Space').ok, false);
  assert.equal(rebindControl(defaults, 'KeyE', 'Space').ok, true);
  assert.equal(
    defaults.keys.KeyE,
    'KeyE',
    'validation does not mutate defaults',
  );
});

void test('physical keyboard sources release independently and still combine with canonical gamepad and pointer input', () => {
  const settings = rebound(defaultControlSettings(), 'KeyE', 'KeyZ');
  const physical = new Set(['KeyZ', 'Space']);
  assert.deepEqual([...mapPhysicalKeys(settings, physical)], ['KeyE']);
  physical.delete('KeyZ');
  assert.deepEqual([...mapPhysicalKeys(settings, physical)], ['KeyE']);
  physical.delete('Space');
  const combined = mergeInputKeys(
    mapPhysicalKeys(settings, physical),
    new Set(['KeyE', 'KeyA']),
  );
  assert.deepEqual([...combined].sort(), ['KeyA', 'KeyE']);
  assert.equal(physical.size, 0);
});

void test('saved bindings and hint preference survive reload; malformed or blocked storage recovers without throwing', () => {
  const settings = {
    ...rebound(defaultControlSettings(), 'KeyA', 'KeyV'),
    showWorldPrompts: false,
  };
  let raw = null;
  const storage = {
    getItem(key) {
      assert.equal(key, CONTROL_STORAGE_KEY);
      return raw;
    },
    setItem(key, value) {
      assert.equal(key, CONTROL_STORAGE_KEY);
      raw = value;
    },
  };
  assert.equal(saveControlSettings(storage, settings), null);
  assert.deepEqual(loadControlSettings(storage), {
    settings,
    storageWarning: null,
  });
  for (const raw of [
    'oops',
    '{}',
    'null',
    JSON.stringify({ ...settings, version: 99 }),
    JSON.stringify({ ...settings, keys: { ...settings.keys, KeyE: 'KeyV' } }),
  ])
    assert.deepEqual(parseControlSettings(raw), defaultControlSettings());
  const blocked = {
    getItem() {
      throw Error('denied');
    },
    setItem() {
      throw Error('quota');
    },
  };
  assert.deepEqual(
    loadControlSettings(blocked).settings,
    defaultControlSettings(),
  );
  assert.ok(loadControlSettings(blocked).storageWarning);
  assert.match(saveControlSettings(blocked, settings), /до закрытия страницы/);
  assert.equal(
    new Set(Object.values(settings.keys)).size,
    CANONICAL_KEYS.length,
  );
});

void test('actual engine receives the rebound brace action while directional in-world badges and gamepad commands stay correct', () => {
  const settings = rebound(defaultControlSettings(), 'KeyE', 'KeyZ');
  const s = createScreenEpisode(2, 'drill');
  tick(s, 1 / 60, mapPhysicalKeys(settings, ['KeyE', 'Enter']));
  assert.equal(s.drillMode, 'position', 'old E cannot hold the chair');
  tick(s, 1 / 60, new Set()); // Release the failed climb press before trying the rebound key.
  tick(s, 1 / 60, mapPhysicalKeys(settings, ['KeyZ', 'Enter']));
  assert.equal(s.drillMode, 'climb');
  for (let n = 0; n < 30; n++)
    tick(s, 1 / 60, mapPhysicalKeys(settings, ['KeyZ', 'Enter']));
  assert.ok(s.climb > 0);
  assert.equal(s.braceHeld, true);
  tick(s, 1 / 60, mapPhysicalKeys(settings, ['Enter']));
  assert.equal(s.braceHeld, false);
  try {
    assert.equal(setControlBinding('KeyA', 'KeyV').ok, true);
    assert.equal(keyPrompt('KeyA'), 'V');
    assert.equal(keyboardPrompt(0, 'horizontal'), 'V/D');
    assert.deepEqual(
      screenPromptInput(
        { assignments: [] },
        0,
        { control: 'horizontal', direction: 'left' },
        ['KeyA'],
      ),
      { label: 'V', held: true },
    );
    const pad = (pressed = []) => ({
      index: 0,
      id: 'Xbox',
      connected: true,
      mapping: 'standard',
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, (_, n) => ({
        pressed: pressed.includes(n),
        value: pressed.includes(n) ? 1 : 0,
      })),
    });
    const memory = createPadInput();
    mapGamepads(memory, [pad()], 1);
    assert.deepEqual([...mapGamepads(memory, [pad([14, 0])], 1).keys].sort(), [
      'KeyA',
      'KeyE',
    ]);
    setWorldPrompts(false);
    assert.equal(getControlSettings().showWorldPrompts, false);
  } finally {
    resetControlSettings();
  }
});

void test('nested modal ownership is idempotent and releases the input blocker completely', () => {
  assert.equal(isControlInputBlocked(), false);
  const first = acquireControlInputBlock(),
    second = acquireControlInputBlock();
  assert.equal(isControlInputBlocked(), true);
  first();
  first();
  assert.equal(isControlInputBlocked(), true);
  second();
  assert.equal(isControlInputBlocked(), false);
});

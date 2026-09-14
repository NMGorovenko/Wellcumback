import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const checkout = resolve(process.env.FRIENDSLOP_CHECKOUT || process.cwd());
const candidate = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(checkout, 'package.json'));
const { build } = require('esbuild');
const find = (file) => [file, `${file}.ts`, `${file}.tsx`].find(existsSync);
const source = (file) =>
  find(join(candidate, file)) ?? find(join(checkout, file));
const bundle = await build({
  stdin: {
    contents: `export * from ${JSON.stringify(source('lib/game/input/gamepads.ts'))};
      export {useGameLoop} from ${JSON.stringify(source('hooks/use-game-loop.ts'))};
      export {setControlBinding,resetControlSettings} from ${JSON.stringify(source('lib/game/input/settings-store.ts'))};`,
    resolveDir: checkout,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
  plugins: [
    {
      name: 'private-overlay-and-react-effects',
      setup(b) {
        b.onResolve({ filter: /^react$/ }, () => ({
          path: 'react',
          namespace: 'effect-test',
        }));
        b.onLoad({ filter: /.*/, namespace: 'effect-test' }, () => ({
          contents:
            'export const useRef=value=>({current:value}); export const useEffect=effect=>globalThis.__playerMenuEffects.push(effect);',
          loader: 'js',
        }));
        b.onResolve({ filter: /^@\// }, (args) => ({
          path: source(args.path.slice(2)),
        }));
        b.onResolve({ filter: /^\./ }, (args) => {
          const path = resolve(dirname(args.importer), args.path);
          const base = args.importer.startsWith(candidate + '/')
            ? candidate
            : args.importer.startsWith(checkout + '/')
              ? checkout
              : null;
          if (!base) return;
          return { path: source(relative(base, path)) };
        });
      },
    },
  ],
});
const runtime = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
const {
  createPadInput,
  mapGamepads,
  createPadNavigation,
  navigateGamepad,
  useGameLoop,
  setControlBinding,
  resetControlSettings,
} = runtime;
const pad = (index, buttons = [], axes = [0, 0]) => ({
  index,
  id: `controller-${index}`,
  mapping: 'standard',
  connected: true,
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({
    pressed: buttons.includes(i),
    value: buttons.includes(i) ? 1 : 0,
  })),
});
const devices = (buttons = [], axes = []) => [
  pad(2, buttons[0], axes[0]),
  pad(8, buttons[1], axes[1]),
];

void test('simultaneous P1 direction and P2 confirm reach separate players while shared navigation stays compatible', () => {
  const memory = createPadInput();
  mapGamepads(memory, devices(), 2, 'race');
  const frame = mapGamepads(
    memory,
    devices(
      [[], [0]],
      [
        [1, 0],
        [0, 0],
      ],
    ),
    2,
    'race',
  );
  assert.deepEqual(navigateGamepad(createPadNavigation(), frame, 1, 0), {
    direction: 'right',
    confirm: false,
    back: false,
  });
  assert.deepEqual(navigateGamepad(createPadNavigation(), frame, 1, 1), {
    direction: null,
    confirm: true,
    back: false,
  });
  assert.deepEqual(navigateGamepad(createPadNavigation(), frame, 1), {
    direction: null,
    confirm: true,
    back: false,
  });
  const held = mapGamepads(
    memory,
    devices(
      [[], [0]],
      [
        [1, 0],
        [0, 0],
      ],
    ),
    2,
    'race',
  );
  assert.equal(
    held.navigationByPlayer[1].confirm,
    false,
    'confirm remains an edge',
  );
});
void test('one controller with sparse browser index belongs to player 2, not slot zero', () => {
  const memory = createPadInput();
  mapGamepads(memory, [pad(8)], 2, 'race');
  const frame = mapGamepads(memory, [pad(8, [0], [0, -1])], 2, 'race');
  assert.equal(frame.assignments[0].player, 1);
  assert.deepEqual(frame.navigationByPlayer[0], {
    x: 0,
    y: 0,
    confirm: false,
    back: false,
  });
  assert.deepEqual(navigateGamepad(createPadNavigation(), frame, 1, 1), {
    direction: null,
    confirm: true,
    back: false,
  });
  assert.deepEqual(navigateGamepad(createPadNavigation(), frame, 1, 2), {
    direction: null,
    confirm: false,
    back: false,
  });
});
void test('direction repeat clocks are independent per player', () => {
  const memory = createPadInput(),
    cursors = [createPadNavigation(), createPadNavigation()];
  mapGamepads(memory, devices(), 2, 'race');
  let frame = mapGamepads(
    memory,
    devices(
      [],
      [
        [1, 0],
        [0, 0],
      ],
    ),
    2,
    'race',
  );
  assert.equal(navigateGamepad(cursors[0], frame, 1, 0).direction, 'right');
  frame = mapGamepads(
    memory,
    devices(
      [],
      [
        [1, 0],
        [-1, 0],
      ],
    ),
    2,
    'race',
  );
  assert.equal(navigateGamepad(cursors[1], frame, 1.2, 1).direction, 'left');
  assert.equal(navigateGamepad(cursors[0], frame, 1.37, 0).direction, 'right');
  assert.equal(navigateGamepad(cursors[1], frame, 1.37, 1).direction, null);
  assert.equal(navigateGamepad(cursors[1], frame, 1.57, 1).direction, 'left');
});

function MountLoop(perPlayer = true, players = 2) {
  const names = [
    'window',
    'document',
    'navigator',
    'performance',
    'HTMLElement',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    '__playerMenuEffects',
  ];
  const saved = Object.fromEntries(
    names.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  const install = (name, value) =>
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  const win = new EventTarget(),
    doc = new EventTarget();
  let now = 0,
    active = true,
    controllers = devices(),
    nextId = 0;
  const raf = new Map(),
    effects = [],
    cleanups = [];
  const calls = [],
    ticks = [];
  const game = { current: { paused: true, players } };
  const store = new Map();
  win.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  doc.hidden = false;
  doc.hasFocus = () => active;
  // Deliberately no document.activeElement: routing must retain player identity.
  install('window', win);
  install('document', doc);
  install('navigator', { getGamepads: () => controllers });
  install('performance', { now: () => now });
  install('HTMLElement', class {});
  install('__playerMenuEffects', effects);
  install('requestAnimationFrame', (callback) => {
    const id = ++nextId;
    raf.set(id, callback);
    return id;
  });
  install('cancelAnimationFrame', (id) => raf.delete(id));
  const menu = {
    enabled: true,
    ...(perPlayer ? { perPlayer: true } : {}),
    onMove: (...args) => calls.push(['move', ...args]),
    onConfirm: (...args) => calls.push(['confirm', ...args]),
    onBack: (...args) => calls.push(['back', ...args]),
  };
  useGameLoop({
    game,
    keys: { current: new Set() },
    profile: 'race',
    inputPlayers: players,
    tick: (...args) => ticks.push(args),
    action: () => calls.push(['action']),
    pause: () => {
      game.current.paused = true;
    },
    snapshot: () => {},
    padMenu: menu,
  });
  for (const effect of effects) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
  return {
    calls,
    ticks,
    game,
    menu,
    frame(pads = controllers, delta = 16) {
      controllers = pads;
      now += delta;
      const pending = [...raf.values()];
      raf.clear();
      for (const callback of pending) callback(now);
    },
    keyboard(code, repeat = false) {
      const event = new Event('keydown', { cancelable: true });
      Object.assign(event, {
        code,
        repeat,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
      });
      win.dispatchEvent(event);
      return event.defaultPrevented;
    },
    blur() {
      active = false;
      win.dispatchEvent(new Event('blur'));
    },
    focus() {
      active = true;
      win.dispatchEvent(new Event('focus'));
    },
    close() {
      for (const cleanup of cleanups.reverse()) cleanup();
      resetControlSettings();
      for (const name of names) {
        if (saved[name]) Object.defineProperty(globalThis, name, saved[name]);
        else delete globalThis[name];
      }
    },
  };
}
void test('actual loop dispatches both personal callbacks in one RAF and keeps menu driving neutral', () => {
  const h = MountLoop();
  try {
    h.frame();
    h.frame(
      devices(
        [[], [0]],
        [
          [1, 0],
          [0, 0],
        ],
      ),
    );
    assert.deepEqual(h.calls, [
      ['move', 'right', 0],
      ['confirm', 1],
    ]);
    assert.deepEqual(h.ticks.at(-1)[4], [
      { throttle: 0, steer: 0, handbrake: false, reset: false },
      { throttle: 0, steer: 0, handbrake: false, reset: false },
    ]);
  } finally {
    h.close();
  }
});
void test('actual loop routes remapped race keyboard controls and a lone pad to their own cards', () => {
  const h = MountLoop();
  try {
    h.frame([pad(8)]);
    h.frame([pad(8, [0])]);
    assert.deepEqual(h.calls, [['confirm', 1]]);
    h.calls.length = 0;
    assert.equal(setControlBinding('KeyD', 'KeyZ', 'race').ok, true);
    h.keyboard('KeyD');
    assert.deepEqual(
      h.calls,
      [],
      'story binding must not navigate a race card',
    );
    h.keyboard('KeyZ');
    h.keyboard('ArrowUp');
    h.keyboard('Enter');
    h.keyboard('KeyE');
    h.keyboard('Escape');
    h.keyboard('Enter', true);
    h.keyboard('KeyO');
    assert.deepEqual(h.calls, [
      ['move', 'right', 0],
      ['move', 'up', 1],
      ['confirm', 1],
      ['confirm', 0],
      ['back', 0],
    ]);
  } finally {
    h.close();
  }
});
void test('actual loop clears personal repeat clocks and requires neutral after blur or pause changes', () => {
  const h = MountLoop();
  try {
    const held = devices(
      [],
      [
        [1, 0],
        [-1, 0],
      ],
    );
    h.frame();
    h.frame(held);
    h.calls.length = 0;
    h.blur();
    h.focus();
    h.frame(held);
    assert.deepEqual(h.calls, [], 'held sticks remain disarmed after focus');
    h.frame(devices());
    h.frame(held);
    assert.deepEqual(
      h.calls,
      [
        ['move', 'right', 0],
        ['move', 'left', 1],
      ],
      'repeat deadlines from before blur must not suppress fresh presses',
    );
    h.calls.length = 0;
    h.game.current.paused = false;
    h.frame(held);
    assert.deepEqual(h.calls, [], 'pause transition requires neutral');
    h.frame(devices());
    h.frame(held);
    assert.deepEqual(h.calls, [
      ['move', 'right', 0],
      ['move', 'left', 1],
    ]);
  } finally {
    h.close();
  }
});
void test('default shared loop invokes old callbacks without a player argument', () => {
  const h = MountLoop(false);
  try {
    h.frame();
    h.frame(
      devices(
        [[], [0]],
        [
          [1, 0],
          [0, 0],
        ],
      ),
    );
    assert.deepEqual(h.calls, [['confirm']]);
    h.keyboard('ArrowUp');
    h.keyboard('Enter');
    h.keyboard('Escape');
    assert.deepEqual(h.calls, [
      ['confirm'],
      ['move', 'up'],
      ['confirm'],
      ['back'],
    ]);
  } finally {
    h.close();
  }
});

void test('personal menu consumes Space secondary without activating the browser focus', () => {
  const h = MountLoop();
  try {
    h.frame();
    assert.equal(h.keyboard('Space'), true);
    assert.deepEqual(h.calls, []);
  } finally {
    h.close();
  }
});
void test('third local keyboard IJKL/O/U controls only card 3 and consumes secondary', () => {
  const h = MountLoop(true, 3);
  try {
    h.frame([]);
    for (const key of ['KeyI', 'KeyJ', 'KeyK', 'KeyL', 'KeyO', 'KeyU'])
      assert.equal(h.keyboard(key), true);
    assert.deepEqual(h.calls, [
      ['move', 'up', 2],
      ['move', 'left', 2],
      ['move', 'down', 2],
      ['move', 'right', 2],
      ['confirm', 2],
    ]);
    h.calls.length = 0;
    h.keyboard('KeyW');
    h.keyboard('Enter');
    assert.deepEqual(h.calls, [
      ['move', 'up', 0],
      ['confirm', 1],
    ]);
  } finally {
    h.close();
  }
});
void test('three sparse controllers route simultaneous P1/P2/P3 actions independently', () => {
  const h = MountLoop(true, 3);
  try {
    h.frame([pad(2), pad(8), pad(17)]);
    h.frame([pad(2, [], [1, 0]), pad(8, [0]), pad(17, [1])]);
    assert.deepEqual(h.calls, [
      ['move', 'right', 0],
      ['confirm', 1],
      ['back', 2],
    ]);
    assert.equal(h.ticks.at(-1)[4].length, 3);
  } finally {
    h.close();
  }
});

import test from 'node:test';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const checkout = resolve(process.env.FRIENDSLOP_CHECKOUT || process.cwd());
const candidate = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(checkout, 'package.json'));
const { build } = require('esbuild');
const source = (file) => {
  for (const base of [candidate, checkout])
    for (const extension of ['', '.ts', '.tsx']) {
      const path = join(base, file + extension);
      if (existsSync(path)) return path;
    }
  throw new Error(`Missing source: ${file}`);
};
const bundle = await build({
  stdin: {
    contents: `export * from ${JSON.stringify(source('lib/game/network/room-status.ts'))};
      export * from ${JSON.stringify(source('components/game/network/room-status.tsx'))};`,
    resolveDir: checkout,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  packages: 'external',
  jsx: 'automatic',
  logLevel: 'silent',
  plugins: [
    {
      name: 'candidate-alias',
      setup(b) {
        b.onResolve(
          { filter: /^@\/lib\/game\/network\/room-status-store$/ },
          () => ({ path: 'presence-store', namespace: 'status-test' }),
        );
        b.onLoad({ filter: /.*/, namespace: 'status-test' }, () => ({
          contents:
            'export const roomPresence={subscribe:()=>()=>{},getSnapshot:()=>null,getServerSnapshot:()=>null};',
          loader: 'js',
        }));
        b.onResolve({ filter: /^@\// }, (args) => ({
          path: source(args.path.slice(2)),
        }));
      },
    },
  ],
});
const builtModule = { exports: {} };
runInNewContext(bundle.outputFiles[0].text, {
  require,
  module: builtModule,
  exports: builtModule.exports,
  performance,
  setTimeout,
  clearTimeout,
});
const {
  advanceRoomPresence,
  expireRoomNotice,
  roomStatusDisplay,
  RoomStatus,
  createRoomPresenceStore,
} = builtModule.exports;
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const self = {
  id: 'host',
  slot: 0,
  name: 'Никита',
  connected: true,
  lastSeen: 100,
};
const friend = {
  id: 'guest',
  slot: 1,
  name: 'Ярик',
  connected: true,
  lastSeen: 100,
};
const third = {
  id: 'third',
  slot: 2,
  name: 'Настя',
  connected: true,
  lastSeen: 100,
};
const view = (patch = {}) => ({
  code: 'ABCD2345',
  slot: 0,
  status: 'connected',
  capacity: 3,
  roster: [self, friend],
  ping: 42,
  world: null,
  message: '',
  frozen: false,
  ...patch,
});

void test('initial roster is quiet; a new connected device announces once across unchanged relay polls', () => {
  const initial = advanceRoomPresence(null, view(), 0);
  assert.equal(initial.notice, null);
  const joined = advanceRoomPresence(
    initial,
    view({ roster: [self, friend, third] }),
    100,
  );
  assert.equal(joined.notice.text, 'В игре: Настя');
  assert.equal(joined.notice.expiresAt, 4600);
  for (let i = 0; i < 20; i++)
    assert.equal(
      advanceRoomPresence(
        joined,
        view({
          roster: [{ ...self }, { ...friend }, { ...third }],
          ping: 900,
          world: { state: { elapsed: i } },
        }),
        200 + i,
      ),
      joined,
    );
});

void test('named disconnect fires once, expires while the game is paused, then reconnect has a new notice', () => {
  const initial = advanceRoomPresence(null, view(), 0);
  const disconnectedView = view({
    roster: [self, { ...friend, connected: false }],
    frozen: true,
    world: { state: { paused: true, elapsed: 12 } },
  });
  const lost = advanceRoomPresence(initial, disconnectedView, 100);
  assert.equal(lost.notice.text, 'Нет связи: Ярик');
  assert.equal(advanceRoomPresence(lost, disconnectedView, 200), lost);
  assert.equal(expireRoomNotice(lost, lost.notice.id, 4599), lost);
  const expired = expireRoomNotice(lost, lost.notice.id, 4600);
  assert.equal(expired.notice, null);
  assert.equal(
    advanceRoomPresence(expired, disconnectedView, 7000),
    expired,
    'paused snapshots cannot replay the same notification',
  );
  const returned = advanceRoomPresence(expired, view(), 7100);
  assert.equal(returned.notice.text, 'Снова в игре: Ярик');
  assert.ok(returned.notice.id > lost.notice.id);
  assert.equal(
    expireRoomNotice(returned, lost.notice.id, 10000),
    returned,
    'the old timer cannot erase a newer notification',
  );
});

void test('a missing member is a named disconnect and several changes are visible together', () => {
  const initial = advanceRoomPresence(
    null,
    view({ roster: [self, friend, third] }),
    0,
  );
  const lost = advanceRoomPresence(
    initial,
    view({ roster: [self, { ...third, connected: false }] }),
    100,
  );
  assert.match(lost.notice.text, /Нет связи: Ярик/);
  assert.match(lost.notice.text, /Нет связи: Настя/);
  assert.equal(
    advanceRoomPresence(
      lost,
      view({ roster: [self, { ...third, connected: false }] }),
      200,
    ),
    lost,
  );
});

void test('losing our relay connection never labels friends offline or consumes an unconfirmed roster', () => {
  const initial = advanceRoomPresence(
    null,
    view({ roster: [self, friend, third] }),
    0,
  );
  const reconnecting = view({
    status: 'reconnecting',
    roster: [
      self,
      { ...friend, connected: false },
      { ...third, connected: false },
    ],
    frozen: true,
  });
  const lost = advanceRoomPresence(initial, reconnecting, 100);
  assert.equal(lost.notice.text, 'Связь с сервером потеряна');
  assert.deepEqual(lost.members, initial.members);
  assert.deepEqual(
    roomStatusDisplay(reconnecting).peers.map((p) => p.state),
    ['unknown', 'unknown', 'unknown'],
  );
  assert.equal(roomStatusDisplay(reconnecting).relayRtt, null);
  const failed = advanceRoomPresence(
    lost,
    { ...reconnecting, status: 'failed' },
    200,
  );
  assert.equal(
    failed.notice,
    lost.notice,
    'one connection outage is not another notification on every status update',
  );
  const restored = advanceRoomPresence(
    failed,
    view({ roster: [self, friend, third] }),
    300,
  );
  assert.equal(restored.notice.text, 'Связь с сервером восстановлена');
  assert.ok(
    !restored.notice.text.includes('Снова в игре'),
    'no invented individual disconnect/reconnect',
  );
});

void test('a genuine peer change during a local connection gap appears only after the relay confirms it', () => {
  const initial = advanceRoomPresence(null, view(), 0);
  const lost = advanceRoomPresence(
    initial,
    view({ status: 'reconnecting' }),
    100,
  );
  const restored = advanceRoomPresence(
    lost,
    view({ roster: [self, { ...friend, connected: false }] }),
    200,
  );
  assert.equal(
    restored.notice.text,
    'Связь с сервером восстановлена · Нет связи: Ярик',
  );
});

void test('changing or leaving a room clears old notices and an initial offline peer is not a new disconnect', () => {
  const initial = advanceRoomPresence(null, view(), 0);
  const lost = advanceRoomPresence(
    initial,
    view({ roster: [self, { ...friend, connected: false }] }),
    100,
  );
  const changed = advanceRoomPresence(
    lost,
    view({ code: 'EFGH6789', roster: [self, { ...friend, connected: false }] }),
    200,
  );
  assert.equal(changed.notice, null);
  assert.equal(
    advanceRoomPresence(
      changed,
      view({ code: '', status: 'offline', roster: [] }),
      300,
    ),
    null,
  );
  assert.equal(
    advanceRoomPresence(null, view({ status: 'reconnecting' }), 0).notice,
    null,
  );
});

void test('RTT belongs only to this client’s server connection, including valid zero; no peer ping is invented', () => {
  for (const ping of [0, 42.4, 900]) {
    const display = roomStatusDisplay(
      view({ ping, roster: [self, { ...friend, ping: 987 }] }),
    );
    assert.equal(display.relayRtt, Math.round(ping));
    assert.equal(Object.hasOwn(display.peers[1], 'ping'), false);
    assert.equal(Object.hasOwn(display.peers[1], 'relayRtt'), false);
  }
  for (const ping of [-1, NaN, Infinity])
    assert.equal(roomStatusDisplay(view({ ping })).relayRtt, null);
  assert.equal(
    roomStatusDisplay(view({ status: 'failed', ping: 90 })).relayRtt,
    null,
  );
});

void test('rendered compact HUD names every device, explains RTT accessibly and stays present while paused', () => {
  const html = renderToStaticMarkup(
    React.createElement(RoomStatus, {
      room: view({
        roster: [self, friend, { ...third, connected: false }],
        ping: 0,
        frozen: true,
        world: { state: { paused: true } },
      }),
      onOpen() {},
    }),
  );
  assert.match(html, /Никита · ты/);
  assert.match(html, /Ярик/);
  assert.match(html, /Настя: нет связи/);
  assert.match(html, /title="До сервера"/);
  assert.match(html, /aria-label="До сервера: 0 мс"/);
  assert.equal((html.match(/room-strip-ping/g) || []).length, 1);
  assert.match(html, /<output class="room-notice" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /Открыть комнату ABCD2345/);
  assert.equal(
    renderToStaticMarkup(
      React.createElement(RoomStatus, {
        room: view({ code: '', status: 'offline' }),
        onOpen() {},
      }),
    ),
    '',
  );
});

void test('presence store shares one subscription; unchanged polls cannot prolong a notice and its timer clears during pause', () => {
  let current = view(),
    now = 0,
    updates = 0;
  const roomListeners = new Set(),
    timers = new Set();
  const store = createRoomPresenceStore(
    () => current,
    (callback) => {
      roomListeners.add(callback);
      return () => roomListeners.delete(callback);
    },
    () => now,
    (callback, delay) => {
      const timer = { callback, due: now + delay };
      timers.add(timer);
      return () => timers.delete(timer);
    },
  );
  const emit = () => roomListeners.forEach((callback) => callback());
  const runTimer = (timer) => {
    timers.delete(timer);
    timer.callback();
  };
  const first = store.subscribe(() => updates++),
    second = store.subscribe(() => {});
  assert.equal(roomListeners.size, 1);
  assert.equal(store.getSnapshot().notice, null);
  current = view({
    frozen: true,
    world: { state: { paused: true, elapsed: 12 } },
    roster: [self, { ...friend, connected: false }],
  });
  emit();
  assert.equal(updates, 1);
  const notification = store.getSnapshot().notice;
  for (let i = 1; i <= 50; i++) {
    now = i * 50;
    current = {
      ...current,
      ping: i,
      roster: current.roster.map((peer) => ({ ...peer })),
    };
    emit();
  }
  assert.equal(
    updates,
    1,
    'normal RTT/snapshot polling causes no presence rerender',
  );
  assert.equal(timers.size, 1);
  assert.equal([...timers][0].due, 4500);
  now = 4499.5;
  runTimer([...timers][0]); // A browser timer may wake just before its deadline.
  assert.equal(store.getSnapshot().notice, notification);
  assert.equal(
    timers.size,
    1,
    'an early callback must not leave a notice stuck forever',
  );
  now = 4500.5;
  runTimer([...timers][0]);
  assert.equal(store.getSnapshot().notice, null);
  assert.equal(updates, 2);
  assert.equal(current.world.state.elapsed, 12);
  assert.equal(current.world.state.paused, true);
  first();
  assert.equal(roomListeners.size, 1);
  current = view();
  emit();
  assert.equal(store.getSnapshot().notice.text, 'Снова в игре: Ярик');
  assert.equal(timers.size, 1);
  second();
  assert.equal(roomListeners.size, 0);
  assert.equal(timers.size, 0);
  assert.equal(store.getSnapshot(), null);
  const remounted = store.subscribe(() => {});
  assert.equal(
    store.getSnapshot().notice,
    null,
    'remount establishes a quiet baseline',
  );
  remounted();
});

import test from 'node:test';
import { ROOM_VERSION } from '../lib/game/network/room-types.ts';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleRoomRequest, MEMBER_STALE_MS } from '../lib/server/rooms.ts';
import { freshCity } from '../lib/game/city/engine.ts';
import { freshGame } from '../lib/game/screen/engine.ts';
import { freshClean } from '../lib/game/clean/engine.ts';
import { freshMoving } from '../lib/game/moving/engine.ts';
import { getRoomConnection } from '../lib/game/network/room-transport.ts';
import * as client from '../lib/game/network/room-client.ts';
import * as bridge from '../lib/game/network/room-game.ts';

const original = {
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  fetch: globalThis.fetch,
  performance: globalThis.performance,
  location: globalThis.location,
  window: globalThis.window,
  sessionStorage: globalThis.sessionStorage,
  localStorage: globalThis.localStorage,
};
let now = 0,
  timers = [],
  db,
  requests,
  nextResponseDelay = 0,
  nextRtt = 0;
const pollWaiters = new Set();
function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(
    readFileSync(new URL('../drizzle/0000_rooms.sql', import.meta.url), 'utf8'),
  );
  sqlite.exec(
    readFileSync(
      new URL('../drizzle/0001_reconnect_pause.sql', import.meta.url),
      'utf8',
    ),
  );
  sqlite.exec(
    readFileSync(
      new URL('../drizzle/0002_room_protocol.sql', import.meta.url),
      'utf8',
    ),
  );
  const prepare = (sql, values = []) => ({
    bind: (...next) => prepare(sql, next),
    first: async () => sqlite.prepare(sql).get(...values) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    run: async () => ({
      meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) },
    }),
  });
  db = {
    prepare,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  now = 0;
  timers = [];
  requests = [];
  nextResponseDelay = 0;
  nextRtt = 0;
  pollWaiters.clear();
  globalThis.performance = { now: () => now };
  globalThis.location = { protocol: 'https:' };
  const storage = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  const durable = new Map();
  globalThis.localStorage = {
    getItem: (key) => durable.get(key) ?? null,
    setItem: (key, value) => durable.set(key, value),
    removeItem: (key) => durable.delete(key),
  };
  globalThis.setTimeout = (fn, ms) => {
    const item = { fn, ms };
    timers.push(item);
    // Scheduling the next poll happens after fetch, response.json and ingest.
    for (const done of pollWaiters) done();
    return item;
  };
  globalThis.clearTimeout = (item) => {
    timers = timers.filter((entry) => entry !== item);
  };
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    const requestDb = db,
      requestTime = 1000 + now;
    const delay = nextResponseDelay,
      rtt = nextRtt;
    nextResponseDelay = 0;
    nextRtt = 0;
    if (delay)
      await new Promise((resolve) => original.setTimeout(resolve, delay));
    const reply = await handleRoomRequest(requestDb, payload, requestTime);
    now += rtt;
    requests.push({ payload, reply });
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
async function drain() {
  if (timers.length) return;
  await new Promise((resolve, reject) => {
    const timeout = original.setTimeout(() => {
      pollWaiters.delete(done);
      reject(
        new Error(`Poll did not complete: ${client.roomSnapshot().status}`),
      );
    }, 10000);
    const done = () => {
      original.clearTimeout(timeout);
      pollWaiters.delete(done);
      resolve();
    };
    pollWaiters.add(done);
  });
}
const api = (body) =>
  handleRoomRequest(db, { version: ROOM_VERSION, ...body }, 1000 + now);
async function nextPoll() {
  const timer = timers.shift();
  assert.ok(timer, 'client must schedule the next poll');
  timer.fn();
  await drain();
}
async function hostCity(driver = 0, capacity = 2) {
  await client.openRoom('Ведущий', capacity);
  await drain();
  const code = client.roomSnapshot().code;
  const guest = (await api({ op: 'join', code, name: 'Друг' })).body;
  client.publishRoomWorld({
    scene: 'city',
    epoch: 100 + now,
    state: freshCity(),
    brief: false,
    driver,
  });
  await nextPoll();
  return { code, guest, epoch: client.roomWorld().epoch };
}
async function cleanup() {
  await client.leaveRoom();
  Object.assign(globalThis, original);
}

const oldEndpoint = {
  url: 'wss://old.example/rooms',
  accessKey: 'a'.repeat(64),
};
const newEndpoint = { ...oldEndpoint, url: 'wss://new.example/rooms' };
function desktopTransport() {
  const calls = [];
  globalThis.window = {
    wellcumNetwork: {
      disconnect: async () => {},
      request: async (connection, payload) => {
        calls.push({ connection, payload: structuredClone(payload) });
        return api(payload);
      },
    },
  };
  return calls;
}

for (const [scene, fresh] of Object.entries({
  city: freshCity,
  screen: freshGame,
  clean: freshClean,
  moving: freshMoving,
}))
  void test(`${scene}: updated invitation restores the same guest and progress, without joining or replaying old input`, async () => {
    setup();
    const calls = desktopTransport();
    try {
      const host = (await api({ op: 'create', name: 'Host', capacity: 2 }))
        .body;
      await client.openRoom('Guest', 2, host.code, oldEndpoint);
      await drain();
      const snapshot = {
        scene,
        epoch: 10,
        attempt: 7,
        roles: [1, 0, 2],
        driver: 1,
        brief: false,
        state: { ...fresh(2), elapsed: 143, paused: true },
      };
      assert.equal(
        (
          await api({
            op: 'poll',
            code: host.code,
            token: host.token,
            snapshot,
            snapshotSeq: 1,
          })
        ).status,
        200,
      );
      snapshot.state.paused = false;
      await api({
        op: 'poll',
        code: host.code,
        token: host.token,
        snapshot,
        snapshotSeq: 2,
      });
      await nextPoll();
      const before = JSON.parse(sessionStorage.getItem('wellcum-room-v5'));
      client.captureRoomInput(new Set());
      await nextPoll();
      client.captureRoomInput(new Set(['KeyW']), undefined, {
        kind: 'restart',
      });
      const index = calls.length;
      client.updateRoomConnection(host.code, newEndpoint);
      assert.equal(client.roomWorld().state.paused, true);
      await drain();
      const request = calls[index];
      assert.deepEqual(request.connection, newEndpoint);
      assert.equal(request.payload.op, 'poll');
      assert.equal(request.payload.token, before.token);
      assert.equal(request.payload.rejoin, true);
      assert.deepEqual(request.payload.frames, []);
      assert.equal(client.roomSnapshot().slot, before.slot);
      assert.equal(client.roomWorld().scene, scene);
      assert.equal(client.roomWorld().attempt, 7);
      assert.equal(client.roomWorld().state.elapsed, 143);
      assert.equal(client.roomWorld().state.paused, true);
      assert.deepEqual(client.roomWorld().roles, [1, 0, 2]);
      const saved = JSON.parse(localStorage.getItem('wellcum-room-return-v5'));
      assert.equal(saved.token, before.token);
      assert.equal(saved.slot, before.slot);
      assert.deepEqual(saved.connection, newEndpoint);
      assert.equal(
        calls.slice(index).some((call) => call.payload.op === 'join'),
        false,
      );
      const unchanged = calls.length;
      assert.throws(
        () => client.updateRoomConnection('ZZZZZZZZ', newEndpoint),
        /другой комнаты/,
      );
      assert.throws(
        () =>
          client.updateRoomConnection(host.code, {
            ...newEndpoint,
            accessKey: 'b'.repeat(64),
          }),
        /другой комнаты/,
      );
      assert.throws(
        () =>
          client.updateRoomConnection(host.code, {
            ...newEndpoint,
            url: 'ws://public.example/rooms',
          }),
        /защищённым/,
      );
      assert.equal(
        calls.length,
        unchanged,
        'bad invitations never send the saved member token',
      );
      assert.deepEqual(getRoomConnection(), newEndpoint);
    } finally {
      await cleanup();
    }
  });

void test('late old-endpoint responses cannot replace the recovered world or create a second poll loop', async () => {
  setup();
  desktopTransport();
  try {
    await client.openRoom('Host', 2, undefined, oldEndpoint);
    await drain();
    const code = client.roomSnapshot().code;
    await api({ op: 'join', code, name: 'Guest' });
    client.publishRoomWorld({
      scene: 'city',
      epoch: 20,
      attempt: 12,
      brief: false,
      state: { ...freshCity(), x: 42 },
    });
    await nextPoll();
    const previous = window.wellcumNetwork.request.bind(window.wellcumNetwork);
    let releaseOld, beganOld;
    const began = new Promise((resolve) => (beganOld = resolve));
    window.wellcumNetwork.request = async (connection, payload) => {
      if (connection.url === oldEndpoint.url && payload.op === 'poll') {
        const reply = await previous(connection, payload);
        beganOld();
        await new Promise((resolve) => (releaseOld = resolve));
        reply.body.snapshot.state.x = 999;
        return reply;
      }
      return previous(connection, payload);
    };
    timers.shift().fn();
    await began;
    client.updateRoomConnection(code, newEndpoint);
    await drain();
    const epoch = client.roomWorld().epoch;
    releaseOld();
    await new Promise((resolve) => original.setTimeout(resolve, 10));
    assert.equal(client.roomWorld().state.x, 42);
    assert.equal(client.roomWorld().epoch, epoch);
    assert.equal(client.roomWorld().attempt, 12);
    assert.equal(client.roomWorld().state.paused, true);
    assert.equal(client.roomSnapshot().status, 'connected');
    assert.equal(timers.length, 1, 'only the new transport schedules polling');
  } finally {
    await cleanup();
  }
});

void test('late desktop recovery cannot attach its endpoint after the creator leaves the room', async () => {
  setup();
  desktopTransport();
  try {
    await client.openRoom('Host', 2, undefined, oldEndpoint);
    await drain();
    let finishRecovery;
    window.wellcumNetwork.host = () =>
      new Promise((resolve) => (finishRecovery = resolve));
    const recovery = client.recoverHostedRoom();
    const rejected = assert.rejects(recovery, /Комната уже закрыта/);
    await client.leaveRoom();
    finishRecovery({ state: 'ready', connection: newEndpoint, message: '' });
    await rejected;
    assert.equal(client.roomActive(), false);
    assert.equal(getRoomConnection(), null);
  } finally {
    await cleanup();
  }
});

void test('host reload first polls without a null snapshot and restores the server world before city RAF initialization', async () => {
  setup();
  try {
    const host = (await api({ op: 'create', name: 'Ведущий' })).body;
    const world = {
      scene: 'screen',
      epoch: 4,
      state: freshGame(2),
      brief: true,
      driver: 0,
    };
    await api({
      op: 'poll',
      code: host.code,
      token: host.token,
      snapshot: world,
      snapshotSeq: 1,
    });
    sessionStorage.setItem(
      'wellcum-room-v5',
      JSON.stringify({
        code: host.code,
        token: host.token,
        slot: 0,
        sequence: 0,
        snapshotSeq: 1,
      }),
    );
    client.restoreRoom();
    bridge.tickRoomCity(freshCity(), 1 / 60, new Set());
    await drain();
    assert.equal(
      requests[0].reply.status,
      200,
      'restoring host must not submit snapshot:null',
    );
    assert.equal(client.roomSnapshot().status, 'connected');
    assert.equal(client.roomWorld()?.scene, 'screen');
    assert.equal(client.roomWorld()?.epoch, 5);
    assert.equal(client.roomWorld()?.attempt, 4);
    assert.equal(client.roomWorld()?.state.paused, true);
  } finally {
    await cleanup();
  }
});

void test('city authority needs neutral analog axes before arming after ownership/epoch reset', async () => {
  setup();
  try {
    await hostCity(0);
    const state = freshCity();
    bridge.tickRoomCity(state, 0.1, new Set(), { throttle: 1, steer: 0 });
    assert.equal(
      state.speed,
      0,
      'held RT must not arm throttle simply because keyboard keys are empty',
    );
    bridge.tickRoomCity(state, 0.1, new Set(), { throttle: 0, steer: 0 });
    bridge.tickRoomCity(state, 0.1, new Set(), { throttle: 1, steer: 0 });
    assert.ok(state.speed > 0);
  } finally {
    await cleanup();
  }
});

void test('last remote throttle expires at the short deadline on a fast relay even while HTTP presence stays healthy', async () => {
  setup();
  try {
    now = 100;
    const { code, guest, epoch } = await hostCity(1);
    const state = freshCity();
    await api({
      op: 'poll',
      code,
      token: guest.token,
      frames: [{ seq: 1, epoch, keys: [], drive: { throttle: 0, steer: 0 } }],
    });
    await nextPoll();
    bridge.tickRoomCity(state, 0.1, new Set());
    await api({
      op: 'poll',
      code,
      token: guest.token,
      frames: [
        { seq: 2, epoch, keys: ['KeyW'], drive: { throttle: 1, steer: 0 } },
      ],
    });
    await nextPoll();
    bridge.tickRoomCity(state, 0.1, new Set());
    assert.ok(state.speed > 0);
    const previousSpeed = state.speed;
    now += 700;
    await api({ op: 'poll', code, token: guest.token });
    await nextPoll();
    assert.equal(
      client.roomSnapshot().frozen,
      false,
      'presence is deliberately healthy',
    );
    bridge.tickRoomCity(state, 0.1, new Set());
    assert.ok(
      state.speed <= previousSpeed,
      `expired throttle still accelerates: ${previousSpeed} -> ${state.speed}`,
    );
  } finally {
    await cleanup();
  }
});

void test('city host must release held analog throttle again after transport reconnection', async () => {
  setup();
  try {
    now = 1000;
    const { code, guest } = await hostCity(0);
    const state = freshCity();
    bridge.tickRoomCity(state, 0.1, new Set(), { throttle: 0, steer: 0 });
    bridge.tickRoomCity(state, 0.1, new Set(), { throttle: 1, steer: 0 });
    assert.ok(state.speed > 0);
    now += MEMBER_STALE_MS + 1;
    await api({ op: 'poll', code, token: guest.token });
    await nextPoll();
    assert.equal(client.roomSnapshot().frozen, true);
    bridge.tickRoomCity(state, 0.1, new Set(), { throttle: 1, steer: 0 });
    await nextPoll();
    assert.equal(client.roomSnapshot().frozen, false);
    const previousSpeed = state.speed;
    bridge.tickRoomCity(state, 0.1, new Set(), { throttle: 1, steer: 0 });
    assert.ok(
      state.speed <= previousSpeed,
      `held throttle rearmed after reconnect: ${previousSpeed} -> ${state.speed}`,
    );
  } finally {
    await cleanup();
  }
});

void test('batched guest press/release both reach fixed simulation when rendering at 240Hz', async () => {
  setup();
  try {
    now = 2000;
    const { code, guest, epoch } = await hostCity(0);
    const state = freshGame(2);
    state.phase = 'level';
    state.levelCheck.mode = 'settle';
    state.angle = state.bubble = 0;
    state.levelStable = 1.2;
    client.publishRoomWorld({
      scene: 'screen',
      epoch: epoch + 1,
      state,
      brief: false,
      driver: 0,
    });
    await nextPoll();
    const frames = [
      { seq: 1, epoch: epoch + 1, keys: ['KeyE'] },
      { seq: 2, epoch: epoch + 1, keys: [] },
    ];
    assert.equal(
      (await api({ op: 'poll', code, token: guest.token, frames })).status,
      200,
    );
    await nextPoll();
    for (let count = 0; count < 16; count++)
      bridge.tickRoomScreen(state, 1 / 240, new Set());
    assert.equal(
      state.levelCheck.mode,
      'celebrate',
      'the guest tap vanished before any fixed simulation step observed it',
    );
  } finally {
    await cleanup();
  }
});

void test('city applies a short queued throttle pulse once at 240Hz', async () => {
  setup();
  try {
    now = 3000;
    const { code, guest, epoch } = await hostCity(1);
    const state = freshCity();
    await api({
      op: 'poll',
      code,
      token: guest.token,
      frames: [{ seq: 1, epoch, keys: [] }],
    });
    await nextPoll();
    bridge.tickRoomCity(state, 1 / 60, new Set());
    await api({
      op: 'poll',
      code,
      token: guest.token,
      frames: [
        { seq: 2, epoch, keys: ['KeyW'] },
        { seq: 3, epoch, keys: [] },
      ],
    });
    // The response can take more event-loop turns under the full parallel test
    // suite. Only simulate after the queued input actually reaches the host.
    nextResponseDelay = 25;
    await nextPoll();
    for (let count = 0; count < 16; count++)
      bridge.tickRoomCity(state, 1 / 240, new Set());
    assert.ok(
      state.speed > 0,
      'the throttle pulse vanished between fixed steps',
    );
  } finally {
    await cleanup();
  }
});

void test('third player joining during the brief is included even when begin races the next roster reply', async () => {
  setup();
  try {
    now = 4000;
    const { code } = await hostCity(0, 3);
    bridge.roomCommand({ kind: 'start-screen' });
    assert.equal(client.roomWorld().state.players, 2);
    await nextPoll();
    const third = await api({ op: 'join', code, name: 'Третий' });
    assert.equal(third.status, 200);
    assert.equal(third.body.slot, 2);
    bridge.roomCommand({ kind: 'begin' });
    assert.equal(client.roomWorld().brief, false);
    await nextPoll();
    const state = freshGame(2);
    bridge.tickRoomScreen(state, 1 / 60, new Set());
    assert.equal(
      state.players,
      3,
      'accepted slot 2 must not remain a spectator',
    );
    assert.equal(client.roomWorld().state.players, 3);
  } finally {
    await cleanup();
  }
});

void test('only host resets the authoritative city car and invalidates old movement with a new epoch', async () => {
  setup();
  try {
    now = 5000;
    const { epoch } = await hostCity(1);
    const state = client.roomWorld().state;
    const spawn = freshCity();
    state.x = spawn.x + 5;
    state.vx = 4;
    state.speed = 4;
    bridge.roomCommand({ kind: 'restart' }, 1);
    assert.equal(
      client.roomWorld().state.x,
      spawn.x + 5,
      'guest cannot reset the shared car',
    );
    bridge.roomCommand({ kind: 'restart' });
    assert.equal(client.roomWorld().state.x, spawn.x);
    assert.equal(client.roomWorld().state.speed, 0);
    assert.equal(client.roomWorld().epoch, epoch + 1);
    assert.equal(client.roomWorld().driver, 1);
  } finally {
    await cleanup();
  }
});

void test('guest keyboard action and held E share one queued press rather than two simulation edges', async () => {
  setup();
  try {
    now = 6000;
    const host = (await api({ op: 'create', capacity: 2, name: 'Host' })).body;
    await api({
      op: 'poll',
      code: host.code,
      token: host.token,
      snapshot: {
        scene: 'screen',
        epoch: 1,
        state: freshGame(2),
        brief: true,
        driver: 0,
      },
      snapshotSeq: 1,
    });
    await client.openRoom('Guest', 2, host.code);
    await drain();
    client.captureRoomInput(new Set());
    bridge.roomCommand({ kind: 'action', value: 'input' });
    client.captureRoomInput(new Set(['KeyE']));
    client.captureRoomInput(new Set());
    await nextPoll();
    const pending = (
      await api({ op: 'poll', code: host.code, token: host.token })
    ).body.frames['1'];
    const press = pending.find((frame) => frame.command?.kind === 'action');
    assert.deepEqual(press.keys, ['KeyE']);
    assert.equal(pending.length, 3, 'neutral, one combined press, release');
    assert.deepEqual(pending.at(-1).keys, []);
  } finally {
    await cleanup();
  }
});

void test('stale host bootstrap recovers server scene by polling without another snapshot write', async () => {
  setup();
  try {
    now = 7000;
    const { epoch } = await hostCity(0);
    client.publishRoomWorld({
      scene: 'screen',
      epoch: epoch + 1,
      state: freshGame(2),
      brief: true,
      driver: 0,
    });
    await nextPoll();
    client.publishRoomWorld({
      scene: 'city',
      epoch: 0,
      state: freshCity(),
      brief: false,
      driver: 0,
    });
    await nextPoll();
    assert.equal(client.roomSnapshot().status, 'reconnecting');
    bridge.tickRoomCity(freshCity(), 1 / 60, new Set());
    await nextPoll();
    assert.equal(
      requests.at(-1).payload.snapshot,
      undefined,
      'resync reads first instead of repeatedly writing stale state',
    );
    assert.equal(client.roomSnapshot().status, 'connected');
    assert.equal(client.roomWorld().scene, 'screen');
    assert.equal(client.roomWorld().epoch, epoch + 1);
    await nextPoll();
    assert.equal(
      requests.at(-1).reply.status,
      200,
      'normal publishing resumes after recovery',
    );
  } finally {
    await cleanup();
  }
});

void test('1.3s relay RTT preserves fresh state and held controls between slow polls, then expires within a bounded deadline', async () => {
  setup();
  try {
    now = 10000;
    nextRtt = 1300;
    const { code, guest, epoch } = await hostCity(1);
    const state = freshCity();
    await api({
      op: 'poll',
      code,
      token: guest.token,
      frames: [{ seq: 1, epoch, keys: [] }],
    });
    nextRtt = 1300;
    await nextPoll();
    bridge.tickRoomCity(state, 1 / 60, new Set());
    await api({
      op: 'poll',
      code,
      token: guest.token,
      frames: [{ seq: 2, epoch, keys: ['KeyW'] }],
    });
    nextRtt = 1300;
    await nextPoll();
    bridge.tickRoomCity(state, 0.1, new Set());
    const previousSpeed = state.speed;
    now += 1600;
    assert.equal(
      client.roomFresh(),
      true,
      'a healthy slow request is not a disconnect',
    );
    assert.match(client.roomSnapshot().message, /Медленная связь/);
    bridge.tickRoomCity(state, 0.1, new Set());
    assert.equal(state.paused, false);
    assert.ok(
      state.speed > previousSpeed,
      'held throttle must span slow relay responses',
    );
    assert.equal(
      timers[0].ms,
      250,
      'leave gateway idle time after each completed poll',
    );
    now += client.roomInputDeadlineMs() + 1;
    // Continue receiving HTTP presence but no input from the guest renderer.
    await api({ op: 'poll', code, token: guest.token });
    await nextPoll();
    assert.equal(client.roomSnapshot().frozen, false);
    const speedBeforeExpiry = state.speed;
    bridge.tickRoomCity(state, 0.1, new Set());
    assert.ok(
      state.speed <= speedBeforeExpiry,
      'missing input must neutralize by its deadline',
    );
    const beforeFreshInput = state.speed;
    await api({
      op: 'poll',
      code,
      token: guest.token,
      frames: [{ seq: 3, epoch, keys: ['KeyW'] }],
    });
    await nextPoll();
    bridge.tickRoomCity(state, 0.1, new Set());
    assert.ok(
      state.speed > beforeFreshInput,
      'a connected peer can resume sending controls after an input-only gap',
    );
    await api({
      op: 'poll',
      code,
      token: guest.token,
      frames: [
        { seq: 4, epoch, keys: [] },
        { seq: 5, epoch, keys: ['KeyW'] },
      ],
    });
    await nextPoll();
    const beforeRearm = state.speed;
    bridge.tickRoomCity(state, 0.1, new Set());
    assert.ok(
      state.speed > beforeRearm,
      'a release and new press restore normal control',
    );
  } finally {
    await cleanup();
  }
});

void test('3s relay RTT remains fresh between replies but never extends a lost connection past 10s', async () => {
  setup();
  try {
    now = 20000;
    await hostCity();
    nextRtt = 3000;
    await nextPoll();
    assert.equal(client.roomSnapshot().ping, 3000);
    assert.equal(client.roomInputDeadlineMs(), 8000);
    now += 3250;
    assert.equal(client.roomFresh(), true);
    now += 6751;
    assert.equal(
      client.roomFresh(),
      false,
      'bounded grace cannot hold a lost connection forever',
    );
    const state = freshCity();
    bridge.tickRoomCity(state, 1 / 60, new Set(['KeyW']));
    assert.equal(state.paused, true);
    assert.equal(state.speed, 0);
  } finally {
    await cleanup();
  }
});

void test('a first unexpectedly slow in-flight poll gets bounded grace before its first RTT sample', async () => {
  setup();
  try {
    now = 30000;
    await hostCity();
    nextResponseDelay = 25;
    const timer = timers.shift();
    timer.fn();
    now += 3000;
    assert.equal(client.roomFresh(), true);
    now += 7001;
    assert.equal(client.roomFresh(), false);
    await drain();
  } finally {
    await cleanup();
  }
});

void test('continuous analog steering on a 3s relay does not outrun bounded reliable frame delivery', async () => {
  setup();
  try {
    const host = (await api({ op: 'create', capacity: 2 })).body;
    await api({
      op: 'poll',
      code: host.code,
      token: host.token,
      snapshot: {
        scene: 'city',
        epoch: 0,
        brief: false,
        state: freshCity(),
        driver: 1,
      },
      snapshotSeq: 1,
    });
    nextRtt = 3000;
    await client.openRoom('Driver', 2, host.code);
    await drain();
    client.captureRoomInput(new Set());
    for (let cycle = 0; cycle < 5; cycle++) {
      nextResponseDelay = 25;
      const timer = timers.shift();
      timer.fn();
      for (let frame = 0; frame < 60; frame++) {
        now += 50;
        client.captureRoomInput(new Set(), {
          throttle: Math.cos(frame / 10),
          steer: 0.5,
        });
        assert.equal(
          client.roomSnapshot().status,
          'connected',
          'analog samples must not fill the reliable queue',
        );
      }
      await drain();
      const received =
        (await api({ op: 'poll', code: host.code, token: host.token })).body
          .frames['1'] ?? [];
      assert.ok(received.length <= 60);
      if (received.length)
        await api({
          op: 'poll',
          code: host.code,
          token: host.token,
          acks: { 1: received.at(-1).seq },
        });
    }
    assert.equal(client.roomSnapshot().ping, 3000);
  } finally {
    await cleanup();
  }
});

void test('a healthy slow guest stays controllable on a fast host after an input-only timeout', async () => {
  setup();
  try {
    const { code, guest, epoch } = await hostCity(1);
    const state = freshCity();
    await api({
      op: 'poll',
      code,
      token: guest.token,
      frames: [{ seq: 1, epoch, keys: [] }],
    });
    await nextPoll();
    bridge.tickRoomCity(state, 0.1, new Set());
    await api({
      op: 'poll',
      code,
      token: guest.token,
      frames: [{ seq: 2, epoch, keys: ['KeyW'] }],
    });
    await nextPoll();
    bridge.tickRoomCity(state, 0.1, new Set());
    assert.ok(state.speed > 0);
    for (let i = 0; i < 6; i++) {
      now += 250;
      await nextPoll();
      bridge.tickRoomCity(state, 0.1, new Set());
    }
    assert.equal(client.roomSnapshot().frozen, false);
    assert.equal(client.roomFresh(), true);
    const before = state.speed;
    await api({
      op: 'poll',
      code,
      token: guest.token,
      frames: [{ seq: 3, epoch, keys: ['KeyW'] }],
    });
    await nextPoll();
    bridge.tickRoomCity(state, 0.1, new Set());
    assert.ok(
      state.speed > before,
      'healthy held input from a slow guest must resume after its next response',
    );
  } finally {
    await cleanup();
  }
});
void test('screen resume discards held controls delivered during pause and requires new neutral input', async () => {
  setup();
  try {
    const { code, guest } = await hostCity();
    const state = freshGame(2);
    state.paused = false;
    state.frameTwist = 0.7;
    client.publishRoomWorld({
      scene: 'screen',
      epoch: 200,
      state,
      brief: false,
    });
    await nextPoll();
    bridge.tickRoomScreen(state, 1 / 60, new Set());
    // Both frames were created before the guest could see the host's pause.
    await api({
      op: 'poll',
      code,
      token: guest.token,
      frames: [
        { seq: 1, epoch: 200, keys: [] },
        { seq: 2, epoch: 200, keys: ['KeyW'] },
      ],
    });
    bridge.roomCommand({ kind: 'pause' }, 0);
    await nextPoll();
    bridge.tickRoomScreen(state, 0.1, new Set());
    assert.equal(state.paused, true);
    const before = state.frameTwist;
    bridge.roomCommand({ kind: 'resume' }, 0);
    bridge.tickRoomScreen(state, 0.1, new Set());
    assert.equal(
      state.frameTwist,
      before,
      'pre-pause queued hold must not reactivate at resume',
    );
    await api({
      op: 'poll',
      code,
      token: guest.token,
      frames: [{ seq: 3, epoch: 200, keys: ['KeyW'] }],
    });
    await nextPoll();
    bridge.tickRoomScreen(state, 0.1, new Set());
    assert.equal(
      state.frameTwist,
      before,
      'a still-held control cannot bypass the resume latch',
    );
    await api({
      op: 'poll',
      code,
      token: guest.token,
      frames: [
        { seq: 4, epoch: 200, keys: [] },
        { seq: 5, epoch: 200, keys: ['KeyW'] },
      ],
    });
    await nextPoll();
    bridge.tickRoomScreen(state, 0.1, new Set());
    assert.ok(
      state.frameTwist > before,
      'release and new press restore control after resume',
    );
  } finally {
    await cleanup();
  }
});

for (const scene of ['clean', 'moving'])
  void test(`${scene}: begin, late third slot, shared pause and restart preserve host authority`, async () => {
    setup();
    try {
      const { code } = await hostCity(0, 3);
      bridge.roomCommand({ kind: 'start-story', value: scene });
      const world = client.roomWorld();
      assert.equal(world.scene, scene);
      assert.equal(world.brief, true);
      await nextPoll();
      const third = await api({ op: 'join', code, name: 'Third' });
      assert.equal(third.status, 200);
      bridge.roomCommand({ kind: 'begin' }, 1);
      assert.equal(client.roomWorld().brief, true);
      bridge.roomCommand({ kind: 'begin' }, 0);
      await nextPoll();
      const tick =
        scene === 'clean' ? bridge.tickRoomClean : bridge.tickRoomMoving;
      const state = structuredClone(client.roomWorld().state);
      tick(state, 1 / 60, new Set());
      assert.equal(state.players, 3);
      assert.equal(state.actorCount, scene === 'clean' ? 1 : 3);
      if (scene === 'moving') assert.equal(state.actors.length, 3);
      assert.equal(state.phase, scene === 'clean' ? 'duty' : 'moving');
      bridge.roomCommand({ kind: 'pause' }, 2);
      tick(state, 1 / 60, new Set());
      assert.equal(state.paused, true);
      bridge.roomCommand({ kind: 'resume' }, 2);
      tick(state, 1 / 60, new Set());
      assert.equal(state.paused, true);
      bridge.roomCommand({ kind: 'resume' }, 0);
      tick(state, 1 / 60, new Set());
      assert.equal(state.paused, false);
      const epoch = client.roomWorld().epoch;
      bridge.roomCommand({ kind: 'restart' }, 1);
      assert.equal(client.roomWorld().epoch, epoch);
      bridge.roomCommand({ kind: 'restart' }, 0);
      assert.equal(client.roomWorld().epoch, epoch + 1);
      assert.equal(client.roomWorld().brief, true);
      bridge.roomCommand({ kind: 'exit' }, 0);
      assert.equal(client.roomWorld().scene, 'city');
    } finally {
      await cleanup();
    }
  });

void test('moving: host sub-frame action and remote short press/release pick up once with independent slots', async () => {
  setup();
  try {
    const { code, guest } = await hostCity();
    bridge.roomCommand({ kind: 'start-story', value: 'moving' });
    bridge.roomCommand({ kind: 'begin' });
    const world = client.roomWorld(),
      state = world.state;
    Object.assign(state.actors[0], {
      x: state.items[0].x,
      y: state.items[0].y + 35,
    });
    Object.assign(state.actors[1], {
      x: state.items[1].x,
      y: state.items[1].y + 35,
    });
    await nextPoll();
    bridge.tickRoomMoving(state, 1 / 60, new Set());
    bridge.roomCommand({ kind: 'action', value: 'input' });
    for (let frame = 0; frame < 4; frame++)
      bridge.tickRoomMoving(state, 1 / 240, new Set());
    assert.equal(state.actors[0].heldItem, 0);
    await api({
      op: 'poll',
      code,
      token: guest.token,
      frames: [
        { seq: 1, epoch: world.epoch, keys: [] },
        {
          seq: 2,
          epoch: world.epoch,
          keys: ['KeyE'],
          command: { kind: 'action', value: 'input' },
        },
        { seq: 3, epoch: world.epoch, keys: [] },
      ],
    });
    await nextPoll();
    for (let frame = 0; frame < 16; frame++)
      bridge.tickRoomMoving(state, 1 / 240, new Set());
    assert.equal(state.actors[1].heldItem, 1);
    assert.equal(state.items[0].carrier, 0);
    assert.equal(state.items[1].carrier, 1);
  } finally {
    await cleanup();
  }
});

void test('clean: Q only controls the anonymous soldier, not another participant', () => {
  assert.equal(bridge.mapRoomKeys(new Set(['KeyQ']), 0, 0).has('KeyQ'), true);
  assert.equal(bridge.mapRoomKeys(new Set(['KeyQ']), 1, 0).has('KeyQ'), false);
  assert.equal(bridge.mapRoomKeys(new Set(['KeyQ']), 2, 0).has('KeyQ'), false);
});

void test('explicit host exit stops its desktop server before a delayed leave can affect a new session', async () => {
  setup();
  try {
    await hostCity();
    let stopped = 0;
    globalThis.window = {
      wellcumNetwork: {
        stop: async () => {
          stopped++;
        },
        disconnect: async () => {},
      },
    };
    nextResponseDelay = 30;
    const closing = client.closeRoomSession();
    assert.equal(
      stopped,
      1,
      'stop must be queued synchronously with explicit exit',
    );
    await client.openRoom('Новая компания', 2);
    await drain();
    const nextCode = client.roomSnapshot().code;
    await closing;
    assert.equal(client.roomSnapshot().code, nextCode);
    assert.equal(client.roomActive(), true);
    assert.equal(stopped, 1);
  } finally {
    await cleanup();
  }
});

void test('a guest exit and an ordinary room switch do not stop a desktop server', async () => {
  setup();
  try {
    let stopped = 0;
    globalThis.window = {
      wellcumNetwork: {
        stop: async () => {
          stopped++;
        },
        disconnect: async () => {},
      },
    };
    await client.openRoom('Ведущий', 2);
    await drain();
    await client.openRoom('Новая компания', 2);
    await drain();
    assert.equal(stopped, 0);
    await client.leaveRoom();
    const host = (await api({ op: 'create', name: 'Друг' })).body;
    await client.openRoom('Гость', 2, host.code);
    await drain();
    assert.equal(client.roomSnapshot().slot, 1);
    await client.closeRoomSession();
    assert.equal(stopped, 0);
  } finally {
    await cleanup();
  }
});

void test('leader transfers only chosen actors, pauses without resetting and survives every scene transition', async () => {
  setup();
  try {
    const { code } = await hostCity(0, 3);
    await api({ op: 'join', code, name: 'Третий' });
    await nextPoll();
    const city = client.roomWorld().state;
    city.x = 42;
    bridge.roomCommand({ kind: 'leader', value: 2 });
    await nextPoll();
    assert.equal(client.roomHost(), true, 'simulator ownership does not move');
    assert.deepEqual(client.roomWorld().roles, [2, 1, 0]);
    assert.equal(client.roomWorld().driver, 2);
    assert.equal(city.paused, true);
    assert.equal(city.x, 42);
    bridge.roomCommand({ kind: 'start-story', value: 'moving' }, 0);
    assert.equal(
      client.roomWorld().scene,
      'city',
      'former leader cannot launch',
    );
    bridge.roomCommand({ kind: 'start-story', value: 'moving' }, 2);
    assert.equal(client.roomWorld().scene, 'moving');
    assert.deepEqual(client.roomWorld().roles, [2, 1, 0]);
    bridge.roomCommand({ kind: 'begin' }, 2);
    const moving = client.roomWorld().state;
    moving.actors[0].stamina = 42;
    const attempt = client.roomWorld().attempt;
    bridge.roomCommand({ kind: 'leader', value: 1 }, 2);
    await nextPoll();
    assert.deepEqual(client.roomWorld().roles, [1, 2, 0]);
    assert.equal(client.roomWorld().state, moving);
    assert.equal(client.roomWorld().state.actors[0].stamina, 42);
    assert.equal(
      client.roomWorld().attempt,
      attempt,
      'handoff cannot duplicate result credit',
    );
    assert.equal(bridge.roomRoleName(client.roomWorld(), 1), 'Ярик');
    assert.equal(bridge.roomRoleName(client.roomWorld(), 2), 'Настя');
    bridge.roomCommand({ kind: 'restart' }, 1);
    assert.deepEqual(client.roomWorld().roles, [1, 2, 0]);
    bridge.roomCommand({ kind: 'exit' }, 1);
    bridge.roomCommand({ kind: 'start-story', value: 'clean' }, 1);
    assert.equal(bridge.roomRoleName(client.roomWorld(), 1), 'Солдат');
    assert.equal(bridge.roomRoleName(client.roomWorld(), 2), 'Наблюдатель');
    bridge.roomCommand({ kind: 'episode', value: 'clean' }, 1);
    assert.equal(bridge.roomRoleName(client.roomWorld(), 1), 'Сослуживец');
    assert.equal(bridge.roomRoleName(client.roomWorld(), 2), 'Рома');
    bridge.roomCommand({ kind: 'exit' }, 1);
    bridge.roomCommand({ kind: 'start-story', value: 'screen' }, 1);
    bridge.roomCommand({ kind: 'restart' }, 1);
    assert.deepEqual(client.roomWorld().roles, [1, 2, 0]);
  } finally {
    await cleanup();
  }
});

void test('transfer invalidates remaining old-epoch commands and new leader can resume through the input latch', async () => {
  setup();
  try {
    const { code, guest, epoch } = await hostCity(0, 3);
    const third = (await api({ op: 'join', code, name: 'Третий' })).body;
    await nextPoll();
    bridge.roomCommand({ kind: 'leader', value: 1 });
    await nextPoll();
    const currentEpoch = client.roomWorld().epoch;
    const send = (token, frames) => api({ op: 'poll', code, token, frames });
    await send(guest.token, [
      {
        seq: 1,
        epoch: currentEpoch,
        keys: [],
        command: { kind: 'leader', value: 2 },
      },
    ]);
    await send(third.token, [
      {
        seq: 1,
        epoch: currentEpoch,
        keys: [],
        command: { kind: 'start-story', value: 'moving' },
      },
    ]);
    await nextPoll();
    bridge.tickRoomCity(freshCity(), 0.1, new Set());
    assert.equal(
      client.roomWorld().scene,
      'city',
      'old command cannot gain authority through another member’s transfer',
    );
    assert.deepEqual(client.roomWorld().roles, [2, 0, 1]);
    assert.ok(client.roomWorld().epoch > epoch);
    await nextPoll();
    await send(third.token, [
      {
        seq: 2,
        epoch: client.roomWorld().epoch,
        keys: [],
        command: { kind: 'resume' },
      },
    ]);
    await nextPoll();
    bridge.tickRoomCity(freshCity(), 0.1, new Set());
    assert.equal(
      client.roomWorld().state.paused,
      false,
      'management command is independent of gameplay release latch',
    );
    const speed = client.roomWorld().state.speed;
    await send(third.token, [
      { seq: 3, epoch: client.roomWorld().epoch, keys: ['KeyW'] },
    ]);
    await nextPoll();
    bridge.tickRoomCity(freshCity(), 0.1, new Set());
    assert.equal(
      client.roomWorld().state.speed,
      speed,
      'held control from before resume stays disarmed',
    );
    await send(third.token, [
      { seq: 4, epoch: client.roomWorld().epoch, keys: [] },
      { seq: 5, epoch: client.roomWorld().epoch, keys: ['KeyW'] },
    ]);
    await nextPoll();
    bridge.tickRoomCity(freshCity(), 0.1, new Set());
    assert.ok(client.roomWorld().state.speed > speed);
  } finally {
    await cleanup();
  }
});

for (const scene of ['city', 'screen', 'clean', 'moving'])
  void test(`${scene}: reconnect between host polls keeps progress, roles and score identity on a manual pause`, async () => {
    setup();
    try {
      const { code, guest } = await hostCity();
      if (scene !== 'city') {
        bridge.roomCommand({ kind: 'start-story', value: scene });
        bridge.roomCommand({ kind: 'begin' });
      }
      bridge.roomCommand({ kind: 'leader', value: 1 });
      await nextPoll();
      bridge.roomCommand({ kind: 'resume' }, 1);
      const world = client.roomWorld();
      world.state.elapsed = 143;
      const state = structuredClone(world.state);
      const epoch = world.epoch;
      const attempt = world.attempt;
      await nextPoll();
      now += 100;
      await api({ op: 'poll', code, token: guest.token, rejoin: true });
      await nextPoll();
      assert.equal(client.roomWorld().state.paused, true);
      assert.deepEqual(client.roomWorld().roles, [1, 0, 2]);
      assert.equal(client.roomWorld().attempt, attempt);
      assert.equal(client.roomWorld().epoch, epoch + 1);
      assert.equal(client.roomWorld().state.elapsed, state.elapsed);
      assert.equal(client.roomSnapshot().frozen, true);
      bridge.roomCommand({ kind: 'restart' }, 1);
      assert.equal(
        client.roomWorld().epoch,
        epoch + 1,
        'waiting room cannot restart from queued input',
      );
      await nextPoll();
      assert.equal(client.roomSnapshot().frozen, false);
      assert.equal(
        client.roomWorld().state.paused,
        true,
        'successful reconnection does not resume itself',
      );
      bridge.roomCommand({ kind: 'resume' }, 1);
      assert.equal(client.roomWorld().state.paused, false);
    } finally {
      await cleanup();
    }
  });

void test('closed tab explicitly restores saved participant token without joining or taking another seat', async () => {
  setup();
  try {
    const host = (await api({ op: 'create', name: 'Host', capacity: 2 })).body;
    const guest = (await api({ op: 'join', code: host.code, name: 'Guest' }))
      .body;
    await api({
      op: 'poll',
      code: host.code,
      token: host.token,
      snapshotSeq: 1,
      snapshot: {
        scene: 'moving',
        epoch: 4,
        roles: [1, 0, 2],
        attempt: 3,
        brief: false,
        driver: 1,
        state: { paused: true, elapsed: 88 },
      },
    });
    localStorage.setItem(
      'wellcum-room-return-v5',
      JSON.stringify({ code: host.code, token: guest.token, slot: 1 }),
    );
    assert.equal(client.savedRoomCode(), host.code);
    client.restoreRoom();
    assert.equal(
      client.roomActive(),
      false,
      'new tabs never automatically steal an active session',
    );
    client.returnToSavedRoom();
    await drain();
    assert.equal(client.roomSnapshot().slot, 1);
    assert.equal(client.roomWorld().scene, 'moving');
    assert.equal(client.roomWorld().state.elapsed, 88);
    assert.ok(requests.every(({ payload }) => payload.op === 'poll'));
    assert.equal(requests[0].payload.rejoin, true);
    assert.equal(client.roomSnapshot().roster.length, 2);
  } finally {
    await cleanup();
  }
});

void test('returning leader to simulator owner cannot resume before the paused role snapshot is acknowledged', async () => {
  setup();
  try {
    await hostCity();
    bridge.roomCommand({ kind: 'leader', value: 1 });
    await nextPoll();
    bridge.roomCommand({ kind: 'leader', value: 0 }, 1);
    assert.equal(client.roomFresh(), false);
    bridge.roomCommand({ kind: 'resume' });
    assert.equal(client.roomWorld().state.paused, true);
    const epoch = client.roomWorld().epoch;
    await nextPoll();
    assert.equal(requests.at(-1).reply.status, 200);
    assert.equal(client.roomWorld().epoch, epoch);
    assert.equal(client.roomFresh(), true);
    bridge.roomCommand({ kind: 'resume' });
    assert.equal(client.roomWorld().state.paused, false);
  } finally {
    await cleanup();
  }
});

void test('late guest epoch resynchronizes without creating an endless chain of reconnect pauses', async () => {
  setup();
  try {
    const host = (await api({ op: 'create', name: 'Host', capacity: 2 })).body;
    await api({
      op: 'poll',
      code: host.code,
      token: host.token,
      snapshotSeq: 1,
      snapshot: {
        scene: 'city',
        epoch: 1,
        brief: false,
        state: freshCity(),
        driver: 0,
      },
    });
    await client.openRoom('Guest', 2, host.code);
    await drain();
    now += 200;
    client.captureRoomInput(new Set());
    await api({
      op: 'poll',
      code: host.code,
      token: host.token,
      snapshotSeq: 2,
      snapshot: {
        scene: 'moving',
        epoch: 2,
        brief: true,
        state: { paused: true },
        driver: 0,
      },
    });
    await nextPoll();
    assert.equal(client.roomSnapshot().status, 'reconnecting');
    await nextPoll();
    assert.equal(
      requests.at(-1).payload.rejoin,
      undefined,
      'stale input is not another transport break',
    );
    assert.equal(requests.at(-1).reply.body.pauseRevision, 0);
    assert.equal(client.roomWorld().epoch, 2);
    assert.equal(client.roomSnapshot().status, 'connected');
  } finally {
    await cleanup();
  }
});

void test('repeated neutral keepalives cannot bury a guest leader menu command behind a throttled host', async () => {
  setup();
  try {
    const { code, guest } = await hostCity();
    bridge.roomCommand({ kind: 'leader', value: 1 });
    await nextPoll();
    const epoch = client.roomWorld().epoch;
    const frames = Array.from({ length: 50 }, (_, i) => ({
      seq: i + 1,
      epoch,
      keys: [],
    }));
    frames.push({
      seq: 51,
      epoch,
      keys: [],
      command: { kind: 'start-story', value: 'clean' },
    });
    await api({ op: 'poll', code, token: guest.token, frames });
    await nextPoll();
    bridge.tickRoomCity(freshCity(), 0.05, new Set());
    assert.equal(client.roomWorld().scene, 'clean');
  } finally {
    await cleanup();
  }
});

void test('background polling does not replace another tab’s explicitly selected return identity', async () => {
  setup();
  try {
    const { code, guest } = await hostCity();
    const saved = JSON.stringify({ code, token: guest.token, slot: 1 });
    localStorage.setItem('wellcum-room-return-v5', saved);
    await nextPoll();
    assert.equal(localStorage.getItem('wellcum-room-return-v5'), saved);
  } finally {
    await cleanup();
  }
});

void test('clean handoff publishes a new epoch and discards old queued commands', async () => {
  setup();
  let unsubscribe = () => {};
  try {
    const { crewSpawn } = await import('../lib/game/clean/layout.ts');
    const { code, guest, epoch } = await hostCity();
    const state = freshClean(2);
    Object.assign(state, {
      phase: 'response',
      responseStage: 'gear',
      pantsLoaded: true,
      elapsed: 43,
      machine: 34,
      spin: 0.56,
      valve: 0.4,
      machineClean: 0.25,
      score: 321,
    });
    for (let i = 1; i < 3; i++) {
      state.npcs[i].x = crewSpawn.x + (i === 1 ? -25 : 25);
      state.npcs[i].y = crewSpawn.y;
    }
    const oldEpoch = epoch + 1;
    client.publishRoomWorld({
      scene: 'clean',
      epoch: oldEpoch,
      attempt: 7,
      state,
      brief: false,
      roles: [0, 1, 2],
      driver: 0,
    });
    await nextPoll();
    const queued = await api({
      op: 'poll',
      code,
      token: guest.token,
      frames: [
        { seq: 1, epoch: oldEpoch, keys: [] },
        { seq: 2, epoch: oldEpoch, keys: [], command: { kind: 'pause' } },
        { seq: 3, epoch: oldEpoch, keys: ['KeyA', 'KeyE'] },
      ],
    });
    assert.equal(queued.status, 200);
    await nextPoll();
    const previousWorld = client.roomWorld(),
      notifications = [];
    unsubscribe = client.subscribeRoom(() => {
      const world = client.roomWorld();
      notifications.push({
        epoch: world.epoch,
        attempt: world.attempt,
        phase: world.state.phase,
      });
    });
    bridge.tickRoomClean(state, 0.1, new Set());
    assert.deepEqual(notifications, [
      { epoch: oldEpoch + 1, attempt: 7, phase: 'clean' },
    ]);
    assert.equal(previousWorld.epoch, oldEpoch);
    assert.equal(state.actorCount, 2);
    assert.equal(state.score, 321);
    assert.equal(state.paused, false, 'old pause cannot cross the handoff');
    assert.deepEqual(client.roomWorld().roles, [0, 1, 2]);
    const before = { x: [...state.x], y: [...state.y] };
    bridge.tickRoomClean(state, 0.1, new Set());
    assert.deepEqual(state.x, before.x);
    assert.deepEqual(state.y, before.y);
    assert.equal(client.roomWorld().epoch, oldEpoch + 1);
    await nextPoll();
    const persisted = await api({ op: 'poll', code, token: guest.token });
    assert.equal(persisted.status, 200);
    assert.equal(persisted.body.snapshot.epoch, oldEpoch + 1);
    assert.equal(persisted.body.snapshot.attempt, 7);
    assert.equal(persisted.body.snapshot.state.phase, 'clean');
    const renewed = await api({
      op: 'poll',
      code,
      token: guest.token,
      frames: [
        { seq: 4, epoch: oldEpoch + 1, keys: [] },
        { seq: 5, epoch: oldEpoch + 1, keys: ['KeyD'] },
      ],
    });
    assert.equal(renewed.status, 200);
    await nextPoll();
    bridge.tickRoomClean(state, 0.1, new Set());
    assert.ok(state.x[1] > before.x[1]);
    assert.equal(state.x[0], before.x[0]);
    assert.equal(state.score, 321);
    assert.equal(client.roomWorld().attempt, 7);
  } finally {
    unsubscribe();
    await cleanup();
  }
});

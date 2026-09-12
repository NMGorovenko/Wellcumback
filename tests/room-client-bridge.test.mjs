import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleRoomRequest, MEMBER_STALE_MS } from '../lib/server/rooms.ts';
import { freshCity } from '../lib/game/city/engine.ts';
import { freshGame } from '../lib/game/screen/engine.ts';
import * as client from '../lib/game/network/room-client.ts';
import * as bridge from '../lib/game/network/room-game.ts';

const original = {
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  fetch: globalThis.fetch,
  performance: globalThis.performance,
  location: globalThis.location,
  sessionStorage: globalThis.sessionStorage,
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
  const prepare = (sql, values = []) => ({
    bind: (...next) => prepare(sql, next),
    first: async () => sqlite.prepare(sql).get(...values) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    run: async () => sqlite.prepare(sql).run(...values),
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
  handleRoomRequest(db, { version: 3, ...body }, 1000 + now);
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
      'wellcum-room-v3',
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
    assert.equal(client.roomWorld()?.epoch, 4);
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
      state.phase,
      'result',
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

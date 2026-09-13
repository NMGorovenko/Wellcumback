import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleRoomRequest, MEMBER_STALE_MS } from '../lib/server/rooms.ts';
import { freshCity } from '../lib/game/city/engine.ts';
import {
  changeLocalRacers,
  freshRace,
  startRace,
  tickRace,
} from '../lib/game/race/engine.ts';
import { raceCourse } from '../lib/game/race/course.ts';
import { neutralRaceInput } from '../lib/game/race/types.ts';
import { applyRaceCommand } from '../lib/game/network/room-race.ts';
import { ROOM_VERSION } from '../lib/game/network/room-types.ts';
import { setRoomConnection } from '../lib/game/network/room-transport.ts';
import * as client from '../lib/game/network/room-client.ts';
import * as bridge from '../lib/game/network/room-game.ts';

// Real room SQL and the production client/bridge; only time, storage and HTTP
// delivery are controlled. Each node:test file has its own process/singletons.
const original = Object.fromEntries(
  [
    'setTimeout',
    'clearTimeout',
    'fetch',
    'performance',
    'location',
    'window',
    'sessionStorage',
    'localStorage',
  ].map((key) => [key, globalThis[key]]),
);
let now, timers, db, sqlite, requests;
const pollWaiters = new Set();
function setup() {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const migration of ['0000_rooms.sql', '0001_reconnect_pause.sql'])
    sqlite.exec(
      readFileSync(new URL(`../drizzle/${migration}`, import.meta.url), 'utf8'),
    );
  const prepare = (sql, values = []) => ({
    bind: (...next) => prepare(sql, next),
    first: async (column) => {
      const row = sqlite.prepare(sql).get(...values);
      return row ? (column ? row[column] : row) : null;
    },
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
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  now = 0;
  timers = [];
  requests = [];
  pollWaiters.clear();
  globalThis.performance = { now: () => now };
  globalThis.location = { protocol: 'https:' };
  globalThis.window = undefined;
  for (const key of ['sessionStorage', 'localStorage']) {
    const storage = new Map();
    globalThis[key] = {
      getItem: (name) => storage.get(name) ?? null,
      setItem: (name, value) => storage.set(name, value),
      removeItem: (name) => storage.delete(name),
    };
  }
  globalThis.setTimeout = (fn, ms) => {
    const timer = { fn, ms };
    timers.push(timer);
    for (const done of pollWaiters) done();
    return timer;
  };
  globalThis.clearTimeout = (timer) => {
    timers = timers.filter((item) => item !== timer);
  };
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    const reply = await api(payload);
    requests.push({ payload: structuredClone(payload), reply });
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
const api = (body) =>
  handleRoomRequest(db, { version: ROOM_VERSION, ...body }, 1000 + now);
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
async function nextPoll() {
  const timer = timers.shift();
  assert.ok(timer, 'client must schedule the next poll');
  timer.fn();
  await drain();
  return requests.at(-1);
}
async function cleanup() {
  await client.leaveRoom();
  Object.assign(globalThis, original);
  sqlite.close();
}
const neutral = (count = 1) => Array.from({ length: count }, neutralRaceInput);
const input = (throttle = 0, steer = 0, extra = {}) => ({
  ...neutralRaceInput(),
  throttle,
  steer,
  ...extra,
});
const frame = (seq, epoch, raceInputs, command) => ({
  seq,
  epoch,
  keys: [],
  ...(raceInputs ? { raceInputs } : {}),
  ...(command ? { command } : {}),
});
const state = () => client.roomWorld().state;
function step(inputs = neutral(), dt = 1 / 60) {
  now += dt * 1000;
  bridge.tickRoomRace(state(), dt, inputs);
}
function raceWorld(s, epoch = 1) {
  return {
    scene: 'race',
    epoch,
    attempt: epoch,
    brief: s.phase === 'lobby',
    state: s,
  };
}
async function serverParty() {
  const created = await api({ op: 'create', name: 'Host', capacity: 3 });
  assert.equal(created.status, 201);
  const host = created.body;
  const joined = await api({ op: 'join', code: host.code, name: 'Guest' });
  assert.equal(joined.status, 200);
  const guest = joined.body;
  const pollHost = (body = {}) =>
    api({ op: 'poll', code: host.code, token: host.token, ...body });
  const pollGuest = (body = {}) =>
    api({ op: 'poll', code: host.code, token: guest.token, ...body });
  return { host, guest, pollHost, pollGuest };
}
async function serverLobby(pollHost, localCount = 2) {
  const s = freshRace();
  changeLocalRacers(s, 0, localCount, 'Host');
  changeLocalRacers(s, 1, 1, 'Guest');
  s.racers.forEach((r) => {
    r.ready = true;
  });
  const world = raceWorld(s);
  assert.equal(
    (await pollHost({ snapshot: world, snapshotSeq: 1 })).status,
    200,
  );
  const start = structuredClone(world);
  assert.ok(startRace(start.state, raceCourse(start.state.trackId)));
  start.epoch++;
  start.attempt = start.epoch;
  start.brief = false;
  return { world, start };
}
async function hostLobby(localCount = 1) {
  await client.openRoom('Host', 3);
  await drain();
  const code = client.roomSnapshot().code;
  const guestReply = await api({ op: 'join', code, name: 'Guest' });
  assert.equal(guestReply.status, 200);
  const guest = guestReply.body;
  const pollGuest = (body = {}) =>
    api({ op: 'poll', code, token: guest.token, ...body });
  client.publishRoomWorld({
    scene: 'city',
    epoch: 100,
    state: freshCity(),
    brief: false,
  });
  await nextPoll();
  bridge.roomCommand({ kind: 'start-race' });
  if (localCount === 2) bridge.roomCommand({ kind: 'race-local', value: 2 });
  await nextPoll();
  return { code, guest, pollGuest };
}
async function readyHostLobby() {
  const revision = state().revision;
  for (const member of client.roomSnapshot().roster)
    bridge.roomCommand({ kind: 'race-ready', revision }, member.slot);
  await nextPoll();
  assert.ok(client.raceLobbyConfirmed());
  return revision;
}
async function acceptedHostRace(localCount = 2) {
  const party = await hostLobby(localCount);
  const revision = await readyHostLobby();
  bridge.roomCommand({ kind: 'race-start', revision });
  assert.equal(client.raceStartConfirmed(), false);
  assert.equal((await nextPoll()).reply.status, 200);
  assert.ok(client.raceStartConfirmed());
  // Skip only the three-second display countdown, after the real start CAS.
  state().phase = 'racing';
  state().countdown = 0;
  await nextPoll();
  step(neutral(localCount));
  return party;
}

void test('race guest preserves a 20ms second-local throttle/steer tap and release through real SQL', async () => {
  setup();
  try {
    const host = (await api({ op: 'create', name: 'Host', capacity: 3 })).body;
    await client.openRoom('Guest', 3, host.code);
    await drain();
    const s = freshRace();
    changeLocalRacers(s, 1, 2, 'Guest');
    s.racers.forEach((r) => {
      r.ready = true;
    });
    const pollHost = (body = {}) =>
      api({ op: 'poll', code: host.code, token: host.token, ...body });
    assert.equal(
      (await pollHost({ snapshot: raceWorld(s), snapshotSeq: 1 })).status,
      200,
    );
    const started = structuredClone(s);
    assert.ok(startRace(started, raceCourse(started.trackId)));
    assert.equal(
      (await pollHost({ snapshot: raceWorld(started, 2), snapshotSeq: 2 }))
        .status,
      200,
    );
    await nextPoll();
    const capture = (inputs) =>
      client.captureRoomInput(new Set(), undefined, undefined, inputs);
    capture(neutral(2));
    now += 10;
    capture([input(), input(1, -1)]);
    now += 10;
    capture(neutral(2));
    await nextPoll();
    const sent = requests.at(-1).payload.frames;
    assert.deepEqual(
      sent.map((f) => f.raceInputs.map((i) => [i.throttle, i.steer])),
      [
        [
          [0, 0],
          [0, 0],
        ],
        [
          [0, 0],
          [1, -1],
        ],
        [
          [0, 0],
          [0, 0],
        ],
      ],
    );
    const received = (await pollHost()).body.frames['1'];
    assert.deepEqual(
      received.map((f) => f.seq),
      sent.map((f) => f.seq),
    );
    const duplicate = await api({
      op: 'poll',
      code: host.code,
      token: requests.find((r) => r.payload.op === 'join').reply.body.token,
      frames: sent,
    });
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.ack, sent.at(-1).seq);
    assert.equal(
      (await pollHost()).body.frames['1'].length,
      3,
      'retransmission must not duplicate the pulse',
    );
  } finally {
    await cleanup();
  }
});

void test('race start CAS rejects a join interleaved after its read and preserves unsaved lobby input/ACK', async () => {
  setup();
  try {
    const { code, pollGuest } = await hostLobby();
    const revision = await readyHostLobby();
    const epoch = client.roomWorld().epoch;
    const colorId = state().racers.find((r) => r.memberSlot === 1).colorId;
    assert.equal(
      (
        await pollGuest({
          frames: [
            frame(1, epoch, undefined, {
              kind: 'race-car',
              localIndex: 0,
              vehicleId: 'amg-one',
              colorId,
            }),
          ],
        })
      ).status,
      200,
    );
    await nextPoll();
    bridge.roomCommand({ kind: 'race-start', revision });
    const tentative = structuredClone(client.roomWorld());
    for (let i = 0; i < 24; i++) step(neutral(), 1 / 240);
    assert.deepEqual(
      client.roomWorld(),
      tentative,
      'pending start must not simulate or consume old-epoch commands',
    );
    const batch = db.batch.bind(db);
    let joined;
    db.batch = async (statements) => {
      db.batch = batch;
      joined = await api({ op: 'join', code, name: 'Late guest' });
      return batch(statements);
    };
    const rejected = await nextPoll();
    assert.equal(joined.status, 200);
    assert.equal(rejected.reply.status, 409);
    assert.equal(rejected.reply.body.error.code, 'RACE_LOBBY_CHANGED');
    assert.equal(rejected.payload.acks['1'] ?? 0, 0);
    const recovered = await nextPoll();
    assert.equal(recovered.payload.snapshot, undefined);
    assert.equal(recovered.payload.acks['1'] ?? 0, 0);
    assert.equal(state().phase, 'lobby');
    assert.equal(client.roomWorld().epoch, epoch);
    assert.equal(
      recovered.reply.body.frames['1'][0].seq,
      1,
      'failed start must not delete saved config',
    );
    step();
    assert.equal(
      state().racers.find((r) => r.memberSlot === 1).vehicleId,
      'amg-one',
    );
    assert.deepEqual(
      state().racers.map((r) => r.id),
      ['0:0', '1:0', '2:0'],
    );
    assert.ok(state().racers.every((r) => !r.ready));
    await nextPoll();
    assert.equal(
      requests.at(-1).reply.body.frames['1'],
      undefined,
      'ACK follows applying and saving the config',
    );
  } finally {
    await cleanup();
  }
});

void test('accepted race freezes car/track roster, rejects active joins, and permits result joins', async () => {
  setup();
  try {
    const { host, pollHost } = await serverParty();
    const { start } = await serverLobby(pollHost);
    assert.equal(
      (await pollHost({ snapshot: start, snapshotSeq: 2 })).status,
      200,
    );
    assert.equal(
      (await api({ op: 'join', code: host.code, name: 'Late' })).body.error
        .code,
      'GAME_STARTED',
    );
    for (const mutate of [
      (s) => {
        s.trackId = 'nordschleife';
      },
      (s) => {
        s.racers[0].vehicleId = 'amg-one';
      },
      (s) => {
        s.racers.splice(1, 1);
        s.players--;
      },
    ]) {
      const changed = structuredClone(start);
      changed.state.phase = 'racing';
      mutate(changed.state);
      const reply = await pollHost({ snapshot: changed, snapshotSeq: 3 });
      assert.equal(reply.status, 400);
      assert.equal(reply.body.error.code, 'INVALID_SNAPSHOT');
    }
    const result = structuredClone(start);
    result.state.phase = 'result';
    result.state.paused = true;
    assert.equal(
      (await pollHost({ snapshot: result, snapshotSeq: 3 })).status,
      200,
    );
    const late = await api({ op: 'join', code: host.code, name: 'Late' });
    assert.equal(late.status, 200);
    assert.equal(late.body.slot, 2);
    assert.deepEqual(
      late.body.snapshot.state.racers.map((r) => r.id),
      ['0:0', '0:1', '1:0'],
      'result join never adds a car to the completed run',
    );
  } finally {
    await cleanup();
  }
});

void test('race config owns only the authenticated device; stale ready and prototype vehicle are rejected', async () => {
  setup();
  try {
    const { pollGuest } = await hostLobby(2);
    const oldRevision = await readyHostLobby();
    const epoch = client.roomWorld().epoch;
    const hostCars = structuredClone(
      state().racers.filter((r) => r.memberSlot === 0),
    );
    const guest = state().racers.find((r) => r.memberSlot === 1);
    const command = {
      kind: 'race-car',
      localIndex: 0,
      vehicleId: 'toString',
      colorId: guest.colorId,
    };
    const rejected = await pollGuest({
      frames: [frame(1, epoch, undefined, command)],
    });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error.code, 'INVALID_COMMAND');
    assert.equal(
      applyRaceCommand(
        client.roomWorld(),
        command,
        1,
        client.roomSnapshot().roster,
      ),
      null,
    );
    assert.equal(guest.vehicleId, 'mustang');
    const accepted = await pollGuest({
      frames: [
        frame(1, epoch, undefined, { ...command, vehicleId: 'amg-one' }),
        frame(2, epoch, undefined, {
          kind: 'race-ready',
          revision: oldRevision,
        }),
      ],
    });
    assert.equal(
      accepted.status,
      200,
      'invalid packet must not consume sequence 1',
    );
    await nextPoll();
    step(neutral(2));
    step(neutral(2));
    assert.equal(guest.vehicleId, 'amg-one');
    assert.deepEqual(
      state()
        .racers.filter((r) => r.memberSlot === 0)
        .map((r) => ({ ...r, ready: true })),
      hostCars,
    );
    assert.ok(state().revision > oldRevision);
    assert.ok(
      state().racers.every((r) => !r.ready),
      'old revision cannot ready a newly configured car',
    );
    await nextPoll();
    assert.equal(
      requests.at(-1).reply.status,
      200,
      'invalid vehicle must not poison future snapshots',
    );
  } finally {
    await cleanup();
  }
});

void test('2 local racers + remote pulse match independent per-car inputs at 240Hz without replaying retransmissions', async () => {
  setup();
  try {
    const { pollGuest } = await acceptedHostRace(2);
    const epoch = client.roomWorld().epoch;
    const frames = [
      frame(1, epoch, neutral()),
      frame(2, epoch, [input(1, 0.5)]),
      frame(3, epoch, neutral()),
    ];
    assert.equal((await pollGuest({ frames })).status, 200);
    await nextPoll();
    await nextPoll(); // The relay still returns all three unacknowledged frames.
    const expected = structuredClone(state());
    const course = raceCourse(expected.trackId);
    const before = structuredClone(state());
    for (let fixed = 0; fixed < 6; fixed++) {
      const local = fixed < 3 ? [input(1), input(-1)] : neutral(2);
      const remote = fixed === 1 ? input(1, 0.5) : input();
      tickRace(
        expected,
        1 / 60,
        new Map([
          ['0:0', local[0]],
          ['0:1', local[1]],
          ['1:0', remote],
        ]),
        course,
      );
      for (let raf = 0; raf < 4; raf++) step(local, 1 / 240);
    }
    assert.ok(
      Math.abs(state().elapsed - before.elapsed - 0.1) < 1e-9,
      'one shared simulation clock, not one tick per car/view',
    );
    for (const actual of state().racers) {
      const wanted = expected.racers.find((r) => r.id === actual.id);
      const start = before.racers.find((r) => r.id === actual.id);
      assert.ok(
        Math.hypot(actual.car.x - start.car.x, actual.car.z - start.car.z) > 0,
        `${actual.id} must receive its own control`,
      );
      for (const key of ['x', 'z', 'vx', 'vz', 'speed', 'heading'])
        assert.ok(
          Math.abs(actual.car[key] - wanted.car[key]) < 1e-9,
          `${actual.id}.${key}: no swallowed or duplicated pulse`,
        );
    }
    await nextPoll();
    assert.equal(requests.at(-1).payload.acks['1'], 3);
    assert.equal(requests.at(-1).reply.body.frames['1'], undefined);
  } finally {
    await cleanup();
  }
});

void test('race guest rejoin preserves both local cars and attempt behind a durable manual-resume barrier', async () => {
  setup();
  try {
    const { pollGuest, guest } = await acceptedHostRace(2);
    const running = client.roomWorld();
    running.state.elapsed = 143;
    const remote = state().racers.find((r) => r.memberSlot === 1);
    remote.laps = 1;
    remote.passedGates = 4;
    remote.nextGate = 4;
    remote.score = 320;
    remote.car.x += 0.5;
    await nextPoll();
    const progress = structuredClone(client.roomWorld());
    assert.equal(
      (
        await pollGuest({
          frames: [frame(1, running.epoch, [input(1, 0, { reset: true })])],
        })
      ).status,
      200,
    );
    now += MEMBER_STALE_MS + 1;
    const returned = await pollGuest({ rejoin: true });
    assert.equal(returned.status, 200);
    assert.equal(returned.body.slot, guest.slot);
    assert.equal(returned.body.resumed, true);
    assert.equal(returned.body.frozen, true);
    const observed = await nextPoll();
    assert.equal(observed.reply.body.frozen, true);
    assert.ok(state().paused);
    assert.ok(client.roomWorld().epoch > progress.epoch);
    assert.equal(client.roomWorld().attempt, progress.attempt);
    assert.deepEqual(state(), { ...progress.state, paused: true });
    const acknowledged = await nextPoll();
    assert.equal(acknowledged.reply.body.frozen, false);
    assert.equal(
      acknowledged.reply.body.frames['1'],
      undefined,
      'pre-break reset/throttle cannot survive the barrier',
    );
    assert.ok(state().paused, 'transport reconnection is not gameplay resume');
    const paused = structuredClone(state());
    step(neutral(2));
    assert.deepEqual(state(), paused);
    const epoch = client.roomWorld().epoch;
    // Establish the paused epoch and a neutral packet, then hold throttle while
    // paused. Resume must still require a NEW neutral packet and press.
    await pollGuest({
      frames: [frame(2, epoch, neutral()), frame(3, epoch, [input(1)])],
    });
    await nextPoll();
    step(neutral(2));
    step(neutral(2));
    bridge.roomCommand({ kind: 'resume' });
    const before = structuredClone(state());
    step(neutral(2));
    step(neutral(2));
    assert.equal(
      remote.car.x,
      before.racers.find((r) => r.id === remote.id).car.x,
    );
    assert.equal(
      remote.car.z,
      before.racers.find((r) => r.id === remote.id).car.z,
    );
    assert.equal(remote.respawns, 0);
    await pollGuest({
      frames: [frame(4, epoch, neutral()), frame(5, epoch, [input(1)])],
    });
    await nextPoll();
    step(neutral(2));
    step(neutral(2));
    assert.ok(
      remote.car.speed > 0,
      'fresh neutral then press restores the same remote car',
    );
    assert.equal(remote.score, 320);
    assert.equal(remote.laps, 1);
    assert.deepEqual(
      state().racers.map((r) => r.id),
      ['0:0', '0:1', '1:0'],
    );
  } finally {
    await cleanup();
  }
});

void test('guest reconnect rearms two local seats only after BOTH controls return to neutral', async () => {
  setup();
  try {
    const host = (await api({ op: 'create', name: 'Host', capacity: 3 })).body;
    await client.openRoom('Guest', 3, host.code);
    await drain();
    const guestToken = requests.find((r) => r.payload.op === 'join').reply.body
      .token;
    const pollHost = (body = {}) =>
      api({ op: 'poll', code: host.code, token: host.token, ...body });
    const s = freshRace();
    changeLocalRacers(s, 1, 2, 'Guest');
    s.racers.forEach((r) => {
      r.ready = true;
    });
    assert.equal(
      (await pollHost({ snapshot: raceWorld(s), snapshotSeq: 1 })).status,
      200,
    );
    const running = structuredClone(s);
    assert.ok(startRace(running, raceCourse(running.trackId)));
    assert.equal(
      (await pollHost({ snapshot: raceWorld(running, 2), snapshotSeq: 2 }))
        .status,
      200,
    );
    await nextPoll();
    const capture = (inputs) =>
      client.captureRoomInput(new Set(), undefined, undefined, inputs);
    capture(neutral(2));
    now += 10;
    capture([input(1), input(1)]);
    await nextPoll();
    const rejoined = await api({
      op: 'poll',
      code: host.code,
      token: guestToken,
      rejoin: true,
    });
    assert.equal(rejoined.status, 200);
    assert.equal(rejoined.body.frozen, true);
    await nextPoll();
    const paused = {
      ...raceWorld({ ...running, paused: true }, 3),
      attempt: 2,
    };
    assert.equal(
      (
        await pollHost({
          snapshot: paused,
          snapshotSeq: 3,
          pauseAck: rejoined.body.pauseRevision,
        })
      ).body.frozen,
      false,
    );
    await nextPoll();
    assert.ok(client.roomFresh());
    now += 200;
    capture([input(1), input(1)]);
    now += 200;
    capture([input(), input(1)]);
    await nextPoll();
    const latched = requests.at(-1).payload.frames;
    assert.ok(latched.length > 0);
    assert.ok(
      latched.every((f) =>
        f.raceInputs.every(
          (i) => !i.throttle && !i.steer && !i.handbrake && !i.reset,
        ),
      ),
      'releasing one seat cannot rearm the other held seat',
    );
    now += 200;
    capture(neutral(2));
    now += 10;
    capture([input(), input(1)]);
    await nextPoll();
    const rearmed = requests.at(-1).payload.frames;
    assert.deepEqual(
      rearmed.at(-1).raceInputs.map((i) => i.throttle),
      [0, 1],
    );
    assert.ok(rearmed.every((f) => f.epoch === 3));
    assert.equal(client.roomWorld().attempt, 2);
    assert.deepEqual(
      state().racers.map((r) => r.id),
      ['0:0', '1:0', '1:1'],
    );
  } finally {
    await cleanup();
  }
});

void test('leaving an unconfirmed start cannot lock a new room with a lower epoch', async () => {
  setup();
  try {
    await hostLobby();
    const revision = await readyHostLobby();
    bridge.roomCommand({ kind: 'race-start', revision });
    assert.equal(client.raceStartConfirmed(), false);
    const abandonedEpoch = client.roomWorld().epoch;
    await client.leaveRoom();
    assert.ok(client.raceStartConfirmed());
    assert.equal(client.raceLobbyConfirmed(), false);
    await client.openRoom('New host', 3);
    await drain();
    const code = client.roomSnapshot().code;
    const joined = await api({ op: 'join', code, name: 'New guest' });
    assert.equal(joined.status, 200);
    client.publishRoomWorld({
      scene: 'city',
      epoch: 0,
      state: freshCity(),
      brief: false,
    });
    await nextPoll();
    bridge.roomCommand({ kind: 'start-race' });
    await nextPoll();
    const epoch = client.roomWorld().epoch;
    assert.ok(epoch < abandonedEpoch);
    const guestCommand = await api({
      op: 'poll',
      code,
      token: joined.body.token,
      frames: [frame(1, epoch, undefined, { kind: 'race-local', value: 2 })],
    });
    assert.equal(guestCommand.status, 200);
    await nextPoll();
    step();
    assert.deepEqual(
      state().racers.map((r) => r.id),
      ['0:0', '1:0', '1:1'],
      'new room must consume guest config despite the older pending epoch',
    );
    assert.ok(client.raceStartConfirmed());
    const nextRevision = await readyHostLobby();
    bridge.roomCommand({ kind: 'race-start', revision: nextRevision });
    assert.equal((await nextPoll()).reply.status, 200);
    assert.ok(client.raceStartConfirmed());
    assert.equal(state().phase, 'countdown');
  } finally {
    await cleanup();
  }
});

for (const savedBeforeRecovery of [false, true])
  void test(`endpoint recovery during tentative start restores saved ${savedBeforeRecovery ? 'countdown' : 'lobby'} without join or automatic resume`, async () => {
    setup();
    try {
      const oldEndpoint = {
        url: 'wss://old.example/rooms',
        accessKey: 'a'.repeat(64),
      };
      const nextEndpoint = { ...oldEndpoint, url: 'wss://next.example/rooms' };
      globalThis.window = {
        wellcumNetwork: {
          disconnect: async () => {},
          request: async (connection, payload) => {
            const reply = await api(payload);
            requests.push({
              connection: structuredClone(connection),
              payload: structuredClone(payload),
              reply,
            });
            return reply;
          },
        },
      };
      setRoomConnection(oldEndpoint);
      const { code } = await hostLobby(2);
      const token = requests.find((r) => r.payload.op === 'create').reply.body
        .token;
      const revision = await readyHostLobby();
      const savedLobby = structuredClone(client.roomWorld());
      bridge.roomCommand({ kind: 'race-start', revision });
      assert.equal(client.raceStartConfirmed(), false);
      const tentative = structuredClone(client.roomWorld());
      if (savedBeforeRecovery) {
        // The old relay commits the actual start, but the client never receives
        // that reply. Recovery must discover which side of the CAS survived.
        const saved = await api({
          op: 'poll',
          code,
          token,
          snapshot: tentative,
          snapshotSeq: requests.at(-1).payload.snapshotSeq + 1,
        });
        assert.equal(saved.status, 200);
      }
      const firstRecoveryRequest = requests.length;
      client.updateRoomConnection(code, nextEndpoint);
      assert.equal(
        client.roomWorld(),
        null,
        'discard a start whose commit status is unknown',
      );
      assert.ok(client.raceStartConfirmed());
      assert.equal(client.raceLobbyConfirmed(), false);
      await drain();
      const recovered = requests.at(-1);
      assert.equal(recovered.reply.status, 200);
      assert.equal(recovered.payload.snapshot, undefined);
      assert.equal(recovered.payload.rejoin, true);
      const saved = savedBeforeRecovery ? tentative : savedLobby;
      assert.equal(state().phase, saved.state.phase);
      assert.equal(client.roomWorld().attempt, saved.attempt);
      assert.ok(client.roomWorld().epoch > saved.epoch);
      assert.deepEqual(state(), { ...saved.state, paused: true });
      assert.equal(recovered.reply.body.frozen, true);
      const acknowledged = await nextPoll();
      assert.equal(acknowledged.reply.status, 200);
      assert.equal(acknowledged.reply.body.frozen, false);
      assert.ok(state().paused, 'a recovered countdown requires manual resume');
      const paused = structuredClone(state());
      step(neutral(2));
      assert.deepEqual(state(), paused);
      assert.ok(
        requests
          .slice(firstRecoveryRequest)
          .every(
            (r) =>
              r.payload.op === 'poll' &&
              r.payload.code === code &&
              r.payload.token === token &&
              r.connection.url === nextEndpoint.url,
          ),
        'retarget the same credential; never create or join a different room',
      );
    } finally {
      await cleanup();
    }
  });

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  handleRoomRequest,
  MAX_INPUT_FRAMES,
  MEMBER_STALE_MS,
  ROOM_TTL_MS,
} from '../lib/server/rooms.ts';

function database() {
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
  return {
    sqlite,
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
}
const call = (db, body, now = 1000) =>
  handleRoomRequest(db, { version: 5, ...body }, now);
const frame = (seq, keys = [], epoch = 0, command) => ({
  seq,
  epoch,
  keys,
  ...(command ? { command } : {}),
});
const snapshot = (epoch = 0, scene = 'city', brief = false) => ({
  epoch,
  attempt: epoch,
  roles: [0, 1, 2],
  scene,
  brief,
  state: { phase: 'frame', paused: false },
  driver: 0,
});
async function party(capacity = 3) {
  const db = database();
  const created = await call(db, { op: 'create', capacity, name: 'Рома' });
  assert.equal(created.status, 201);
  const host = created.body;
  const joined = await call(db, { op: 'join', code: host.code, name: 'Ярик' });
  assert.equal(joined.status, 200);
  const guest = joined.body;
  const hostPoll = (body = {}, now = 1000) =>
    call(db, { op: 'poll', code: host.code, token: host.token, ...body }, now);
  const guestPoll = (body = {}, now = 1000) =>
    call(db, { op: 'poll', code: host.code, token: guest.token, ...body }, now);
  return { db, host, guest, hostPoll, guestPoll };
}

void test('version required; bounded short code and hashed distinct credentials; no secret in views', async () => {
  const db = database();
  assert.equal(
    (await handleRoomRequest(db, { op: 'create' }, 1000)).body.error.code,
    'VERSION_MISMATCH',
  );
  const created = await call(db, { op: 'create' });
  const host = created.body;
  assert.match(host.code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
  assert.match(host.token, /^[a-f0-9]{64}$/);
  assert.equal(host.slot, 0);
  assert.equal(host.ack, 0);
  assert.equal(host.frozen, false, 'host can drive while waiting alone');
  const member = db.sqlite.prepare('SELECT * FROM room_members').get();
  assert.notEqual(member.token_hash, host.token);
  const view = await call(db, {
    op: 'poll',
    code: host.code,
    token: host.token,
  });
  assert.equal(JSON.stringify(view).includes(host.token), false);
  assert.equal(JSON.stringify(view).includes(member.token_hash), false);
  assert.equal(
    (await call(db, { op: 'poll', code: host.code, token: 'f'.repeat(64) }))
      .status,
    401,
  );
  assert.equal((await call(db, { op: 'join', code: 'bad' })).status, 400);
});

void test('stable slots, capacity and private guest views; guest cannot write state or acknowledgements', async () => {
  const { db, host, guest, hostPoll, guestPoll } = await party();
  const third = await call(db, { op: 'join', code: host.code, name: 'Никита' });
  assert.equal(guest.slot, 1);
  assert.equal(third.body.slot, 2);
  assert.equal(
    (await call(db, { op: 'join', code: host.code })).body.error.code,
    'ROOM_FULL',
  );
  assert.equal(
    (await guestPoll({ snapshot: snapshot(), snapshotSeq: 1 })).status,
    403,
  );
  assert.equal((await guestPoll({ acks: { 1: 99 } })).status, 403);
  await guestPoll({ frames: [frame(1, ['KeyE'])] });
  assert.deepEqual((await guestPoll()).body.frames, {});
  assert.equal((await hostPoll()).body.frames['1'][0].seq, 1);
  assert.equal(
    (await guestPoll({ frames: [frame(2, ['Enter'])] })).status,
    400,
  );
});

void test('press/release taps survive batching, retries and cumulative acknowledgement exactly once', async () => {
  const { hostPoll, guestPoll } = await party();
  const frames = [
    frame(1, ['KeyE']),
    frame(2, []),
    frame(3, ['KeyQ']),
    frame(4, []),
  ];
  assert.equal((await guestPoll({ frames })).body.ack, 4);
  assert.equal((await guestPoll({ frames })).body.ack, 4);
  assert.deepEqual((await hostPoll()).body.frames['1'], frames);
  await hostPoll({ acks: { 1: 2 } });
  assert.deepEqual((await hostPoll()).body.frames['1'], frames.slice(2));
  await hostPoll({ acks: { 1: 4 } });
  assert.deepEqual((await hostPoll()).body.frames, {});
  assert.equal((await guestPoll({ frames })).body.ack, 4);
  assert.deepEqual(
    (await hostPoll()).body.frames,
    {},
    'retries cannot replay consumed actions',
  );
  assert.equal(
    (await guestPoll({ frames: [frame(6)] })).body.error.code,
    'INPUT_SEQUENCE_GAP',
  );
  assert.equal((await guestPoll({ frames: [frame(5)] })).body.ack, 5);
});

void test('queue cap is bounded and resumes after host ack; 120 frames use bounded SQL statement count', async () => {
  const { db, host, hostPoll, guestPoll } = await party();
  const frames = Array.from({ length: MAX_INPUT_FRAMES }, (_, index) =>
    frame(index + 1),
  );
  assert.equal((await guestPoll({ frames })).body.ack, MAX_INPUT_FRAMES);
  assert.equal(
    (await guestPoll({ frames: [frame(121)] })).body.error.code,
    'INPUT_QUEUE_FULL',
  );
  assert.equal(
    db.sqlite
      .prepare('SELECT COUNT(*) n FROM room_frames WHERE room_code=?')
      .get(host.code).n,
    120,
  );
  await hostPoll({ acks: { 1: 120 } });
  assert.equal((await guestPoll({ frames: [frame(121)] })).body.ack, 121);
});

void test('host epoch invalidates old inputs, stale snapshot retries cannot roll back, active story locks join', async () => {
  const { db, host, hostPoll, guestPoll } = await party();
  await hostPoll({ snapshot: snapshot(), snapshotSeq: 1 });
  await guestPoll({ frames: [frame(1, ['KeyQ'])] });
  const current = snapshot(1, 'screen', false);
  const update = await hostPoll({ snapshot: current, snapshotSeq: 2 });
  assert.deepEqual(update.body.snapshot, current);
  assert.deepEqual(update.body.frames, {});
  assert.equal(
    (await guestPoll({ frames: [frame(2)] })).body.error.code,
    'STALE_EPOCH',
  );
  assert.equal((await guestPoll({ frames: [frame(2, [], 1)] })).body.ack, 2);
  assert.equal(
    (await hostPoll({ snapshot: snapshot(), snapshotSeq: 1 })).body.error.code,
    'STALE_SNAPSHOT',
  );
  await hostPoll({
    snapshot: { ...current, state: { phase: 'rods' } },
    snapshotSeq: 3,
  });
  await hostPoll({ snapshot: current, snapshotSeq: 2 });
  assert.equal((await hostPoll()).body.snapshot.state.phase, 'rods');
  assert.equal(
    (await call(db, { op: 'join', code: host.code })).body.error.code,
    'GAME_STARTED',
  );
  await hostPoll({ snapshot: snapshot(2, 'city'), snapshotSeq: 4 });
  assert.equal((await call(db, { op: 'join', code: host.code })).status, 200);
});

void test('presence freezes disconnected party, reconnect preserves slot/ack; explicit guest leave keeps identity', async () => {
  const { db, host, guest, hostPoll, guestPoll } = await party(2);
  await guestPoll({ frames: [frame(1)] });
  const now = 1000 + MEMBER_STALE_MS + 1;
  const stale = await hostPoll({}, now);
  assert.equal(stale.body.frozen, true);
  assert.equal(stale.body.roster[1].connected, false);
  const rejoined = await guestPoll({}, now);
  assert.equal(rejoined.body.slot, 1);
  assert.equal(rejoined.body.ack, 1);
  assert.equal(
    rejoined.body.frozen,
    true,
    'first reconnect response freezes until neutral input',
  );
  assert.equal(rejoined.body.resumed, true);
  assert.equal(
    (await guestPoll({}, now)).body.frozen,
    true,
    'return remains frozen until host saves a pause',
  );
  assert.equal(rejoined.body.roster[1].id, guest.roster[1].id);
  await call(db, { op: 'leave', code: host.code, token: guest.token }, now);
  assert.equal((await hostPoll({}, now)).body.frozen, true);
  assert.equal(
    (await call(db, { op: 'join', code: host.code }, now)).body.error.code,
    'ROOM_FULL',
  );
  assert.equal((await guestPoll({}, now)).body.resumed, true);
  assert.equal(
    (await guestPoll({}, now)).body.frozen,
    true,
    'return remains frozen until host saves a pause',
  );
  assert.deepEqual((await hostPoll({}, now)).body.frames, {});
});

void test('reconnect discards buffered/offline presses but keeps monotonic acknowledgement', async () => {
  const { hostPoll, guestPoll } = await party();
  await guestPoll({ frames: [frame(1, ['KeyQ'])] });
  const now = 1000 + MEMBER_STALE_MS + 1;
  await hostPoll({}, now);
  const reconnect = await guestPoll(
    { frames: [frame(2, [], 0, { kind: 'action' })] },
    now,
  );
  assert.equal(reconnect.body.ack, 2);
  assert.equal(reconnect.body.resumed, true);
  assert.deepEqual((await hostPoll({}, now)).body.frames, {});
  await guestPoll({ frames: [frame(3)] }, now);
  assert.deepEqual((await hostPoll({}, now)).body.frames['1'], [frame(3)]);
});

void test('concurrent joins atomically take distinct vacant slots; expired room cleanup cascades', async () => {
  const db = database();
  const host = (await call(db, { op: 'create' })).body;
  const joined = await Promise.all([
    call(db, { op: 'join', code: host.code }),
    call(db, { op: 'join', code: host.code }),
  ]);
  assert.deepEqual(
    joined.map((reply) => reply.body.slot).sort((a, b) => a - b),
    [1, 2],
  );
  const guest = joined[0].body;
  await call(db, {
    op: 'poll',
    code: host.code,
    token: guest.token,
    frames: [frame(1)],
  });
  await call(db, { op: 'create' }, 1000 + ROOM_TTL_MS);
  assert.equal(
    db.sqlite
      .prepare('SELECT COUNT(*) n FROM rooms WHERE code=?')
      .get(host.code).n,
    0,
  );
  assert.equal(
    db.sqlite
      .prepare('SELECT COUNT(*) n FROM room_members WHERE room_code=?')
      .get(host.code).n,
    0,
  );
  assert.equal(
    db.sqlite
      .prepare('SELECT COUNT(*) n FROM room_frames WHERE room_code=?')
      .get(host.code).n,
    0,
  );
});

void test('host leave closes room; expired tokens cannot resurrect it', async () => {
  const { db, host, hostPoll, guestPoll } = await party();
  assert.equal(
    (await hostPoll({}, 1000 + ROOM_TTL_MS)).body.error.code,
    'ROOM_EXPIRED',
  );
  await call(db, { op: 'leave', code: host.code, token: host.token });
  assert.equal((await guestPoll()).body.error.code, 'ROOM_CLOSED');
  assert.equal(
    (await call(db, { op: 'join', code: host.code })).body.error.code,
    'ROOM_CLOSED',
  );
});

void test('bounded payloads reject invalid objects, forged slots, unsupported commands and excessive snapshots', async () => {
  const { hostPoll, guestPoll } = await party();
  assert.equal(
    (await hostPoll({ snapshot: snapshot() })).body.error.code,
    'STALE_SNAPSHOT',
  );
  assert.equal(
    (
      await hostPoll({
        snapshot: { ...snapshot(), state: { value: NaN } },
        snapshotSeq: 1,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await hostPoll({
        snapshot: { ...snapshot(), state: { value: 'x'.repeat(97000) } },
        snapshotSeq: 1,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await hostPoll({
        snapshot: { ...snapshot(), state: { value: 'я'.repeat(60000) } },
        snapshotSeq: 2,
      })
    ).status,
    413,
  );
  assert.equal(
    (await guestPoll({ frames: [frame(1, [], 0, { kind: 'evil' })] })).status,
    400,
  );
  assert.equal(
    (
      await guestPoll({
        frames: [{ ...frame(1), drive: { throttle: 4, steer: 0 } }],
      })
    ).status,
    400,
  );
  const injected = JSON.parse(
    '{"phase":"frame","__proto__":{"polluted":true}}',
  );
  assert.equal(
    (
      await hostPoll({
        snapshot: { ...snapshot(), state: injected },
        snapshotSeq: 2,
      })
    ).status,
    400,
  );
  assert.equal(
    (await guestPoll({ frames: [frame(1, [], 0, { kind: 'start-screen' })] }))
      .body.ack,
    1,
  );
});

void test('slow 3s polling and one missed response retain presence; a real gap still freezes and discards offline commands', async () => {
  const { hostPoll, guestPoll } = await party(2);
  for (let index = 1; index <= 3; index++) {
    const now = 1000 + index * 3250;
    const guest = await guestPoll({ frames: [frame(index, ['KeyW'])] }, now);
    assert.equal(guest.body.resumed, false);
    assert.equal(guest.body.frozen, false);
    const host = await hostPoll({}, now);
    assert.equal(host.body.resumed, false);
    assert.equal(host.body.frozen, false);
    assert.equal(host.body.frames['1'].at(-1).seq, index);
  }
  const lastSeen = 10750;
  assert.equal((await hostPoll({}, lastSeen + 6500)).body.frozen, false);
  const lostAt = lastSeen + MEMBER_STALE_MS + 1;
  assert.equal((await hostPoll({}, lostAt)).body.frozen, true);
  const resumed = await guestPoll({ frames: [frame(4, ['KeyE'])] }, lostAt);
  assert.equal(resumed.body.resumed, true);
  assert.equal(resumed.body.ack, 4);
  assert.deepEqual((await hostPoll({}, lostAt)).body.frames, {});
});

void test('brief disconnect cannot disappear between host polls; only saved host pause acknowledges it', async () => {
  const { hostPoll, guestPoll } = await party(2);
  const world = snapshot(8, 'moving');
  world.state = {
    paused: false,
    elapsed: 312,
    bags: [{ id: 4, carriers: [0, 1] }],
    alertProgress: 0.6,
  };
  world.roles = [1, 0, 2];
  world.state.paused = true;
  await hostPoll({ snapshot: world, snapshotSeq: 1 });
  world.state.paused = false;
  await hostPoll({ snapshot: world, snapshotSeq: 2 });
  const returned = await guestPoll({ rejoin: true }, 1010);
  assert.equal(returned.body.pauseRevision, 1);
  assert.equal(returned.body.frozen, true);
  const late = await hostPoll({ snapshot: world, snapshotSeq: 3 }, 1011);
  assert.equal(late.body.frozen, true, 'host cannot overlook a fast reconnect');
  assert.equal(late.body.snapshot.state.paused, true);
  assert.deepEqual(late.body.snapshot.state.bags, world.state.bags);
  assert.deepEqual(late.body.snapshot.roles, [1, 0, 2]);
  assert.equal((await guestPoll({ pauseAck: 1 }, 1012)).status, 403);
  assert.equal(
    (await hostPoll({ snapshot: world, snapshotSeq: 4, pauseAck: 1 }, 1012))
      .status,
    400,
  );
  world.state.paused = true;
  world.epoch++;
  const ack = await hostPoll(
    { snapshot: world, snapshotSeq: 4, pauseAck: 1 },
    1013,
  );
  assert.equal(ack.body.frozen, false);
  assert.equal(
    ack.body.snapshot.state.paused,
    true,
    'ack is not an automatic resume',
  );
  world.state.paused = false;
  assert.equal(
    (await hostPoll({ snapshot: world, snapshotSeq: 5 }, 1014)).body.snapshot
      .state.paused,
    false,
  );
});

void test('active host can keep a disconnected friend’s slot and progress beyond six hours', async () => {
  const { host, guest, hostPoll, guestPoll } = await party(2);
  const world = snapshot(7, 'clean');
  world.state = {
    paused: true,
    spots: [{ x: 14, y: 30, clean: 0.7 }],
    elapsed: 230,
  };
  await hostPoll({ snapshot: world, snapshotSeq: 1 });
  for (let hour = 1; hour <= 12; hour++) {
    const reply = await hostPoll({}, 1000 + hour * 3600000);
    assert.equal(reply.status, 200);
    assert.ok(reply.body.expiresAt > host.expiresAt);
  }
  const returned = await guestPoll({}, 1000 + 12 * 3600000 + 1);
  assert.equal(returned.status, 200);
  assert.equal(returned.body.slot, guest.slot);
  assert.deepEqual(returned.body.snapshot.state, world.state);
});

void test('role permutation validates a connected target, new epoch and pause; guest leader remains unable to publish state', async () => {
  const { db, host, hostPoll, guestPoll } = await party(3);
  await hostPoll({ snapshot: snapshot(1), snapshotSeq: 1 });
  const next = { ...snapshot(2), roles: [2, 1, 0], state: { paused: true } };
  assert.equal(
    (await hostPoll({ snapshot: next, snapshotSeq: 2 })).status,
    400,
    'missing member cannot lead',
  );
  await call(db, { op: 'join', code: host.code, name: 'Третий' });
  assert.equal(
    (
      await hostPoll({
        snapshot: { ...next, epoch: 1, attempt: 1 },
        snapshotSeq: 2,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await hostPoll({
        snapshot: { ...next, state: { paused: false } },
        snapshotSeq: 2,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await hostPoll({
        snapshot: { ...next, roles: [2, 2, 0] },
        snapshotSeq: 2,
      })
    ).status,
    400,
  );
  assert.equal(
    (await hostPoll({ snapshot: next, snapshotSeq: 2 })).status,
    200,
  );
  assert.deepEqual((await guestPoll()).body.snapshot.roles, [2, 1, 0]);
  assert.equal(
    (await guestPoll({ snapshot: next, snapshotSeq: 3 })).status,
    403,
  );
});

void test('duplicate snapshot sequence cannot acknowledge a pause that was never saved', async () => {
  const { hostPoll, guestPoll } = await party(2);
  const world = snapshot(1);
  await hostPoll({ snapshot: world, snapshotSeq: 5 });
  await guestPoll({ rejoin: true });
  const reply = await hostPoll({
    snapshot: { ...world, state: { paused: true } },
    snapshotSeq: 5,
    pauseAck: 1,
  });
  assert.equal(reply.status, 200);
  assert.equal(
    reply.body.snapshot.state.paused,
    false,
    'stale snapshot correctly ignored',
  );
  assert.equal(
    reply.body.frozen,
    true,
    'unsaved paused payload is not a valid acknowledgement',
  );
});

void test('concurrent host epoch cannot keep a returning guest offline', async () => {
  const { db, host, guestPoll, hostPoll } = await party(2);
  await hostPoll({ snapshot: snapshot(1), snapshotSeq: 1 });
  const now = 1000 + MEMBER_STALE_MS + 100;
  const batch = db.batch.bind(db);
  let interleave = true;
  db.batch = async (statements) => {
    if (interleave) {
      interleave = false;
      const next = snapshot(2);
      next.state.paused = true;
      await hostPoll({ snapshot: next, snapshotSeq: 2 }, now);
    }
    return batch(statements);
  };
  const returned = await guestPoll({}, now + 1);
  assert.equal(returned.status, 200);
  assert.equal(returned.body.resumed, true);
  assert.equal(returned.body.roster.find((p) => p.slot === 1).connected, true);
  const next = await guestPoll({}, now + 120);
  assert.equal(next.body.resumed, false);
  assert.equal(next.body.pauseRevision, returned.body.pauseRevision);
  assert.equal(
    next.body.frozen,
    true,
    'manual paused snapshot acknowledgement is still required',
  );
  assert.equal(
    db.sqlite.prepare('SELECT epoch FROM rooms WHERE code = ?').get(host.code)
      .epoch,
    2,
  );
});

void test('room protocol carries the six-speed city at 115 km/h and preserves it through the reconnect pause', async () => {
  const { freshCity, tickCity } = await import('../lib/game/city/engine.ts');
  const { hostPoll, guestPoll } = await party(2);
  const city = { ...freshCity(), x: -104, z: -63, heading: Math.PI / 2 };
  for (let i = 0; i < 360; i++) tickCity(city, 1 / 60, new Set(['KeyW']));
  const world = { ...snapshot(3), state: city };
  const published = await hostPoll({ snapshot: world, snapshotSeq: 1 });
  assert.equal(published.status, 200);
  const seen = await guestPoll();
  assert.equal(seen.body.snapshot.state.speed, 32);
  assert.equal(seen.body.snapshot.state.powertrain.gear, 6);
  assert.deepEqual(seen.body.snapshot.state.powertrain, city.powertrain);
  await hostPoll({}, 1000 + MEMBER_STALE_MS + 1);
  const back = await guestPoll({ rejoin: true }, 1000 + MEMBER_STALE_MS + 2);
  assert.equal(back.status, 200);
  assert.equal(back.body.frozen, true);
  const held = await hostPoll(
    { snapshot: world, snapshotSeq: 2 },
    1000 + MEMBER_STALE_MS + 3,
  );
  assert.equal(held.body.snapshot.state.paused, true);
  assert.equal(back.body.snapshot.state.speed, 32);
  assert.deepEqual(back.body.snapshot.state.powertrain, city.powertrain);
});

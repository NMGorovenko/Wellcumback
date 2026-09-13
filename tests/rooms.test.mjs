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
  handleRoomRequest(db, { version: 4, ...body }, now);
const frame = (seq, keys = [], epoch = 0, command) => ({
  seq,
  epoch,
  keys,
  ...(command ? { command } : {}),
});
const snapshot = (epoch = 0, scene = 'city', brief = false) => ({
  epoch,
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
  assert.equal((await guestPoll({}, now)).body.frozen, false);
  assert.equal(rejoined.body.roster[1].id, guest.roster[1].id);
  await call(db, { op: 'leave', code: host.code, token: guest.token }, now);
  assert.equal((await hostPoll({}, now)).body.frozen, true);
  assert.equal(
    (await call(db, { op: 'join', code: host.code }, now)).body.error.code,
    'ROOM_FULL',
  );
  assert.equal((await guestPoll({}, now)).body.resumed, true);
  assert.equal((await guestPoll({}, now)).body.frozen, false);
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

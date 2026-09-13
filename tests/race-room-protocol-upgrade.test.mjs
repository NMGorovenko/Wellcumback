/** Actual persisted v6 SQLite upgrade. Usage: node --test /tmp/race-room-protocol-upgrade.test.mjs
 * Optional checkout: FRIENDSLOP_CHECKOUT=/absolute/path node --test ...
 * Creates and removes only its own directory under os.tmpdir().
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(process.env.FRIENDSLOP_CHECKOUT || process.cwd());
const moduleAt = (file) => import(pathToFileURL(join(root, file)).href);
const { createRoomDatabase } = await moduleAt('server/sqlite.ts');
const { handleRoomRequest, ROOM_VERSION } = await moduleAt(
  'lib/server/rooms.ts',
);
const { freshRace, freshRacer } = await moduleAt('lib/game/race/engine.ts');
const baseSchema = readFileSync(join(root, 'drizzle/0000_rooms.sql'), 'utf8');
const oldPauseSchema = readFileSync(
  join(root, 'drizzle/0001_reconnect_pause.sql'),
  'utf8',
);
const now = 1_000_000;
const sha = (value) => createHash('sha256').update(value).digest('hex');
const dump = (sqlite) =>
  Object.fromEntries(
    ['rooms', 'room_members', 'room_frames'].map((table) => [
      table,
      sqlite
        .prepare(`SELECT * FROM ${table} ORDER BY 1, 2`)
        .all()
        .map((row) => ({ ...row })),
    ]),
  );
const withoutProtocol = (rows) =>
  rows.map(({ protocol_version: _version, ...row }) => row);

void test('saved v6 AMG ONE and old Mustang Nordschleife survive migration but never restore into v7', async () => {
  assert.equal(
    ROOM_VERSION,
    7,
    'Fixture intentionally tests the v6 -> v7 boundary',
  );
  const directory = mkdtempSync(join(tmpdir(), 'friendslop-room-upgrade-'));
  const filename = join(directory, 'rooms.sqlite');
  let store;
  try {
    const legacy = new DatabaseSync(filename);
    legacy.exec(baseSchema + '\n' + oldPauseSchema);
    const fixtures = [
      {
        code: 'A2B3C4D5',
        vehicle: 'amg-one',
        phase: 'lobby',
        epoch: 5,
        attempt: 5,
      },
      {
        code: 'E6F7G8H9',
        vehicle: 'mustang',
        phase: 'racing',
        epoch: 8,
        attempt: 7,
      },
    ];
    for (const [index, fixture] of fixtures.entries()) {
      const state = freshRace();
      state.trackId = 'nordschleife';
      state.phase = fixture.phase;
      state.paused = false;
      state.players = 2;
      state.racers.push(freshRacer(1, 0, 'Друг', 'blue'));
      state.elapsed = 143;
      state.racers[0].vehicleId = fixture.vehicle;
      // Real coordinates from the v6 Mutkurve: deliberately not migrated to v7 centreline.
      Object.assign(state.racers[0].car, { x: 369.01, z: -685.11, speed: 25 });
      Object.assign(state.racers[0], {
        elevation: -25.79,
        laps: 1,
        nextGate: 4,
        passedGates: 4,
        score: 320,
      });
      const snapshot = {
        scene: 'race',
        epoch: fixture.epoch,
        state,
        brief: fixture.phase === 'lobby',
        driver: 0,
        roles: [0, 1, 2],
        attempt: fixture.attempt,
      };
      fixture.tokens = [
        (index * 2 + 1).toString(16).repeat(64),
        (index * 2 + 2).toString(16).repeat(64),
      ];
      legacy
        .prepare(
          'INSERT INTO rooms (code,capacity,snapshot,snapshot_seq,epoch,created_at,expires_at,closed_at,pause_revision,pause_ack) VALUES (?,3,?,32,?,?,?,NULL,2,1)',
        )
        .run(
          fixture.code,
          JSON.stringify(snapshot),
          fixture.epoch,
          now - 100,
          now + 6 * 3600_000,
        );
      for (const slot of [0, 1]) {
        legacy
          .prepare(
            'INSERT INTO room_members (room_code,id,slot,name,token_hash,last_seen,last_seq,left_at) VALUES (?,?,?,?,?,?,4,?)',
          )
          .run(
            fixture.code,
            `${fixture.code}-member-${slot}`,
            slot,
            slot ? 'Друг' : 'Ведущий',
            sha(fixture.tokens[slot]),
            now - 20,
            slot ? now - 10 : null,
          );
      }
      legacy
        .prepare(
          'INSERT INTO room_frames (room_code,slot,seq,epoch,payload,created_at) VALUES (?,1,4,?,?,?)',
        )
        .run(
          fixture.code,
          fixture.epoch,
          JSON.stringify({ seq: 4, epoch: fixture.epoch, keys: ['KeyW'] }),
          now - 30,
        );
    }
    const before = dump(legacy);
    legacy.close();
    // No new migration is passed: this exercises actual relay startup detection.
    store = createRoomDatabase(baseSchema, filename);
    const migrated = dump(store.sqlite);
    assert.deepEqual(
      withoutProtocol(migrated.rooms),
      before.rooms,
      'Room bytes/progress preserved',
    );
    assert.deepEqual(
      migrated.room_members,
      before.room_members,
      'Credentials, presence and ACK preserved',
    );
    assert.deepEqual(
      migrated.room_frames,
      before.room_frames,
      'Pending frames preserved',
    );
    assert.ok(migrated.rooms.every((room) => room.protocol_version === 6));
    for (const fixture of fixtures) {
      const requests = [
        ...fixture.tokens.flatMap((token) => [
          { op: 'poll', token },
          { op: 'poll', token, rejoin: true },
        ]),
        { op: 'join', name: 'Новый участник' },
      ];
      for (const request of requests) {
        const response = await handleRoomRequest(
          store.db,
          { version: ROOM_VERSION, code: fixture.code, ...request },
          now,
        );
        assert.equal(
          response.status,
          409,
          `${fixture.vehicle}/${request.op}/${!!request.rejoin}`,
        );
        assert.equal(response.body.error.code, 'VERSION_MISMATCH');
        assert.equal(
          response.body.snapshot,
          undefined,
          'Old world never reaches renderer',
        );
      }
    }
    assert.deepEqual(
      dump(store.sqlite),
      migrated,
      'Rejected restores do not touch progress, tokens, TTL, pause barrier or input ACK',
    );
    const created = await handleRoomRequest(
      store.db,
      { op: 'create', version: ROOM_VERSION, name: 'Новая игра' },
      now,
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.version, 7);
    const { code, token } = created.body;
    assert.equal(
      store.sqlite
        .prepare('SELECT protocol_version FROM rooms WHERE code=?')
        .get(code).protocol_version,
      7,
    );
    assert.equal(
      (
        await handleRoomRequest(
          store.db,
          { op: 'poll', version: 7, code, token },
          now + 1,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await handleRoomRequest(
          store.db,
          { op: 'join', version: 7, code, name: 'Друг' },
          now + 2,
        )
      ).status,
      200,
    );
    const after = dump(store.sqlite);
    store.close();
    store = createRoomDatabase(baseSchema, filename);
    assert.deepEqual(
      dump(store.sqlite),
      after,
      'Repeated app startup is idempotent',
    );
    assert.equal(
      (
        await handleRoomRequest(
          store.db,
          { op: 'poll', version: 7, code, token },
          now + 3,
        )
      ).status,
      200,
    );
  } finally {
    store?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

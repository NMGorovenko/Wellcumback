import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import { startRelay } from '../server/relay.ts';
import { RoomSocket } from '../lib/game/network/room-socket.ts';
import {
  makeInvitation,
  parseInvitation,
  validateConnection,
} from '../lib/game/network/connection.ts';
import { ROOM_VERSION } from '../lib/game/network/room-types.ts';
const schema = readFileSync(
  new URL('../drizzle/0000_rooms.sql', import.meta.url),
  'utf8',
);
const open = (connection) =>
  new RoomSocket(connection, (url) => new WebSocket(url));
void test('invitation carries only guest server access and room, rejects unsafe URLs and mismatched versions', () => {
  const connection = {
    url: 'wss://example.com/rooms',
    accessKey: 'a'.repeat(64),
  };
  const invitation = makeInvitation(connection, 'ABCD2345');
  assert.deepEqual(parseInvitation(invitation), {
    ...connection,
    code: 'ABCD2345',
    version: ROOM_VERSION,
  });
  assert.ok(
    !atob(invitation.slice(5).replace(/-/g, '+').replace(/_/g, '/')).includes(
      'token',
    ),
  );
  for (const url of [
    'file:///rooms',
    'https://example.com/rooms',
    'ws://example.com/rooms',
    'wss://user:pass@example.com/rooms',
    'wss://example.com/other',
  ])
    assert.throws(() => validateConnection({ ...connection, url }));
  assert.throws(() =>
    parseInvitation(
      'WCB1:' +
        btoa(JSON.stringify({ ...connection, code: 'ABCD2345', version: 1 })),
    ),
  );
});
void test('real WebSocket clients create, join, exchange all scene snapshots and recover same slot', async () => {
  const relay = await startRelay({ schema });
  const connection = {
    url: `ws://127.0.0.1:${relay.port}/rooms`,
    accessKey: relay.accessKey,
  };
  const host = open(connection),
    guest = open(connection),
    stranger = open({ ...connection, accessKey: '0'.repeat(64) });
  const request = (client, body) =>
    client.request({ version: ROOM_VERSION, ...body });
  try {
    await assert.rejects(stranger.connect());
    const created = await request(host, {
      op: 'create',
      name: 'Host',
      capacity: 3,
    });
    assert.equal(created.status, 201);
    const h = created.body;
    const joined = await request(guest, {
      op: 'join',
      name: 'Guest',
      code: h.code,
    });
    assert.equal(joined.status, 200);
    const g = joined.body;
    const hp = (extra = {}) =>
      request(host, { op: 'poll', code: h.code, token: h.token, ...extra });
    const gp = (extra = {}) =>
      request(guest, { op: 'poll', code: h.code, token: g.token, ...extra });
    let epoch = 0;
    for (const scene of ['city', 'screen', 'clean', 'moving']) {
      epoch++;
      const snapshot = {
        scene,
        epoch,
        attempt: epoch,
        roles: [0, 1, 2],
        brief: true,
        state: { paused: true, players: 2 },
        driver: 0,
      };
      assert.equal((await hp({ snapshot, snapshotSeq: epoch })).status, 200);
      assert.deepEqual((await gp()).body.snapshot, snapshot);
    }
    const denied = await gp({
      snapshot: {
        scene: 'city',
        epoch: 99,
        brief: false,
        state: {},
        driver: 0,
      },
      snapshotSeq: 99,
    });
    assert.equal(denied.status, 403);
    await gp({
      frames: [
        { seq: 1, epoch, keys: ['KeyW'] },
        { seq: 2, epoch, keys: [] },
      ],
    });
    assert.deepEqual(
      (await hp()).body.frames['1'].map((f) => f.keys),
      [['KeyW'], []],
    );
    guest.close();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await hp()).body.frozen, true);
    const returned = await gp();
    assert.equal(returned.body.slot, 1);
    assert.equal(returned.body.resumed, true);
    await hp({ acks: { 1: 2 } });
    assert.equal(
      (await request(host, { op: 'leave', code: h.code, token: h.token }))
        .status,
      200,
    );
    assert.equal((await gp()).status, 410);
  } finally {
    host.close();
    guest.close();
    stranger.close();
    await relay.close();
  }
});

void test('untrusted LAN-looking domains cannot carry an unencrypted invitation', () => {
  const connection = { accessKey: 'f'.repeat(64) };
  for (const host of [
    '10.attacker.example',
    '192.168.attacker.example',
    '127.attacker.example',
    '172.16.attacker.example',
    '8.8.8.8',
  ])
    assert.throws(() =>
      validateConnection({ ...connection, url: `ws://${host}/rooms` }),
    );
  for (const host of [
    '10.0.0.2',
    '192.168.1.22',
    '127.0.0.1',
    '172.16.0.1',
    'localhost',
    '[::1]',
    '[fd12::1]',
  ])
    assert.doesNotThrow(() =>
      validateConnection({ ...connection, url: `ws://${host}/rooms` }),
    );
});

void test('malformed replies before and after handshake reject instead of escaping the message handler', async () => {
  const { WebSocketServer } = await import('ws');
  for (const afterHello of [false, true])
    for (const malformed of [null, [], 7, 'broken']) {
      const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
      await new Promise((resolve) => server.once('listening', resolve));
      server.on('connection', (ws) => {
        let hello = false;
        ws.on('message', () => {
          if (afterHello && !hello) {
            hello = true;
            ws.send(JSON.stringify({ kind: 'hello', version: ROOM_VERSION }));
          } else ws.send(JSON.stringify(malformed));
        });
      });
      const client = open({
        url: `ws://127.0.0.1:${server.address().port}/rooms`,
        accessKey: '0'.repeat(64),
      });
      try {
        await assert.rejects(
          afterHello ? client.request({ op: 'poll' }) : client.connect(),
        );
      } finally {
        client.close();
        for (const peer of server.clients) peer.terminate();
        await new Promise((resolve) => server.close(resolve));
      }
    }
});

void test('VPN invitation roundtrips exact overlay subnet boundaries without permitting neighbouring public ranges', () => {
  for (const address of ['100.64.0.0', '100.127.255.255', '100.110.50.12']) {
    const connection = {
      url: `ws://${address}:31337/rooms`,
      accessKey: 'a'.repeat(64),
    };
    assert.equal(
      parseInvitation(makeInvitation(connection, 'ABCD2345')).url,
      connection.url,
    );
  }
  for (const address of [
    '100.63.255.255',
    '100.128.0.0',
    '100.64.0.1.evil.example',
    '100.999.0.1',
  ]) {
    assert.throws(() =>
      validateConnection({
        url: `ws://${address}:31337/rooms`,
        accessKey: 'a'.repeat(64),
      }),
    );
  }
});

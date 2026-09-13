import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { createDesktopNetwork, localAddresses } from '../desktop/network.ts';
import { startRelay } from '../server/relay.ts';
import { ROOM_VERSION } from '../lib/game/network/room-types.ts';
const schema = readFileSync(
  new URL('../drizzle/0000_rooms.sql', import.meta.url),
  'utf8',
);
const manager = () =>
  createDesktopNetwork({
    schema,
    binary: '/missing/cloudflared',
    tempRoot: os.tmpdir(),
  });

void test('parallel desktop host and immediate stop share one lifecycle', async () => {
  const network = manager();
  const first = network.host('lan');
  const second = network.host('lan');
  const stopped = network.stop();
  const [a, b] = await Promise.all([first, second, stopped]);
  assert.deepEqual(a, b);
  assert.equal((await network.status()).state, 'offline');
});

void test('desktop relay handles concurrent requests and closes every transport on stop', async () => {
  const relay = await startRelay({ schema });
  const network = manager();
  const connection = {
    url: `ws://127.0.0.1:${relay.port}/rooms`,
    accessKey: relay.accessKey,
  };
  try {
    const requests = await Promise.all(
      [0, 1].map((n) =>
        network.request(connection, {
          version: ROOM_VERSION,
          op: 'create',
          name: 'Peer' + n,
          capacity: 2,
        }),
      ),
    );
    assert.deepEqual(
      requests.map((r) => r.status),
      [201, 201],
    );
    await network.disconnect();
    const reconnected = await network.request(connection, {
      version: ROOM_VERSION,
      op: 'poll',
      code: requests[0].body.code,
      token: requests[0].body.token,
    });
    assert.equal(reconnected.status, 200);
    await network.stop();
  } finally {
    await network.stop();
    await relay.close();
  }
});

void test(
  'LAN host can be restarted and invitation stops accepting connections after stop',
  { skip: !localAddresses().length },
  async () => {
    const network = manager();
    try {
      const [first, second] = await Promise.all([
        network.host('lan'),
        network.host('lan'),
      ]);
      assert.equal(first.state, 'ready');
      assert.deepEqual(first, second);
      const created = await network.request(first.connection, {
        version: ROOM_VERSION,
        op: 'create',
        name: 'Host',
        capacity: 2,
      });
      assert.equal(created.status, 201);
      await network.stop();
      const next = await network.host('lan');
      assert.equal(next.state, 'ready');
      assert.notEqual(next.connection.accessKey, first.connection.accessKey);
    } finally {
      await network.stop();
    }
  },
);

void test('tunnel DNS fallback resolves current addresses without changing TLS or system DNS', async () => {
  const { tunnelEdgeArguments } = await import('../desktop/tunnel-dns.ts');
  const normal = await tunnelEdgeArguments({
    srv: async () => [{ name: 'edge' }],
    addresses: async () => {
      throw new Error('Must not be called');
    },
  });
  assert.deepEqual(normal, []);
  const names = [];
  const fallback = await tunnelEdgeArguments({
    srv: async () => {
      throw new Error('Local DNS refused');
    },
    addresses: async (name) => {
      names.push(name);
      return [
        { address: names.length === 1 ? '198.41.192.67' : '198.41.200.63' },
      ];
    },
  });
  assert.deepEqual(names, [
    'region1.v2.argotunnel.com',
    'region2.v2.argotunnel.com',
  ]);
  assert.deepEqual(fallback, [
    '--no-prechecks',
    '--edge',
    '198.41.192.67:7844',
    '--edge',
    '198.41.200.63:7844',
  ]);
  assert.ok(!fallback.includes('--no-tls-verify'));
  await assert.rejects(
    tunnelEdgeArguments({ srv: async () => [], addresses: async () => [] }),
    /DNS/,
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { WebSocket } from 'ws';
import { RoomSocket } from '../lib/game/network/room-socket.ts';
import { freshCity } from '../lib/game/city/engine.ts';
import {
  createDesktopNetwork,
  localAddresses,
  localInterfaces,
} from '../desktop/network.ts';
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

void test('tunnel crash and failed retry retain the relay, pause, credentials and progress until explicit stop', async () => {
  const launches = [];
  let failNext = false;
  const network = createDesktopNetwork({
    schema,
    binary: '/unused/provider',
    tempRoot: os.tmpdir(),
    async openTunnel(options) {
      launches.push(options);
      if (failNext) {
        failNext = false;
        throw new Error('Provider unavailable');
      }
      return {
        connection: {
          url: `wss://tunnel-${launches.length}.example/rooms`,
          accessKey: options.accessKey,
        },
        stop: async () => {},
      };
    },
  });
  let guest;
  const hostRequest = (connection, body) =>
    network.request(connection, { version: ROOM_VERSION, ...body });
  try {
    const first = await network.host('internet');
    const host = (
      await hostRequest(first.connection, {
        op: 'create',
        name: 'Host',
        capacity: 2,
      })
    ).body;
    guest = new RoomSocket(
      {
        url: `ws://127.0.0.1:${launches[0].port}/rooms`,
        accessKey: first.connection.accessKey,
      },
      (url) => new WebSocket(url),
    );
    const guestRequest = (body) =>
      guest.request({ version: ROOM_VERSION, ...body });
    const joined = (
      await guestRequest({ op: 'join', code: host.code, name: 'Guest' })
    ).body;
    const snapshot = {
      scene: 'city',
      epoch: 90,
      attempt: 72,
      roles: [1, 0, 2],
      driver: 1,
      brief: false,
      state: { ...freshCity(), x: 42, paused: true },
    };
    const saved = await hostRequest(first.connection, {
      op: 'poll',
      code: host.code,
      token: host.token,
      snapshot,
      snapshotSeq: 1,
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    snapshot.state.paused = false;
    assert.equal(
      (
        await hostRequest(first.connection, {
          op: 'poll',
          code: host.code,
          token: host.token,
          snapshot,
          snapshotSeq: 2,
        })
      ).status,
      200,
    );
    await guestRequest({
      op: 'poll',
      code: host.code,
      token: joined.token,
      frames: [{ seq: 1, epoch: 90, keys: ['KeyW'] }],
    });
    launches[0].onExit();
    assert.equal((await network.status()).recoverable, true);
    const paused = await hostRequest(first.connection, {
      op: 'poll',
      code: host.code,
      token: host.token,
    });
    assert.equal(paused.status, 200);
    assert.equal(paused.body.snapshot.state.paused, true);
    assert.equal(paused.body.snapshot.state.x, 42);
    assert.equal(paused.body.snapshot.attempt, 72);
    assert.deepEqual(paused.body.snapshot.roles, [1, 0, 2]);
    assert.equal(paused.body.frozen, true);
    assert.equal(paused.body.roster.find((p) => p.slot === 1).connected, false);
    assert.equal(
      Object.values(paused.body.frames).flat().length,
      0,
      'pre-crash held input is discarded',
    );
    if (localAddresses().length)
      await assert.rejects(
        network.host('lan', localAddresses()[0]),
        /Сначала закрой/,
      );
    failNext = true;
    assert.equal((await network.host('internet')).recoverable, true);
    const [restored, concurrent] = await Promise.all([
      network.host('internet'),
      network.host('internet'),
    ]);
    assert.deepEqual(restored, concurrent);
    assert.equal(launches.length, 3, 'concurrent retry shares one tunnel');
    assert.equal(restored.state, 'ready');
    assert.ok(!restored.recoverable);
    assert.notEqual(restored.connection.url, first.connection.url);
    assert.equal(restored.connection.accessKey, first.connection.accessKey);
    assert.ok(launches.every((item) => item.port === launches[0].port));
    launches[0].onExit();
    launches[1].onExit();
    assert.equal(
      (await network.status()).state,
      'ready',
      'old callbacks cannot break the recovered tunnel',
    );
    const returned = await guestRequest({
      op: 'poll',
      code: host.code,
      token: joined.token,
      rejoin: true,
    });
    assert.equal(returned.status, 200);
    assert.equal(returned.body.slot, 1);
    assert.equal(returned.body.snapshot.state.paused, true);
    const next = await hostRequest(restored.connection, {
      op: 'poll',
      code: host.code,
      token: host.token,
    });
    assert.equal(next.status, 200);
    assert.equal(next.body.snapshot.state.x, 42);
    assert.equal(next.body.snapshot.attempt, 72);
    assert.deepEqual(next.body.snapshot.roles, [1, 0, 2]);
    assert.equal(
      next.body.snapshot.state.paused,
      true,
      'recovery never resumes automatically',
    );
    assert.equal(
      (
        await hostRequest(first.connection, {
          op: 'poll',
          code: host.code,
          token: host.token,
        })
      ).status,
      200,
      'creator can still poll through the previous alias',
    );
    guest.close();
    await network.stop();
    launches[2].onExit();
    assert.equal((await network.status()).state, 'offline');
    const fresh = await network.host('internet');
    assert.notEqual(
      fresh.connection.accessKey,
      first.connection.accessKey,
      'only an explicit stop starts a new relay',
    );
    const missing = await hostRequest(fresh.connection, {
      op: 'poll',
      code: host.code,
      token: host.token,
    });
    assert.equal(missing.body.error.code, 'ROOM_NOT_FOUND');
  } finally {
    guest?.close();
    await network.stop();
  }
});

void test('stopping during a tunnel retry cancels the retry and closes the preserved relay', async () => {
  const launches = [];
  let resolveRetry, enteredRetry;
  const entered = new Promise((resolve) => (enteredRetry = resolve));
  let stopped = 0;
  const network = createDesktopNetwork({
    schema,
    binary: '/unused/provider',
    tempRoot: os.tmpdir(),
    async openTunnel(options) {
      launches.push(options);
      if (launches.length === 2) {
        enteredRetry();
        await new Promise((resolve) => (resolveRetry = resolve));
      }
      return {
        connection: {
          url: 'wss://retry.example/rooms',
          accessKey: options.accessKey,
        },
        stop: async () => {
          stopped++;
        },
      };
    },
  });
  try {
    await network.host('internet');
    launches[0].onExit();
    const retry = network.host('internet');
    await entered;
    const stopping = network.stop();
    resolveRetry();
    assert.equal((await retry).state, 'failed');
    await stopping;
    assert.equal((await network.status()).state, 'offline');
    assert.equal(stopped, 2, 'even a late provider result is closed');
    launches[1].onExit();
    assert.equal((await network.status()).state, 'offline');
  } finally {
    await network.stop();
  }
});

void test('a final stop cancels a host call waiting for an earlier stop', async () => {
  let finishStop, enteredStop;
  const entered = new Promise((resolve) => (enteredStop = resolve));
  let launches = 0;
  const network = createDesktopNetwork({
    schema,
    binary: '/unused/provider',
    tempRoot: os.tmpdir(),
    async openTunnel(options) {
      launches++;
      return {
        connection: {
          url: 'wss://cancel.example/rooms',
          accessKey: options.accessKey,
        },
        async stop() {
          enteredStop();
          await new Promise((resolve) => (finishStop = resolve));
        },
      };
    },
  });
  await network.host('internet');
  const stopping = network.stop();
  await entered;
  const restarting = network.host('internet');
  const finalStop = network.stop();
  finishStop();
  await Promise.all([stopping, restarting, finalStop]);
  assert.equal((await network.status()).state, 'offline');
  assert.equal(launches, 1, 'a cancelled pending start must not open a tunnel');
});

void test(
  'parallel desktop host and immediate stop share one lifecycle',
  { skip: !localAddresses().length },
  async () => {
    const network = manager();
    const first = network.host('lan', localAddresses()[0]);
    const second = network.host('lan', localAddresses()[0]);
    const stopped = network.stop();
    const [a, b] = await Promise.all([first, second, stopped]);
    assert.deepEqual(a, b);
    assert.equal((await network.status()).state, 'offline');
  },
);

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
        network.host('lan', localAddresses()[0]),
        network.host('lan', localAddresses()[0]),
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
      const next = await network.host('lan', localAddresses()[0]);
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

void test('LAN interface list preserves names, includes overlay range and rejects nonlocal/internal addresses', (t) => {
  const item = (address, internal = false, family = 'IPv4') => ({
    address,
    internal,
    family,
  });
  t.mock.method(os, 'networkInterfaces', () => ({
    wifi: [item('192.168.1.25'), item('fe80::1', false, 'IPv6')],
    tunnel: [item('100.64.0.0'), item('100.127.255.255')],
    ignored: [
      item('100.63.255.255'),
      item('100.128.0.0'),
      item('8.8.8.8'),
      item('10.0.0.4', true),
      item('10.999.1.1'),
      item('10.0.0.1.evil.test'),
    ],
    duplicate: [item('192.168.1.25')],
  }));
  assert.deepEqual(localInterfaces(), [
    { name: 'wifi', address: '192.168.1.25' },
    { name: 'tunnel', address: '100.64.0.0' },
    { name: 'tunnel', address: '100.127.255.255' },
  ]);
});

void test(
  'address validation cannot replace a live room; concurrent different selection cannot share a startup',
  { skip: !localAddresses().length },
  async (t) => {
    const actual = localAddresses()[0];
    let available = {
      wifi: [{ address: actual, family: 'IPv4', internal: false }],
      vpn: [{ address: '100.110.50.12', family: 'IPv4', internal: false }],
    };
    t.mock.method(os, 'networkInterfaces', () => available);
    const network = manager();
    try {
      await assert.rejects(network.host('lan'), /Выбери адрес/);
      const starting = network.host('lan', actual);
      await assert.rejects(
        network.host('lan', '100.110.50.12'),
        /Сначала закрой/,
      );
      const first = await starting;
      assert.equal(first.state, 'ready');
      assert.equal(first.selectedAddress, actual);
      assert.equal(new URL(first.connection.url).hostname, actual);
      const created = await network.request(first.connection, {
        version: ROOM_VERSION,
        op: 'create',
        name: 'Host',
        capacity: 2,
      });
      assert.equal(
        created.status,
        201,
        'self-host request reaches selected listener',
      );
      assert.deepEqual(
        (await network.host('lan', actual)).connection,
        first.connection,
      );
      available = {};
      await assert.rejects(network.host('lan', actual), /больше недоступна/);
      for (const invalid of [
        '8.8.8.8',
        '10.0.0.17',
        'localhost',
        'ws://' + actual,
        actual + ':8080',
        17,
      ]) {
        await assert.rejects(network.host('lan', invalid));
      }
      await assert.rejects(network.host('internet', actual));
      assert.equal((await network.status()).state, 'ready');
      assert.equal(
        (
          await network.request(first.connection, {
            version: ROOM_VERSION,
            op: 'poll',
            code: created.body.code,
            token: created.body.token,
          })
        ).status,
        200,
        'invalid choice does not close saved room',
      );
    } finally {
      await network.stop();
    }
  },
);

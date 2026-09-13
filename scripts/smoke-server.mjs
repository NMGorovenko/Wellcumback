/** Verify the packaged relay in its own Node process, including SQLite persistence. */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { RoomSocket } from '../lib/game/network/room-socket.ts';
import { ROOM_VERSION } from '../lib/game/network/room-types.ts';
const folder = await mkdtemp(path.join(os.tmpdir(), 'wellcum-server-smoke-'));
const reserve = createServer().listen(0, '127.0.0.1');
await once(reserve, 'listening');
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const accessKey = randomBytes(32).toString('hex');
const connection = { url: `ws://127.0.0.1:${port}/rooms`, accessKey };
let child, host, guest;
async function start() {
  child = spawn(
    process.execPath,
    [fileURLToPath(new URL('../outputs/server/server.mjs', import.meta.url))],
    {
      env: {
        ...process.env,
        WELLCUM_ACCESS_KEY: accessKey,
        HOST: '127.0.0.1',
        PORT: String(port),
        WELLCUM_DATABASE: path.join(folder, 'rooms.sqlite'),
      },
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Packaged relay startup timeout')),
      8000,
    );
    child.once('error', reject);
    child.once('exit', (code) =>
      reject(new Error(`Relay exited before readiness: ${code}`)),
    );
    child.stdout.on('data', (data) => {
      if (data.toString().includes('Wellcum back relay listening')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.equal(health.version, ROOM_VERSION);
  host = new RoomSocket(connection, (url) => new WebSocket(url));
  guest = new RoomSocket(connection, (url) => new WebSocket(url));
}
async function stop() {
  host?.close();
  guest?.close();
  if (child && child.exitCode === null) {
    const ended = once(child, 'exit');
    child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 5000);
    const [code] = await ended;
    clearTimeout(force);
    assert.equal(code, 0);
  }
}
const request = (client, payload) =>
  client.request({ version: ROOM_VERSION, ...payload });
try {
  // Start from the previous release's schema, as an existing desktop host does.
  const legacy = new DatabaseSync(path.join(folder, 'rooms.sqlite'));
  legacy.exec(
    await readFile(
      new URL('../drizzle/0000_rooms.sql', import.meta.url),
      'utf8',
    ),
  );
  legacy.close();
  await start();
  const h = (await request(host, { op: 'create', name: 'Host', capacity: 2 }))
    .body;
  const g = (await request(guest, { op: 'join', code: h.code, name: 'Guest' }))
    .body;
  const snapshot = {
    scene: 'moving',
    epoch: 2,
    brief: true,
    driver: 0,
    roles: [0, 1, 2],
    attempt: 2,
    state: { players: 2, paused: true },
  };
  await request(host, {
    op: 'poll',
    code: h.code,
    token: h.token,
    snapshot,
    snapshotSeq: 1,
  });
  assert.deepEqual(
    (await request(guest, { op: 'poll', code: h.code, token: g.token })).body
      .snapshot,
    snapshot,
  );
  await stop();
  await start();
  const restored = await request(host, {
    op: 'poll',
    code: h.code,
    token: h.token,
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.slot, 0);
  assert.deepEqual(restored.body.snapshot, snapshot);
  const returning = await request(guest, {
    op: 'poll',
    code: h.code,
    token: g.token,
    rejoin: true,
  });
  assert.equal(returning.body.frozen, true);
  assert.ok(returning.body.pauseRevision > 0);
  const confirmed = await request(host, {
    op: 'poll',
    code: h.code,
    token: h.token,
    snapshot,
    snapshotSeq: 2,
    pauseAck: returning.body.pauseRevision,
  });
  assert.equal(confirmed.body.frozen, false);
  assert.deepEqual(confirmed.body.snapshot, snapshot);
  console.log(
    'SERVER_PACKAGE_OK: separate process, WebSocket, two clients, legacy SQLite upgrade, restart, reconnect pause barrier, graceful stop',
  );
} finally {
  await stop();
  await rm(folder, { recursive: true, force: true });
}

/** Explicit network smoke; public tunnel is opened only with --internet. No invitation secrets are printed. */
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { WebSocket } from 'ws';
import { fetchTunnel } from './fetch-tunnel.mjs';
import { createDesktopNetwork } from '../desktop/network.ts';
import { RoomSocket } from '../lib/game/network/room-socket.ts';
import { ROOM_VERSION } from '../lib/game/network/room-types.ts';
import {
  makeInvitation,
  parseInvitation,
} from '../lib/game/network/connection.ts';
import assert from 'node:assert/strict';
const mode = process.argv.includes('--internet') ? 'internet' : 'lan';
const { binary } = await fetchTunnel(process.platform, process.arch);
const schema = await readFile(
  new URL('../drizzle/0000_rooms.sql', import.meta.url),
  'utf8',
);
const manager = createDesktopNetwork({ schema, binary, tempRoot: os.tmpdir() });
let guest;
try {
  const start = performance.now();
  const status = await manager.host(mode);
  assert.equal(status.state, 'ready', status.message);
  const connection = status.connection;
  const host = (
    await manager.request(connection, {
      version: ROOM_VERSION,
      op: 'create',
      name: 'Host',
      capacity: 3,
    })
  ).body;
  const invite = parseInvitation(makeInvitation(connection, host.code));
  guest = new RoomSocket(invite, (url) => new WebSocket(url));
  const request = (body) => guest.request({ version: ROOM_VERSION, ...body });
  const joined = await request({
    op: 'join',
    code: invite.code,
    name: 'Guest',
  });
  assert.equal(joined.status, 200);
  const rtts = [];
  for (let index = 0; index < 12; index++) {
    const before = performance.now();
    const reply = await request({
      op: 'poll',
      code: host.code,
      token: joined.body.token,
    });
    assert.equal(reply.status, 200);
    rtts.push(Math.round(performance.now() - before));
  }
  await request({ op: 'leave', code: host.code, token: joined.body.token });
  console.log(
    JSON.stringify({
      mode,
      connected: true,
      invitationRoundTrip: true,
      publicTLS: connection.url.startsWith('wss:'),
      totalSeconds: Math.round((performance.now() - start) / 1000),
      rttMs: rtts,
    }),
  );
} finally {
  guest?.close();
  await manager.stop();
}

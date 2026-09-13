import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { handleRoomRequest, MEMBER_STALE_MS } from '../lib/server/rooms.ts';
import { ROOM_VERSION } from '../lib/game/network/room-types.ts';
import { createRoomDatabase } from './sqlite.ts';

export async function startRelay(options: {
  schema: string;
  host?: string;
  port?: number;
  accessKey?: string;
  database?: string;
}) {
  const accessKey = options.accessKey ?? randomBytes(32).toString('hex');
  if (!/^[a-f0-9]{64}$/.test(accessKey))
    throw new Error(
      'Server access key must be 32 random bytes encoded as hex.',
    );
  const store = createRoomDatabase(options.schema, options.database);
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/health' && request.method === 'GET') {
      response.end(
        JSON.stringify({ game: 'wellcum-back', version: ROOM_VERSION }),
      );
    } else {
      response.writeHead(404);
      response.end('{}');
    }
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 256 * 1024,
    perMessageDeflate: false,
  });
  const clients = new Set<WebSocket>();
  const identities = new Map<string, WebSocket>();
  const attempts = new Map<string, { time: number; count: number }>();
  let closing = false,
    queued = 0;
  let chain: Promise<unknown> = Promise.resolve();
  const enqueue = (operation: () => Promise<unknown>) => {
    queued++;
    chain = chain
      .then(operation)
      .catch(() => {})
      .finally(() => {
        queued--;
      });
  };
  server.on('upgrade', (request, socket, head) => {
    // Do not trust forwarded IPs: tunnel connections intentionally share one budget.
    const ip = request.socket.remoteAddress ?? '';
    const now = Date.now();
    const previous = attempts.get(ip);
    const rate =
      previous && now - previous.time < 60000
        ? previous
        : { time: now, count: 0 };
    rate.count++;
    attempts.set(ip, rate);
    if (
      closing ||
      request.url !== '/rooms' ||
      clients.size >= 24 ||
      rate.count > 120
    ) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) =>
      wss.emit('connection', ws),
    );
  });
  wss.on('connection', (ws) => {
    clients.add(ws);
    let ready = false,
      identity = '',
      rateStart = Date.now(),
      messages = 0;
    const timer = setTimeout(() => ws.close(1008, 'Handshake required'), 5000);
    const send = (body: unknown) => {
      if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 512 * 1024)
        ws.send(JSON.stringify(body));
      else ws.close(1013, 'Backpressure');
    };
    ws.on('error', () => {
      /* Peer errors have no credentials in logs. */
    });
    ws.on('message', (bytes, binary) => {
      const now = Date.now();
      if (now - rateStart >= 1000) {
        rateStart = now;
        messages = 0;
      }
      if (binary || ++messages > 80 || queued > 128) {
        ws.close(1008, 'Request limit');
        return;
      }
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(
          (Buffer.isBuffer(bytes)
            ? bytes
            : Array.isArray(bytes)
              ? Buffer.concat(bytes)
              : Buffer.from(bytes)
          ).toString('utf8'),
        );
      } catch {
        ws.close(1008, 'Invalid JSON');
        return;
      }
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        ws.close(1008);
        return;
      }
      if (!ready) {
        const key = message.accessKey;
        if (
          message.kind !== 'hello' ||
          message.version !== ROOM_VERSION ||
          typeof key !== 'string' ||
          !/^[a-f0-9]{64}$/.test(key) ||
          !timingSafeEqual(Buffer.from(key), Buffer.from(accessKey))
        ) {
          ws.close(1008, 'Invitation rejected');
          return;
        }
        clearTimeout(timer);
        ready = true;
        send({ kind: 'hello', version: ROOM_VERSION });
        return;
      }
      if (!Number.isSafeInteger(message.id) || Number(message.id) < 1) {
        ws.close(1008);
        return;
      }
      enqueue(async () => {
        if (closing || ws.readyState !== WebSocket.OPEN) return;
        const body = message.body as Record<string, unknown> | null;
        if (
          body?.op === 'create' &&
          Number(
            store.sqlite
              .prepare(
                'SELECT COUNT(*) AS n FROM rooms WHERE closed_at IS NULL AND expires_at > ?',
              )
              .get(Date.now())?.n,
          ) >= 32
        ) {
          send({
            id: message.id,
            status: 503,
            body: {
              error: {
                code: 'ROOM_LIMIT',
                message: 'Сервер заполнен. Подождите завершения другой игры.',
              },
            },
          });
          return;
        }
        const reply = await handleRoomRequest(store.db, body);
        if (
          reply.status >= 200 &&
          reply.status < 300 &&
          body?.op === 'poll' &&
          typeof body.code === 'string' &&
          typeof body.token === 'string'
        ) {
          const hash = createHash('sha256').update(body.token).digest('hex');
          identity = `${body.code}:${hash}`;
          identities.set(identity, ws);
        }
        send({ id: message.id, ...reply });
      });
    });
    ws.on('close', () => {
      clearTimeout(timer);
      clients.delete(ws);
      if (identity && identities.get(identity) === ws) {
        identities.delete(identity);
        const [code, hash] = identity.split(':');
        enqueue(async () => {
          if (!closing && !identities.has(identity))
            store.sqlite
              .prepare(
                'UPDATE room_members SET last_seen = ? WHERE room_code = ? AND token_hash = ?',
              )
              .run(Date.now() - MEMBER_STALE_MS - 1, code, hash);
        });
      }
    });
  });
  const sweep = setInterval(() => {
    for (const [ip, rate] of attempts)
      if (Date.now() - rate.time > 60000) attempts.delete(ip);
    enqueue(async () => {
      if (!closing)
        store.sqlite
          .prepare('DELETE FROM rooms WHERE expires_at < ?')
          .run(Date.now());
    });
  }, 60000);
  sweep.unref();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve);
  }).catch((error) => {
    clearInterval(sweep);
    store.close();
    throw error;
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Server did not bind to a TCP port.');
  return {
    port: address.port,
    accessKey,
    async close() {
      if (closing) return;
      closing = true;
      clearInterval(sweep);
      for (const ws of clients) ws.terminate();
      await chain;
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      store.close();
    },
  };
}

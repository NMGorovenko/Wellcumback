import { readFileSync } from 'node:fs';
import path from 'node:path';
import { startRelay } from './relay.ts';
const accessKey = process.env.WELLCUM_ACCESS_KEY;
if (!accessKey || !/^[a-f0-9]{64}$/.test(accessKey))
  throw new Error(
    'Set WELLCUM_ACCESS_KEY to 32 random bytes encoded as 64 hex characters.',
  );
const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid PORT.');
const schema = readFileSync(
  path.join(path.dirname(process.argv[1]), 'rooms.sql'),
  'utf8',
);
const relay = await startRelay({
  schema,
  accessKey,
  host: process.env.HOST ?? '127.0.0.1',
  port,
  database: process.env.WELLCUM_DATABASE,
});
console.log(
  `FRIENDSLOP relay listening on port ${relay.port}. TLS must be provided by the reverse proxy.`,
);
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void relay.close().then(() => {
      process.exitCode = 0;
    });
  });

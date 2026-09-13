import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { WebSocket } from 'ws';
import { RoomSocket } from '../lib/game/network/room-socket.ts';
import type { RoomConnection } from '../lib/game/network/connection.ts';
import { tunnelEdgeArguments } from './tunnel-dns.ts';

export async function stopTunnel(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const kill = setTimeout(() => child.kill('SIGKILL'), 2000);
    const done = setTimeout(resolve, 4000);
    child.once('exit', () => {
      clearTimeout(kill);
      clearTimeout(done);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

/** An app-owned, temporary tunnel. No account credentials or user config are read. */
export async function openTunnel(options: {
  binary: string;
  tempRoot: string;
  port: number;
  accessKey: string;
  signal: AbortSignal;
  onExit: () => void;
}) {
  const directory = await mkdtemp(
    path.join(options.tempRoot, 'wellcum-tunnel-'),
  );
  const config = path.join(directory, 'config.yml');
  await writeFile(config, '{}\n', { mode: 0o600 });
  let ready = false,
    child: ChildProcess | undefined;
  try {
    options.signal.throwIfAborted();
    const edgeArguments = await tunnelEdgeArguments();
    options.signal.throwIfAborted();
    const environment = { ...process.env };
    for (const key of Object.keys(environment))
      if (/^(TUNNEL_|CLOUDFLARE_|NO_TLS_VERIFY$)/.test(key))
        delete environment[key];
    child = spawn(
      options.binary,
      [
        'tunnel',
        '--config',
        config,
        '--no-autoupdate',
        '--protocol',
        'http2',
        '--url',
        `http://127.0.0.1:${options.port}`,
        '--metrics',
        '127.0.0.1:0',
        '--grace-period',
        '1s',
        ...edgeArguments,
      ],
      {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: environment,
      },
    );
    const tunnel = child;
    const stop = async () => {
      ready = false;
      await stopTunnel(tunnel);
      await rm(directory, { recursive: true, force: true });
    };
    const abort = () => {
      void stop();
    };
    options.signal.addEventListener('abort', abort, { once: true });
    tunnel.once('exit', () => {
      options.signal.removeEventListener('abort', abort);
      if (ready) {
        ready = false;
        options.onExit();
      }
      void rm(directory, { recursive: true, force: true });
    });
    const hostname = await new Promise<string>((resolve, reject) => {
      let tail = '';
      const timer = setTimeout(
        () =>
          finish(
            new Error(
              'Не удалось открыть интернет-туннель. Попробуй ещё раз или выбери локальную сеть.',
            ),
          ),
        45000,
      );
      const fail = () =>
        finish(
          new Error(
            'Интернет-туннель остановился. Проверь соединение и доступ сети к Cloudflare.',
          ),
        );
      const read = (data: Buffer) => {
        tail = (tail + data.toString()).slice(-4096);
        const match = tail.match(
          /https:\/\/([a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com)\b/,
        );
        if (match) finish(null, match[1]);
      };
      function finish(error: Error | null, host?: string) {
        clearTimeout(timer);
        tunnel.removeListener('error', fail);
        tunnel.removeListener('exit', fail);
        tunnel.stdout?.removeListener('data', read);
        tunnel.stderr?.removeListener('data', read);
        options.signal.removeEventListener('abort', fail);
        if (error) reject(error);
        else resolve(host!);
      }
      tunnel.once('error', fail);
      tunnel.once('exit', fail);
      tunnel.stdout?.on('data', read);
      tunnel.stderr?.on('data', read);
      options.signal.addEventListener('abort', fail, { once: true });
    });
    // Drain future output but never log URLs, connection keys, or configuration.
    tunnel.stdout?.resume();
    tunnel.stderr?.resume();
    tunnel.on('error', () => {
      if (ready) {
        ready = false;
        options.onExit();
      }
    });
    const connection: RoomConnection = {
      url: `wss://${hostname}/rooms`,
      accessKey: options.accessKey,
    };
    const deadline = Date.now() + 45000;
    let verified = false;
    while (!verified && Date.now() < deadline) {
      options.signal.throwIfAborted();
      if (tunnel.exitCode !== null || tunnel.signalCode !== null)
        throw new Error('Туннель закрылся до подключения.');
      const probe = new RoomSocket(
        connection,
        (url) => new WebSocket(url) as unknown as globalThis.WebSocket,
      );
      try {
        await probe.connect();
        verified = true;
      } catch {
        /* DNS/edge registration can take a moment. */
      } finally {
        probe.close();
      }
      if (!verified) await new Promise((resolve) => setTimeout(resolve, 700));
    }
    options.signal.throwIfAborted();
    if (!verified)
      throw new Error(
        'Адрес получен, но интернет-подключение ещё не работает. Попробуй создать сервер снова.',
      );
    if (tunnel.exitCode !== null || tunnel.signalCode !== null)
      throw new Error('Туннель закрылся до завершения проверки.');
    ready = true;
    return { connection, stop };
  } catch (error) {
    if (child) await stopTunnel(child);
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

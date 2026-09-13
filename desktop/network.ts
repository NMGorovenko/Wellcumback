import os from 'node:os';
import { WebSocket } from 'ws';
import { startRelay } from '../server/relay.ts';
import { RoomSocket } from '../lib/game/network/room-socket.ts';
import { isLocalIPv4 } from '../lib/game/network/local-address.ts';
import {
  validateConnection,
  type RoomConnection,
} from '../lib/game/network/connection.ts';
import type {
  DesktopHostStatus,
  HostMode,
  LocalInterface,
} from '../lib/game/network/desktop-bridge.ts';
import { openTunnel } from './tunnel.ts';
export { parseInvitation } from '../lib/game/network/connection.ts';

export function localInterfaces(): LocalInterface[] {
  const seen = new Set<string>();
  return Object.entries(os.networkInterfaces()).flatMap(([name, items]) =>
    (items ?? []).flatMap((item) => {
      if (
        item.family !== 'IPv4' ||
        item.internal ||
        !isLocalIPv4(item.address) ||
        seen.has(item.address)
      )
        return [];
      seen.add(item.address);
      return [{ name, address: item.address }];
    }),
  );
}
export const localAddresses = () =>
  localInterfaces().map((item) => item.address);

export function createDesktopNetwork(options: {
  schema: string;
  binary: string;
  tempRoot: string;
  openTunnel?: typeof openTunnel;
}) {
  let state: DesktopHostStatus = { state: 'offline', message: '' };
  let relay: Awaited<ReturnType<typeof startRelay>> | null = null;
  let tunnel: Awaited<ReturnType<typeof openTunnel>> | null = null;
  let starting: Promise<DesktopHostStatus> | null = null;
  let controller: AbortController | null = null;
  let client: RoomSocket | null = null,
    clientKey = '';
  let stopping: Promise<void> | null = null;
  let tunnelGeneration = 0;
  let stopGeneration = 0;
  const ownedEndpoints = new Set<string>();
  const disconnect = async () => {
    client?.close();
    client = null;
    clientKey = '';
  };
  const release = async () => {
    tunnelGeneration++;
    ownedEndpoints.clear();
    await disconnect();
    const oldTunnel = tunnel,
      oldRelay = relay;
    tunnel = null;
    relay = null;
    await oldTunnel?.stop();
    await oldRelay?.close();
  };
  const stop = async () => {
    stopGeneration++;
    if (stopping) return stopping;
    controller?.abort();
    stopping = (async () => {
      await starting?.catch(() => {});
      await release();
      state = { state: 'offline', message: '' };
    })().finally(() => {
      stopping = null;
    });
    return stopping;
  };
  const status = async (): Promise<DesktopHostStatus> => {
    const interfaces = localInterfaces();
    return {
      ...structuredClone(state),
      localInterfaces: interfaces,
      localAddresses: interfaces.map((item) => item.address),
    };
  };
  const host = async (
    mode: HostMode,
    address?: string,
  ): Promise<DesktopHostStatus> => {
    if (mode !== 'internet' && mode !== 'lan')
      throw new Error('Неизвестный режим сервера.');
    const requestedAt = stopGeneration;
    if (stopping) await stopping;
    if (requestedAt !== stopGeneration) return status();
    if (
      address !== undefined &&
      (typeof address !== 'string' || mode !== 'lan')
    )
      throw new Error('Адрес сети выбирается только для локальной сети / VPN.');
    const addresses = localAddresses();
    const selectedAddress =
      mode === 'lan'
        ? (address ?? (addresses.length === 1 ? addresses[0] : undefined))
        : undefined;
    if (
      mode === 'lan' &&
      (!selectedAddress || !addresses.includes(selectedAddress))
    )
      throw new Error(
        address
          ? 'Выбранная сеть больше недоступна. Подключи её заново или выбери другую.'
          : addresses.length
            ? 'Выбери адрес сети, к которой подключён друг.'
            : 'Не найдена локальная сеть или VPN. Подключись и попробуй снова.',
      );
    if (starting || state.state === 'ready' || (relay && state.recoverable)) {
      if (state.mode !== mode || state.selectedAddress !== selectedAddress)
        throw new Error(
          'Сначала закрой текущий сервер, затем выбери другую сеть.',
        );
      if (starting || state.state === 'ready') return starting ?? status();
    }
    const recovering = !!relay && !!state.recoverable;
    controller = new AbortController();
    const signal = controller.signal;
    state = {
      ...(recovering ? state : {}),
      state: 'starting',
      mode,
      selectedAddress,
      message:
        mode === 'internet'
          ? 'Открываем сервер и проверяем интернет-подключение…'
          : 'Открываем сервер в локальной сети…',
    };
    starting = (async () => {
      try {
        if (!recovering) await release();
        signal.throwIfAborted();
        if (!relay)
          relay = await startRelay({
            schema: options.schema,
            host: mode === 'lan' ? selectedAddress : '127.0.0.1',
          });
        signal.throwIfAborted();
        let connection: RoomConnection;
        if (mode === 'internet') {
          const currentTunnel = ++tunnelGeneration;
          const previousTunnel = tunnel;
          tunnel = null;
          await previousTunnel?.stop();
          signal.throwIfAborted();
          tunnel = await (options.openTunnel ?? openTunnel)({
            ...options,
            port: relay.port,
            accessKey: relay.accessKey,
            signal,
            onExit: () => {
              if (
                signal.aborted ||
                currentTunnel !== tunnelGeneration ||
                !relay
              )
                return;
              void relay.pauseRooms();
              state = {
                ...state,
                state: 'failed',
                mode,
                recoverable: true,
                message:
                  'Интернет-связь закрылась. Прохождение сохранено на паузе. Восстанови связь и отправь другу обновлённое приглашение.',
              };
            },
          });
          connection = tunnel.connection;
        } else
          connection = {
            url: `ws://${selectedAddress}:${relay.port}/rooms`,
            accessKey: relay.accessKey,
          };
        signal.throwIfAborted();
        ownedEndpoints.add(connection.url);
        state = {
          state: 'ready',
          mode,
          selectedAddress,
          connection,
          localAddresses: addresses,
          message:
            mode === 'internet'
              ? recovering
                ? 'Связь восстановлена. Скопируй обновлённое приглашение и отправь другу — его место и прохождение сохранены.'
                : 'Интернет-сервер готов. Оставь приложение открытым, пока играете.'
              : 'Сервер готов. Друг должен быть в той же сети или VPN.',
        };
      } catch (error) {
        if (!recovering || signal.aborted) await release();
        state = {
          ...(recovering && !signal.aborted ? state : {}),
          state: 'failed',
          mode,
          recoverable: recovering && !signal.aborted,
          message: signal.aborted
            ? 'Запуск отменён.'
            : error instanceof Error
              ? error.message
              : 'Не удалось запустить сервер.',
        };
      }
      return status();
    })().finally(() => {
      starting = null;
    });
    return starting;
  };
  return {
    host,
    stop,
    disconnect,
    status,
    async request(value: RoomConnection, payload: unknown) {
      const connection = validateConnection(value);
      if (JSON.stringify(payload)?.length > 256 * 1024)
        throw new Error('Слишком большое сообщение.');
      // The host talks to its own relay directly; friends use the verified public address.
      const target =
        relay &&
        state.mode === 'internet' &&
        ownedEndpoints.has(connection.url) &&
        relay.accessKey === connection.accessKey
          ? { ...connection, url: `ws://127.0.0.1:${relay.port}/rooms` }
          : connection;
      const key = target.url + target.accessKey;
      if (clientKey !== key) {
        void disconnect();
        clientKey = key;
        client = new RoomSocket(
          target,
          (url) => new WebSocket(url) as unknown as globalThis.WebSocket,
        );
      }
      return client!.request(payload);
    },
  };
}

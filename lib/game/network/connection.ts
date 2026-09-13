import { ROOM_VERSION } from './room-types.ts';

export type RoomConnection = { url: string; accessKey: string };
export type RoomInvitation = RoomConnection & { code: string; version: number };
export function validateConnection(value: unknown): RoomConnection {
  const c = value as Partial<RoomConnection> | null;
  if (
    !c ||
    typeof c.url !== 'string' ||
    c.url.length > 512 ||
    typeof c.accessKey !== 'string' ||
    !/^[a-f0-9]{64}$/.test(c.accessKey)
  )
    throw new Error('Неверная строка подключения. Скопируй её целиком.');
  const url = new URL(c.url);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const ipv4 =
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) &&
    hostname.split('.').every((part) => Number(part) <= 255);
  const local =
    hostname === 'localhost' ||
    hostname === '::1' ||
    (ipv4 &&
      /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) ||
    /^(fc|fd)[a-f0-9]{2}:/i.test(hostname);
  if (
    (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && local)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/rooms'
  )
    throw new Error(
      'Нужен адрес игрового сервера с защищённым подключением. Для локальной сети допустим ws.',
    );
  return { url: url.href, accessKey: c.accessKey };
}
export function makeInvitation(connection: RoomConnection, code: string) {
  const c = validateConnection(connection);
  if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(code))
    throw new Error('Неверный код комнаты.');
  const content = JSON.stringify({ ...c, code, version: ROOM_VERSION });
  return (
    'WCB1:' +
    btoa(content).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  );
}
export function parseInvitation(text: string): RoomInvitation {
  try {
    const raw = text.trim();
    if (raw.length > 1500 || !/^WCB1:[A-Za-z0-9_-]+$/.test(raw))
      throw new Error();
    const data = JSON.parse(
      atob(raw.slice(5).replace(/-/g, '+').replace(/_/g, '/')),
    );
    if (data.version !== ROOM_VERSION)
      throw new Error(
        'Версии игры различаются. Установите одну версию у всех игроков.',
      );
    if (
      typeof data.code !== 'string' ||
      !/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(data.code)
    )
      throw new Error();
    return {
      ...validateConnection(data),
      code: data.code,
      version: data.version,
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Версии'))
      throw error;
    throw new Error(
      'Не удалось прочитать приглашение. Скопируй строку WCB1: целиком.',
    );
  }
}

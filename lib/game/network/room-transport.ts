import { desktopNetwork } from './desktop-bridge.ts';
import { validateConnection, type RoomConnection } from './connection.ts';
import { RoomSocket, type SocketReply } from './room-socket.ts';

let connection: RoomConnection | null = null;
let socket: RoomSocket | null = null;
export const getRoomConnection = () => connection;
export const roomPollDelay = () => (connection ? 35 : 250);
export function setRoomConnection(next: RoomConnection | null) {
  socket?.close();
  socket = null;
  connection = next ? validateConnection(next) : null;
  void desktopNetwork()?.disconnect();
}
export async function requestRoom(payload: unknown): Promise<SocketReply> {
  if (connection) {
    const desktop = desktopNetwork();
    if (desktop) return desktop.request(connection, payload);
    socket ??= new RoomSocket(connection);
    return socket.request(payload);
  }
  const response = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => null),
  };
}

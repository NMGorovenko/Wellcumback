/** Separate Node process used by the native smoke; never shipped in the app. */
import { WebSocket } from 'ws';
import { RoomSocket } from '../../lib/game/network/room-socket.ts';
import { ROOM_VERSION } from '../../lib/game/network/room-types.ts';
let socket;
process.on('message', async ({ id, connection, payload, close }) => {
  try {
    if (close) {
      socket?.close();
      process.disconnect();
      return;
    }
    socket ??= new RoomSocket(connection, (url) => new WebSocket(url));
    const result = await socket.request({ version: ROOM_VERSION, ...payload });
    process.send({ id, result });
  } catch (error) {
    process.send({ id, error: error.message });
  }
});
process.on('disconnect', () => {
  socket?.close();
  process.exit(0);
});

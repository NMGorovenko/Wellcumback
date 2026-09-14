import { roomSnapshot, subscribeRoom } from './room-client.ts';
import { createRoomPresenceStore } from './room-status.ts';

export const roomPresence = createRoomPresenceStore(
  roomSnapshot,
  subscribeRoom,
);

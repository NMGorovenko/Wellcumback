'use client';
import { useEffect, useSyncExternalStore } from 'react';
import {
  restoreRoom,
  roomSnapshot,
  subscribeRoom,
} from '@/lib/game/network/room-client';
export function useRoom() {
  useEffect(restoreRoom, []);
  return useSyncExternalStore(subscribeRoom, roomSnapshot, roomSnapshot);
}

import type { DriveAxes } from '../input/drive.ts';
export const ROOM_VERSION = 5;
export type RoomScene = 'city' | 'screen' | 'clean' | 'moving';
export type RoomCommand = {
  kind:
    | 'action'
    | 'pause'
    | 'resume'
    | 'move-side'
    | 'chairs'
    | 'begin'
    | 'restart'
    | 'episode'
    | 'exit'
    | 'wheel'
    | 'leader'
    | 'start-screen'
    | 'start-story'
    | 'ready';
  value?: string | number;
};
export type RoomFrame = {
  seq: number;
  epoch: number;
  keys: string[];
  drive?: DriveAxes;
  command?: RoomCommand;
};
export type RoomWorld = {
  scene: RoomScene;
  epoch: number;
  state: Record<string, unknown>;
  brief: boolean;
  driver?: number;
  /** Actor index → stable room member slot. Never reorder engine actors. */
  roles?: [number, number, number];
  /** Stable score identity; handing over control is not a new attempt. */
  attempt?: number;
};
export type RoomMember = {
  id: string;
  slot: number;
  name: string;
  connected: boolean;
  lastSeen: number;
};
export type RoomReply = {
  version: number;
  code: string;
  token?: string;
  slot: number;
  capacity: number;
  serverTime: number;
  expiresAt: number;
  roster: RoomMember[];
  snapshot: RoomWorld | null;
  snapshotSeq: number;
  resumed: boolean;
  pauseRevision: number;
  frames: Record<string, RoomFrame[]>;
  ack: number;
  frozen: boolean;
};
export type RoomView = {
  status: 'offline' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
  code: string;
  slot: number;
  capacity: number;
  roster: RoomMember[];
  world: RoomWorld | null;
  message: string;
  ping: number;
  frozen: boolean;
};

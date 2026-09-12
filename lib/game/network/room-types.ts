import type { DriveAxes } from '../input/drive.ts';
export const ROOM_VERSION = 3;
export type RoomScene = 'city' | 'screen';
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
    | 'start-screen'
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

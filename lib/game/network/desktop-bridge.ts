import type { RoomConnection } from './connection.ts';
import type { SocketReply } from './room-socket.ts';

export type HostMode = 'internet' | 'lan';
export type DesktopHostStatus = {
  state: 'offline' | 'starting' | 'ready' | 'failed';
  mode?: HostMode;
  connection?: RoomConnection;
  localAddresses?: string[];
  message: string;
};
export interface DesktopNetwork {
  host(mode: HostMode): Promise<DesktopHostStatus>;
  stop(): Promise<void>;
  status(): Promise<DesktopHostStatus>;
  request(connection: RoomConnection, payload: unknown): Promise<SocketReply>;
  disconnect(): Promise<void>;
  copy(text: string): Promise<void>;
}
declare global {
  interface Window {
    wellcumNetwork?: DesktopNetwork;
  }
}
export const desktopNetwork = () =>
  typeof window === 'undefined' ? undefined : window.wellcumNetwork;

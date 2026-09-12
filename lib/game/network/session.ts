import {
  driveIsNeutral,
  neutralDrive,
  resolveDrive,
  type DriveAxes,
} from '../input/drive.ts';
import { DrivingPeer, type PeerStatus } from './peer.ts';
import { drivingKeys, type PeerPacket } from './protocol.ts';
import { tickCity, type CityState } from '../city/engine.ts';
export type SessionView = {
  role: 'host' | 'guest' | null;
  status: PeerStatus;
  driver: 'host' | 'guest';
  message: string;
  invite: string;
};
export const EMPTY_SESSION: SessionView = {
  role: null,
  status: 'idle',
  driver: 'host',
  message: '',
  invite: '',
};
let view: SessionView = EMPTY_SESSION;
const listeners = new Set<() => void>();
let peer: DrivingPeer | null = null,
  lastSequence = -1,
  sequence = 0,
  sendClock = 0,
  epoch = 0;
let remoteAt: number | null = null,
  connectedAt = 0,
  transportConnected = false,
  appStale = false,
  guestArmed = false,
  hostArmed = true;
let remoteDrive = neutralDrive();
let remoteKeys = new Set<string>(),
  remoteCity: CityState | null = null;
const notify = (change: Partial<SessionView>) => {
  view = { ...view, ...change };
  listeners.forEach((listener) => listener());
};
export const networkSnapshot = () => view;
export function subscribeNetwork(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function receive(packet: PeerPacket) {
  if (!transportConnected || packet.seq <= lastSequence) return;
  if (
    view.role === 'host' &&
    packet.type === 'input' &&
    packet.epoch === epoch
  ) {
    lastSequence = packet.seq;
    remoteKeys = new Set(packet.keys);
    remoteDrive = packet.drive ?? neutralDrive();
    remoteAt = performance.now();
  } else if (
    view.role === 'guest' &&
    packet.type === 'city' &&
    packet.epoch >= epoch
  ) {
    if (epoch !== packet.epoch || view.driver !== packet.driver)
      guestArmed = false;
    epoch = packet.epoch;
    lastSequence = packet.seq;
    remoteCity = packet.state;
    remoteAt = performance.now();
    if (view.driver !== packet.driver)
      notify({
        driver: packet.driver,
        message:
          packet.driver === 'guest'
            ? 'Руль у тебя: отпусти кнопки, затем нажимай газ.'
            : '',
      });
  } else return;
  if (appStale) {
    appStale = false;
    notify({ status: 'connected', message: '' });
  }
}
function setup(role: 'host' | 'guest') {
  disconnectNetwork();
  notify({ role, status: 'gathering', message: '' });
  const connection = new DrivingPeer({
    onPacket: (packet) => {
      if (peer === connection) receive(packet);
    },
    onStatus: (status, message = '') => {
      if (peer !== connection) return;
      const connected = status === 'connected';
      if (connected && !transportConnected) {
        connectedAt = performance.now();
        guestArmed = false;
      }
      transportConnected = connected;
      if (!connected) {
        {
          remoteKeys.clear();
          remoteDrive = neutralDrive();
        }
        guestArmed = false;
      }
      notify({ status, message });
    },
  });
  peer = connection;
  return connection;
}
export async function createNetworkInvite() {
  const connection = setup('host');
  try {
    const invite = await connection.offer();
    if (peer === connection) notify({ invite });
  } catch (error) {
    if (peer === connection)
      notify({
        status: 'failed',
        message:
          error instanceof Error
            ? error.message
            : 'Не удалось создать приглашение.',
      });
  }
}
export async function joinNetworkInvite(code: string) {
  const connection = setup('guest');
  try {
    const invite = await connection.answer(code);
    if (peer === connection) notify({ invite });
  } catch (error) {
    if (peer === connection)
      notify({
        status: 'failed',
        message:
          error instanceof Error ? error.message : 'Не удалось подключиться.',
      });
  }
}
export async function acceptNetworkAnswer(code: string) {
  const connection = peer;
  if (!connection || view.role !== 'host') {
    notify({ status: 'failed', message: 'Сначала создайте приглашение.' });
    return;
  }
  try {
    await connection.accept(code);
  } catch (error) {
    if (peer === connection)
      notify({
        status: 'failed',
        message: error instanceof Error ? error.message : 'Ответ не принят.',
      });
  }
}
export function disconnectNetwork() {
  const connection = peer;
  peer = null;
  connection?.close();
  {
    remoteKeys.clear();
    remoteDrive = neutralDrive();
  }
  remoteCity = null;
  remoteAt = null;
  connectedAt = 0;
  transportConnected = false;
  appStale = false;
  guestArmed = false;
  hostArmed = true;
  lastSequence = -1;
  sequence = 0;
  sendClock = 0;
  epoch = 0;
  notify(EMPTY_SESSION);
}
export function passNetworkWheel() {
  if (view.role === 'host' && view.status === 'connected') {
    epoch++;
    {
      remoteKeys.clear();
      remoteDrive = neutralDrive();
    }
    remoteAt = null;
    connectedAt = performance.now();
    hostArmed = false;
    const driver = view.driver === 'host' ? 'guest' : 'host';
    notify({
      driver,
      message:
        driver === 'host'
          ? 'Руль у тебя: отпусти кнопки, затем нажимай газ.'
          : 'Руль у друга.',
    });
  }
}
/** Network mode lasts until explicit disconnect, including handshake/failure.
 * A lost data channel never silently turns the guest into a second authority. */
export function isNetworkDrive() {
  return view.role !== null;
}
export function tickNetworkCity(
  s: CityState,
  dt: number,
  input: ReadonlySet<string>,
  axes?: DriveAxes,
) {
  if (!isNetworkDrive()) {
    tickCity(s, dt, input, axes);
    return;
  }
  s.interaction = null;
  const localDrive = resolveDrive(input, axes);
  if (!Number.isFinite(dt) || dt < 0) return;
  const delta = Math.min(dt, 0.1),
    now = performance.now();
  sendClock += delta;
  const stale = transportConnected && now - (remoteAt ?? connectedAt) > 2000;
  if (stale && !appStale) {
    appStale = true;
    hostArmed = false;
    notify({
      status: 'connecting',
      message: 'Ждём данные друга. Управление отпущено.',
    });
  }
  if (view.role === 'guest') {
    if (remoteCity && transportConnected && !stale) {
      const { x, z, heading, paused } = s;
      Object.assign(s, remoteCity, { paused, interaction: null });
      const amount = 1 - Math.exp(-delta * 22);
      if (Math.hypot(x - s.x, z - s.z) < 8) {
        s.x = x + (s.x - x) * amount;
        s.z = z + (s.z - z) * amount;
        s.heading =
          heading +
          Math.atan2(
            Math.sin(s.heading - heading),
            Math.cos(s.heading - heading),
          ) *
            amount;
      }
    }
    const pressed = drivingKeys(input);
    const eligible =
      transportConnected &&
      !stale &&
      !s.paused &&
      !remoteCity?.paused &&
      view.driver === 'guest';
    if (!eligible) guestArmed = false;
    else if (!pressed.length && driveIsNeutral(localDrive)) guestArmed = true;
    const canDrive = eligible && guestArmed;
    if (sendClock >= 0.05 && transportConnected) {
      peer?.send({
        type: 'input',
        version: 1,
        seq: sequence++,
        epoch,
        keys: canDrive ? pressed : [],
        drive: canDrive ? localDrive : neutralDrive(),
      });
      sendClock = 0;
    }
    if (!transportConnected || stale || !remoteCity) {
      s.vx = s.vz = s.speed = 0;
      s.drifting = false;
    }
    if (stale) {
      s.radio = 'Ждём связь с водителем…';
      s.radioUntil = s.elapsed + 1;
    }
    return;
  }
  if (!transportConnected || remoteAt === null || now - remoteAt >= 350) {
    remoteKeys.clear();
    remoteDrive = neutralDrive();
  }
  if (
    view.driver === 'host' &&
    !stale &&
    !drivingKeys(input).length &&
    driveIsNeutral(localDrive)
  )
    hostArmed = true;
  const keys = new Set(
    drivingKeys(
      view.driver === 'host'
        ? hostArmed && !stale
          ? input
          : new Set<string>()
        : remoteKeys,
    ),
  );
  // Host remains authoritative. E and pending local mission activation are
  // excluded throughout the handshake and after failure, not just when connected.
  tickCity(
    s,
    delta,
    keys,
    view.driver === 'host'
      ? hostArmed && !stale
        ? localDrive
        : neutralDrive()
      : remoteDrive,
  );
  if (sendClock >= 0.06 && transportConnected) {
    peer?.send({
      type: 'city',
      version: 1,
      seq: sequence++,
      epoch,
      driver: view.driver,
      state: { ...s, interaction: null },
    });
    sendClock = 0;
  }
}

import type { DriveAxes } from '../input/drive.ts';
import type { CityState } from '../city/engine.ts';
export const NETWORK_VERSION = 1;
export const DRIVE_KEYS = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ShiftLeft',
  'KeyQ',
] as const;
export type DriveKey = (typeof DRIVE_KEYS)[number];
export type DrivePacket = {
  type: 'input';
  version: 1;
  seq: number;
  epoch: number;
  keys: DriveKey[];
  drive?: DriveAxes;
};
export type CityPacket = {
  type: 'city';
  version: 1;
  seq: number;
  epoch: number;
  driver: 'host' | 'guest';
  state: CityState;
};
export type PeerPacket = DrivePacket | CityPacket;
export function drivingKeys(keys: ReadonlySet<string>): DriveKey[] {
  return DRIVE_KEYS.filter((code) => keys.has(code));
}
/** Invites and remote input are untrusted. Peers can send only bounded driving
 * state; no executable code, arbitrary object merging or game saves are accepted. */
export function readPeerPacket(raw: unknown): PeerPacket | null {
  if (typeof raw !== 'string' || raw.length > 12000) return null;
  try {
    const p: unknown = JSON.parse(raw);
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    const v = p as Record<string, unknown>;
    if (
      v.version !== NETWORK_VERSION ||
      !Number.isSafeInteger(v.seq) ||
      Number(v.seq) < 0 ||
      !Number.isSafeInteger(v.epoch) ||
      Number(v.epoch) < 0
    )
      return null;
    if (v.type === 'input') {
      if (
        !Array.isArray(v.keys) ||
        v.keys.length > DRIVE_KEYS.length ||
        v.keys.some((k) => !DRIVE_KEYS.includes(k)) ||
        new Set(v.keys).size !== v.keys.length
      )
        return null;
      const drive = v.drive as DriveAxes | undefined;
      if (
        drive !== undefined &&
        (!drive ||
          typeof drive !== 'object' ||
          Array.isArray(drive) ||
          ![drive.throttle, drive.steer].every(
            (axis) =>
              typeof axis === 'number' &&
              Number.isFinite(axis) &&
              Math.abs(axis) <= 1,
          ))
      )
        return null;
      return {
        type: 'input',
        version: 1,
        ...(drive
          ? { drive: { throttle: drive.throttle, steer: drive.steer } }
          : {}),
        seq: Number(v.seq),
        epoch: Number(v.epoch),
        keys: v.keys as DriveKey[],
      };
    }
    if (
      v.type !== 'city' ||
      (v.driver !== 'host' && v.driver !== 'guest') ||
      !v.state ||
      typeof v.state !== 'object' ||
      Array.isArray(v.state)
    )
      return null;
    const s = v.state as Record<string, unknown>;
    const numberKeys = [
      'x',
      'z',
      'vx',
      'vz',
      'heading',
      'steering',
      'speed',
      'elapsed',
      'bumps',
      'bumpCooldown',
      'driftDistance',
      'nearStop',
      'accumulator',
      'radioUntil',
    ];
    if (
      numberKeys.some(
        (k) =>
          typeof s[k] !== 'number' ||
          !Number.isFinite(s[k]) ||
          Math.abs(Number(s[k])) > 1e9,
      )
    )
      return null;
    if (
      Math.abs(Number(s.x)) > 35 ||
      Math.abs(Number(s.z)) > 25 ||
      Math.abs(Number(s.vx)) > 20 ||
      Math.abs(Number(s.vz)) > 20 ||
      Number(s.speed) < 0 ||
      Number(s.speed) > 20
    )
      return null;
    if (
      typeof s.paused !== 'boolean' ||
      typeof s.drifting !== 'boolean' ||
      typeof s.previousAction !== 'boolean' ||
      typeof s.radio !== 'string' ||
      s.radio.length > 300 ||
      s.players !== 1 ||
      s.interaction !== null
    )
      return null;
    if (
      !Number.isInteger(s.nearStop) ||
      Number(s.nearStop) < -1 ||
      Number(s.nearStop) > 3
    )
      return null;
    if (
      [
        'elapsed',
        'bumps',
        'bumpCooldown',
        'driftDistance',
        'accumulator',
        'radioUntil',
      ].some((k) => Number(s[k]) < 0) ||
      !Number.isSafeInteger(s.bumps) ||
      Math.abs(Number(s.steering)) > 1.01 ||
      Number(s.bumpCooldown) > 1.51 ||
      Number(s.accumulator) > 0.017
    )
      return null;
    // Copy known fields only. Prototype names/unknown objects are never forwarded.
    const state = Object.fromEntries(
      numberKeys.map((k) => [k, s[k]]),
    ) as unknown as CityState;
    Object.assign(state, {
      players: 1,
      paused: s.paused,
      drifting: s.drifting,
      previousAction: s.previousAction,
      radio: s.radio,
      interaction: null,
    });
    return {
      type: 'city',
      version: 1,
      seq: Number(v.seq),
      epoch: Number(v.epoch),
      driver: v.driver as CityPacket['driver'],
      state,
    };
  } catch {
    return null;
  }
}
export type Invite = { version: 1; type: 'offer' | 'answer'; sdp: string };
export function encodeInvite(description: { type: string; sdp?: string }) {
  if (
    !description.sdp ||
    !['offer', 'answer'].includes(description.type) ||
    description.sdp.length > 40000
  )
    throw new Error('Приглашение ещё не готово.');
  // Escape Unicode before btoa: the copy/paste code is ASCII even if the browser
  // puts a non-Latin session name into SDP. atob+JSON.parse reverses this exactly.
  const json = JSON.stringify({
    version: 1,
    type: description.type,
    sdp: description.sdp,
  }).replace(
    /[\u007f-\uffff]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
  const code = 'WCB1.' + btoa(json);
  if (code.length > 60000)
    throw new Error('Приглашение слишком большое. Создайте новое соединение.');
  return code;
}
export function decodeInvite(
  code: string,
  expected: 'offer' | 'answer',
): Invite {
  if (
    typeof code !== 'string' ||
    code.length > 60000 ||
    !code.trim().startsWith('WCB1.')
  )
    throw new Error('Нужен полный код приглашения Wellcum back.');
  try {
    const encoded = code.trim().slice(5).replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error();
    const v: unknown = JSON.parse(atob(encoded));
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    const p = v as Record<string, unknown>;
    if (
      p.version !== 1 ||
      p.type !== expected ||
      typeof p.sdp !== 'string' ||
      p.sdp.length > 40000 ||
      !p.sdp.startsWith('v=0\r\n') ||
      !/^m=application /m.test(p.sdp)
    )
      throw new Error();
    return { version: 1, type: expected, sdp: p.sdp };
  } catch {
    throw new Error(
      expected === 'offer'
        ? 'Это не приглашение от водителя.'
        : 'Это не ответ друга. Проверь, что скопирован весь код.',
    );
  }
}

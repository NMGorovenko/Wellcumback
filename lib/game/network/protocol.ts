import { validCityRoofSurfaceId } from '../city/roofs.ts';
import { validCityFlight } from '../city/flight.ts';
import { validCityDamage } from '../city/destruction.ts';
import {
  CITY_TOP_SPEED,
  AUTOMATIC_RATIOS,
  freshPowertrain,
} from '../city/powertrain.ts';
import { CITY_BOUNDS, cityStops } from '../city/layout.ts';
import type { DriveAxes } from '../input/drive.ts';
import type { CityState } from '../city/engine.ts';
export const NETWORK_VERSION = 9;
export const NETWORK_CHANNEL = `wellcum-city-v${NETWORK_VERSION}`;
const VERSION_MISMATCH =
  'Версии игры различаются. Обновите игру у обоих игроков и создайте новое приглашение.';
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
  version: typeof NETWORK_VERSION;
  seq: number;
  epoch: number;
  keys: DriveKey[];
  drive?: DriveAxes;
};
export type CityPacket = {
  type: 'city';
  version: typeof NETWORK_VERSION;
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
  if (typeof raw !== 'string' || raw.length > 24000) return null;
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
        version: NETWORK_VERSION,
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
      Number(s.x) < CITY_BOUNDS.minX ||
      Number(s.x) > CITY_BOUNDS.maxX ||
      Number(s.z) < CITY_BOUNDS.minZ ||
      Number(s.z) > CITY_BOUNDS.maxZ ||
      Math.abs(Number(s.vx)) > CITY_TOP_SPEED + 0.1 ||
      Math.abs(Number(s.vz)) > CITY_TOP_SPEED + 0.1 ||
      Number(s.speed) < 0 ||
      Number(s.speed) > CITY_TOP_SPEED + 0.1
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
      Number(s.nearStop) >= cityStops.length
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
    if (!validCityDamage(s.damage) || !validCityFlight(s.flight)) return null;
    if (s.flight) {
      const f = s.flight;
      state.flight = {
        airborne: f.airborne,
        vy: f.vy,
        waterTime: f.waterTime,
        landing: f.landing,
      };
      if (f.launchCooldown !== undefined)
        state.flight.launchCooldown = f.launchCooldown;
      if (f.suspension) {
        state.flight.suspension = {
          offset: f.suspension.offset,
          velocity: f.suspension.velocity,
        };
      }
      if (f.safe) {
        const p = f.safe;
        state.flight.safe = {
          x: p.x,
          z: p.z,
          heading: p.heading,
          elevation: p.elevation,
          surfaceId: p.surfaceId,
        };
      }
    }
    if (s.travelRevision !== undefined) {
      if (
        !Number.isSafeInteger(s.travelRevision) ||
        Number(s.travelRevision) < 0
      )
        return null;
      state.travelRevision = Number(s.travelRevision);
    }
    if (s.damage) {
      const damage = s.damage as NonNullable<CityState['damage']>;
      state.damage = {
        marks: damage.marks,
        hits: damage.hits.map((h) => [...h]),
      };
    }
    if (s.powertrain !== undefined) {
      if (
        !s.powertrain ||
        typeof s.powertrain !== 'object' ||
        Array.isArray(s.powertrain)
      )
        return null;
      const motor = s.powertrain as Record<string, unknown>;
      const fields = Object.keys(freshPowertrain());
      if (
        fields.some(
          (key) =>
            typeof motor[key] !== 'number' ||
            !Number.isFinite(motor[key]) ||
            Number(motor[key]) < 0 ||
            Number(motor[key]) > 1e9,
        ) ||
        !Number.isInteger(motor.gear) ||
        Number(motor.gear) < 1 ||
        Number(motor.gear) > AUTOMATIC_RATIOS.length ||
        Number(motor.rpm) > 5700 ||
        Number(motor.load) > 1
      )
        return null;
      state.powertrain = Object.fromEntries(
        fields.map((key) => [key, motor[key]]),
      ) as typeof state.powertrain;
    }
    for (const key of ['elevation', 'pitch', 'roll'] as const)
      if (s[key] !== undefined) {
        if (
          typeof s[key] !== 'number' ||
          !Number.isFinite(s[key]) ||
          Math.abs(s[key]) > (key === 'elevation' ? 200 : Math.PI / 3)
        )
          return null;
        state[key] = s[key];
      }
    if (s.surfaceId !== undefined) {
      if (
        typeof s.surfaceId !== 'string' ||
        s.surfaceId.length > 100 ||
        (!/^ground$|^road:[a-z0-9:-]+$/.test(s.surfaceId) &&
          !validCityRoofSurfaceId(s.surfaceId))
      )
        return null;
      state.surfaceId = s.surfaceId;
    }
    if (s.throttle !== undefined) {
      if (
        typeof s.throttle !== 'number' ||
        !Number.isFinite(s.throttle) ||
        Math.abs(s.throttle) > 1
      )
        return null;
      state.throttle = s.throttle;
    }
    return {
      type: 'city',
      version: NETWORK_VERSION,
      seq: Number(v.seq),
      epoch: Number(v.epoch),
      driver: v.driver as CityPacket['driver'],
      state,
    };
  } catch {
    return null;
  }
}
export type Invite = {
  version: typeof NETWORK_VERSION;
  type: 'offer' | 'answer';
  sdp: string;
};
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
    version: NETWORK_VERSION,
    type: description.type,
    sdp: description.sdp,
  }).replace(
    /[\u007f-\uffff]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
  const code = `WCB${NETWORK_VERSION}.` + btoa(json);
  if (code.length > 60000)
    throw new Error('Приглашение слишком большое. Создайте новое соединение.');
  return code;
}
export function decodeInvite(
  code: string,
  expected: 'offer' | 'answer',
): Invite {
  if (typeof code !== 'string' || code.length > 60000)
    throw new Error('Нужен полный код приглашения FRIENDSLOP.');
  const trimmed = code.trim(),
    prefix = `WCB${NETWORK_VERSION}.`;
  if (/^WCB\d+\./.test(trimmed) && !trimmed.startsWith(prefix))
    throw new Error(VERSION_MISMATCH);
  if (!trimmed.startsWith(prefix))
    throw new Error('Нужен полный код приглашения FRIENDSLOP.');
  try {
    const encoded = trimmed.slice(prefix.length).replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error();
    const v: unknown = JSON.parse(atob(encoded));
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    const p = v as Record<string, unknown>;
    if (p.version !== NETWORK_VERSION) throw new Error(VERSION_MISMATCH);
    if (
      p.type !== expected ||
      typeof p.sdp !== 'string' ||
      p.sdp.length > 40000 ||
      !p.sdp.startsWith('v=0\r\n') ||
      !/^m=application /m.test(p.sdp)
    )
      throw new Error();
    return { version: NETWORK_VERSION, type: expected, sdp: p.sdp };
  } catch (error) {
    if (error instanceof Error && error.message === VERSION_MISMATCH)
      throw error;
    throw new Error(
      expected === 'offer'
        ? 'Это не приглашение от водителя.'
        : 'Это не ответ друга. Проверь, что скопирован весь код.',
    );
  }
}

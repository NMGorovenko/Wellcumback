import {
  validRaceInputs,
  validRaceState,
  frozenRaceConfig,
  validRaceCommand,
} from '../game/race/validation.ts';
import type { RaceInput } from '../game/race/types.ts';
/** Host-authoritative room relay. No game simulation or secrets belong in logs. */
import { ROOM_VERSION } from '../game/network/room-types.ts';
export { ROOM_VERSION };
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
// HTTP relay requests can take several seconds through the hosting gateway.
export const MEMBER_STALE_MS = 10000;
export const MAX_INPUT_FRAMES = 120;
const MAX_SNAPSHOT_BYTES = 96 * 1024;
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const INPUT_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyE',
  'KeyQ',
  'ShiftLeft',
  'Space',
]);
const COMMANDS = new Set([
  'action',
  'pause',
  'resume',
  'move-side',
  'chairs',
  'begin',
  'restart',
  'episode',
  'exit',
  'wheel',
  'leader',
  'start-screen',
  'start-story',
  'ready',
  'start-race',
  'race-local',
  'race-car',
  'race-track',
  'race-mode',
  'race-laps',
  'race-ready',
  'race-start',
  'race-lobby',
]);

type SqlValue = string | number | null;
export interface RoomStatement {
  bind(...values: SqlValue[]): RoomStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface RoomDatabase {
  prepare(sql: string): RoomStatement;
  batch(statements: RoomStatement[]): Promise<unknown[]>;
}
export type RoomCommand = { kind: string; [key: string]: unknown };
export type RoomInput = {
  seq: number;
  epoch: number;
  keys: string[];
  drive?: { throttle: number; steer: number };
  raceInputs?: RaceInput[];
  command?: RoomCommand;
};
export type RoomSnapshot = {
  scene: 'city' | 'screen' | 'clean' | 'moving' | 'race';
  epoch: number;
  state: Record<string, unknown>;
  brief: boolean;
  driver?: number;
  roles?: [number, number, number];
  attempt?: number;
};
export type RoomView = {
  version: typeof ROOM_VERSION;
  code: string;
  slot: number;
  capacity: number;
  serverTime: number;
  expiresAt: number;
  roster: {
    id: string;
    slot: number;
    name: string;
    connected: boolean;
    lastSeen: number;
  }[];
  snapshot: RoomSnapshot | null;
  snapshotSeq: number;
  frames: Record<string, RoomInput[]>;
  ack: number;
  frozen: boolean;
  resumed: boolean;
  pauseRevision: number;
};
type RoomRow = {
  code: string;
  capacity: number;
  snapshot: string | null;
  snapshot_seq: number;
  epoch: number;
  created_at: number;
  expires_at: number;
  closed_at: number | null;
  pause_revision: number;
  pause_ack: number;
};
type MemberRow = {
  room_code: string;
  id: string;
  slot: number;
  name: string;
  token_hash: string;
  last_seen: number;
  last_seq: number;
  left_at: number | null;
};
type FrameRow = { slot: number; seq: number; payload: string };
export type RoomReply = {
  status: number;
  body:
    | RoomView
    | (RoomView & { token: string })
    | { ok: true }
    | { error: { code: string; message: string } };
};
class RoomError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
function fail(status: number, code: string, message: string): never {
  throw new RoomError(status, code, message);
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
const safeInt = (value: unknown, minimum = 0): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
function boundedJson(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= MAX_SNAPSHOT_BYTES;
  if (Array.isArray(value))
    return (
      value.length <= 2000 &&
      value.every((item) => boundedJson(item, depth + 1))
    );
  if (!object(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 500 &&
    entries.every(
      ([key, item]) =>
        key !== '__proto__' &&
        key !== 'constructor' &&
        key !== 'prototype' &&
        boundedJson(item, depth + 1),
    )
  );
}
function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
function readSnapshot(value: unknown): RoomSnapshot {
  if (
    !object(value) ||
    !['city', 'screen', 'clean', 'moving', 'race'].includes(
      String(value.scene),
    ) ||
    !safeInt(value.epoch) ||
    !object(value.state) ||
    typeof value.brief !== 'boolean' ||
    (value.driver !== undefined &&
      (!safeInt(value.driver) || value.driver > 2)) ||
    (value.roles !== undefined &&
      (!Array.isArray(value.roles) ||
        value.roles.length !== 3 ||
        new Set(value.roles).size !== 3 ||
        value.roles.some((slot) => !safeInt(slot) || slot > 2))) ||
    (value.attempt !== undefined &&
      (!safeInt(value.attempt) || value.attempt > value.epoch)) ||
    !boundedJson(value.state)
  ) {
    return fail(400, 'INVALID_SNAPSHOT', 'Неверный снимок комнаты.');
  }
  if (
    value.scene === 'race' &&
    (!validRaceState(value.state) ||
      value.brief !== (value.state.phase === 'lobby'))
  )
    return fail(400, 'INVALID_SNAPSHOT', 'Неверный заезд.');
  const snapshot: RoomSnapshot = {
    scene: value.scene as RoomSnapshot['scene'],
    epoch: value.epoch,
    state: { ...value.state },
    brief: value.brief,
    roles: (value.roles ?? [0, 1, 2]) as [number, number, number],
    attempt: value.attempt === undefined ? value.epoch : Number(value.attempt),
    driver: value.driver === undefined ? 0 : Number(value.driver),
  };
  if (jsonBytes(snapshot) > MAX_SNAPSHOT_BYTES)
    fail(413, 'SNAPSHOT_TOO_LARGE', 'Снимок комнаты слишком большой.');
  return snapshot;
}
function readFrames(value: unknown): RoomInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_INPUT_FRAMES)
    return fail(400, 'INVALID_FRAMES', 'Слишком много команд.');
  let previous = 0;
  return value.map((raw) => {
    if (
      !object(raw) ||
      !safeInt(raw.seq, 1) ||
      raw.seq <= previous ||
      !safeInt(raw.epoch) ||
      !Array.isArray(raw.keys) ||
      raw.keys.length > INPUT_KEYS.size ||
      raw.keys.some((key) => typeof key !== 'string' || !INPUT_KEYS.has(key)) ||
      new Set(raw.keys).size !== raw.keys.length
    )
      return fail(400, 'INVALID_FRAMES', 'Неверная последовательность ввода.');
    previous = raw.seq;
    const frame: RoomInput = {
      seq: raw.seq,
      epoch: raw.epoch,
      keys: raw.keys as string[],
    };
    if (raw.drive !== undefined) {
      const drive = raw.drive;
      if (
        !object(drive) ||
        ![drive.throttle, drive.steer].every(
          (axis) =>
            typeof axis === 'number' &&
            Number.isFinite(axis) &&
            Math.abs(axis) <= 1,
        )
      )
        return fail(400, 'INVALID_FRAMES', 'Неверное управление машиной.');
      frame.drive = {
        throttle: Number(drive.throttle),
        steer: Number(drive.steer),
      };
    }
    if (raw.raceInputs !== undefined) {
      if (!validRaceInputs(raw.raceInputs))
        return fail(400, 'INVALID_FRAMES', 'Неверный ввод гонщиков.');
      frame.raceInputs = raw.raceInputs as RaceInput[];
    }
    if (raw.command !== undefined) {
      if (
        !object(raw.command) ||
        typeof raw.command.kind !== 'string' ||
        !COMMANDS.has(raw.command.kind) ||
        !validRaceCommand(raw.command) ||
        !boundedJson(raw.command, 5) ||
        jsonBytes(raw.command) > 1024
      )
        return fail(400, 'INVALID_COMMAND', 'Неизвестная команда комнаты.');
      frame.command = raw.command as RoomCommand;
    }
    return frame;
  });
}
function readCode(value: unknown): string {
  if (typeof value !== 'string')
    return fail(400, 'INVALID_CODE', 'Введите код комнаты из восьми символов.');
  const code = value.trim().toUpperCase();
  if (
    code.length !== 8 ||
    code.split('').some((letter) => !CODE_ALPHABET.includes(letter))
  )
    return fail(400, 'INVALID_CODE', 'Введите код комнаты из восьми символов.');
  return code;
}
function readName(value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string')
    return fail(400, 'INVALID_NAME', 'Неверное имя игрока.');
  const name = value
    .trim()
    .split('')
    .filter(
      (character) =>
        character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
    )
    .join('')
    .replace(/\s+/g, ' ');
  if (!name || name.length > 32)
    return fail(
      400,
      'INVALID_NAME',
      'Имя должно содержать от 1 до 32 символов.',
    );
  return name;
}
function token(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
function roomCode(): string {
  // Rejection sampling avoids biased short invitation codes.
  let code = '';
  const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
  while (code.length < 8)
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < limit) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (code.length === 8) break;
    }
  return code;
}
async function hash(raw: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
async function getRoom(
  db: RoomDatabase,
  code: string,
  now: number,
): Promise<RoomRow> {
  const room = await db
    .prepare('SELECT * FROM rooms WHERE code = ?')
    .bind(code)
    .first<RoomRow>();
  return validateRoom(room, now);
}
function validateRoom(room: RoomRow | null, now: number): RoomRow {
  if (!room)
    return fail(404, 'ROOM_NOT_FOUND', 'Комната не найдена. Проверьте код.');
  if (room.closed_at !== null)
    return fail(410, 'ROOM_CLOSED', 'Создатель закрыл комнату.');
  if (room.expires_at <= now)
    return fail(410, 'ROOM_EXPIRED', 'Время комнаты истекло. Создайте новую.');
  return room;
}
async function memberFor(
  db: RoomDatabase,
  code: string,
  raw: unknown,
): Promise<MemberRow> {
  if (typeof raw !== 'string' || !/^[a-f0-9]{64}$/.test(raw))
    return fail(401, 'INVALID_TOKEN', 'Подключитесь к комнате заново.');
  const member = await db
    .prepare(
      'SELECT * FROM room_members WHERE room_code = ? AND token_hash = ?',
    )
    .bind(code, await hash(raw))
    .first<MemberRow>();
  if (!member)
    return fail(401, 'INVALID_TOKEN', 'Подключитесь к комнате заново.');
  return member;
}
async function roomView(
  db: RoomDatabase,
  code: string,
  slot: number,
  now: number,
  resumed = false,
): Promise<RoomView> {
  // Read one consistent view in one D1 round trip, rather than separately
  // fetching room, roster and input queue over the hosting gateway.
  const row = await db
    .prepare(`SELECT r.*,
    (SELECT json_group_array(json_object('id', m.id, 'slot', m.slot,
      'name', m.name, 'last_seen', m.last_seen, 'last_seq', m.last_seq,
      'left_at', m.left_at)) FROM (
        SELECT * FROM room_members WHERE room_code = r.code ORDER BY slot
      ) m) AS members_json,
    CASE WHEN ? = 0 THEN (
      SELECT json_group_array(json_object('slot', f.slot, 'seq', f.seq, 'payload', f.payload))
      FROM (SELECT slot, seq, payload FROM room_frames
        WHERE room_code = r.code AND epoch = r.epoch ORDER BY slot, seq) f
    ) ELSE '[]' END AS frames_json
    FROM rooms r WHERE r.code = ?`)
    .bind(slot, code)
    .first<RoomRow & { members_json: string; frames_json: string }>();
  const room = validateRoom(row, now);
  const members = JSON.parse(row!.members_json) as MemberRow[];
  const pending = JSON.parse(row!.frames_json) as FrameRow[];
  const roster = members.map((member) => ({
    id: member.id,
    slot: member.slot,
    name: member.name,
    connected:
      member.left_at === null && now - member.last_seen <= MEMBER_STALE_MS,
    lastSeen: member.last_seen,
  }));
  const frames: Record<string, RoomInput[]> = {};
  for (const row of pending)
    (frames[String(row.slot)] ??= []).push(
      JSON.parse(row.payload) as RoomInput,
    );
  return {
    version: ROOM_VERSION,
    code,
    slot,
    capacity: room.capacity,
    serverTime: now,
    expiresAt: room.expires_at,
    roster,
    snapshot: room.snapshot
      ? (JSON.parse(room.snapshot) as RoomSnapshot)
      : null,
    snapshotSeq: room.snapshot_seq,
    frames,
    ack: members.find((member) => member.slot === slot)?.last_seq ?? 0,
    frozen:
      resumed ||
      room.pause_revision > room.pause_ack ||
      roster.some((member) => !member.connected),
    pauseRevision: room.pause_revision,
    resumed,
  };
}
async function createRoom(
  db: RoomDatabase,
  body: Record<string, unknown>,
  now: number,
): Promise<RoomReply> {
  const capacity = body.capacity ?? 3;
  if (capacity !== 2 && capacity !== 3)
    return fail(
      400,
      'INVALID_CAPACITY',
      'В комнате может быть два или три игрока.',
    );
  const name = readName(body.name, 'Ведущий');
  const rawToken = token(),
    tokenHash = await hash(rawToken);
  // Expiry needs no scheduled service; bounded cleanup accompanies new rooms.
  await db
    .prepare(
      'DELETE FROM rooms WHERE code IN (SELECT code FROM rooms WHERE expires_at <= ? ORDER BY expires_at LIMIT 32)',
    )
    .bind(now)
    .run();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = roomCode();
    try {
      await db.batch([
        db
          .prepare(
            'INSERT INTO rooms (code, capacity, snapshot, snapshot_seq, epoch, created_at, expires_at, closed_at) VALUES (?, ?, NULL, 0, 0, ?, ?, NULL)',
          )
          .bind(code, capacity, now, now + ROOM_TTL_MS),
        db
          .prepare(
            'INSERT INTO room_members (room_code, id, slot, name, token_hash, last_seen, last_seq, left_at) VALUES (?, ?, 0, ?, ?, ?, 0, NULL)',
          )
          .bind(code, crypto.randomUUID(), name, tokenHash, now),
      ]);
      return {
        status: 201,
        body: { ...(await roomView(db, code, 0, now)), token: rawToken },
      };
    } catch (error) {
      if (!String(error).includes('UNIQUE constraint failed: rooms.code'))
        throw error;
    }
  }
  return fail(
    503,
    'ROOM_UNAVAILABLE',
    'Не удалось создать комнату. Попробуйте ещё раз.',
  );
}
async function joinRoom(
  db: RoomDatabase,
  body: Record<string, unknown>,
  now: number,
): Promise<RoomReply> {
  const code = readCode(body.code),
    name = readName(body.name, 'Друг');
  const rawToken = token(),
    tokenHash = await hash(rawToken);
  for (let attempt = 0; attempt < 3; attempt++) {
    const room = await getRoom(db, code, now);
    const snapshot = room.snapshot
      ? (JSON.parse(room.snapshot) as RoomSnapshot)
      : null;
    if (
      snapshot &&
      (snapshot.scene === 'race'
        ? !['lobby', 'result'].includes(String(snapshot.state.phase))
        : snapshot.scene !== 'city' && !snapshot.brief)
    )
      return fail(
        409,
        'GAME_STARTED',
        'История уже началась. Дождитесь возвращения в город.',
      );
    const members = (
      await db
        .prepare('SELECT slot FROM room_members WHERE room_code = ?')
        .bind(code)
        .all<{ slot: number }>()
    ).results;
    const slot = Array.from(
      { length: room.capacity - 1 },
      (_, index) => index + 1,
    ).find((candidate) => !members.some((member) => member.slot === candidate));
    if (slot === undefined)
      return fail(
        409,
        'ROOM_FULL',
        'Все места заняты. Для восстановления используйте прежнее подключение.',
      );
    try {
      await db
        .prepare(`INSERT INTO room_members (room_code, id, slot, name, token_hash, last_seen, last_seq, left_at)
        SELECT ?, ?, ?, ?, ?, ?, 0, NULL WHERE EXISTS (
          SELECT 1 FROM rooms WHERE code = ? AND closed_at IS NULL AND expires_at > ?
          AND (snapshot IS NULL OR (json_extract(snapshot,'$.scene')='race' AND json_extract(snapshot,'$.state.phase') IN ('lobby','result')) OR (json_extract(snapshot,'$.scene')<>'race' AND (json_extract(snapshot,'$.scene')='city' OR json_extract(snapshot,'$.brief')=1)))
        )`)
        .bind(code, crypto.randomUUID(), slot, name, tokenHash, now, code, now)
        .run();
      const inserted = await db
        .prepare(
          'SELECT slot FROM room_members WHERE room_code = ? AND token_hash = ?',
        )
        .bind(code, tokenHash)
        .first<{ slot: number }>();
      if (!inserted) {
        await getRoom(db, code, now);
        return fail(
          409,
          'GAME_STARTED',
          'История уже началась. Дождитесь возвращения в город.',
        );
      }
      return {
        status: 200,
        body: { ...(await roomView(db, code, slot, now)), token: rawToken },
      };
    } catch (error) {
      if (
        !String(error).includes(
          'UNIQUE constraint failed: room_members.room_code, room_members.slot',
        )
      )
        throw error;
    }
  }
  return fail(409, 'ROOM_FULL', 'Место только что заняли. Попробуйте ещё раз.');
}
async function pollRoom(
  db: RoomDatabase,
  body: Record<string, unknown>,
  now: number,
): Promise<RoomReply> {
  const code = readCode(body.code),
    room = await getRoom(db, code, now),
    member = await memberFor(db, code, body.token);
  const resumed =
    member.left_at !== null ||
    now - member.last_seen > MEMBER_STALE_MS ||
    body.rejoin === true;
  const frames = readFrames(body.frames);
  const snapshot =
    body.snapshot === undefined ? undefined : readSnapshot(body.snapshot);
  if (
    member.slot !== 0 &&
    (snapshot !== undefined ||
      body.acks !== undefined ||
      body.pauseAck !== undefined)
  )
    return fail(
      403,
      'HOST_ONLY',
      'Снимок отправляет приложение создателя комнаты.',
    );
  if (member.slot === 0 && frames.length)
    return fail(
      403,
      'GUEST_INPUT_ONLY',
      'Ведущий применяет свой ввод локально.',
    );
  if (
    snapshot &&
    (!safeInt(body.snapshotSeq, 1) || snapshot.epoch < room.epoch)
  )
    return fail(
      409,
      'STALE_SNAPSHOT',
      'Снимок относится к предыдущему состоянию комнаты.',
    );
  if (snapshot && snapshot.driver! >= room.capacity)
    return fail(400, 'INVALID_SNAPSHOT', 'Неверное место водителя.');
  if (
    snapshot &&
    room.snapshot &&
    snapshot.scene !== (JSON.parse(room.snapshot) as RoomSnapshot).scene &&
    snapshot.epoch <= room.epoch
  )
    return fail(409, 'STALE_EPOCH', 'Для перехода нужна новая версия сцены.');
  if (
    snapshot &&
    snapshot.epoch > room.epoch &&
    Number(body.snapshotSeq) <= room.snapshot_seq
  )
    return fail(409, 'STALE_SNAPSHOT', 'Нужен новый номер снимка.');
  const previous = room.snapshot
    ? (JSON.parse(room.snapshot) as RoomSnapshot)
    : null;
  const raceStart =
    !!snapshot &&
    snapshot.scene === 'race' &&
    snapshot.state.phase === 'countdown' &&
    !(
      previous?.scene === 'race' &&
      ['countdown', 'racing'].includes(String(previous.state.phase))
    );
  if (
    snapshot?.scene === 'race' &&
    !validRaceState(snapshot.state, room.capacity)
  )
    return fail(400, 'INVALID_SNAPSHOT', 'Неверный состав заезда.');
  if (
    raceStart &&
    (previous?.scene !== 'race' ||
      previous.state.phase !== 'lobby' ||
      snapshot!.epoch <= room.epoch ||
      previous.state.revision !== snapshot!.state.revision ||
      !(previous.state.racers as { ready: boolean }[]).every((r) => r.ready) ||
      frozenRaceConfig(previous.state) !== frozenRaceConfig(snapshot!.state))
  )
    return fail(
      409,
      'RACE_LOBBY_CHANGED',
      'Состав заезда изменился. Подтвердите готовность ещё раз.',
    );
  if (
    snapshot?.scene === 'race' &&
    previous?.scene === 'race' &&
    ['countdown', 'racing'].includes(String(previous.state.phase)) &&
    snapshot.state.phase !== 'lobby' &&
    frozenRaceConfig(previous.state) !== frozenRaceConfig(snapshot.state)
  )
    return fail(400, 'INVALID_SNAPSHOT', 'Машины закреплены до конца заезда.');
  const rolesChanged =
    snapshot &&
    JSON.stringify(snapshot.roles) !==
      JSON.stringify(previous?.roles ?? [0, 1, 2]);
  if (
    snapshot &&
    snapshot
      .roles!.slice(0, room.capacity)
      .some((slot) => slot >= room.capacity)
  )
    return fail(400, 'INVALID_SNAPSHOT', 'Неверное назначение ролей.');
  if (snapshot && rolesChanged) {
    if (snapshot.epoch <= room.epoch || snapshot.state.paused !== true)
      return fail(
        409,
        'STALE_EPOCH',
        'Для передачи ведущего нужна пауза и новая версия управления.',
      );
    const target = await db
      .prepare('SELECT * FROM room_members WHERE room_code = ? AND slot = ?')
      .bind(code, snapshot.roles![0])
      .first<MemberRow>();
    if (
      !target ||
      target.left_at !== null ||
      now - target.last_seen > MEMBER_STALE_MS
    )
      return fail(
        400,
        'INVALID_SNAPSHOT',
        'Дождитесь подключения нового ведущего.',
      );
  }
  if (
    body.pauseAck !== undefined &&
    (!safeInt(body.pauseAck) ||
      body.pauseAck > room.pause_revision ||
      !snapshot ||
      snapshot.state.paused !== true)
  )
    return fail(
      400,
      'INVALID_PAUSE_ACK',
      'Подтвердить ожидание можно только сохранённой паузой.',
    );
  const acks: [number, number][] = [];
  if (body.acks !== undefined) {
    if (!object(body.acks) || Object.keys(body.acks).length > 2)
      return fail(400, 'INVALID_ACKS', 'Неверное подтверждение ввода.');
    for (const [slot, seq] of Object.entries(body.acks)) {
      if (
        !/^[12]$/.test(slot) ||
        Number(slot) >= room.capacity ||
        !safeInt(seq)
      )
        return fail(400, 'INVALID_ACKS', 'Неверное подтверждение ввода.');
      acks.push([Number(slot), seq]);
    }
  }
  const fresh = frames.filter((frame) => frame.seq > member.last_seq);
  for (let index = 0; index < fresh.length; index++) {
    if (fresh[index].seq !== member.last_seq + index + 1)
      return fail(
        409,
        'INPUT_SEQUENCE_GAP',
        'Повторите неподтверждённые команды по порядку.',
      );
    if (fresh[index].epoch !== room.epoch)
      return fail(409, 'STALE_EPOCH', 'Ввод относится к предыдущей сцене.');
  }
  if (fresh.length && !resumed) {
    const count = await db
      .prepare(
        'SELECT COUNT(*) AS total FROM room_frames WHERE room_code = ? AND slot = ?',
      )
      .bind(code, member.slot)
      .first<{ total: number }>();
    if ((count?.total ?? 0) + fresh.length > MAX_INPUT_FRAMES)
      return fail(409, 'INPUT_QUEUE_FULL', 'Ждём подтверждение ведущего.');
  }
  const statements: RoomStatement[] = [
    db
      .prepare(
        'UPDATE rooms SET expires_at = MAX(expires_at, ?) WHERE code = ? AND closed_at IS NULL',
      )
      .bind(now + ROOM_TTL_MS, code),
  ];
  if (resumed)
    statements.push(
      db
        .prepare(
          'UPDATE rooms SET pause_revision = pause_revision + 1 WHERE code = ?',
        )
        .bind(code),
    );
  // Reconnection is a neutral-input boundary, never a replay of actions made
  // while a peer was away. Sequence acknowledgement still advances below.
  if (resumed)
    statements.push(
      member.slot === 0
        ? db.prepare('DELETE FROM room_frames WHERE room_code = ?').bind(code)
        : db
            .prepare('DELETE FROM room_frames WHERE room_code = ? AND slot = ?')
            .bind(code, member.slot),
    );
  let snapshotIndex = -1;
  if (snapshot) {
    if (resumed || room.pause_revision > room.pause_ack)
      snapshot.state.paused = true;
    snapshotIndex = statements.length;
    const raceGuard = raceStart
      ? ` AND snapshot_seq = ? AND epoch = ? AND pause_revision = pause_ack
      AND json_extract(snapshot,'$.scene')='race' AND json_extract(snapshot,'$.state.phase')='lobby'
      AND NOT EXISTS (SELECT 1 FROM room_members m WHERE m.room_code=rooms.code AND (m.left_at IS NOT NULL OR m.last_seen < ? OR NOT EXISTS (SELECT 1 FROM json_each(?, '$.state.racers') j WHERE json_extract(j.value,'$.memberSlot')=m.slot)))
      AND NOT EXISTS (SELECT 1 FROM json_each(?, '$.state.racers') j WHERE NOT EXISTS (SELECT 1 FROM room_members m WHERE m.room_code=rooms.code AND m.slot=json_extract(j.value,'$.memberSlot')))`
      : '';
    const raceArgs: SqlValue[] = raceStart
      ? [
          room.snapshot_seq,
          room.epoch,
          now - MEMBER_STALE_MS,
          JSON.stringify(snapshot),
          JSON.stringify(snapshot),
        ]
      : [];
    statements.push(
      db
        .prepare(
          `UPDATE rooms SET snapshot = CASE WHEN pause_revision > pause_ack THEN json_set(?, '$.state.paused', json('true')) ELSE ? END, snapshot_seq = ?, epoch = ? WHERE code = ? AND closed_at IS NULL AND expires_at > ? AND snapshot_seq < ? AND epoch <= ?${raceGuard}`,
        )
        .bind(
          JSON.stringify(snapshot),
          JSON.stringify(snapshot),
          Number(body.snapshotSeq),
          snapshot.epoch,
          code,
          now,
          Number(body.snapshotSeq),
          snapshot.epoch,
          ...raceArgs,
        ),
    );
    statements.push(
      db
        .prepare(
          'DELETE FROM room_frames WHERE room_code = ? AND epoch < (SELECT epoch FROM rooms WHERE code = ?)',
        )
        .bind(code, code),
    );
  }
  if (snapshot && body.pauseAck !== undefined)
    statements.push(
      db
        .prepare(
          `UPDATE rooms SET pause_ack = MAX(pause_ack, ?) WHERE code = ? AND snapshot_seq = ? AND epoch = ? AND json_extract(snapshot, '$.state.paused') = 1`,
        )
        .bind(
          Number(body.pauseAck),
          code,
          Number(body.snapshotSeq),
          snapshot.epoch,
        ),
    );
  for (const [slot, seq] of acks)
    statements.push(
      db
        .prepare(
          `DELETE FROM room_frames WHERE room_code = ? AND slot = ? AND seq <= ?${snapshot ? ' AND EXISTS (SELECT 1 FROM rooms WHERE code = ? AND snapshot_seq = ? AND epoch = ?)' : ''}`,
        )
        .bind(
          code,
          slot,
          seq,
          ...(snapshot ? [code, Number(body.snapshotSeq), snapshot.epoch] : []),
        ),
    );
  if (fresh.length && !resumed)
    statements.push(
      db
        .prepare(`INSERT INTO room_frames (room_code, slot, seq, epoch, payload, created_at)
    SELECT ?, ?, json_extract(value, '$.seq'), json_extract(value, '$.epoch'), value, ? FROM json_each(?) WHERE EXISTS (
      SELECT 1 FROM room_members m JOIN rooms r ON r.code = m.room_code
      WHERE m.room_code = ? AND m.slot = ? AND m.token_hash = ? AND m.last_seq = ?
      AND r.epoch = ? AND r.closed_at IS NULL AND r.expires_at > ?
    )`)
        .bind(
          code,
          member.slot,
          now,
          JSON.stringify(fresh),
          code,
          member.slot,
          member.token_hash,
          member.last_seq,
          room.epoch,
          now,
        ),
    );
  const newest = fresh.at(-1)?.seq ?? member.last_seq;
  // Presence belongs to the authenticated member, not a simulation epoch.
  // A concurrent host snapshot must not make a successful return look offline.
  statements.push(
    db
      .prepare(
        `UPDATE room_members SET last_seen = MAX(last_seen, ?), left_at = CASE WHEN left_at <= ? THEN NULL ELSE left_at END WHERE room_code = ? AND slot = ? AND token_hash = ? AND EXISTS (SELECT 1 FROM rooms WHERE code = ? AND closed_at IS NULL AND expires_at > ?)`,
      )
      .bind(now, now, code, member.slot, member.token_hash, code, now),
  );
  statements.push(
    db
      .prepare(
        `UPDATE room_members SET last_seq = ? WHERE room_code = ? AND slot = ? AND token_hash = ? AND last_seq = ? AND EXISTS (SELECT 1 FROM rooms WHERE code = ? AND closed_at IS NULL AND expires_at > ? AND epoch = ?)`,
      )
      .bind(
        newest,
        code,
        member.slot,
        member.token_hash,
        member.last_seq,
        code,
        now,
        snapshot ? snapshot.epoch : room.epoch,
      ),
  );
  const results = await db.batch(statements);
  if (
    raceStart &&
    (results[snapshotIndex] as { meta?: { changes?: number } })?.meta
      ?.changes !== 1
  )
    return fail(
      409,
      'RACE_LOBBY_CHANGED',
      'Состав заезда изменился. Подтвердите готовность ещё раз.',
    );
  return {
    status: 200,
    body: await roomView(db, code, member.slot, now, resumed),
  };
}
async function leaveRoom(
  db: RoomDatabase,
  body: Record<string, unknown>,
  now: number,
): Promise<RoomReply> {
  const code = readCode(body.code);
  await getRoom(db, code, now);
  const member = await memberFor(db, code, body.token);
  const statements = [
    db
      .prepare(
        'UPDATE room_members SET left_at = ? WHERE room_code = ? AND slot = ? AND token_hash = ?',
      )
      .bind(now, code, member.slot, member.token_hash),
    db
      .prepare('DELETE FROM room_frames WHERE room_code = ? AND slot = ?')
      .bind(code, member.slot),
  ];
  if (member.slot === 0)
    statements.push(
      db
        .prepare('UPDATE rooms SET closed_at = ? WHERE code = ?')
        .bind(now, code),
    );
  await db.batch(statements);
  return { status: 200, body: { ok: true } };
}
/** `now` is injectable for deterministic expiry/reconnect tests. */
export async function handleRoomRequest(
  db: RoomDatabase,
  payload: unknown,
  now = Date.now(),
): Promise<RoomReply> {
  try {
    if (!object(payload) || payload.version !== ROOM_VERSION)
      return fail(400, 'VERSION_MISMATCH', 'Обновите игру у всех игроков.');
    if (payload.op === 'create') return await createRoom(db, payload, now);
    if (payload.op === 'join') return await joinRoom(db, payload, now);
    if (payload.op === 'poll') return await pollRoom(db, payload, now);
    if (payload.op === 'leave') return await leaveRoom(db, payload, now);
    return fail(400, 'INVALID_OPERATION', 'Неизвестная команда комнаты.');
  } catch (error) {
    if (error instanceof RoomError)
      return {
        status: error.status,
        body: { error: { code: error.code, message: error.message } },
      };
    return {
      status: 503,
      body: {
        error: {
          code: 'RELAY_UNAVAILABLE',
          message:
            'Сервер комнаты временно недоступен. Подключение восстановится автоматически.',
        },
      },
    };
  }
}

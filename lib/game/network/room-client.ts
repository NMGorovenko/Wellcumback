import { roomRoles } from './room-roles.ts';
import { pauseRoomWorld } from './room-pause.ts';
import { desktopNetwork } from './desktop-bridge.ts';
import {
  getRoomConnection,
  setRoomConnection,
  requestRoom,
  roomPollDelay,
} from './room-transport.ts';
import { type RoomConnection, validateConnection } from './connection.ts';
import {
  ROOM_VERSION,
  type RoomCommand,
  type RoomFrame,
  type RoomReply,
  type RoomView,
  type RoomWorld,
} from './room-types.ts';
import { neutralDrive, type DriveAxes } from '../input/drive.ts';

const EMPTY: RoomView = {
  status: 'offline',
  code: '',
  slot: -1,
  capacity: 2,
  roster: [],
  world: null,
  message: '',
  ping: 0,
  frozen: false,
};
const STORAGE = 'wellcum-room-v5';
const SAVED_ROOM = 'wellcum-room-return-v5';
let pauseRevision = 0;
let rejoining = false;
let pendingRoleEpoch: number | null = null;
const REQUEST_TIMEOUT_MS = 8000;
let latencyMs = 0;
let pendingSince: number | null = null;
// Successful RTT rises immediately and decays slowly, so one fast response
// does not discard the allowance a slow relay just demonstrated. An in-flight
// request also grants bounded grace before its first timing sample arrives.
const relayLatency = () =>
  Math.max(
    latencyMs,
    pendingSince === null ? 0 : Math.max(0, performance.now() - pendingSince),
  );
export const roomInputDeadlineMs = () =>
  Math.min(8000, 650 + relayLatency() * 3);
const freshnessDeadlineMs = () => Math.min(10000, 1500 + relayLatency() * 3);
function recordLatency(elapsed: number) {
  latencyMs = Math.max(Math.min(REQUEST_TIMEOUT_MS, elapsed), latencyMs * 0.95);
}
const LOCAL_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyE',
  'KeyQ',
  'ShiftLeft',
  'Space',
]);
let view = EMPTY;
let credential: { code: string; token: string; slot: number } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let generation = 0,
  sequence = 0,
  snapshotSeq = 0,
  acceptedAt = 0;
let world: RoomWorld | null = null;
let outbox: RoomFrame[] = [];
let lastInput = '',
  lastDriveAt = 0;
let readyForInput = false;
let needsResync = false;
let acks: Record<string, number> = {};
const incoming = new Map<number, RoomFrame[]>();
const listeners = new Set<() => void>();
const announce = (change: Partial<RoomView>) => {
  view = { ...view, ...change };
  listeners.forEach((listener) => listener());
};
export const roomSnapshot = () => view;
export const roomWorld = () => world;
export const roomActive = () => credential !== null;
export const roomHost = () => credential?.slot === 0;
export const subscribeRoom = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const roomFresh = () =>
  !!credential &&
  view.status === 'connected' &&
  performance.now() - acceptedAt < freshnessDeadlineMs() &&
  !view.frozen &&
  pendingRoleEpoch === null;

function saveCredential(remember = false) {
  try {
    if (credential) {
      const saved = JSON.stringify({
        ...credential,
        sequence,
        snapshotSeq,
        connection: getRoomConnection(),
      });
      sessionStorage.setItem(STORAGE, saved);
      if (remember && typeof localStorage !== 'undefined')
        localStorage.setItem(SAVED_ROOM, saved);
    } else {
      sessionStorage.removeItem(STORAGE);
    }
  } catch {
    /* Storage availability never grants or changes a room role. */
  }
}
async function request(payload: Record<string, unknown>): Promise<RoomReply> {
  const response = await requestRoom({ ...payload, version: ROOM_VERSION });
  const body = response.body as
    | (Partial<RoomReply> & { error?: { code?: string; message?: string } })
    | null;
  if (response.status < 200 || response.status >= 300) {
    const error = new Error(
      body?.error?.message || 'Сервер комнаты не ответил. Проверяем связь…',
    );
    Object.assign(error, { code: body?.error?.code, status: response.status });
    throw error;
  }
  if (body?.version !== ROOM_VERSION || !Array.isArray(body.roster))
    throw new Error(
      'Версии игры различаются. Обновите игру у всех участников.',
    );
  return body as RoomReply;
}
function ingest(reply: RoomReply, elapsed: number) {
  recordLatency(elapsed);
  acceptedAt = performance.now();
  snapshotSeq = Math.max(snapshotSeq, reply.snapshotSeq || 0);
  const pauseChanged = reply.pauseRevision > pauseRevision;
  pauseRevision = Math.max(pauseRevision, reply.pauseRevision ?? 0);
  if (reply.resumed || pauseChanged) {
    outbox = [];
    incoming.clear();
    readyForInput = false;
    lastInput = '';
  }
  if (credential?.slot === 0) {
    for (const [slotKey, frames] of Object.entries(reply.frames)) {
      const slot = Number(slotKey);
      if (
        !Number.isInteger(slot) ||
        slot < 1 ||
        slot > 2 ||
        !Array.isArray(frames)
      )
        continue;
      const queue = incoming.get(slot) ?? [];
      let after = queue.at(-1)?.seq ?? acks[slotKey] ?? 0;
      for (const frame of frames)
        if (frame.seq > after) {
          const previous = queue.at(-1);
          // Repeated held/neutral keepalives must not bury a menu command when
          // a browser throttles the host tab. Preserve every actual key edge.
          if (
            previous &&
            !previous.command &&
            !frame.command &&
            previous.epoch === frame.epoch &&
            JSON.stringify([previous.keys, previous.drive]) ===
              JSON.stringify([frame.keys, frame.drive])
          )
            queue[queue.length - 1] = frame;
          else queue.push(frame);
          after = frame.seq;
        }
      incoming.set(slot, queue);
    }
    // Reloaded host adopts the server's most recent world before ticking again.
    if (!world && reply.snapshot) world = reply.snapshot;
  } else if (
    reply.snapshot &&
    (!world || reply.snapshot.epoch >= world.epoch)
  ) {
    const changed = world?.epoch !== reply.snapshot.epoch;
    world = reply.snapshot;
    if (changed) {
      outbox = [];
      lastInput = '';
      readyForInput = false;
    }
  }
  if (world && (reply.resumed || pauseChanged || reply.frozen))
    pauseRoomWorld(world);
  if (world && pauseChanged && credential?.slot === 0) {
    // Keep the simulation, invalidate every command queued before the break.
    world = {
      ...world,
      attempt: world.attempt ?? world.epoch,
      epoch: world.epoch + 1,
    };
  }
  if (
    pendingRoleEpoch !== null &&
    reply.snapshot &&
    reply.snapshot.epoch >= pendingRoleEpoch &&
    JSON.stringify(roomRoles(reply.snapshot)) ===
      JSON.stringify(roomRoles(world))
  )
    pendingRoleEpoch = null;
  outbox = outbox.filter((frame) => frame.seq > reply.ack);
  sequence = outbox.length ? Math.max(sequence, reply.ack) : reply.ack;
  announce({
    status: 'connected',
    code: reply.code,
    slot: reply.slot,
    capacity: reply.capacity,
    roster: reply.roster,
    world,
    frozen: reply.frozen || pendingRoleEpoch !== null,
    ping: Math.round(elapsed),
    message:
      pendingRoleEpoch !== null
        ? 'Передаём ведущего…'
        : reply.frozen
          ? 'Друг отошёл или потерял связь. История ждёт.'
          : elapsed > 700
            ? 'Медленная связь: действия приходят с задержкой.'
            : '',
  });
  saveCredential();
}
async function poll(run: number) {
  if (run !== generation || !credential) return;
  const started = performance.now();
  pendingSince = started;
  try {
    const reply = await request({
      op: 'poll',
      ...credential,
      ...(rejoining ? { rejoin: true } : {}),
      ...(credential.slot === 0
        ? {
            ...(!needsResync && world
              ? {
                  snapshot: world,
                  snapshotSeq: ++snapshotSeq,
                  ...(world.state.paused === true
                    ? { pauseAck: pauseRevision }
                    : {}),
                }
              : {}),
            acks,
          }
        : { frames: needsResync ? [] : outbox.slice(0, 60) }),
    });
    if (run !== generation) return;
    pendingSince = null;
    ingest(reply, performance.now() - started);
    needsResync = false;
    rejoining = false;
  } catch (error) {
    if (run !== generation) return;
    pendingSince = null;
    readyForInput = false;
    const code = (error as { code?: string }).code;
    // A routine input epoch resync is not another disconnect. Otherwise each
    // late frame would create a pause revision and invalidate the next one.
    if (
      ![
        'STALE_EPOCH',
        'STALE_SNAPSHOT',
        'INPUT_SEQUENCE_GAP',
        'INPUT_QUEUE_FULL',
      ].includes(code ?? '')
    )
      rejoining = true;
    if (['STALE_EPOCH', 'INPUT_SEQUENCE_GAP'].includes(code ?? '')) {
      outbox = [];
      needsResync = true;
      lastInput = '';
    }
    if (roomHost() && (code === 'STALE_SNAPSHOT' || code === 'STALE_EPOCH')) {
      // Recover the authoritative saved scene before publishing again. A stale
      // local bootstrap must not trap a restored host in an endless write loop.
      world = null;
      incoming.clear();
      needsResync = true;
      lastInput = '';
    }
    const terminal = [
      'ROOM_NOT_FOUND',
      'ROOM_EXPIRED',
      'ROOM_CLOSED',
      'UNAUTHORIZED',
      'VERSION_MISMATCH',
      'INVALID_TOKEN',
    ].includes(code ?? '');
    announce({
      status: terminal ? 'failed' : 'reconnecting',
      frozen: true,
      message:
        error instanceof Error ? error.message : 'Восстанавливаем связь…',
    });
    if (terminal) return;
  }
  if (run === generation)
    timer = setTimeout(() => {
      void poll(run);
    }, roomPollDelay());
}
export async function openRoom(
  name: string,
  capacity: 2 | 3 = 2,
  code?: string,
  connection: RoomConnection | null = getRoomConnection(),
) {
  if (
    !connection &&
    (typeof location === 'undefined' || !/^https?:$/.test(location.protocol))
  ) {
    announce({
      status: 'failed',
      message:
        'Создай сервер в приложении или вставь строку подключения от друга.',
    });
    return;
  }
  if (credential) await leaveRoom();
  setRoomConnection(connection);
  const run = ++generation;
  announce({ ...EMPTY, status: 'connecting' });
  const started = performance.now();
  pendingSince = started;
  try {
    const reply = await request(
      code
        ? { op: 'join', code: code.toUpperCase().replace(/\s/g, ''), name }
        : { op: 'create', name, capacity },
    );
    if (run !== generation || !reply.token) return;
    credential = { code: reply.code, token: reply.token, slot: reply.slot };
    sequence = 0;
    snapshotSeq = 0;
    readyForInput = false;
    pendingSince = null;
    ingest(reply, performance.now() - started);
    saveCredential(true);
    void poll(run);
  } catch (error) {
    if (run === generation) {
      pendingSince = null;
      announce({
        status: 'failed',
        message:
          error instanceof Error
            ? error.message
            : 'Не удалось открыть комнату.',
      });
    }
  }
}
export function restoreRoom() {
  if (credential || typeof sessionStorage === 'undefined') return;
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE) || 'null');
    if (
      !saved ||
      typeof saved.code !== 'string' ||
      typeof saved.token !== 'string' ||
      !Number.isInteger(saved.slot)
    )
      return;
    setRoomConnection(
      saved.connection ? validateConnection(saved.connection) : null,
    );
    credential = { code: saved.code, token: saved.token, slot: saved.slot };
    sequence = Number.isSafeInteger(saved.sequence) ? saved.sequence : 0;
    snapshotSeq = Number.isSafeInteger(saved.snapshotSeq)
      ? saved.snapshotSeq
      : 0;
    announce({
      ...EMPTY,
      status: 'reconnecting',
      code: saved.code,
      slot: saved.slot,
      frozen: true,
      message: 'Возвращаемся в комнату…',
    });
    rejoining = true;
    saveCredential(true);
    void poll(++generation);
  } catch {
    /* Ignore damaged local resume data. */
  }
}
/** A closed tab/app can explicitly return; invitations never include this token. */
export function savedRoomCode(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_ROOM) || 'null');
    return saved &&
      /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(saved.code) &&
      /^[a-f0-9]{64}$/.test(saved.token) &&
      Number.isInteger(saved.slot) &&
      saved.slot >= 0 &&
      saved.slot <= 2
      ? saved.code
      : null;
  } catch {
    return null;
  }
}
export function returnToSavedRoom() {
  if (credential || !savedRoomCode()) return;
  try {
    sessionStorage.setItem(STORAGE, localStorage.getItem(SAVED_ROOM)!);
    restoreRoom();
  } catch {
    /* Unavailable storage leaves the connection untouched. */
  }
}
export async function leaveRoom() {
  const previous = credential;
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_ROOM) || 'null');
    if (previous && saved?.token === previous.token)
      localStorage.removeItem(SAVED_ROOM);
  } catch {
    /* Other tabs' saved return options remain intact. */
  }
  const run = ++generation;
  clearTimeout(timer);
  credential = null;
  world = null;
  outbox = [];
  incoming.clear();
  acks = {};
  sequence = 0;
  snapshotSeq = 0;
  latencyMs = 0;
  pauseRevision = 0;
  rejoining = false;
  pendingRoleEpoch = null;
  pendingSince = null;
  lastInput = '';
  lastDriveAt = 0;
  readyForInput = false;
  needsResync = false;
  saveCredential();
  announce(EMPTY);
  if (previous) {
    try {
      await requestRoom({ version: ROOM_VERSION, op: 'leave', ...previous });
    } catch {
      /* The abandoned session also expires server-side. */
    }
  }
  if (run === generation) setRoomConnection(null);
}

// Explicit user exit closes an owned desktop relay as well as membership.
// Queue stop before awaiting the leave reply: a slow old room must never
// shut down a new server started while that reply is still in flight.
export async function closeRoomSession() {
  const owner = roomHost();
  const leaving = leaveRoom();
  await Promise.all([leaving, owner ? desktopNetwork()?.stop() : undefined]);
}

export function publishRoomWorld(next: RoomWorld) {
  if (!roomHost()) return;
  const changed = world?.epoch !== next.epoch || world?.scene !== next.scene;
  if (JSON.stringify(roomRoles(world)) !== JSON.stringify(roomRoles(next)))
    pendingRoleEpoch = next.epoch;
  world = next;
  if (changed) {
    readyForInput = false;
    lastInput = '';
    announce({
      world,
      ...(pendingRoleEpoch !== null
        ? { frozen: true, message: 'Передаём ведущего…' }
        : {}),
    });
  }
}
export function captureRoomInput(
  keys: ReadonlySet<string>,
  drive: DriveAxes = neutralDrive(),
  command?: RoomCommand,
) {
  if (!credential || !world || roomHost()) return;
  const selected = [...keys].filter((key) => LOCAL_KEYS.has(key)).sort();
  if (!roomFresh()) readyForInput = false;
  else if (
    !selected.length &&
    Math.abs(drive.steer) + Math.abs(drive.throttle) < 0.05
  )
    readyForInput = true;
  const safe = readyForInput ? selected : [];
  const safeDrive = readyForInput ? drive : neutralDrive();
  const signature = JSON.stringify([safe, safeDrive]);
  const now = performance.now();
  if (needsResync) return;
  if (!command && signature === lastInput && now - lastDriveAt < 180) return;
  if (
    !command &&
    safe.join() === JSON.parse(lastInput || '[[],{}]')[0].join() &&
    now - lastDriveAt <
      Math.max(50, Math.min(250, (relayLatency() + roomPollDelay()) / 30))
  )
    return;
  if (outbox.length >= 100) {
    announce({
      frozen: true,
      status: 'reconnecting',
      message: 'Связь отстаёт. Отпустите кнопки, ждём сервер.',
    });
    return;
  }
  outbox.push({
    seq: ++sequence,
    epoch: world.epoch,
    keys: safe,
    drive: safeDrive,
    ...(command ? { command } : {}),
  });
  lastInput = signature;
  lastDriveAt = now;
  // Send a key edge immediately instead of waiting for the next idle heartbeat.
  if (getRoomConnection() && pendingSince === null) {
    clearTimeout(timer);
    const run = generation;
    timer = setTimeout(() => {
      void poll(run);
    }, 0);
  }
}
export function takeRoomFrame(
  slot: number,
  epoch: number,
): RoomFrame | undefined {
  const queue = incoming.get(slot);
  while (queue?.length) {
    const frame = queue.shift()!;
    acks[String(slot)] = frame.seq;
    if (frame.epoch === epoch) return frame;
  }
  return undefined;
}

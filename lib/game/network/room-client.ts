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
const STORAGE = 'wellcum-room-v3';
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
  performance.now() - acceptedAt < 1500 &&
  !view.frozen;

function saveCredential() {
  try {
    if (credential)
      sessionStorage.setItem(
        STORAGE,
        JSON.stringify({ ...credential, sequence, snapshotSeq }),
      );
    else sessionStorage.removeItem(STORAGE);
  } catch {
    /* Storage availability never grants or changes a room role. */
  }
}
async function request(payload: Record<string, unknown>): Promise<RoomReply> {
  const response = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, version: ROOM_VERSION }),
    cache: 'no-store',
    signal: AbortSignal.timeout(4000),
  });
  const body = (await response.json().catch(() => null)) as
    | (Partial<RoomReply> & { error?: { code?: string; message?: string } })
    | null;
  if (!response.ok) {
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
function ingest(reply: RoomReply) {
  acceptedAt = performance.now();
  snapshotSeq = Math.max(snapshotSeq, reply.snapshotSeq || 0);
  if (reply.resumed) {
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
          queue.push(frame);
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
  outbox = outbox.filter((frame) => frame.seq > reply.ack);
  sequence = outbox.length ? Math.max(sequence, reply.ack) : reply.ack;
  announce({
    status: 'connected',
    code: reply.code,
    slot: reply.slot,
    capacity: reply.capacity,
    roster: reply.roster,
    world,
    frozen: reply.frozen,
    message: reply.frozen ? 'Друг отошёл или потерял связь. История ждёт.' : '',
  });
  saveCredential();
}
async function poll(run: number) {
  if (run !== generation || !credential) return;
  const started = performance.now();
  try {
    const reply = await request({
      op: 'poll',
      ...credential,
      ...(credential.slot === 0
        ? {
            ...(!needsResync && world
              ? { snapshot: world, snapshotSeq: ++snapshotSeq }
              : {}),
            acks,
          }
        : { frames: needsResync ? [] : outbox.slice(0, 60) }),
    });
    if (run !== generation) return;
    ingest(reply);
    needsResync = false;
    announce({ ping: Math.round(performance.now() - started) });
  } catch (error) {
    if (run !== generation) return;
    readyForInput = false;
    const code = (error as { code?: string }).code;
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
    timer = setTimeout(
      () => {
        void poll(run);
      },
      Math.max(40, 120 - (performance.now() - started)),
    );
}
export async function openRoom(
  name: string,
  capacity: 2 | 3 = 2,
  code?: string,
) {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) {
    announce({
      status: 'failed',
      message:
        'Онлайн-комнаты доступны в браузерной версии. Открой сайт игры и пригласи друга.',
    });
    return;
  }
  if (credential) await leaveRoom();
  const run = ++generation;
  announce({ ...EMPTY, status: 'connecting' });
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
    ingest(reply);
    void poll(run);
  } catch (error) {
    if (run === generation)
      announce({
        status: 'failed',
        message:
          error instanceof Error
            ? error.message
            : 'Не удалось открыть комнату.',
      });
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
    void poll(++generation);
  } catch {
    /* Ignore damaged local resume data. */
  }
}
export async function leaveRoom() {
  const previous = credential;
  generation++;
  clearTimeout(timer);
  credential = null;
  world = null;
  outbox = [];
  incoming.clear();
  acks = {};
  sequence = 0;
  snapshotSeq = 0;
  lastInput = '';
  readyForInput = false;
  needsResync = false;
  saveCredential();
  announce(EMPTY);
  if (previous) {
    try {
      await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: ROOM_VERSION,
          op: 'leave',
          ...previous,
        }),
        keepalive: true,
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      /* The abandoned session also expires server-side. */
    }
  }
}
export function publishRoomWorld(next: RoomWorld) {
  if (!roomHost()) return;
  const changed = world?.epoch !== next.epoch || world?.scene !== next.scene;
  world = next;
  if (changed) {
    readyForInput = false;
    lastInput = '';
    announce({ world });
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
    now - lastDriveAt < 50
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

import type { RoomMember, RoomView } from './room-types.ts';

type PresenceMember = Pick<RoomMember, 'id' | 'slot' | 'name' | 'connected'>;
export type RoomPresence = {
  code: string;
  status: RoomView['status'];
  members: PresenceMember[];
  serial: number;
  notice: { id: number; text: string; expiresAt: number } | null;
};
const NOTICE_MS = 4500;

/** Keep the last confirmed roster through a local connection gap. A missing
 * server reply says nothing about whether any individual friend disconnected. */
export function advanceRoomPresence(
  previous: RoomPresence | null,
  room: Pick<RoomView, 'code' | 'slot' | 'status' | 'roster'>,
  now: number,
): RoomPresence | null {
  if (!room.code) return null;
  const sameRoom = previous?.code === room.code;
  const prior = sameRoom ? previous : null;
  const confirmed = room.status === 'connected';
  const members = confirmed
    ? room.roster.map(({ id, slot, name, connected }) => ({
        id,
        slot,
        name,
        connected,
      }))
    : (prior?.members ?? []);
  const events: string[] = [];
  if (prior) {
    if (
      prior.status === 'connected' &&
      (room.status === 'reconnecting' || room.status === 'failed')
    )
      events.push('Связь с сервером потеряна');
    else if (prior.status !== 'connected' && confirmed && prior.members.length)
      events.push('Связь с сервером восстановлена');
    if (confirmed && prior.members.length) {
      for (const member of members) {
        if (member.slot === room.slot) continue;
        const old = prior.members.find((p) => p.id === member.id);
        if (member.connected && !old) events.push(`В игре: ${member.name}`);
        else if (old?.connected && !member.connected)
          events.push(`Нет связи: ${member.name}`);
        else if (old && !old.connected && member.connected)
          events.push(`Снова в игре: ${member.name}`);
      }
      for (const old of prior.members)
        if (
          old.slot !== room.slot &&
          old.connected &&
          !members.some((member) => member.id === old.id)
        )
          events.push(`Нет связи: ${old.name}`);
    }
  }
  const serial = (previous?.serial ?? 0) + Number(events.length > 0);
  const notice = events.length
    ? { id: serial, text: events.join(' · '), expiresAt: now + NOTICE_MS }
    : (prior?.notice ?? null);
  if (
    prior &&
    prior.status === room.status &&
    notice === prior.notice &&
    JSON.stringify(members) === JSON.stringify(prior.members)
  )
    return prior;
  return { code: room.code, status: room.status, members, serial, notice };
}

export function expireRoomNotice(
  presence: RoomPresence | null,
  id: number,
  now: number,
) {
  return presence?.notice?.id === id && now >= presence.notice.expiresAt
    ? { ...presence, notice: null }
    : presence;
}

export function roomStatusDisplay(room: RoomView) {
  const confirmed = room.status === 'connected';
  return {
    // This is this client's request/response time to the relay, never a
    // measurement of any other player's connection or of one-way latency.
    relayRtt:
      confirmed && Number.isFinite(room.ping) && room.ping >= 0
        ? Math.round(room.ping)
        : null,
    peers: room.roster.map((member) => ({
      id: member.id,
      name: member.name,
      self: member.slot === room.slot,
      state: confirmed
        ? member.connected
          ? ('connected' as const)
          : ('disconnected' as const)
        : ('unknown' as const),
    })),
  };
}

/** Subscribe to presence edges, not rendering/game time. The notification
 * deadline keeps running when gameplay is paused and polling cannot extend it. */
export function createRoomPresenceStore(
  read: () => RoomView,
  subscribe: (listener: () => void) => () => void,
  now = () => performance.now(),
  schedule = (callback: () => void, milliseconds: number) => {
    const timer = setTimeout(callback, milliseconds);
    return () => clearTimeout(timer);
  },
) {
  let presence: RoomPresence | null = null;
  let stop: (() => void) | undefined;
  let cancel: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: RoomPresence | null) => {
    if (next === presence) return;
    const previousNotice = presence?.notice;
    presence = next;
    if (next?.notice !== previousNotice) {
      cancel?.();
      cancel = undefined;
      const notice = next?.notice;
      if (notice) {
        const expire = () => {
          if (presence?.notice !== notice) return;
          const remaining = Math.ceil(notice.expiresAt - now());
          if (remaining > 0) cancel = schedule(expire, remaining);
          else publish(expireRoomNotice(presence, notice.id, now()));
        };
        cancel = schedule(
          expire,
          Math.max(0, Math.ceil(notice.expiresAt - now())),
        );
      }
    }
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => presence,
    getServerSnapshot: () => null,
    subscribe(this: void, listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        presence = advanceRoomPresence(null, read(), now());
        stop = subscribe(() =>
          publish(advanceRoomPresence(presence, read(), now())),
        );
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stop?.();
          cancel?.();
          stop = cancel = undefined;
          presence = null;
        }
      };
    },
  };
}

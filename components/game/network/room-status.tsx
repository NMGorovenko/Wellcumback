'use client';
import { useSyncExternalStore } from 'react';
import type { RoomView } from '@/lib/game/network/room-types';
import { roomStatusDisplay } from '@/lib/game/network/room-status';
import { roomPresence } from '@/lib/game/network/room-status-store';

export function RoomStatus({
  room,
  onOpen,
}: {
  room: RoomView;
  onOpen: () => void;
}) {
  const presence = useSyncExternalStore(
    roomPresence.subscribe,
    roomPresence.getSnapshot,
    roomPresence.getServerSnapshot,
  );
  const notice = presence?.code === room.code ? presence.notice : null;
  if (!room.code) return null;
  const display = roomStatusDisplay(room);
  return (
    <div className="room-strip" aria-label="Онлайн-комната">
      <button
        type="button"
        onClick={onOpen}
        title={`Комната ${room.code}`}
        aria-label={`Открыть комнату ${room.code}`}
      >
        Комната
      </button>
      <ul className="room-strip-peers" aria-label="Участники комнаты">
        {display.peers.map((peer) => {
          const status =
            peer.state === 'connected'
              ? 'в игре'
              : peer.state === 'disconnected'
                ? 'нет связи'
                : 'проверяем связь';
          const name = `${peer.name}${peer.self ? ' · ты' : ''}`;
          return (
            <li
              key={peer.id}
              data-state={peer.state}
              title={`${name}: ${status}`}
            >
              <i aria-hidden="true" />
              <span aria-label={`${name}: ${status}`}>{name}</span>
            </li>
          );
        })}
      </ul>
      <small
        className="room-strip-ping"
        title="До сервера"
        aria-label={
          display.relayRtt === null
            ? 'До сервера: нет данных'
            : `До сервера: ${display.relayRtt} мс`
        }
      >
        {display.relayRtt === null ? '—' : `${display.relayRtt} мс`}
      </small>
      <output
        className="room-notice"
        aria-live="polite"
        aria-atomic="true"
      >
        {notice?.text ?? ''}
      </output>
    </div>
  );
}

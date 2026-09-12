'use client';
import { useEffect, useState } from 'react';
import { Copy, Radio, Unplug } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { roomCommand } from '@/lib/game/network/room-game';
import { useRoom } from '@/hooks/use-room';
import { leaveRoom, openRoom } from '@/lib/game/network/room-client';
import { acquireControlInputBlock } from '@/lib/game/input/settings-store';
export function NetworkDialog({
  open,
  onOpenChange,
  onDrive,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onDrive: () => void;
}) {
  const room = useRoom();
  const [name, setName] = useState('Друг'),
    [code, setCode] = useState(''),
    [capacity, setCapacity] = useState<2 | 3>(2),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    if (open) return acquireControlInputBlock();
  }, [open]);
  const busy = room.status === 'connecting';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="help-dialog network-dialog">
        <span className="tiny-label">ОНЛАЙН · ПЕРВАЯ СОВМЕСТНАЯ ИСТОРИЯ</span>
        <DialogTitle>
          {room.code ? 'Компания собирается' : 'Позови друга'}
        </DialogTitle>
        <DialogDescription>
          Ездите по городу и собирайте экран с разных компьютеров. У каждого
          свои WASD + E или геймпад.
        </DialogDescription>
        {!room.code ? (
          <>
            <label className="network-label" htmlFor="room-name">
              Как тебя подписать
            </label>
            <input
              id="room-name"
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="network-actions">
              <label>
                Мест{' '}
                <select
                  aria-label="Мест в комнате"
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value) as 2 | 3)}
                >
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </label>
              <button
                className="play-button"
                disabled={busy}
                onClick={() => void openRoom(name, capacity)}
              >
                <Radio size={15} />
                Создать комнату
              </button>
            </div>
            <label className="network-label" htmlFor="room-code">
              Код от друга
            </label>
            <input
              id="room-code"
              className="room-code"
              value={code}
              maxLength={8}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
              }
              placeholder="8 символов"
            />
            <button
              className="secondary-button"
              disabled={busy || code.length !== 8}
              onClick={() => void openRoom(name, capacity, code)}
            >
              Войти по коду
            </button>
          </>
        ) : (
          <>
            <div className="room-invite">
              <strong>{room.code}</strong>
              <button
                aria-label="Скопировать код комнаты"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(room.code);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                <Copy size={18} />
                {copied ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
            <div className="room-members">
              {room.roster.map((member) => (
                <div key={member.id}>
                  <i className={member.connected ? 'connected' : ''} />
                  <strong>
                    {member.name}
                    {member.slot === room.slot ? ' · ты' : ''}
                  </strong>
                  <span>
                    {['Никита', 'Ярик', 'Рома'][member.slot]}
                    {member.slot === 0 ? ' · ведущий' : ''}
                  </span>
                </div>
              ))}
            </div>
            <p className="quiet">
              На время короткого разрыва история встаёт на паузу. Перезагрузка
              этой вкладки возвращает тебя на своё место; ведущий затем
              продолжает игру.
            </p>
            {room.slot === 0 && room.world?.scene === 'city' && (
              <button
                className="play-button"
                disabled={
                  room.roster.length < 2 ||
                  room.roster.some((p) => !p.connected) ||
                  room.frozen
                }
                onClick={() => {
                  roomCommand({ kind: 'start-screen' });
                  onOpenChange(false);
                }}
              >
                Собрать экран вместе
              </button>
            )}
            <button
              className="play-button"
              disabled={room.status === 'failed'}
              onClick={() => {
                onDrive();
                onOpenChange(false);
              }}
            >
              Вернуться в игру
            </button>
            <button
              className="secondary-button"
              onClick={() => void leaveRoom()}
            >
              <Unplug size={15} />
              {room.slot === 0 ? 'Закрыть комнату' : 'Выйти из комнаты'}
            </button>
          </>
        )}
        {room.message && (
          <output className="network-message">{room.message}</output>
        )}
        <p className="quiet">
          Комнаты работают в веб-версии. Казарма и переезд пока доступны
          локально. Всем участникам нужен доступ к одному сайту игры.
        </p>
      </DialogContent>
    </Dialog>
  );
}

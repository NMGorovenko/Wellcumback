'use client';
import { isRoomLeader } from '@/lib/game/network/room-roles';
import { useEffect, useRef, useState } from 'react';
import { Copy, Radio, Unplug } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { roomCommand, roomRoleName } from '@/lib/game/network/room-game';
import { useRoom } from '@/hooks/use-room';
import {
  closeRoomSession,
  openRoom,
  savedRoomCode,
  returnToSavedRoom,
} from '@/lib/game/network/room-client';
import { getRoomConnection } from '@/lib/game/network/room-transport';
import {
  makeInvitation,
  parseInvitation,
  validateConnection,
} from '@/lib/game/network/connection';
import {
  desktopNetwork,
  type DesktopHostStatus,
  type HostMode,
} from '@/lib/game/network/desktop-bridge';
import { useFormGamepad } from '@/hooks/use-form-gamepad';

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
  const desktop = desktopNetwork();
  const canNetwork =
    !!desktop ||
    (typeof location !== 'undefined' && /^https?:$/.test(location.protocol));
  const [name, setName] = useState('Друг'),
    [code, setCode] = useState('');
  const [capacity, setCapacity] = useState<2 | 3>(2),
    [mode, setMode] = useState<HostMode>('internet');
  const [copied, setCopied] = useState(false),
    [working, setWorking] = useState(false),
    [error, setError] = useState('');
  const [server, setServer] = useState<DesktopHostStatus>({
    state: 'offline',
    message: '',
  });
  const [serverURL, setServerURL] = useState(''),
    [serverKey, setServerKey] = useState('');
  const form = useRef<HTMLDivElement>(null),
    inviteField = useRef<HTMLTextAreaElement>(null);
  useFormGamepad(open, form, () => onOpenChange(false));
  useEffect(() => {
    if (!open || !desktop) return;
    let cancelled = false;
    const read = () => {
      void desktop
        .status()
        .then((value) => {
          if (!cancelled) setServer(value);
        })
        .catch(() => {});
    };
    read();
    const timer = setInterval(read, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, desktop]);
  const savedCode = open ? savedRoomCode() : null;
  const busy = working || room.status === 'connecting';
  const connection = getRoomConnection();
  const invitation =
    room.code && connection ? makeInvitation(connection, room.code) : room.code;
  const attempt = async (operation: () => Promise<unknown>) => {
    if (busy) return;
    setWorking(true);
    setError('');
    setCopied(false);
    try {
      await operation();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось подключиться.');
    } finally {
      setWorking(false);
    }
  };
  const create = async () => {
    if (desktop) {
      const status = await desktop.host(mode);
      setServer(status);
      if (status.state !== 'ready' || !status.connection)
        throw new Error(status.message);
      await openRoom(name, capacity, undefined, status.connection);
    } else await openRoom(name, capacity, undefined, null);
  };
  const join = async () => {
    if (code.trim().startsWith('WCB1:')) {
      const invite = parseInvitation(code);
      await openRoom(name, capacity, invite.code, invite);
    } else if (
      !desktop &&
      /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(code.trim().toUpperCase())
    )
      await openRoom(name, capacity, code.trim().toUpperCase(), null);
    else
      throw new Error('Вставь всю строку WCB1:, которую скопировал ведущий.');
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="help-dialog network-dialog" ref={form}>
        <span className="tiny-label">ОНЛАЙН · WINDOWS + MAC + БРАУЗЕР</span>
        <DialogTitle>
          {room.code ? 'Компания собирается' : 'Позови друга'}
        </DialogTitle>
        <DialogDescription>
          Город и все три истории вместе. У каждого свои WASD + E или геймпад.
        </DialogDescription>
        {!room.code ? (
          <>
            {savedCode && (
              <button
                data-form-control
                className="play-button"
                disabled={busy}
                onClick={() => returnToSavedRoom()}
              >
                Вернуться в комнату {savedCode}
              </button>
            )}
            <label className="network-label" htmlFor="room-name">
              Как тебя подписать
            </label>
            <input
              data-form-control
              id="room-name"
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="network-options" aria-label="Мест в комнате">
              <span>Мест</span>
              {([2, 3] as const).map((value) => (
                <button
                  data-form-control
                  key={value}
                  aria-pressed={capacity === value}
                  onClick={() => setCapacity(value)}
                  disabled={busy}
                >
                  {value}
                </button>
              ))}
            </div>
            {desktop && (
              <div className="network-options" aria-label="Тип сервера">
                {(['internet', 'lan'] as const).map((value) => (
                  <button
                    data-form-control
                    key={value}
                    disabled={busy}
                    aria-pressed={mode === value}
                    onClick={() => setMode(value)}
                  >
                    {value === 'internet'
                      ? 'Через интернет'
                      : 'Одна сеть / VPN'}
                  </button>
                ))}
              </div>
            )}
            <button
              data-form-control
              className="play-button"
              disabled={busy || !canNetwork}
              onClick={() => void attempt(create)}
            >
              <Radio size={16} />
              {working ? 'Подключаем…' : 'Создать игру'}
            </button>
            {desktop && (
              <p className="quiet">
                {mode === 'internet'
                  ? 'VPS не нужен. Игра откроет временный туннель Cloudflare и подготовит приглашение. Его адрес действует, пока сервер открыт.'
                  : 'Подключитесь к одной локальной сети или VPN. Ведущему нужно разрешить входящие соединения игры в системном брандмауэре.'}
              </p>
            )}
            <label className="network-label" htmlFor="room-code">
              Строка подключения от друга
            </label>
            <textarea
              data-form-control
              id="room-code"
              value={code}
              maxLength={1500}
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setCode(e.target.value)}
              placeholder={
                desktop
                  ? 'WCB1:…'
                  : 'WCB1:… или 8 символов комнаты на этом сайте'
              }
            />
            <button
              data-form-control
              className="secondary-button"
              disabled={busy || !code.trim() || !canNetwork}
              onClick={() => void attempt(join)}
            >
              Подключиться
            </button>
            {canNetwork && (
              <details className="network-advanced">
                <summary data-form-control>Свой постоянный сервер</summary>
                <label className="network-label" htmlFor="server-url">
                  Адрес сервера
                </label>
                <input
                  data-form-control
                  id="server-url"
                  type="url"
                  value={serverURL}
                  placeholder="wss://game.example.com/rooms"
                  onChange={(e) => setServerURL(e.target.value)}
                />
                <label className="network-label" htmlFor="server-key">
                  Ключ сервера
                </label>
                <input
                  data-form-control
                  id="server-key"
                  type="password"
                  autoComplete="off"
                  maxLength={64}
                  value={serverKey}
                  onChange={(e) => setServerKey(e.target.value)}
                />
                <button
                  data-form-control
                  className="secondary-button"
                  disabled={busy || !serverURL || !serverKey}
                  onClick={() =>
                    void attempt(() =>
                      openRoom(
                        name,
                        capacity,
                        undefined,
                        validateConnection({
                          url: serverURL.trim(),
                          accessKey: serverKey.trim(),
                        }),
                      ),
                    )
                  }
                >
                  Создать комнату на сервере
                </button>
              </details>
            )}
          </>
        ) : (
          <>
            <div className="room-invite">
              <strong>{room.code}</strong>
              <button
                data-form-control
                aria-label="Скопировать приглашение"
                onClick={() =>
                  void attempt(async () => {
                    try {
                      if (desktop && connection) await desktop.copy(invitation);
                      else await navigator.clipboard.writeText(invitation);
                      setCopied(true);
                    } catch {
                      inviteField.current?.focus();
                      inviteField.current?.select();
                      setError(
                        'Строка выделена — скопируй её через Ctrl+C или ⌘C.',
                      );
                    }
                  })
                }
              >
                <Copy size={18} />
                {copied ? 'Скопировано' : 'Копировать приглашение'}
              </button>
            </div>
            <textarea
              data-form-control
              ref={inviteField}
              aria-label="Приглашение для друга"
              readOnly
              value={invitation}
              onFocus={(e) => e.currentTarget.select()}
            />
            <p className="quiet">
              {connection
                ? 'Отправь другу эту строку. Он вставит её в «Онлайн → Подключиться». Нужна одинаковая версия игры.'
                : 'Этот код работает на том же сайте. Всем участникам нужен доступ к веб-версии.'}
            </p>
            <div className="room-members">
              {room.roster.map((member) => (
                <div key={member.id}>
                  <i className={member.connected ? 'connected' : ''} />
                  <strong>
                    {member.name}
                    {member.slot === room.slot ? ' · ты' : ''}
                  </strong>
                  <span>
                    {roomRoleName(room.world, member.slot)}
                    {isRoomLeader(room.world, member.slot) ? ' · ведущий' : ''}
                  </span>
                  {isRoomLeader(room.world, room.slot) &&
                    member.slot !== room.slot && (
                      <button
                        data-form-control
                        className="secondary-button"
                        disabled={
                          !member.connected ||
                          room.frozen ||
                          room.status !== 'connected' ||
                          !room.world
                        }
                        onClick={() =>
                          roomCommand({ kind: 'leader', value: member.slot })
                        }
                      >
                        Передать ведущего · {member.name}
                      </button>
                    )}
                </div>
              ))}
            </div>
            <p className="quiet">
              При разрыве связи история ждёт. Вернувшийся игрок занимает прежнее
              место; ведущий нажимает «Продолжить». Передача ведущего меняет
              основного героя и водителя, сохраняя этап. Приложение создателя
              комнаты должно оставаться открытым, даже после передачи роли.
            </p>
            {isRoomLeader(room.world, room.slot) &&
              room.world?.scene === 'city' && (
                <div className="network-stories">
                  {[
                    ['screen', 'Собрать экран'],
                    ['clean', 'Байка из казармы'],
                    ['moving', 'Переезд Ярика'],
                  ].map(([story, title]) => (
                    <button
                      data-form-control
                      key={story}
                      className="secondary-button"
                      disabled={
                        room.roster.length < 2 ||
                        room.roster.some((p) => !p.connected) ||
                        room.frozen
                      }
                      onClick={() => {
                        roomCommand({ kind: 'start-story', value: story });
                        onOpenChange(false);
                      }}
                    >
                      {title}
                    </button>
                  ))}
                </div>
              )}
            <button
              data-form-control
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
              data-form-control
              className="secondary-button"
              disabled={busy}
              onClick={() => void attempt(closeRoomSession)}
            >
              <Unplug size={16} />
              {room.slot === 0
                ? 'Закрыть комнату и сервер'
                : 'Выйти из комнаты'}
            </button>
          </>
        )}
        {(error || server.message || room.message) && (
          <output className="network-message">
            {error ||
              (server.state === 'starting' || server.state === 'failed'
                ? server.message
                : room.message || server.message)}
          </output>
        )}
        {!canNetwork && (
          <p className="quiet">
            Один HTML-файл работает офлайн. Для сети запусти приложение Windows
            / Mac или веб-версию.
          </p>
        )}
        {desktop &&
          !room.code &&
          (server.state === 'starting' || server.state === 'ready') && (
            <button
              data-form-control
              className="secondary-button"
              onClick={() =>
                void desktop
                  .stop()
                  .then(() => setServer({ state: 'offline', message: '' }))
              }
            >
              Остановить сервер
            </button>
          )}
      </DialogContent>
    </Dialog>
  );
}

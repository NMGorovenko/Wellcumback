'use client';
import { useEffect, useState } from 'react';
import { Copy, Link2, Radio, Unplug } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useNetworkSession } from '@/hooks/use-network-session';
import {
  acceptNetworkAnswer,
  createNetworkInvite,
  disconnectNetwork,
  joinNetworkInvite,
  passNetworkWheel,
} from '@/lib/game/network/session';
import { acquireControlInputBlock } from '@/lib/game/input/settings-store';
const statuses = {
  idle: 'Поедем вместе?',
  gathering: 'Готовим код…',
  waiting: 'Ждём друга',
  connecting: 'Соединяемся…',
  connected: 'Друг на связи',
  closed: 'Поездка завершена',
  failed: 'Нет соединения',
};
export function NetworkDialog({
  open,
  onOpenChange,
  onDrive,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDrive: () => void;
}) {
  const session = useNetworkSession(),
    [code, setCode] = useState(''),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    if (open) return acquireControlInputBlock();
  }, [open]);
  const busy =
    session.status === 'gathering' || session.status === 'connecting';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(session.invite);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="help-dialog network-dialog">
        <span className="tiny-label">СОВМЕСТНАЯ ПОЕЗДКА · ЭКСПЕРИМЕНТ</span>
        <DialogTitle>{statuses[session.status]}</DialogTitle>
        <DialogDescription>
          Два компьютера, один Mustang. Передавайте руль друг другу и катайтесь
          по общей карте.
        </DialogDescription>
        <p className="quiet">
          В этом первом сетевом этапе доступны поездка и руль. Мини-игры пока
          запускаются локально. Оба откройте одну версию игры.
        </p>
        {session.status !== 'connected' && (
          <>
            <div className="network-actions">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  setCopied(false);
                  setCode('');
                  void createNetworkInvite();
                }}
              >
                <Link2 size={15} /> Создать приглашение
              </button>
            </div>
            <label className="network-label" htmlFor="peer-code">
              {session.role === 'host' ? 'Ответ друга' : 'Приглашение от друга'}
            </label>
            <textarea
              id="peer-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Вставь полный код WCB1…"
              spellCheck={false}
            />
            <button
              className="play-button"
              disabled={!code.trim() || busy}
              onClick={() => {
                setCopied(false);
                if (session.role === 'host') void acceptNetworkAnswer(code);
                else void joinNetworkInvite(code);
              }}
            >
              {session.role === 'host'
                ? 'Принять ответ'
                : 'Подключиться и получить ответ'}
            </button>
            {session.invite && (
              <>
                <label className="network-label" htmlFor="own-peer-code">
                  {session.role === 'host'
                    ? '1. Отправь приглашение другу, затем вставь его ответ выше'
                    : '2. Отправь этот ответ водителю'}
                </label>
                <textarea
                  id="own-peer-code"
                  readOnly
                  value={session.invite}
                  aria-label="Код для друга"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  className="secondary-button"
                  onClick={() => void copy()}
                >
                  <Copy size={15} />
                  {copied ? 'Скопировано' : 'Скопировать код'}
                </button>
              </>
            )}
          </>
        )}
        {session.status === 'connected' && (
          <>
            <p>
              <Radio size={15} /> За рулём:{' '}
              {session.driver === session.role ? 'ты' : 'друг'}. Пассажир может
              подать сигнал кнопкой броска / Q.
            </p>
            {session.role === 'host' && (
              <button className="secondary-button" onClick={passNetworkWheel}>
                Передать руль {session.driver === 'host' ? 'другу' : 'себе'}
              </button>
            )}
            <button
              className="play-button"
              onClick={() => {
                onDrive();
                onOpenChange(false);
              }}
            >
              На общую карту
            </button>
          </>
        )}
        {session.message && (
          <output className="network-message">{session.message}</output>
        )}
        <p className="quiet">
          Прямое соединение может не пройти через некоторые домашние или
          мобильные сети. Автоматические комнаты и сервер для таких соединений —
          следующий этап.
        </p>
        {session.role && (
          <button
            className="secondary-button"
            onClick={() => {
              disconnectNetwork();
              setCode('');
              setCopied(false);
            }}
          >
            <Unplug size={15} /> Отключиться
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

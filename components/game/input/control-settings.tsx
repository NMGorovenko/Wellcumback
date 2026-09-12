'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useControlSettings } from '@/hooks/use-control-settings';
import {
  createPadInput,
  createPadNavigation,
  gamepadPrompt,
  mapGamepads,
  navigateGamepad,
  readGamepads,
  type PadFrame,
} from '@/lib/game/input/gamepads';
import { PLAYER_BINDINGS } from '@/lib/game/input/bindings';
import {
  CONTROL_NAMES,
  PLAYER_NAMES,
  physicalKeyLabel,
  type CanonicalKey,
  type PlayerControl,
} from '@/lib/game/input/settings';
import { acquireControlInputBlock } from '@/lib/game/input/settings-store';

const controls: PlayerControl[] = [
  'up',
  'left',
  'down',
  'right',
  'action',
  'secondary',
];
type ControlSettingsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: number;
  playerNames?: readonly string[];
  pads: Pick<PadFrame, 'assignments'> & Partial<Pick<PadFrame, 'unsupported'>>;
};
export function ControlSettings(props: ControlSettingsProps) {
  return props.open ? <OpenControlSettings {...props} /> : null;
}
function OpenControlSettings({
  open,
  onOpenChange,
  players,
  pads,
  playerNames = PLAYER_NAMES,
}: ControlSettingsProps) {
  const { settings, storageWarning, rebind, reset, setWorldPrompts } =
    useControlSettings();
  const [player, setPlayer] = useState(0);
  const [capturing, setCapturing] = useState<CanonicalKey | null>(null);
  const [notice, setNotice] = useState('');
  const content = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ capturing, onOpenChange, rebind });
  useEffect(() => {
    latest.current = { capturing, onOpenChange, rebind };
  }, [capturing, onOpenChange, rebind]);

  useEffect(() => {
    if (!open) return;
    const release = acquireControlInputBlock();
    const keydown = (event: KeyboardEvent) => {
      const active = latest.current.capturing;
      if (event.code === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (active) {
          setCapturing(null);
          setNotice('Переназначение отменено.');
        } else latest.current.onOpenChange(false);
        return;
      }
      // F is owned by fullscreen outside the modal, including while a key is
      // being recorded. Ordinary Tab navigation remains native when not recording.
      if (!active && event.code !== 'KeyF') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!active || event.repeat) return;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        (event.shiftKey && !event.code.startsWith('Shift'))
      ) {
        setNotice('Нужна одна клавиша без Cmd, Ctrl, Alt и сочетаний.');
        return;
      }
      const result = latest.current.rebind(active, event.code);
      if (result.ok) {
        setCapturing(null);
        setNotice(`Назначено: ${physicalKeyLabel(event.code)}.`);
      } else setNotice(result.reason);
    };
    window.addEventListener('keydown', keydown, true);
    // The modal owns pad navigation while hub/game polling is blocked. It only
    // moves UI focus; the existing gamepad-to-engine mapping is never changed.
    const input = createPadInput(),
      navigation = createPadNavigation();
    let frame = 0;
    const update = (now: number) => {
      const pads = mapGamepads(
        input,
        document.hidden || !document.hasFocus() ? [] : readGamepads(),
        players,
      );
      const nav = navigateGamepad(navigation, pads, now / 1000);
      const items = Array.from(
        content.current?.querySelectorAll<HTMLElement>(
          '[data-control-focus]',
        ) ?? [],
      );
      if (nav.back) {
        if (latest.current.capturing) {
          setCapturing(null);
          setNotice('Переназначение отменено.');
        } else latest.current.onOpenChange(false);
      } else if (!latest.current.capturing) {
        const index = items.findIndex(
          (item) => item === document.activeElement,
        );
        if (nav.direction && items.length) {
          const step =
            nav.direction === 'up' || nav.direction === 'left' ? -1 : 1;
          items[
            index < 0 ? 0 : (index + step + items.length) % items.length
          ]?.focus();
        } else if (nav.confirm) (items[index] ?? items[0])?.click();
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => {
      release();
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', keydown, true);
    };
  }, [open, players]);

  const assigned = pads.assignments.find((pad) => pad.player === player);
  const bindingButton = (canonical: CanonicalKey, title: string) => (
    <button
      type="button"
      data-control-focus
      key={canonical}
      className={`control-binding${capturing === canonical ? ' is-recording' : ''}`}
      onClick={() => {
        setCapturing(canonical);
        setNotice('Нажми новую клавишу. Esc — отмена.');
      }}
      aria-label={`${title}: ${physicalKeyLabel(settings.keys[canonical])}. Нажми, чтобы переназначить.`}
      aria-pressed={capturing === canonical}
    >
      <span>{title}</span>
      <kbd>
        {capturing === canonical
          ? 'Нажми клавишу…'
          : physicalKeyLabel(settings.keys[canonical])}
      </kbd>
    </button>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={content} className="control-settings-dialog">
        <DialogTitle>Управление</DialogTitle>
        <DialogDescription>
          Выбери действие и нажми новую клавишу. Изменения работают во всех
          историях и сохраняются на этом устройстве.
        </DialogDescription>
        <fieldset className="control-player-tabs">
          <legend className="sr-only">Игрок</legend>
          {playerNames.map((name, index) => (
            <button
              data-control-focus
              type="button"
              key={name}
              aria-pressed={index === player}
              onClick={() => {
                setPlayer(index);
                setCapturing(null);
                setNotice('');
              }}
            >
              <strong>
                {index + 1} · {name}
              </strong>
              <small>
                {index < players ? 'в этой игре' : 'настроить заранее'}
              </small>
            </button>
          ))}
        </fieldset>
        <div className="control-binding-list">
          {controls.map((control) =>
            bindingButton(
              PLAYER_BINDINGS[player][control],
              CONTROL_NAMES[control],
            ),
          )}
        </div>
        <p className="control-settings-note">
          {player === 0
            ? 'Пробел тоже выполняет действие первого игрока. В одиночку этой раскладкой управляешь активным героем.'
            : 'Эти клавиши работают, когда участвует этот игрок.'}
        </p>
        {bindingButton('KeyQ', 'Общее · бросок / смена инструмента')}
        <div className="control-pad-info">
          <strong>
            {assigned
              ? `${assigned.label} → ${playerNames[player]}`
              : 'Геймпад пока не назначен этому игроку'}
          </strong>
          {assigned ? (
            <span>
              Действие: <kbd>{gamepadPrompt(pads, player, 'action')}</kbd> ·
              второе: <kbd>{gamepadPrompt(pads, player, 'secondary')}</kbd> ·
              бросок: <kbd>{gamepadPrompt(pads, player, 'throw')}</kbd>
            </span>
          ) : (
            <span>
              Подключи геймпад и отпусти его кнопки. Назначение появится при
              игре.
            </span>
          )}
          {!!pads.unsupported?.length && (
            <small>
              Есть нестандартный геймпад: для него используй клавиатуру.
            </small>
          )}
        </div>
        <label className="control-prompts-toggle">
          <input
            data-control-focus
            type="checkbox"
            checked={settings.showWorldPrompts}
            onChange={(event) => setWorldPrompts(event.target.checked)}
          />
          <span>Показывать кнопки рядом с персонажами</span>
        </label>
        <p className="control-settings-note">
          F — весь экран · Esc — пауза / назад · Tab — переход между
          настройками. Эти клавиши не переназначаются.
        </p>
        <p className="control-settings-notice" aria-live="polite">
          {notice ||
            'Клавиши определяются по расположению: русская раскладка тоже работает.'}
        </p>
        {storageWarning && (
          <p className="control-settings-warning">{storageWarning}</p>
        )}
        <div className="control-settings-actions">
          <button
            data-control-focus
            type="button"
            onClick={() => {
              setCapturing(null);
              reset();
              setNotice('Стандартное управление восстановлено.');
            }}
          >
            Сбросить настройки
          </button>
          <button
            data-control-focus
            type="button"
            onClick={() => onOpenChange(false)}
          >
            Готово
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

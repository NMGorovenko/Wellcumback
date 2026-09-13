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
  mapGamepads,
  navigateGamepad,
  padButtonLabel,
  readGamepads,
  type PadFrame,
} from '@/lib/game/input/gamepads';
import { PLAYER_BINDINGS } from '@/lib/game/input/bindings';
import {
  CITY_CONTROL_NAMES,
  CONTROL_NAMES,
  PLAYER_NAMES,
  getPhysicalBinding,
  physicalKeyLabel,
  type CanonicalKey,
  type InputProfile,
  type PlayerControl,
} from '@/lib/game/input/settings';
import { acquireControlInputBlock } from '@/lib/game/input/settings-store';

const controls: PlayerControl[] = [
  'up',
  'down',
  'left',
  'right',
  'action',
  'secondary',
];
type PadOverview = Pick<PadFrame, 'assignments'> &
  Partial<Pick<PadFrame, 'unsupported'>>;
type Capture = { key: CanonicalKey; profile: InputProfile };
type ControlSettingsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: number;
  playerNames?: readonly string[];
  pads: PadOverview;
  /** Initial context when opening. Both profiles remain available in the dialog. */
  profile?: InputProfile;
};

function PadHelp({
  pads,
  profile,
  player,
  playerNames,
}: {
  pads: PadOverview;
  profile: InputProfile;
  player: number;
  playerNames: readonly string[];
}) {
  const assigned = pads.assignments.find(
    (pad) => pad.player === (profile === 'city' ? 0 : player),
  );
  const fallback: Record<number, string> = {
    0: 'A / ×',
    1: 'B / ○',
    2: 'X / □',
    5: 'RB / R1',
    6: 'LT / L2',
    7: 'RT / R2',
    9: 'Menu / Options',
  };
  const label = (button: number) =>
    assigned ? padButtonLabel(assigned.brand, button) : fallback[button];
  const rows =
    profile === 'city'
      ? [
          ['Руль', 'левый стик ← / →'],
          ['Газ', label(7)],
          ['Тормоз / назад', label(6)],
          ['Дрифт', label(2)],
          ['Начать историю', label(0)],
          ['Сигнал', label(5)],
        ]
      : [
          ['Движение', 'левый стик / крестовина'],
          ['Действие / держать', label(0)],
          ['Второе действие / пылесос', label(6)],
          ['Бросок / смена инструмента', label(5)],
        ];
  return (
    <section className="control-pad-info" aria-label="Управление геймпадом">
      <div className="control-section-heading">
        <strong>{assigned ? assigned.label : 'Xbox / PlayStation'}</strong>
        <span>
          {profile === 'city' ? 'Один водитель' : playerNames[player]}
        </span>
      </div>
      <dl className="control-pad-mapping">
        {rows.map(([action, button]) => (
          <div key={action}>
            <dt>{action}</dt>
            <dd>
              <kbd>{button}</kbd>
            </dd>
          </div>
        ))}
        <div>
          <dt>Пауза / назад</dt>
          <dd>
            <kbd>{label(9)}</kbd>
            <span>или</span>
            <kbd>{label(1)}</kbd>
          </dd>
        </div>
      </dl>
      <div
        className="control-pad-devices"
        aria-live="polite"
        aria-atomic="true"
      >
        {pads.assignments.length ? (
          <ul>
            {pads.assignments.slice(0, 3).map((pad) => (
              <li key={pad.index} data-ready={pad.ready}>
                <span className="control-device-dot" aria-hidden="true" />
                <span>
                  <strong>{pad.label}</strong> →{' '}
                  {profile === 'city' ? 'водитель' : playerNames[pad.player]}
                </span>
                <small>{pad.ready ? 'готов' : 'отпусти кнопки и стик'}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            Геймпад не обнаружен. Подключи его, нажми любую кнопку и отпусти.
          </p>
        )}
        {!!pads.unsupported?.length && (
          <p className="control-settings-warning">
            Геймпад без стандартной раскладки не поддерживается. Клавиатура
            продолжает работать.
          </p>
        )}
      </div>
      <p className="control-settings-note">
        {profile === 'city'
          ? 'Клавиатура и первый геймпад управляют одной машиной.'
          : 'Вдвоём с одним геймпадом: игрок 1 — клавиатура, игрок 2 — геймпад. Два и три геймпада назначаются по порядку.'}{' '}
        Подключение определяется здесь, без перезапуска.
      </p>
    </section>
  );
}

export function ControlSettings(props: ControlSettingsProps) {
  return props.open ? <OpenControlSettings {...props} /> : null;
}
function OpenControlSettings({
  open,
  onOpenChange,
  players,
  pads,
  playerNames = PLAYER_NAMES,
  profile = 'game',
}: ControlSettingsProps) {
  const {
    settings,
    storageWarning,
    rebind,
    reset,
    setWorldPrompts,
    setShowFps,
  } = useControlSettings();
  const [activeProfile, setActiveProfile] = useState<InputProfile>(profile);
  const [device, setDevice] = useState<'keyboard' | 'pad'>('keyboard');
  const [player, setPlayer] = useState(0);
  const [capturing, setCapturing] = useState<Capture | null>(null);
  const [notice, setNotice] = useState('');
  const [livePads, setLivePads] = useState<PadOverview>(pads);
  const content = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ capturing, activeProfile, onOpenChange, rebind });
  useEffect(() => {
    latest.current = { capturing, activeProfile, onOpenChange, rebind };
  }, [capturing, activeProfile, onOpenChange, rebind]);

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
      // F belongs to fullscreen outside this modal. Tab stays native until recording.
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
      const result = latest.current.rebind(
        active.key,
        event.code,
        active.profile,
      );
      if (result.ok) {
        setCapturing(null);
        setNotice(`Назначено: ${physicalKeyLabel(event.code)}.`);
      } else setNotice(result.reason);
    };
    window.addEventListener('keydown', keydown, true);
    const input = createPadInput(),
      navigation = createPadNavigation();
    let frame = 0,
      signature = '';
    const update = (now: number) => {
      const active = latest.current.activeProfile;
      const polled = mapGamepads(
        input,
        document.hidden || !document.hasFocus() ? [] : readGamepads(),
        active === 'city' ? 1 : players,
        active,
      );
      const next = JSON.stringify([polled.assignments, polled.unsupported]);
      if (next !== signature) {
        signature = next;
        setLivePads({
          assignments: polled.assignments,
          unsupported: polled.unsupported,
        });
      }
      const nav = navigateGamepad(navigation, polled, now / 1000);
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
          const item =
            items[index < 0 ? 0 : (index + step + items.length) % items.length];
          item?.focus();
          item?.scrollIntoView({ block: 'nearest' });
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

  const selectProfile = (next: InputProfile, nextPlayer = player) => {
    setActiveProfile(next);
    setPlayer(nextPlayer);
    setCapturing(null);
    setNotice('');
  };
  const bindingButton = (canonical: CanonicalKey, title: string) => {
    const recording =
      capturing?.key === canonical && capturing.profile === activeProfile;
    const label = physicalKeyLabel(
      getPhysicalBinding(settings, canonical, activeProfile),
    );
    return (
      <button
        type="button"
        data-control-focus
        key={canonical}
        className={`control-binding${recording ? ' is-recording' : ''}`}
        onClick={() => {
          setCapturing({ key: canonical, profile: activeProfile });
          setNotice('Нажми новую клавишу. Esc — отмена.');
        }}
        aria-label={`${title}: ${label}. Нажми, чтобы переназначить.`}
        aria-pressed={recording}
      >
        <span>{title}</span>
        <kbd>{recording ? 'Нажми клавишу…' : label}</kbd>
      </button>
    );
  };
  const binding = PLAYER_BINDINGS[activeProfile === 'city' ? 0 : player];
  const names = activeProfile === 'city' ? CITY_CONTROL_NAMES : CONTROL_NAMES;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={content} className="control-settings-dialog">
        <DialogTitle>Управление</DialogTitle>
        <DialogDescription>
          Отдельные раскладки для машины и историй. Настройки сохраняются на
          этом устройстве.
        </DialogDescription>
        <fieldset className="control-player-tabs">
          <legend className="sr-only">Что настроить</legend>
          <button
            data-control-focus
            type="button"
            aria-pressed={activeProfile === 'city'}
            onClick={() => selectProfile('city')}
          >
            <strong>Машина</strong>
            <small>один водитель</small>
          </button>
          {playerNames.slice(0, 3).map((name, index) => (
            <button
              data-control-focus
              type="button"
              key={index}
              aria-pressed={activeProfile === 'game' && index === player}
              onClick={() => selectProfile('game', index)}
            >
              <strong>
                {index + 1} · {name}
              </strong>
              <small>
                {index < players ? 'в историях' : 'настроить заранее'}
              </small>
            </button>
          ))}
        </fieldset>
        <fieldset className="control-device-tabs">
          <legend className="sr-only">Устройство</legend>
          <button
            data-control-focus
            type="button"
            aria-pressed={device === 'keyboard'}
            onClick={() => {
              setDevice('keyboard');
              setCapturing(null);
              setNotice('');
            }}
          >
            Клавиатура
          </button>
          <button
            data-control-focus
            type="button"
            aria-pressed={device === 'pad'}
            onClick={() => {
              setDevice('pad');
              setCapturing(null);
              setNotice('');
            }}
          >
            Геймпады
            {livePads.assignments.length
              ? ` · ${livePads.assignments.length}`
              : ''}
          </button>
        </fieldset>
        {device === 'keyboard' ? (
          <section
            className="control-keyboard-section"
            aria-label="Клавиши управления"
          >
            <p className="control-settings-note">
              Выбери действие и нажми новую клавишу.
            </p>
            <div className="control-binding-list">
              {controls.map((control) =>
                bindingButton(binding[control], names[control]),
              )}
              {bindingButton(
                'KeyQ',
                activeProfile === 'city'
                  ? 'Сигнал'
                  : 'Общее · бросок / смена инструмента',
              )}
            </div>
            <p className="control-settings-note">
              {activeProfile === 'city'
                ? 'Клавиши машины не меняют управление персонажами в историях.'
                : player === 0
                  ? 'Пробел тоже выполняет действие первого игрока. В одиночку управляешь активным героем.'
                  : 'Эти клавиши работают, когда участвует этот игрок.'}
            </p>
          </section>
        ) : (
          <PadHelp
            pads={livePads}
            profile={activeProfile}
            player={player}
            playerNames={playerNames}
          />
        )}
        <label className="control-prompts-toggle">
          <input
            data-control-focus
            type="checkbox"
            checked={settings.showWorldPrompts}
            onChange={(event) => setWorldPrompts(event.target.checked)}
          />
          <span>Показывать кнопки рядом с действиями</span>
        </label>
        <label className="control-prompts-toggle">
          <input
            data-control-focus
            type="checkbox"
            checked={settings.showFps}
            onChange={(event) => setShowFps(event.target.checked)}
          />
          <span>Показывать FPS</span>
        </label>
        <p className="control-settings-shortcuts">
          <span>
            <kbd>F</kbd> весь экран
          </span>
          <span>
            <kbd>Esc</kbd> пауза / назад
          </span>
          <span>
            <kbd>Tab</kbd> по настройкам
          </span>
        </p>
        <p className="control-settings-notice" aria-live="polite">
          {notice ||
            'Русская раскладка тоже работает. F, Esc и Tab не переназначаются.'}
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
              setNotice('Все раскладки и подсказки сброшены к стандартным.');
            }}
          >
            Сбросить всё
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

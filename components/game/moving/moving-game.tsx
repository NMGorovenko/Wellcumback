'use client';
import { isRoomLeader, roomActor } from '@/lib/game/network/room-roles';
import { useRoom } from '@/hooks/use-room';
import { roomWorld, roomFresh } from '@/lib/game/network/room-client';
import { roomCommand, tickRoomMoving } from '@/lib/game/network/room-game';
import type { MovingState } from '@/lib/game/moving/engine';
import { movingLaptopCue } from '@/lib/game/moving/incidents';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Trophy,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  freshMoving,
  movingAction,
  movingCrew,
  movingTick,
} from '@/lib/game/moving/engine';
import { mapMovingCameraKeys } from '@/lib/game/moving/camera-input';
import type { Result } from '@/lib/game/types';
import {
  gamepadHint,
  keyboardPrompt,
  PLAYER_BINDINGS,
  type PadFrame,
} from '@/lib/game/input/gamepads';
import { useGameLoop } from '@/hooks/use-game-loop';
import { useGameInspection } from '@/hooks/use-game-inspection';
import { useControlSettings } from '@/hooks/use-control-settings';
import { ControlSettings } from '@/components/game/input/control-settings';
import { MovingActionPrompts } from './action-prompts';
import { useMovingSound } from './use-moving-sound';
import MovingScene from './scene';
import { SpeechBubble } from '../world/speech-bubble';

export default function MovingGame({
  players,
  online = false,
  externalMenuOpen = false,
  sound,
  onExit,
  onFinish,
  onNext,
}: {
  players: number;
  online?: boolean;
  externalMenuOpen?: boolean;
  sound: boolean;
  onExit: () => void;
  onFinish: (result: Result) => void;
  onNext?: () => void;
}) {
  const room = useRoom();
  const canManage = !online || isRoomLeader(room.world, room.slot);
  const localActor = roomActor(room.world, room.slot);
  const canResume = canManage && (!online || roomFresh());
  const [initial] = useState(() =>
    online && roomWorld()?.scene === 'moving'
      ? (structuredClone(roomWorld()!.state) as unknown as MovingState)
      : freshMoving(players),
  );
  const game = useRef(initial),
    keys = useRef(new Set<string>()),
    saved = useRef(false);
  const { settings } = useControlSettings();
  const [controlsOpen, setControlsOpen] = useState(false);
  const controlsWasPaused = useRef(false);
  const [view, setView] = useState(initial),
    [choice, setChoice] = useState(0);
  const [pads, setPads] = useState<
    Pick<PadFrame, 'assignments' | 'unsupported'>
  >({
    assignments: [],
    unsupported: [],
  });
  const cueRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cameraAspect = useRef(1);
  const updateCameraAspect = useCallback((aspect: number) => {
    cameraAspect.current = aspect;
  }, []);
  const speechRef = useRef<HTMLOutputElement | null>(null);
  useGameInspection(game, keys);
  useMovingSound(sound, view.score, view.delivered, view.paused);
  const action = () => {
    if (online) {
      roomCommand(
        game.current.phase === 'brief'
          ? { kind: 'begin' }
          : { kind: 'action', value: 'input' },
      );
      return;
    }
    movingAction(game.current);
    setView({ ...game.current });
  };
  const setPause = (paused: boolean) => {
    if (game.current.phase !== 'moving') return;
    if (online) {
      if (paused || canResume)
        roomCommand({ kind: paused ? 'pause' : 'resume' });
      keys.current.clear();
      return;
    }
    game.current.paused = paused;
    keys.current.clear();
    setChoice(0);
    setView({ ...game.current });
  };
  const openControls = () => {
    controlsWasPaused.current = game.current.paused;
    if (game.current.phase === 'moving') setPause(true);
    keys.current.clear();
    setControlsOpen(true);
  };
  const closeControls = (open: boolean) => {
    setControlsOpen(open);
    if (!open && game.current.phase === 'moving' && !controlsWasPaused.current)
      setPause(false);
  };
  const restart = () => {
    if (!canManage) return;
    if (online) {
      roomCommand({ kind: 'restart' });
      return;
    }
    game.current = freshMoving(players);
    movingAction(game.current);
    keys.current.clear();
    saved.current = false;
    setChoice(0);
    setView({ ...game.current });
  };
  useGameLoop({
    game,
    keys,
    inputPlayers: online ? 1 : undefined,
    tickWhileBlocked: online,
    tick: (state, delta, held) => {
      const mapped = mapMovingCameraKeys(held, cameraAspect.current);
      if (online) tickRoomMoving(state, delta, mapped);
      else movingTick(state, delta, mapped);
    },
    action,
    pause: () => setPause(!game.current.paused),
    snapshot: setView,
    onGamepads: setPads,
    padMenu: {
      enabled: view.phase !== 'moving' || view.paused,
      onMove: (direction) => {
        if (view.phase !== 'brief') {
          const count = view.paused ? 3 : 2;
          const delta = direction === 'up' || direction === 'left' ? -1 : 1;
          setChoice((value) => (value + delta + count) % count);
        }
      },
      onConfirm: () => {
        if (view.phase === 'brief') action();
        else if (view.paused) {
          if (choice === 0) setPause(false);
          else if (choice === 1) openControls();
          else onExit();
        } else if (choice === 0) (onNext ?? onExit)();
        else restart();
      },
      onBack: () => {
        if (view.paused) setPause(false);
        else onExit();
      },
    },
  });
  useEffect(() => {
    if (view.phase !== 'result' || saved.current) return;
    saved.current = true;
    onFinish({
      story: 'moving',
      score: view.score,
      seconds: Math.round(view.elapsed),
      players: view.players,
      date: new Date().toISOString(),
      details: `${view.items.length} вещей упаковано · ${view.delivered} сумки у двери · ${Math.round(view.teamwork)} сек. вдвоём`,
    });
  }, [
    view.phase,
    view.score,
    view.elapsed,
    view.players,
    view.items.length,
    view.delivered,
    view.teamwork,
    onFinish,
  ]);
  const packed = view.items.filter((item) => item.status === 'packed').length;
  const hold = (key: string, title: string) => (
    <button
      type="button"
      className="touch-key"
      key={key}
      aria-label={title}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        keys.current.add(key);
      }}
      onPointerUp={() => keys.current.delete(key)}
      onPointerCancel={() => keys.current.delete(key)}
      onLostPointerCapture={() => keys.current.delete(key)}
    >
      {title}
    </button>
  );
  return (
    <section
      data-phase={view.phase}
      className="game-layout moving-game-layout"
      aria-label="Переезд Ярика и Насти"
    >
      <div className="game-world moving-world">
        <MovingScene
          game={game}
          cueRefs={cueRefs}
          onCameraAspect={updateCameraAspect}
          speechRef={speechRef}
        />
        <SpeechBubble
          bubbleRef={speechRef}
          speaker={view.speaker}
          text={view.message}
          visible={
            !!view.dialogueId &&
            view.phase !== 'brief' &&
            !view.paused &&
            view.messageUntil > view.elapsed
          }
        />
        {settings.showWorldPrompts && (
          <MovingActionPrompts
            state={view}
            pads={pads}
            cueRefs={cueRefs}
            localSlot={online ? localActor : undefined}
          />
        )}
        <div className="world-heading">
          <span>
            03 /{' '}
            {view.chapter === 'packing'
              ? 'СОБИРАЕМ КВАРТИРУ'
              : 'ПОСЛЕДНИЙ РЫВОК'}
          </span>
          <strong>Переезд Ярика и Насти</strong>
        </div>
        {view.phase === 'moving' && (
          <div
            className={`moving-day-clock${view.dayRemaining < 60 ? ' is-late' : ''}`}
            aria-label="Время до конца дня"
          >
            <small>
              {view.dayRemaining >= 0 ? 'ДО КОНЦА ДНЯ' : 'ЕЩЁ ЧУТЬ-ЧУТЬ'}
            </small>
            <strong>
              {view.dayRemaining < 0 ? '−' : ''}
              {Math.floor(Math.abs(view.dayRemaining) / 60)
                .toString()
                .padStart(2, '0')}
              :
              {Math.floor(Math.abs(view.dayRemaining) % 60)
                .toString()
                .padStart(2, '0')}
            </strong>
          </div>
        )}
        {view.phase === 'moving' && view.alert.active && !view.paused && (
          <output className="moving-alert">
            <span className="moving-alert-dot" />
            <strong>{movingLaptopCue(view).title}</strong>
            <span>
              {view.actors[0].activity === 'laptop'
                ? view.alert.awaitingRelease
                  ? 'Шаг готов · отпусти кнопки'
                  : `Шаг ${view.alert.operation + 1} из 2`
                : 'Ярику нужен ноутбук'}
            </span>
            <progress
              max={1}
              value={view.alert.progress}
              aria-label="Инцидент"
            />
          </output>
        )}
        {view.phase === 'brief' && (
          <div className="moving-overlay">
            <div className="moving-card">
              <span className="tiny-label">
                ОДНА КВАРТИРА · {view.players === 3 ? 'ТРОЕ' : 'ДВОЕ'} · ЦЕЛЫЙ
                ДЕНЬ
              </span>
              <h2>Как оно вообще здесь помещалось?</h2>
              <p>
                Кухня ещё на месте. Балкон тоже. Между ними — всё остальное.
              </p>
              <p>
                Упакуйте вещи в жёлтые сумки и отнесите их к двери. Поднять —
                нажатие, уложить и застегнуть — удержание.
              </p>
              {view.players === 1 && (
                <p className="quiet">Ты — Ярик. Настя помогает сама.</p>
              )}
              <div className="moving-brief-bindings">
                {(online
                  ? [movingCrew[Math.max(0, localActor)]]
                  : movingCrew.slice(0, view.players)
                ).map((person, i) => (
                  <p key={person.name}>
                    <strong>
                      {i + 1} · {person.name}
                    </strong>{' '}
                    {keyboardPrompt(i, 'move')} ·{' '}
                    <kbd>{keyboardPrompt(i, 'action')}</kbd> действие ·{' '}
                    <kbd>{keyboardPrompt(i, 'secondary')}</kbd> опустить /
                    открыть
                  </p>
                ))}
              </div>
              <p className="quiet">
                Стик — ходьба · A/× — действие · L2/LT — опустить
              </p>
              <button
                className="play-button"
                onClick={action}
                disabled={!canResume}
              >
                Начать первую ходку <ArrowRight size={17} />
              </button>
            </div>
          </div>
        )}
        {view.phase === 'result' && (
          <div className="moving-overlay moving-results">
            <div className="moving-card">
              <span className="tiny-label">ПЕРВАЯ ХОДКА ГОТОВА</span>
              <h2>Это ещё не всё.</h2>
              <p>Но эти вещи уже у двери. Пол снова существует.</p>
              <div className="result-score">
                <Trophy size={24} />
                <strong>{view.score.toLocaleString('ru-RU')}</strong>
                <span>очков за найденный пол</span>
              </div>
              <dl className="result-stats">
                <div>
                  <dt>Упаковано вещей</dt>
                  <dd>{packed}</dd>
                </div>
                <div>
                  <dt>Сумок у двери</dt>
                  <dd>{view.delivered}</dd>
                </div>
                <div>
                  <dt>Несли вдвоём</dt>
                  <dd>{Math.round(view.teamwork)} сек.</dd>
                </div>
                <div>
                  <dt>Первая ходка</dt>
                  <dd>{Math.round(view.elapsed)} сек.</dd>
                </div>
              </dl>
              <button
                className={`play-button${choice === 0 ? ' pad-selected' : ''}`}
                onClick={onNext ?? onExit}
              >
                {onNext ? 'Следующая история' : 'К историям'}{' '}
                <ArrowRight size={17} />
              </button>
              <button
                className={`secondary-button${choice === 1 ? ' pad-selected' : ''}`}
                onClick={restart}
                disabled={!canManage}
              >
                <RotateCcw size={16} /> Ещё одна ходка
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="moving-bar" aria-label="Прогресс первой ходки">
        <button
          className="icon-button"
          onClick={onExit}
          aria-label="К историям"
        >
          <ArrowLeft size={17} />
        </button>
        <span>
          <strong>
            {packed}/{view.items.length}
          </strong>{' '}
          вещей в сумках
        </span>
        <span>
          <strong>{view.delivered}</strong> у двери
        </span>
        <button className="secondary-button" onClick={openControls}>
          <Settings2 size={16} /> Управление
        </button>
        <span className="moving-score">
          <Trophy size={16} /> {view.score.toLocaleString('ru-RU')}
        </span>
        {view.phase === 'moving' && (
          <button
            className="secondary-button"
            onClick={() => setPause(!view.paused)}
          >
            <Pause size={16} /> Пауза
          </button>
        )}
      </div>
      <footer className="game-footer moving-footer">
        <div
          className="footer-message"
          aria-live="polite"
          hidden={!!view.dialogueId}
        >
          <span>{view.speaker || 'МЕЖДУ СУМКАМИ'}</span>
          <p>{view.message}</p>
        </div>
        <details className="moving-help">
          <summary>Подсказки и кнопки на экране</summary>
          <p>{gamepadHint(pads)}</p>
          <p>
            Жёлтая сумка: до 18 кг. Поднять — нажатие, уложить и застегнуть —
            удержание. Закрытую сумку можно снова открыть дополнительной
            кнопкой. Чтобы отдохнуть, подойди к дивану и нажми действие.
          </p>
          <div className="touch-row">
            {hold(PLAYER_BINDINGS[0].up, '↑')}
            {hold(PLAYER_BINDINGS[0].left, '←')}
            {hold(PLAYER_BINDINGS[0].down, '↓')}
            {hold(PLAYER_BINDINGS[0].right, '→')}
            {hold(
              PLAYER_BINDINGS[0].action,
              `${keyboardPrompt(0, 'action')} · действие`,
            )}
            {hold(
              PLAYER_BINDINGS[0].secondary,
              `${keyboardPrompt(0, 'secondary')} · опустить`,
            )}
          </div>
        </details>
      </footer>
      <Dialog
        open={
          !externalMenuOpen &&
          !controlsOpen &&
          view.paused &&
          view.phase === 'moving'
        }
        onOpenChange={setPause}
      >
        <DialogContent className="help-dialog">
          <DialogTitle>Короткий привал</DialogTitle>
          <DialogDescription>Игра на паузе.</DialogDescription>
          <button
            className={`play-button${choice === 0 ? ' pad-selected' : ''}`}
            onClick={() => setPause(false)}
            disabled={!canResume}
          >
            <Play size={17} /> Продолжить
          </button>
          <button
            className={`secondary-button${choice === 1 ? ' pad-selected' : ''}`}
            onClick={openControls}
          >
            <Settings2 size={17} /> Управление
          </button>
          <button
            className={`secondary-button${choice === 2 ? ' pad-selected' : ''}`}
            onClick={onExit}
          >
            К историям
          </button>
        </DialogContent>
      </Dialog>
      <ControlSettings
        open={controlsOpen && !externalMenuOpen}
        onOpenChange={closeControls}
        players={online ? 1 : view.players}
        playerNames={
          online
            ? [movingCrew[Math.max(0, localActor)].name]
            : movingCrew.map((person) => person.name)
        }
        pads={pads}
      />
    </section>
  );
}

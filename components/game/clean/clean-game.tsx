'use client';
import { isRoomLeader, roomActor } from '@/lib/game/network/room-roles';
import { useRoom } from '@/hooks/use-room';
import { roomWorld, roomFresh } from '@/lib/game/network/room-client';
import { roomCommand, tickRoomClean } from '@/lib/game/network/room-game';
import type { CleanState } from '@/lib/game/clean/engine';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { ControlSettings } from '@/components/game/input/control-settings';
import { useControlSettings } from '@/hooks/use-control-settings';
import {
  ArrowLeft,
  Camera,
  Settings2,
  ArrowRight,
  Pause,
  Play,
  SkipForward,
  Trophy,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  cleanRole,
  cleanBindings,
  freshClean,
  cleanTick,
  cleanAction,
} from '@/lib/game/clean/engine';
import { cleanPrompts } from '@/lib/game/clean/prompts';
import type { Result } from '@/lib/game/types';
import { gamepadHint, type PadFrame } from '@/lib/game/input/gamepads';
import { useGameInspection } from '@/hooks/use-game-inspection';
import { useGameLoop } from '@/hooks/use-game-loop';
import { useCleanAudio } from '@/hooks/use-clean-audio';
import { EpisodeDialog } from '../episode-dialog';
import { CleanActionPrompts } from './action-prompts';
import {
  cleanEpisodes,
  createCleanEpisode,
  type CleanEpisodeId,
} from '@/lib/game/clean/episodes';
import CleanScene, { type CleanCameraMode } from './scene';
import CleanStatus from './clean-status';
import {
  cleanChapter,
  cleanChapters,
  cleanInstructions,
  cleanTitles,
} from './clean-hud-data';

function CleanTouchButton({
  code,
  label,
  input,
}: {
  code: string;
  label: string;
  input: RefObject<Set<string>>;
}) {
  useEffect(() => {
    const held = input.current;
    return () => {
      held.delete(code);
    };
  }, [input, code]);
  return (
    <button
      className="touch-key"
      aria-label={label}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        input.current.add(code);
      }}
      onPointerUp={() => input.current.delete(code)}
      onPointerCancel={() => input.current.delete(code)}
      onLostPointerCapture={() => input.current.delete(code)}
    >
      {label}
    </button>
  );
}

export default function CleanGame({
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
  onFinish: (r: Result) => void;
  onNext?: () => void;
}) {
  const room = useRoom();
  const canManage = !online || isRoomLeader(room.world, room.slot);
  const localActor = roomActor(room.world, room.slot);
  const canResume = canManage && (!online || roomFresh());
  const [initial] = useState(() =>
    online && roomWorld()?.scene === 'clean'
      ? (structuredClone(roomWorld()!.state) as unknown as CleanState)
      : freshClean(players),
  );
  const game = useRef(initial),
    keys = useRef(new Set<string>()),
    saved = useRef(false);
  const { settings } = useControlSettings();
  const [touchActor, setTouchActor] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [view, setView] = useState(initial),
    [cameraMode, setCameraMode] = useState<CleanCameraMode>('wide');
  const [pads, setPads] = useState<
    Pick<PadFrame, 'assignments' | 'unsupported'>
  >({
    assignments: [],
    unsupported: [],
  });
  const [pauseChoice, setPauseChoice] = useState(0);
  const [episodeOpen, setEpisodeOpen] = useState(false);
  const [episodeChoice, setEpisodeChoice] = useState(0);
  const cueRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cueKeys = useRef<ReadonlySet<string>>(new Set());
  const [heldKeys, setHeldKeys] = useState<ReadonlySet<string>>(new Set());
  const active = view.phase !== 'brief' && view.phase !== 'result';
  useGameInspection(game, keys);
  useCleanAudio(sound, view);
  const action = () => {
    if (online) {
      roomCommand(
        game.current.phase === 'brief'
          ? { kind: 'begin' }
          : { kind: 'action', value: 'input' },
      );
      return;
    }
    cleanAction(game.current);
    setView({ ...game.current });
  };
  const setPause = (paused: boolean) => {
    if (game.current.phase === 'result') return;
    if (online) {
      if (paused || canResume)
        roomCommand({ kind: paused ? 'pause' : 'resume' });
      keys.current.clear();
      return;
    }
    game.current.paused = paused;
    keys.current.clear();
    setView({ ...game.current });
  };
  const pause = () => setPause(!game.current.paused);
  const openControls = () => {
    setPause(true);
    setControlsOpen(true);
  };
  const toggleCamera = () =>
    setCameraMode((mode) => (mode === 'wide' ? 'faces' : 'wide'));
  const openEpisodes = () => {
    if (!canManage) return;
    setPause(true);
    keys.current.clear();
    setEpisodeOpen(true);
    setView({ ...game.current });
  };
  const jumpToEpisode = (id: string) => {
    if (!canManage) return;
    if (online) {
      roomCommand({ kind: 'episode', value: id });
      setEpisodeOpen(false);
      return;
    }
    game.current = createCleanEpisode(players, id as CleanEpisodeId);
    keys.current.clear();
    saved.current = false;
    setEpisodeOpen(false);
    setView({ ...game.current });
  };
  useGameLoop({
    game,
    keys,
    inputPlayers: online ? 1 : undefined,
    tickWhileBlocked: online,
    tick: (state, dt, merged) => {
      cueKeys.current = merged;
      if (online) tickRoomClean(state, dt, merged);
      else cleanTick(state, dt, merged);
    },
    action,
    pause,
    snapshot: (state) => {
      setView(state);
      setHeldKeys(cueKeys.current);
    },
    onGamepads: setPads,
    padMenu: {
      enabled: view.paused || !active,
      onMove: (direction) => {
        const delta = direction === 'up' || direction === 'left' ? -1 : 1;
        if (episodeOpen)
          setEpisodeChoice(
            (v) => (v + delta + cleanEpisodes.length) % cleanEpisodes.length,
          );
        else setPauseChoice((v) => (v + delta + 5) % 5);
      },
      onConfirm: () => {
        if (episodeOpen) jumpToEpisode(cleanEpisodes[episodeChoice].id);
        else if (view.phase === 'brief') action();
        else if (view.paused) {
          if (pauseChoice === 0) setPause(false);
          else if (pauseChoice === 1) openEpisodes();
          else if (pauseChoice === 2) {
            toggleCamera();
            setPause(false);
          } else if (pauseChoice === 3) openControls();
          else onExit();
        } else (onNext ?? onExit)();
      },
      onBack: () => {
        if (episodeOpen) setEpisodeOpen(false);
        else if (view.paused) setPause(false);
        else onExit();
      },
    },
  });
  useEffect(() => {
    if (view.phase === 'result' && !saved.current && !view.practice) {
      saved.current = true;
      onFinish({
        story: 'clean',
        score: view.score,
        players: view.players,
        seconds: Math.round(view.elapsed),
        date: new Date().toISOString(),
        details: `${view.spots.length} следов отмыто · стиралка чистая · ${Math.round(view.teamwork)} сек. сообща`,
      });
    }
  }, [
    view.phase,
    view.players,
    view.practice,
    view.score,
    view.elapsed,
    view.spots.length,
    view.teamwork,
    players,
    onFinish,
  ]);
  const inputActor = online ? 0 : touchActor;
  const touchPrompts = cleanPrompts(
    view,
    online ? Math.max(0, localActor) : touchActor,
  );
  const touchAction = touchPrompts.find(
    (prompt) => prompt.control === 'action',
  );
  const touchSecondary = touchPrompts.find(
    (prompt) => prompt.control === 'throw',
  );
  return (
    <section
      data-phase={view.phase}
      className={`game-layout clean-game-layout${active ? ' clean-active' : ''}`}
      aria-label="Операция Чистый проход"
    >
      <div className="game-world">
        <CleanScene
          players={view.players}
          game={game}
          cameraMode={cameraMode}
          cueRefs={cueRefs}
        />
        {settings.showWorldPrompts && (
          <CleanActionPrompts
            state={view}
            pads={pads}
            cueRefs={cueRefs}
            heldKeys={heldKeys}
            localSlot={online ? localActor : undefined}
          />
        )}
        <button
          className="clean-camera-toggle"
          type="button"
          onClick={toggleCamera}
          aria-pressed={cameraMode === 'faces'}
          aria-label={
            cameraMode === 'faces' ? 'Показать всю казарму' : 'Приблизить лицо'
          }
        >
          <Camera size={16} /> {cameraMode === 'faces' ? 'Вся казарма' : 'Лицо'}
        </button>
        <div className="world-heading">
          <span>02 / ДРУГАЯ РОТА</span>
          <strong>Операция «Чистый проход»</strong>
          {view.practice && (
            <span className="practice-badge">
              Тренировка · без зачёта очков
            </span>
          )}
        </div>
      </div>
      <aside className="game-sidebar" aria-label="Задача и состояние">
        <div className="sidebar-toolbar">
          <button
            className="icon-button"
            onClick={onExit}
            aria-label="К выбору историй"
          >
            <ArrowLeft size={17} />
          </button>
          <span className="sidebar-score">
            <Trophy size={16} />
            <strong>{view.score.toLocaleString('ru-RU')}</strong>
          </span>
          <button
            className="icon-button"
            onClick={openEpisodes}
            disabled={!canManage}
            aria-label="Выбрать эпизод"
          >
            <SkipForward size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Настройки управления"
            onClick={openControls}
          >
            <Settings2 size={17} />
          </button>
          {view.phase !== 'result' && (
            <button className="icon-button" onClick={pause} aria-label="Пауза">
              <Pause size={17} />
            </button>
          )}
        </div>
        <div className="sidebar-heading">
          <span className="tiny-label">
            {view.phase === 'brief'
              ? 'БАЙКА ИЗ ДРУГОЙ РОТЫ'
              : view.phase === 'result'
                ? 'ДЕЛО ЗАКРЫТО'
                : `${cleanChapter[view.phase] + 1} / 3 · ${cleanChapters[cleanChapter[view.phase]]}`}
          </span>
          <h2>{cleanTitles[view.phase]}</h2>
        </div>
        {view.phase === 'brief' ? (
          <div className="sidebar-story">
            <p>
              Солдат решил сначала спросить разрешения. Организм решил иначе.
            </p>
            <p className="quiet">
              {online
                ? `Ты — ${cleanRole(view, Math.max(0, localActor)).name}.`
                : Array.from(
                    { length: view.players },
                    (_, actor) =>
                      `${actor + 1} · ${cleanRole(view, actor).name}`,
                  ).join(' / ')}
            </p>
            <button
              className="play-button"
              onClick={action}
              disabled={!canResume}
            >
              Заступить на смену <ArrowRight size={16} />
            </button>
          </div>
        ) : view.phase === 'result' ? (
          <div className="sidebar-story">
            <div className="result-score">
              <Trophy size={23} />
              <strong>{view.score.toLocaleString('ru-RU')}</strong>
              <span>очков за неразглашение</span>
            </div>
            <p>Коридор блестит. История, к сожалению, осталась.</p>
            <dl className="result-stats">
              <div>
                <dt>Отмыто следов</dt>
                <dd>{view.spots.length}</dd>
              </div>
              <div>
                <dt>Стиралка</dt>
                <dd>Снова белая</dd>
              </div>
              <div>
                <dt>Работали сообща</dt>
                <dd>{Math.round(view.teamwork)} сек.</dd>
              </div>
              <div>
                <dt>Вся смена</dt>
                <dd>{Math.round(view.elapsed)} сек.</dd>
              </div>
            </dl>
            <button className="play-button" onClick={onNext ?? onExit}>
              {onNext ? 'В машину · дальше по городу' : 'К историям'}{' '}
              <ArrowRight size={16} />
            </button>
            {onNext && (
              <button className="secondary-button" onClick={onExit}>
                К итогам вечера
              </button>
            )}
          </div>
        ) : (
          <>
            <CleanStatus
              localActor={online ? localActor : undefined}
              game={view}
              pads={pads}
            />
          </>
        )}
        <details className="clean-help">
          <summary>Помощь и управление</summary>
          <p>{cleanInstructions[view.phase]}</p>
          <p>{gamepadHint(pads)}</p>
          <p>
            Левый стик — ходьба. A/× — действие, RB/R1 — сдержаться, B/○ —
            пауза.
          </p>
          <p>
            {Array.from(
              { length: view.players },
              (_, actor) => `${actor + 1} · ${cleanRole(view, actor).name}`,
            ).join(' / ')}
          </p>
          {active && (
            <details className="touch-controls">
              <summary>Кнопки на экране</summary>
              {!online && players > 1 && (
                <div className="touch-row" aria-label="Кем управлять на экране">
                  {Array.from({ length: players }, (_, actor) => (
                    <button
                      key={actor}
                      className="touch-key"
                      aria-pressed={touchActor === actor}
                      onClick={() => {
                        keys.current.clear();
                        setTouchActor(actor);
                      }}
                    >
                      {cleanRole(view, actor).name}
                    </button>
                  ))}
                </div>
              )}
              <div className="touch-row">
                <CleanTouchButton
                  input={keys}
                  code={cleanBindings[inputActor][2]}
                  label="↑"
                />
                <CleanTouchButton
                  input={keys}
                  code={cleanBindings[inputActor][0]}
                  label="←"
                />
                <CleanTouchButton
                  input={keys}
                  code={cleanBindings[inputActor][3]}
                  label="↓"
                />
                <CleanTouchButton
                  input={keys}
                  code={cleanBindings[inputActor][1]}
                  label="→"
                />
                {touchSecondary &&
                  (touchSecondary.mode === 'release' ? (
                    <span className="tiny-label">
                      Отпусти Q · {touchSecondary.text}
                    </span>
                  ) : (
                    <CleanTouchButton
                      input={keys}
                      code="KeyQ"
                      label={`Q · ${touchSecondary.text}`}
                    />
                  ))}
                {touchAction && (
                  <CleanTouchButton
                    input={keys}
                    code={cleanBindings[inputActor][4]}
                    label={touchAction.text}
                  />
                )}
              </div>
            </details>
          )}
        </details>
      </aside>
      <footer className="game-footer">
        <div className="footer-message" aria-live="polite">
          <span>В КАЗАРМЕ</span>
          <p>{view.message}</p>
        </div>
      </footer>
      <EpisodeDialog
        open={episodeOpen && !externalMenuOpen}
        options={cleanEpisodes}
        selected={episodeChoice}
        onSelect={setEpisodeChoice}
        onChoose={jumpToEpisode}
        onClose={() => setEpisodeOpen(false)}
      />
      <Dialog
        open={
          !externalMenuOpen &&
          !episodeOpen &&
          !controlsOpen &&
          view.paused &&
          view.phase !== 'result' &&
          view.phase !== 'brief'
        }
        onOpenChange={setPause}
      >
        <DialogContent className="help-dialog">
          <DialogTitle>Тихий час</DialogTitle>
          <DialogDescription>
            Игра на паузе. Даже стиралка отдыхает.
          </DialogDescription>
          <button
            className={`play-button${pauseChoice === 0 ? ' pad-selected' : ''}`}
            onClick={() => setPause(false)}
            disabled={!canResume}
          >
            <Play size={17} />
            Продолжить смену
          </button>
          <button
            className={`secondary-button${pauseChoice === 1 ? ' pad-selected' : ''}`}
            onClick={openEpisodes}
            disabled={!canManage}
          >
            <SkipForward size={17} /> Выбрать эпизод
          </button>
          <button
            className={`secondary-button${pauseChoice === 2 ? ' pad-selected' : ''}`}
            onClick={() => {
              toggleCamera();
              setPause(false);
            }}
          >
            <Camera size={17} />{' '}
            {cameraMode === 'faces' ? 'Вернуть общий вид' : 'Рассмотреть лицо'}
          </button>
          <button
            className={`secondary-button${pauseChoice === 3 ? ' pad-selected' : ''}`}
            onClick={openControls}
          >
            <Settings2 size={17} /> Настройки управления
          </button>
          <button
            className={`secondary-button${pauseChoice === 4 ? ' pad-selected' : ''}`}
            onClick={onExit}
          >
            К выбору историй
          </button>
        </DialogContent>
      </Dialog>
      <ControlSettings
        open={controlsOpen && !externalMenuOpen}
        onOpenChange={setControlsOpen}
        players={online ? 1 : players}
        playerNames={
          online
            ? [cleanRole(view, Math.max(0, localActor)).name]
            : [0, 1, 2].map((actor) => cleanRole(view, actor).name)
        }
        pads={pads}
      />
    </section>
  );
}

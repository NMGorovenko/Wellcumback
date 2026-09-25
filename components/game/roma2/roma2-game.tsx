'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Pause, Play, RotateCcw, Settings2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  freshRoma2,
  roma2Action,
  roma2Tick,
  toiletCue,
  toiletHidden,
  visitorCue,
  visitorPresent,
  walkingToiletStage,
  atToiletRags,
  TOILET_RAGS,
  TOILET_EXIT,
  stallX,
  type Roma2State,
} from '@/lib/game/roma2/engine';
import type { Result } from '@/lib/game/types';
import {
  gamepadPrompt,
  keyboardPrompt,
  type PadFrame,
} from '@/lib/game/input/gamepads';
import { useGameLoop } from '@/hooks/use-game-loop';
import { useGameInspection } from '@/hooks/use-game-inspection';
import { useRoom } from '@/hooks/use-room';
import { roomFresh, roomWorld } from '@/lib/game/network/room-client';
import { roomCommand, tickRoomRoma2 } from '@/lib/game/network/room-game';
import { isRoomLeader, roomActor } from '@/lib/game/network/room-roles';
import { ControlSettings } from '../input/control-settings';
import { SpeechBubble } from '../world/speech-bubble';
import Roma2Scene, { roma2Speaker } from './scene';

export default function Roma2Game({
  players,
  online = false,
  externalMenuOpen = false,
  onExit,
  onFinish,
}: {
  players: number;
  online?: boolean;
  externalMenuOpen?: boolean;
  onExit: () => void;
  onFinish: (result: Result) => void;
}) {
  const room = useRoom(),
    canManage = !online || isRoomLeader(room.world, room.slot);
  const canResume = canManage && (!online || roomFresh());
  const [initial] = useState(() =>
    online && roomWorld()?.scene === 'roma2'
      ? (structuredClone(roomWorld()!.state) as unknown as Roma2State)
      : freshRoma2(players),
  );
  const game = useRef(initial),
    keys = useRef(new Set<string>()),
    saved = useRef(false);
  const cues = useRef<(HTMLDivElement | null)[]>([]),
    speech = useRef<HTMLOutputElement | null>(null);
  const [view, setView] = useState(initial),
    [choice, setChoice] = useState(0),
    [controls, setControls] = useState(false);
  const [pads, setPads] = useState<
    Pick<PadFrame, 'assignments' | 'unsupported'>
  >({ assignments: [], unsupported: [] });
  useGameInspection(game, keys);
  const pause = (paused: boolean) => {
    if (game.current.phase !== 'playing') return;
    if (online) {
      if (paused || canResume)
        roomCommand({ kind: paused ? 'pause' : 'resume' });
    } else {
      game.current.paused = paused;
      setView({ ...game.current });
    }
    keys.current.clear();
    setChoice(0);
  };
  const begin = () => {
    if (!canResume) return;
    if (online) roomCommand({ kind: 'begin' });
    else {
      roma2Action(game.current);
      setView({ ...game.current });
    }
  };
  const restart = () => {
    if (!canManage) return;
    if (online) roomCommand({ kind: 'restart' });
    else {
      game.current = freshRoma2(players);
      saved.current = false;
      setView({ ...game.current });
    }
    keys.current.clear();
    setChoice(0);
  };
  const openControls = () => {
    pause(true);
    setControls(true);
  };
  useGameLoop({
    game,
    keys,
    inputPlayers: online ? 1 : undefined,
    tickWhileBlocked: online,
    tick: (s, dt, held) =>
      online ? tickRoomRoma2(s, dt, held) : roma2Tick(s, dt, held),
    action: () => {
      if (game.current.phase === 'brief') begin();
      else if (online) roomCommand({ kind: 'action', value: 'input' });
    },
    pause: () => pause(!game.current.paused),
    snapshot: setView,
    onGamepads: setPads,
    padMenu: {
      enabled: view.paused || view.phase !== 'playing',
      onMove: (d) =>
        setChoice(
          (c) =>
            (c +
              (d === 'up' || d === 'left' ? -1 : 1) +
              (view.phase === 'playing' && view.paused ? 3 : 2)) %
            (view.phase === 'playing' && view.paused ? 3 : 2),
        ),
      onConfirm: () => {
        if (view.phase === 'brief') {
          if (choice === 0) begin();
          else onExit();
        } else if (view.phase === 'result') {
          if (choice === 0) onExit();
          else restart();
        } else if (choice === 0) pause(false);
        else if (choice === 1) openControls();
        else onExit();
      },
      onBack: () =>
        view.phase === 'playing' && view.paused ? pause(false) : onExit(),
    },
  });
  useEffect(() => {
    if (view.phase !== 'result' || saved.current) return;
    saved.current = true;
    onFinish({
      story: 'roma2',
      score: view.score,
      seconds: Math.round(view.elapsed),
      players: view.players,
      date: new Date().toISOString(),
      details: `${view.actors.reduce((n, a) => n + a.calls, 0)} криков о помощи · ${view.actors.reduce((n, a) => n + a.caught, 0)} раз замечены · все выбрались`,
    });
  }, [view, onFinish]);
  const speaker = roma2Speaker(view),
    actor = view.actors[speaker];
  return (
    <section
      className="game-layout roma2-game-layout"
      data-phase={view.phase}
      aria-label="Байки Ромы 2"
    >
      <div className="game-world roma2-world">
        <Roma2Scene game={game} cues={cues} speechRef={speech} />
        <div className="world-heading">
          <span>04 / БАЙКИ РОМЫ 2</span>
          <strong>Пять минут тишины</strong>
        </div>
        <button
          className="icon-button roma2-pause"
          aria-label="Пауза"
          onClick={() => pause(true)}
        >
          <Pause size={18} />
        </button>
        {view.phase === 'playing' &&
          !view.paused &&
          view.actors.some((a) => walkingToiletStage(a)) && (
            <output
              className="roma2-visitor-status"
              data-warning={
                view.visitor.stage === 'warning' || view.visitor.alert > 0
              }
              aria-live="polite"
            >
              <span
                className="roma2-visitor-dot"
                data-present={visitorPresent(view.visitor)}
              />
              <strong>{visitorCue(view.visitor)}</strong>
              <small>Жёлтый сектор — взгляд · кабинка и ширма укрывают</small>
            </output>
          )}
        <SpeechBubble
          bubbleRef={speech}
          speaker={`Рядовой${view.players > 1 ? ` ${speaker + 1}` : ''}`}
          text={actor.line}
          visible={
            view.phase === 'playing' &&
            !view.paused &&
            actor.lineUntil > view.elapsed
          }
        />
        {view.phase === 'playing' && !view.paused && (
          <div className="world-action-cues">
            {view.actors.map((a, i) => {
              const owned = !online || roomActor(room.world, room.slot) === i;
              const slot = online ? 0 : i;
              const label = (kind: 'action' | 'secondary' | 'move') =>
                gamepadPrompt(pads, slot, kind) || keyboardPrompt(slot, kind);
              const timing =
                a.stage === 'wipe' || (a.stage === 'escape' && a.itch > 28);
              const walking = walkingToiletStage(a),
                hidden = toiletHidden(view, a);
              const target =
                a.stage === 'rag'
                  ? TOILET_RAGS
                  : a.stage === 'return'
                    ? { x: stallX(i), z: -1.3 }
                    : TOILET_EXIT;
              const dx = target.x - a.x,
                dz = target.z - a.z;
              const direction =
                Math.abs(dx) > Math.abs(dz)
                  ? dx > 0
                    ? '→'
                    : '←'
                  : dz > 0
                    ? '↓'
                    : '↑';
              const control =
                walking && !(a.stage === 'rag' && atToiletRags(a))
                  ? 'move'
                  : 'action';
              return (
                <div
                  className="roma2-cue"
                  data-timing={timing || walking}
                  data-danger={a.exposure > 0.05}
                  data-hidden={hidden}
                  key={i}
                  ref={(node) => {
                    cues.current[i] = node;
                  }}
                >
                  {view.players > 1 && <small>Рядовой {i + 1}</small>}
                  {owned && timing ? (
                    <div className="roma2-clock">
                      <meter
                        className="sr-only"
                        min={0}
                        max={100}
                        value={Math.round(a.cycle * 100)}
                        aria-label={`${a.stage === 'wipe' ? 'Момент действия' : 'Момент почесаться'}: цель от 64 до 88%`}
                      />
                      <i
                        aria-hidden="true"
                        style={{ transform: `rotate(${a.cycle * 360}deg)` }}
                      />
                      <kbd>{label('action')}</kbd>
                    </div>
                  ) : (
                    owned && a.stage !== 'done' && <kbd>{label(control)}</kbd>
                  )}
                  <span>{toiletCue(a)}</span>
                  {(a.stage === 'relief' ||
                    (a.stage === 'rag' && atToiletRags(a))) && (
                    <progress
                      value={a.progress}
                      max={1}
                      aria-label="Прогресс действия"
                    />
                  )}
                  {a.stage === 'wipe' && <small>{a.strokes} / 4</small>}
                  {owned && walking && (
                    <small className="roma2-destination">
                      {direction} {Math.hypot(dx, dz).toFixed(1)} м ·{' '}
                      {a.stage === 'return'
                        ? `кабинка ${i + 1}`
                        : a.stage === 'rag'
                          ? 'тряпки'
                          : 'выход'}
                    </small>
                  )}
                  {walking && (hidden || a.exposure > 0.05) && (
                    <small className="roma2-cover-status">
                      {hidden ? 'В укрытии' : 'Тебя видят! Скройся!'}
                    </small>
                  )}
                  {walking && a.exposure > 0.01 && (
                    <progress
                      className="roma2-exposure"
                      value={a.exposure}
                      max={1}
                      aria-label="Подозрение посетителя"
                    />
                  )}
                  {owned && a.stage === 'escape' && timing && (
                    <small>{label('move')} · к выходу</small>
                  )}
                  {owned && a.stage === 'paper' && (
                    <small>
                      <kbd>{label('secondary')}</kbd> Позвать
                    </small>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {view.phase !== 'playing' && (
          <div className="moving-overlay">
            <div className="moving-card roma2-card">
              <span className="tiny-label">БАЙКИ РОМЫ 2</span>
              <h2>
                {view.phase === 'brief'
                  ? 'Пять минут тишины.'
                  : 'Рулон — в карман.'}
              </h2>
              <p>
                {view.phase === 'brief'
                  ? 'Наряд закончился. Можно наконец-то спокойно посидеть.'
                  : '«В следующий наряд — со своим рулоном». Из этой кабинки ты вышел другим человеком.'}
              </p>
              {view.phase === 'brief' && (
                <p className="quiet">
                  {online
                    ? 'Каждый занимает свою кабинку.'
                    : `Игроков: ${view.players}.`}
                </p>
              )}
              {view.phase === 'result' && (
                <div className="result-score">
                  <strong>{view.score}</strong>
                  <span>очков · {Math.round(view.elapsed)} сек.</span>
                </div>
              )}
              <button
                className={`play-button${choice === 0 ? ' pad-selected' : ''}`}
                disabled={view.phase === 'brief' && !canResume}
                onClick={view.phase === 'brief' ? begin : onExit}
              >
                {view.phase === 'brief' ? 'Занять кабинку' : 'В город'}{' '}
                <ArrowRight size={17} />
              </button>
              <button
                className={`secondary-button${choice === 1 ? ' pad-selected' : ''}`}
                onClick={view.phase === 'brief' ? onExit : restart}
                disabled={view.phase === 'result' && !canManage}
              >
                {view.phase === 'brief' ? (
                  'В город'
                ) : (
                  <>
                    <RotateCcw size={16} /> Ещё одна байка
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
      <Dialog
        open={
          view.paused &&
          view.phase === 'playing' &&
          !controls &&
          !externalMenuOpen
        }
        onOpenChange={pause}
      >
        <DialogContent className="help-dialog">
          <DialogTitle>Никто не торопит.</DialogTitle>
          <DialogDescription>Игра на паузе.</DialogDescription>
          <button
            className={`play-button${choice === 0 ? ' pad-selected' : ''}`}
            disabled={!canResume}
            onClick={() => pause(false)}
          >
            <Play size={17} /> Продолжить
          </button>
          <button
            className={`secondary-button${choice === 1 ? ' pad-selected' : ''}`}
            onClick={openControls}
          >
            <Settings2 size={17} /> Настройки
          </button>
          <button
            className={`secondary-button${choice === 2 ? ' pad-selected' : ''}`}
            onClick={onExit}
          >
            В город
          </button>
        </DialogContent>
      </Dialog>
      <ControlSettings
        open={controls && !externalMenuOpen}
        onOpenChange={setControls}
        players={online ? 1 : players}
        pads={pads}
        playerNames={['Рядовой 1', 'Рядовой 2', 'Рядовой 3']}
      />
    </section>
  );
}

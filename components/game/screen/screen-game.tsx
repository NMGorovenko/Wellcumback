'use client';
import { useEffect, useRef, useState } from 'react';
import { ControlSettings } from '@/components/game/input/control-settings';
import { useControlSettings } from '@/hooks/use-control-settings';
import {
  ArrowLeft,
  Camera,
  Settings2,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  gamepadHint,
  keyboardPrompt,
  type PadFrame,
} from '@/lib/game/input/gamepads';
import { useGameInspection } from '@/hooks/use-game-inspection';
import { useGameLoop } from '@/hooks/use-game-loop';
import { useScreenMotors } from '@/hooks/use-screen-motors';
import type { Result } from '@/lib/game/types';
import {
  act,
  freshGame,
  moveToSide,
  setChairs,
  setPaused,
  tick,
  titles,
  type GameState,
} from '@/lib/game/screen/engine';
import { EpisodeDialog } from '../episode-dialog';
import {
  createScreenEpisode,
  screenEpisodes,
  type ScreenEpisode,
} from '@/lib/game/screen/episodes';
import { ContextPrompts } from './context-prompts';
import Scene, { type CameraMode } from './scene';
import { NAMES, clock, actNumber, progress } from './screen-hud-data';
import { ScreenPhasePanel } from './screen-phase-panel';
import { ScreenCompactStatus } from './screen-compact-status';
type GameProps = {
  players: number;
  sound: boolean;
  onExit: () => void;
  onFinish: (result: Result) => void;
  onNext?: () => void;
};

function initialGame(players: number) {
  const state = freshGame(players);
  setPaused(state, true);
  return state;
}

export default function ScreenGame({
  players,
  sound,
  onExit,
  onFinish,
  onNext,
}: GameProps) {
  const { settings } = useControlSettings();
  const [controlsOpen, setControlsOpen] = useState(false);
  const [view, setView] = useState(() => initialGame(players));
  const game = useRef<GameState>(view);
  const keys = useRef(new Set<string>());
  const cueRefs = useRef<(HTMLDivElement | null)[]>([]);
  useGameInspection(game, keys);
  const [briefOpen, setBriefOpen] = useState(true);
  const [cameraMode, setCameraMode] = useState<CameraMode>('auto');
  const [selectedPlayer, setSelectedPlayer] = useState(0);
  const [soundOverride, setSoundOverride] = useState<boolean | null>(null);
  const soundOn = soundOverride ?? sound;
  const soundRef = useRef(soundOn);
  const audio = useRef<AudioContext | null>(null);
  useScreenMotors(audio, view, soundOn);
  const lastSoundEvent = useRef(0);
  const saved = useRef(false);
  const [pads, setPads] = useState<
    Pick<PadFrame, 'assignments' | 'unsupported'>
  >({ assignments: [], unsupported: [] });
  const [pauseChoice, setPauseChoice] = useState(0);
  const [episodeOpen, setEpisodeOpen] = useState(false);
  const [episodeChoice, setEpisodeChoice] = useState(0);
  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);
  const snapshot = () => setView({ ...game.current });
  function unlockAudio() {
    if (!soundRef.current) return;
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    } catch {
      /* Audio availability never blocks play. */
    }
  }
  function action() {
    unlockAudio();
    act(game.current);
  }
  function setPause(paused: boolean) {
    setPaused(game.current, paused);
    keys.current.clear();
    snapshot();
  }
  function pause() {
    if (!briefOpen && game.current.phase !== 'result')
      setPause(!game.current.paused);
  }
  useGameLoop({
    game,
    keys,
    tick,
    action,
    pause,
    snapshot: setView,
    onGamepads: setPads,
    padMenu: {
      enabled: briefOpen || view.paused || view.phase === 'result',
      onMove: (direction) => {
        if (episodeOpen) {
          setEpisodeChoice(
            (n) =>
              (n +
                (direction === 'up' || direction === 'left' ? -1 : 1) +
                screenEpisodes.length) %
              screenEpisodes.length,
          );
        } else if (view.paused && !briefOpen)
          setPauseChoice(
            (n) =>
              (n + (direction === 'up' || direction === 'left' ? -1 : 1) + 5) %
              5,
          );
      },
      onConfirm: () => {
        if (episodeOpen) jumpToEpisode(screenEpisodes[episodeChoice].id);
        else if (briefOpen) begin();
        else if (view.phase === 'result') (onNext ?? onExit)();
        else
          [() => setPause(false), openControls, openEpisodes, restart, onExit][
            pauseChoice
          ]();
      },
      onBack: () => {
        if (episodeOpen) setEpisodeOpen(false);
        else if (briefOpen || view.phase === 'result') onExit();
        else setPause(false);
      },
    },
  });
  useEffect(() => {
    // The shared hook also sets paused on blur. Clear queued engine input here so
    // returning to the tab cannot release a pre-blur screwdriver charge.
    const blur = () => {
      setPaused(game.current, true);
      keys.current.clear();
      setView({ ...game.current });
    };
    window.addEventListener('blur', blur);
    return () => window.removeEventListener('blur', blur);
  }, []);
  useEffect(
    () => () => {
      void audio.current?.close().catch(() => {});
    },
    [],
  );
  useEffect(() => {
    const events = view.events.filter(
      (event) => event.id > lastSoundEvent.current,
    );
    if (!events.length) return;
    lastSoundEvent.current = events[events.length - 1].id;
    const context = audio.current;
    if (!soundRef.current || !context || context.state !== 'running') return;
    for (const event of events) {
      if (event.kind === 'throw') continue;
      const good = !['pop', 'miss', 'fall', 'jam'].includes(event.kind);
      const oscillator = context.createOscillator(),
        gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.type = good ? 'sine' : 'triangle';
      const now = context.currentTime;
      oscillator.frequency.setValueAtTime(good ? 640 : 160, now);
      oscillator.frequency.exponentialRampToValueAtTime(
        good ? 910 : 70,
        now + 0.12,
      );
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      oscillator.start(now);
      oscillator.stop(now + 0.18);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }
  }, [view.events, view.elapsed]);
  useEffect(() => {
    if (view.phase !== 'result' || saved.current || view.practice) return;
    saved.current = true;
    onFinish({
      story: 'screen',
      score: view.score,
      seconds: Math.round(view.elapsed),
      players,
      date: new Date().toISOString(),
      details: `Поймано отвёрток: ${view.tool.catches}. Промахов: ${view.tool.misses}. Падений: ${view.falls}. Ошибок: ${view.penalties}.`,
    });
  }, [
    view.phase,
    view.practice,
    view.score,
    view.elapsed,
    view.tool.catches,
    view.tool.misses,
    view.falls,
    view.penalties,
    players,
    onFinish,
  ]);
  function openControls() {
    setPause(true);
    setControlsOpen(true);
  }
  function begin() {
    unlockAudio();
    setBriefOpen(false);
    setPause(false);
  }
  function restart() {
    game.current = initialGame(players);
    keys.current.clear();
    saved.current = false;
    lastSoundEvent.current = 0;
    setSelectedPlayer(0);
    setEpisodeOpen(false);
    setBriefOpen(true);
    snapshot();
  }
  function openEpisodes() {
    setPause(true);
    setBriefOpen(false);
    setEpisodeOpen(true);
  }
  function jumpToEpisode(id: string) {
    game.current = createScreenEpisode(players, id as ScreenEpisode);
    keys.current.clear();
    saved.current = false;
    lastSoundEvent.current = 0;
    setSelectedPlayer(0);
    setBriefOpen(false);
    setEpisodeOpen(false);
    unlockAudio();
    snapshot();
  }
  function move(player: number, side: number) {
    moveToSide(game.current, player, side);
    snapshot();
  }
  function chooseChairs(count: 1 | 2) {
    setChairs(game.current, count);
    snapshot();
  }
  function clickAction(player = 0) {
    unlockAudio();
    act(game.current, player);
  }
  function findLadder() {
    game.current.message =
      'Стремянки нет. Нашли зарядку от Nokia, пакет с пакетами и уверенность в себе.';
    snapshot();
  }
  function soundToggle() {
    const next = !soundOn;
    soundRef.current = next;
    setSoundOverride(next);
    if (next) unlockAudio();
  }

  const phaseProgress = progress(view),
    currentAct = actNumber(view.phase);

  const detailedPanel = (
    <ScreenPhasePanel
      view={view}
      selectedPlayer={selectedPlayer}
      setSelectedPlayer={setSelectedPlayer}
      move={move}
      clickAction={clickAction}
      chooseChairs={chooseChairs}
      findLadder={findLadder}
      onExit={onExit}
      onNext={onNext}
      restart={restart}
      keys={keys}
      unlockAudio={unlockAudio}
    />
  );

  return (
    <section
      className="game-layout screen-game-layout"
      aria-label="Экран на полстены — игра"
    >
      <div className="game-world">
        <Scene stateRef={game} cameraMode={cameraMode} cueRefs={cueRefs} />
        {settings.showWorldPrompts && (
          <ContextPrompts state={view} pads={pads} cueRefs={cueRefs} />
        )}
        <div key={view.phase} className="scene-cut" aria-hidden="true">
          <span>{titles[view.phase]}</span>
        </div>
        <div className="world-heading">
          <span>ИСТОРИЯ 01 · АКТ {currentAct + 1} / 3</span>
          <strong>{titles[view.phase]}</strong>
          {view.practice && (
            <span className="practice-badge">
              Тренировка · без зачёта очков
            </span>
          )}
        </div>
      </div>
      <aside className="game-sidebar" aria-label="Задача и управление">
        <div className="hud-top">
          <div className="hud-score">
            <Trophy size={15} />
            <strong>{view.score.toLocaleString('ru')}</strong>
            <time>{clock(view.elapsed)}</time>
          </div>
          <div className="hud-top-actions">
            <button
              type="button"
              className="hud-icon"
              aria-label="Выбрать эпизод"
              title="Перемотка к эпизоду"
              onClick={openEpisodes}
            >
              <SkipForward size={16} />
            </button>
            <button
              type="button"
              className="hud-icon"
              aria-label="Настройки управления"
              onClick={openControls}
            >
              <Settings2 size={16} />
            </button>
            {view.phase !== 'result' && (
              <button
                type="button"
                className="hud-icon"
                aria-label="Пауза"
                onClick={pause}
              >
                <Pause size={16} />
              </button>
            )}
          </div>
        </div>
        {view.phase !== 'result' && (
          <div className="hud-progress">
            <div>
              <span>{phaseProgress.label}</span>
              <strong>{Math.round(phaseProgress.value * 100)}%</strong>
            </div>
            <progress
              max={1}
              value={phaseProgress.value}
              aria-label="Прогресс этапа"
            />
          </div>
        )}
        <div className="hud-section">
          {view.phase === 'result' ? (
            detailedPanel
          ) : (
            <>
              <ScreenCompactStatus view={view} />
              <details className="hud-help-controls">
                <summary>Помощь и кнопки</summary>
                <p className="hud-note">
                  {gamepadHint(pads)}. Стик — движение, A/× — действие, RB/R1 —
                  бросок, B/○ — пауза.
                </p>
                <div className="hud-help-content">
                  {detailedPanel}
                  <button
                    type="button"
                    className="hud-text-button"
                    aria-pressed={soundOn}
                    onClick={soundToggle}
                  >
                    {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
                    {soundOn ? 'Звуки включены' : 'Включить звуки'}
                  </button>
                  <fieldset className="camera-switch" aria-label="Камера">
                    <span>
                      <Camera size={14} /> Камера
                    </span>
                    {(
                      [
                        ['auto', 'По делу'],
                        ['wide', 'Комната'],
                        ['faces', 'Лица'],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        type="button"
                        key={mode}
                        aria-pressed={cameraMode === mode}
                        onClick={() => setCameraMode(mode)}
                      >
                        {label}
                      </button>
                    ))}
                  </fieldset>
                </div>
              </details>
            </>
          )}
        </div>
        {view.phase !== 'result' && (
          <div className="hud-message" aria-live="polite">
            <span>БРИГАДА</span>
            <p>«{view.message}»</p>
          </div>
        )}
      </aside>
      <EpisodeDialog
        open={episodeOpen}
        options={screenEpisodes}
        selected={episodeChoice}
        onSelect={setEpisodeChoice}
        onChoose={jumpToEpisode}
        onClose={() => setEpisodeOpen(false)}
      />

      <Dialog
        open={briefOpen}
        disablePointerDismissal
        onOpenChange={(_open, details) => details.cancel()}
      >
        <DialogContent className="screen-brief-dialog" showCloseButton={false}>
          <span className="tiny-label">ИСТОРИЯ 01 · КВАРТИРНЫЙ ВОПРОС</span>
          <DialogTitle>Да тут на полчаса.</DialogTitle>
          <DialogDescription>
            Огромный экран, кривой потолок и одна отвёртка на всех. Соберите
            рамку, вставьте спицы в полотно, натяните пружины — и доберитесь до
            стены.
          </DialogDescription>
          <div className="brief-steps">
            <span>
              <b>01</b>Совместить и защёлкнуть
            </span>
            <span>
              <b>02</b>Направить, натянуть, поймать
            </span>
            <span>
              <b>03</b>Просверлить, поднять, выровнять
            </span>
          </div>
          <div className="brief-players">
            {NAMES.slice(0, players).map((name, index) => (
              <div key={name}>
                <strong>{name}</strong>
                <kbd>{keyboardPrompt(index, 'move')}</kbd>
                <span>движение / настройка</span>
                <kbd>{keyboardPrompt(index, 'action')}</kbd>
                <span>действие</span>
              </div>
            ))}
          </div>
          <div className="brief-rule">
            <kbd>{keyboardPrompt(0, 'throw')}</kbd>
            <p>
              <b>Отвёртка одна.</b> Владелец держит кнопку броска и отпускает в
              зелёной зоне. Получатель ловит своей клавишей действия. Промазал —
              подбери с пола.
            </p>
          </div>
          <p className="brief-note">
            {players === 1
              ? `Один набор ${keyboardPrompt(0, 'move')} + ${keyboardPrompt(0, 'action')}. На полу управляешь Никитой, Ярик помогает напротив. У стены управляешь Яриком, Никита страхует и подаёт. Переключать героев не нужно. При сверлении держи ещё ${keyboardPrompt(0, 'secondary')} — пылесос.`
              : `Никита слева, Ярик справа. На стульях Ярик сверлит ${keyboardPrompt(1, 'action')} и пылесосит ${keyboardPrompt(1, 'secondary')}; Никита держит ${keyboardPrompt(0, 'action')} и балансирует ${keyboardPrompt(0, 'horizontal')}. Кнопки рядом с персонажами показывают следующий шаг.`}
          </p>
          <button
            type="button"
            className="hud-text-button"
            onClick={openEpisodes}
          >
            <SkipForward size={15} /> Сразу к эпизоду · тренировка
          </button>
          <p className="brief-note">
            Цельтесь в зелёные зоны. Действие иногда нужно удерживать, иногда —
            вовремя отпускать. Ошибки смешные и исправимые. Поднимать и
            переделывать разрешается.
          </p>
          <div className="brief-actions">
            <button type="button" className="hud-primary" onClick={begin}>
              <Play size={17} />{' '}
              {view.elapsed > 0 ? 'Продолжить работу' : 'Ладно, собираем'}
            </button>
            <button type="button" className="hud-secondary" onClick={onExit}>
              <ArrowLeft size={15} /> К историям
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={
          view.paused &&
          !briefOpen &&
          !episodeOpen &&
          !controlsOpen &&
          view.phase !== 'result'
        }
        onOpenChange={(open) => setPause(open)}
      >
        <DialogContent className="screen-pause-dialog">
          <DialogTitle>Перекур</DialogTitle>
          <DialogDescription>
            Стулья замерли. Никто никого не отпускает.
          </DialogDescription>
          <button
            type="button"
            className={`hud-primary${pauseChoice === 0 ? ' pad-selected' : ''}`}
            onClick={() => setPause(false)}
          >
            <Play size={17} /> Продолжить
          </button>
          <button
            type="button"
            className={`hud-secondary${pauseChoice === 1 ? ' pad-selected' : ''}`}
            onClick={openControls}
          >
            <Settings2 size={15} /> Настройки управления
          </button>
          <button
            type="button"
            className={`hud-secondary${pauseChoice === 2 ? ' pad-selected' : ''}`}
            onClick={openEpisodes}
          >
            <SkipForward size={15} /> Выбрать эпизод
          </button>
          <button
            type="button"
            className={`hud-secondary${pauseChoice === 3 ? ' pad-selected' : ''}`}
            onClick={restart}
          >
            <RotateCcw size={15} /> Начать историю заново
          </button>
          <button
            type="button"
            className={`hud-text-button${pauseChoice === 4 ? ' pad-selected' : ''}`}
            onClick={onExit}
          >
            <ArrowLeft size={15} /> К выбору историй
          </button>
        </DialogContent>
      </Dialog>
      <ControlSettings
        open={controlsOpen}
        onOpenChange={setControlsOpen}
        players={players}
        playerNames={NAMES}
        pads={pads}
      />
    </section>
  );
}

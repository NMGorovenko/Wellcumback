'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, Trophy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  freshClean,
  cleanTick,
  cleanAction,
  cleanPrompt,
} from '@/lib/game/clean/engine';
import type { Result } from '@/lib/game/types';
import { people } from '@/lib/game/presets';
import { gamepadHint, type PadFrame } from '@/lib/game/input/gamepads';
import { useGameInspection } from '@/hooks/use-game-inspection';
import { useGameLoop } from '@/hooks/use-game-loop';
import { useCleanAudio } from '@/hooks/use-clean-audio';
import CleanScene, { type CleanCameraMode } from './scene';
import CleanStatus from './clean-status';
import {
  cleanChapter,
  cleanChapters,
  cleanInstructions,
  cleanTitles,
} from './clean-hud-data';

export default function CleanGame({
  players,
  sound,
  onExit,
  onFinish,
  onNext,
}: {
  players: number;
  sound: boolean;
  onExit: () => void;
  onFinish: (r: Result) => void;
  onNext?: () => void;
}) {
  const game = useRef(freshClean(players)),
    keys = useRef(new Set<string>()),
    saved = useRef(false);
  const [view, setView] = useState(() => freshClean(players)),
    [cameraMode, setCameraMode] = useState<CleanCameraMode>('auto');
  const [pads, setPads] = useState<
    Pick<PadFrame, 'assignments' | 'unsupported'>
  >({ assignments: [], unsupported: [] });
  const [pauseChoice, setPauseChoice] = useState(0);
  const pad = pads.assignments.length > 0,
    active = view.phase !== 'brief' && view.phase !== 'result';
  useGameInspection(game, keys);
  useCleanAudio(sound, view);
  const action = () => {
    cleanAction(game.current);
    setView({ ...game.current });
  };
  const setPause = (paused: boolean) => {
    if (game.current.phase === 'result') return;
    game.current.paused = paused;
    keys.current.clear();
    setView({ ...game.current });
  };
  const pause = () => setPause(!game.current.paused);
  useGameLoop({
    game,
    keys,
    tick: cleanTick,
    action,
    pause,
    snapshot: setView,
    onGamepads: setPads,
    padMenu: {
      enabled: view.paused || !active,
      onMove: () => setPauseChoice((v) => 1 - v),
      onConfirm: () => {
        if (view.paused) {
          if (pauseChoice === 0) setPause(false);
          else onExit();
        } else if (view.phase === 'brief') action();
        else (onNext ?? onExit)();
      },
      onBack: () => {
        if (view.paused) setPause(false);
        else onExit();
      },
    },
  });
  useEffect(() => {
    if (view.phase === 'result' && !saved.current) {
      saved.current = true;
      onFinish({
        story: 'clean',
        score: view.score,
        players,
        seconds: Math.round(view.elapsed),
        date: new Date().toISOString(),
        details: `${view.spots.length} следов отмыто · стиралка чистая · ${Math.round(view.teamwork)} сек. сообща`,
      });
    }
  }, [
    view.phase,
    view.score,
    view.elapsed,
    view.spots.length,
    view.teamwork,
    players,
    onFinish,
  ]);
  const hold = (key: string, title: string) => (
    <button
      key={key}
      className="touch-key"
      aria-label={title}
      onPointerDown={(event) => {
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
      className={`game-layout clean-game-layout${active ? ' clean-active' : ''}`}
      aria-label="Операция Чистый проход"
    >
      <div className="game-world">
        <CleanScene game={game} cameraMode={cameraMode} />
        <div className="world-heading">
          <span>02 / ДРУГАЯ РОТА</span>
          <strong>Операция «Чистый проход»</strong>
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
            <p>
              Дойди до дневального, переживи стирку, а потом всей компанией
              отмой последствия.
            </p>
            <p className="quiet">
              Первая часть — за безымянного солдата. Уборка — за вашу бригаду. В
              одиночку поможет напарник.
            </p>
            <button className="play-button" onClick={action}>
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
              {onNext ? 'Теперь вешаем экран' : 'К историям'}{' '}
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
            <CleanStatus game={view} pad={pad} />
            <p className="context-prompt">{cleanPrompt(view)}</p>
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
            До уборки первый геймпад управляет солдатом. При игре вдвоём или
            втроём один геймпад после переодевания переходит Никите, клавиатура
            остаётся у Ярослава. Отпусти кнопки при смене ролей.
          </p>
          <div className="camera-switch" aria-label="Камера">
            {(
              [
                ['auto', 'Авто'],
                ['wide', 'Обзор'],
                ['faces', 'Ближе'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                aria-pressed={cameraMode === mode}
                onClick={() => setCameraMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>
          <details className="touch-controls">
            <summary>Кнопки на экране</summary>
            <div className="touch-row">
              {hold('KeyW', '↑')}
              {hold('KeyA', '←')}
              {hold('KeyS', '↓')}
              {hold('KeyD', '→')}
              {hold('KeyQ', 'Q · сдержаться')}
              {hold('KeyE', 'E · действие')}
            </div>
          </details>
        </details>
      </aside>
      <footer className="game-footer">
        <div className="footer-message" aria-live="polite">
          <span>РАДИООБМЕН</span>
          <p>{view.message}</p>
        </div>
        {active && (
          <div className="keyboard-controls">
            {pad ? (
              <>
                <span>
                  <kbd>Стик</kbd> ходьба
                </span>
                <span>
                  <kbd>A / ×</kbd> действие
                </span>
                {['find', 'toilet'].includes(view.phase) && (
                  <span>
                    <kbd>RB / R1</kbd> сдержаться
                  </span>
                )}
              </>
            ) : (
              <>
                <span>
                  <kbd>WASD</kbd> + <kbd>E</kbd>{' '}
                  {view.phase === 'clean' ? people[0].name : 'Солдат'}
                </span>
                {view.phase === 'find' || view.phase === 'toilet' ? (
                  <span>
                    <kbd>Q</kbd> сдержаться
                  </span>
                ) : null}
                {view.phase === 'clean' && players > 1 && (
                  <span>
                    <kbd>Стрелки</kbd> + <kbd>Enter</kbd> Никита
                  </span>
                )}
                {view.phase === 'clean' && players > 2 && (
                  <span>
                    <kbd>IJKL</kbd> + <kbd>O</kbd> Рома
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </footer>
      <Dialog
        open={view.paused && view.phase !== 'result'}
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
          >
            <Play size={17} />
            Продолжить смену
          </button>
          <button
            className={`secondary-button${pauseChoice === 1 ? ' pad-selected' : ''}`}
            onClick={onExit}
          >
            К выбору историй
          </button>
        </DialogContent>
      </Dialog>
    </section>
  );
}

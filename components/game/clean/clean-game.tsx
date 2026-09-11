'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Pause, Play, Trophy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { freshClean, cleanTick, cleanAction } from '@/lib/game/clean/engine';
import type { Result } from '@/lib/game/types';
import { useGameLoop } from '@/hooks/use-game-loop';
import CleanCanvas from './canvas';
export default function CleanGame({
  players,
  onExit,
  onFinish,
}: {
  players: number;
  sound: boolean;
  onExit: () => void;
  onFinish: (r: Result) => void;
}) {
  const game = useRef(freshClean(players));
  const keys = useRef(new Set<string>());
  const [view, setView] = useState(() => freshClean(players));
  const saved = useRef(false);
  const action = () => {
    cleanAction(game.current);
    setView({ ...game.current });
  };
  const pause = () => {
    game.current.paused = !game.current.paused;
    keys.current.clear();
    setView({ ...game.current });
  };
  useGameLoop({
    game,
    keys,
    tick: cleanTick,
    action,
    pause,
    snapshot: setView,
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
        details: 'Коридор чист. Свидетели молчат.',
      });
    }
  }, [view.phase, view.score, view.elapsed, players, onFinish]);
  const hold = (key: string, title: string) => (
    <button
      key={key}
      className="touch-key"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        keys.current.add(key);
        if (key === 'KeyE') action();
      }}
      onPointerUp={() => keys.current.delete(key)}
      onPointerCancel={() => keys.current.delete(key)}
      onLostPointerCapture={() => keys.current.delete(key)}
    >
      {title}
    </button>
  );
  return (
    <section className="stage is-playing clean-stage">
      <CleanCanvas game={game} />
      <div className="game-top">
        <div className="game-title">
          <span className="tiny-label">ИСТОРИЯ 02 · 2D · ПИЛОТ</span>
          <h2>Операция «Чистый проход»</h2>
        </div>
        <div className="game-score">
          <Trophy size={17} />
          <strong>{view.score}</strong>
          <button className="icon-button" onClick={pause} aria-label="Пауза">
            <Pause size={16} />
          </button>
        </div>
      </div>
      {!['brief', 'result'].includes(view.phase) && (
        <>
          <div className="clean-task">
            <span>
              {view.phase === 'find'
                ? '01 · Найди дневального'
                : view.phase === 'wash'
                  ? view.station === 1
                    ? '02 · В душ!'
                    : '02 · Загрузи стиралку'
                  : '03 · Зачистка в химзащите'}
            </span>
            <strong>
              {view.phase === 'clean'
                ? `${view.spots.filter((s) => s.progress >= 1).length} / 8 чисто`
                : view.phase === 'find'
                  ? `${Math.ceil(view.timer)} сек.`
                  : '→ к метке'}
            </strong>
          </div>
          <div className="clean-touch touch-row">
            {hold('KeyW', 'W ↑')}
            {hold('KeyA', 'A ←')}
            {hold('KeyS', 'S ↓')}
            {hold('KeyD', 'D →')}
            {hold(
              'KeyE',
              view.phase === 'clean' ? 'Держи E · Оттирать' : 'E · Действие',
            )}
          </div>
          <div className="game-message" aria-live="polite">
            <span>РАДИООБМЕН</span>«{view.message}»
          </div>
          <div className="game-controls">
            <span>
              <kbd>W A S D + E</kbd>Игрок 1
            </span>
            {players > 1 && (
              <span>
                <kbd>↑ ↓ ← → + ENTER</kbd>Игрок 2 · уборка
              </span>
            )}
            {players > 2 && (
              <span>
                <kbd>I J K L + O</kbd>Игрок 3 · уборка
              </span>
            )}
            <span>
              <kbd>ESC</kbd>Перекур
            </span>
          </div>
        </>
      )}
      {view.phase === 'brief' && (
        <div className="result-overlay">
          <div className="result-card">
            <span className="result-stamp">
              БАЙКА ИЗ ДРУГОЙ РОТЫ · НЕ ПРО РОМУ
            </span>
            <h2 style={{ marginTop: 22, fontSize: 32 }}>Срочный доклад</h2>
            <p>
              В казарме всё по расписанию.
              <br />
              Кроме одного очень срочного вопроса.
            </p>
            <p>
              Найди дневального, приведи себя в порядок и помоги бригаде спасти
              коридор. Камера в неловкий момент отвернётся.
            </p>
            <p className="quiet">
              В начале рулит игрок 1. На уборке подключается вся бригада. В
              одиночку помогает дежурный.
            </p>
            <button className="play-button" onClick={action}>
              Разрешите обратиться <ArrowRight size={17} />
            </button>
          </div>
        </div>
      )}
      {view.phase === 'result' && (
        <div className="result-overlay">
          <div className="result-card">
            <span className="result-stamp">
              СЕКРЕТНО. ДО ПЕРВОЙ ВСТРЕЧИ С ДРУЗЬЯМИ.
            </span>
            <Trophy className="result-trophy" size={35} />
            <h2>Следов нет.</h2>
            <p>История, к сожалению, осталась.</p>
            <div className="big-score">
              {view.score}
              <small>ОЧКОВ ЗА НЕРАЗГЛАШЕНИЕ</small>
            </div>
            <p>8 участков спасено · {Math.round(view.elapsed)} секунд</p>
            <button className="play-button" onClick={onExit}>
              К историям <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}
      <Dialog
        open={view.paused && view.phase !== 'result'}
        onOpenChange={(v) => {
          game.current.paused = v;
          keys.current.clear();
          setView({ ...game.current });
        }}
      >
        <DialogContent className="help-dialog">
          <DialogTitle>Тихий час</DialogTitle>
          <DialogDescription>Даже стиралке нужен отдых.</DialogDescription>
          <button className="play-button" onClick={pause}>
            <Play size={17} /> Продолжить
          </button>
          <button className="secondary-button" onClick={onExit}>
            К выбору историй
          </button>
        </DialogContent>
      </Dialog>
    </section>
  );
}

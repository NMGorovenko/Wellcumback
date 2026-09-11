'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Pause,
  Play,
  ArrowLeft,
  RotateCcw,
  Trophy,
  Check,
  Search,
  ArrowRight,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import Scene from './scene';
import {
  act,
  freshGame,
  tick,
  titles,
  type GameState,
} from '@/lib/game/screen/engine';
import type { Result } from '@/lib/game/types';
import { useGameLoop } from '@/hooks/use-game-loop';
const sideNames = ['Сверху', 'Справа', 'Снизу', 'Слева'];
const controls: Record<string, [string, string][]> = {
  frame: [['E / ПРОБЕЛ', 'Защёлкнуть угол']],
  rods: [
    ['↑ ↓ ← →', 'Выбрать сторону'],
    ['УДЕРЖИВАЙ E', 'Вставить спицу'],
  ],
  tension: [
    ['W A S D / СТРЕЛКИ', 'Обойти рамку'],
    ['E / ПРОБЕЛ', 'Прицепить скрепку'],
  ],
  drill: [
    ['A / D', 'Игрок 1 · держать'],
    ['↑ / ↓', 'Игрок 2 · высота'],
    ['УДЕРЖИВАЙ E', 'Игрок 2 · сверлить'],
  ],
  lift: [
    ['W / S', 'Игрок 1 · левый край'],
    ['↑ / ↓', 'Игрок 2 · правый край'],
    ['A / D', 'Сместить экран'],
    ['УДЕРЖИВАЙ E', 'Зацепить'],
  ],
  level: [
    ['← / →', 'Регулировать подвесы'],
    ['E / ПРОБЕЛ', 'Готово, вешаем!'],
  ],
};
export default function ScreenGame({
  players,
  sound,
  onExit,
  onFinish,
}: {
  players: number;
  sound: boolean;
  onExit: () => void;
  onFinish: (r: Result) => void;
}) {
  const game = useRef<GameState>(freshGame(players));
  const keys = useRef(new Set<string>());
  const [view, setView] = useState(() => freshGame(players));
  const saved = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  function ping(good = true) {
    if (!soundRef.current) return;
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
      const oscillator = audio.current.createOscillator(),
        gain = audio.current.createGain();
      oscillator.connect(gain);
      gain.connect(audio.current.destination);
      oscillator.frequency.setValueAtTime(
        good ? 620 : 180,
        audio.current.currentTime,
      );
      oscillator.frequency.exponentialRampToValueAtTime(
        good ? 880 : 90,
        audio.current.currentTime + 0.09,
      );
      gain.gain.setValueAtTime(0.035, audio.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audio.current.currentTime + 0.12,
      );
      oscillator.start();
      oscillator.stop(audio.current.currentTime + 0.13);
    } catch {}
  }
  function action() {
    const old = game.current.score;
    act(game.current);
    if (game.current.score !== old) ping(game.current.score > old);
    setView({ ...game.current });
  }
  function pause() {
    game.current.paused = !game.current.paused;
    keys.current.clear();
    setView({ ...game.current });
  }
  useGameLoop({ game, keys, tick, action, pause, snapshot: setView });
  useEffect(
    () => () => {
      audio.current?.close().catch(() => {});
    },
    [],
  );
  useEffect(() => {
    if (view.phase === 'result' && !saved.current) {
      saved.current = true;
      onFinish({
        story: 'screen',
        score: view.score,
        seconds: Math.round(view.elapsed),
        players,
        date: new Date().toISOString(),
        details: `Падений: ${view.falls}. Ошибок: ${view.penalties}.`,
      });
    }
  }, [
    view.phase,
    view.score,
    view.elapsed,
    view.falls,
    view.penalties,
    players,
    onFinish,
  ]);
  const actNumber = ['frame'].includes(view.phase)
    ? 1
    : ['rods', 'tension'].includes(view.phase)
      ? 2
      : 3;
  const holdButton = (code: string, label: string) => (
    <button
      key={code}
      className="touch-key"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        keys.current.add(code);
        if (code === 'KeyE') action();
      }}
      onPointerUp={() => keys.current.delete(code)}
      onPointerCancel={() => keys.current.delete(code)}
      onLostPointerCapture={() => keys.current.delete(code)}
    >
      {label}
    </button>
  );
  const percentage =
    view.phase === 'frame'
      ? view.corners / 4
      : view.phase === 'rods'
        ? view.rods.reduce((a, b) => a + b, 0) / 4
        : view.phase === 'tension'
          ? view.clips.reduce((a, b) => a + b, 0) / 16
          : view.phase === 'drill'
            ? (view.holes.length + view.drill) / 2
            : view.phase === 'lift'
              ? Math.min(1, view.latch)
              : 1;
  return (
    <section className="stage is-playing" aria-label="Игра: Экран на полстены">
      <Scene game={game} playing />
      <div className="game-top">
        <div className="game-title">
          <span className="tiny-label">АКТ 0{actNumber} / 03</span>
          <h2>{titles[view.phase]}</h2>
        </div>
        <div className="game-score">
          <Trophy size={17} />
          <strong>{view.score.toLocaleString('ru')}</strong>
          <span>
            {Math.floor(view.elapsed / 60)}:
            {String(Math.floor(view.elapsed % 60)).padStart(2, '0')}
          </span>
          <button className="icon-button" aria-label="Пауза" onClick={pause}>
            <Pause size={16} />
          </button>
        </div>
      </div>
      {view.phase !== 'result' && (
        <>
          <div className="game-objective">
            <span>
              {view.phase === 'frame'
                ? `${view.corners} / 4 угла`
                : view.phase === 'rods'
                  ? `${view.rods.filter((n) => n === 1).length} / 4 спицы`
                  : view.phase === 'tension'
                    ? `${view.clips.reduce((a, b) => a + b, 0)} / 16 скрепок`
                    : view.phase === 'drill'
                      ? `${view.holes.length} / 2 отверстия`
                      : view.phase === 'lift'
                        ? 'Два края → два крючка'
                        : 'Смотри на уровень'}
            </span>
            <progress max={1} value={percentage} />
          </div>
          <div className="game-panel">
            {view.phase === 'frame' && (
              <>
                <div className="panel-caption">
                  УГОЛ {view.corners + 1}{' '}
                  <span>Жми, когда бегунок в зелёной зоне</span>
                </div>
                <div className="timing-track">
                  <div className="timing-target" />
                  <i style={{ left: `${view.cursor * 100}%` }} />
                </div>
                <button className="small-primary" onClick={action}>
                  E · Защёлкнуть
                </button>
              </>
            )}
            {['rods', 'tension'].includes(view.phase) && (
              <>
                <div className="panel-caption">
                  {view.phase === 'rods'
                    ? 'ВСТАВЛЯЕМ СПИЦЫ'
                    : 'БАЛАНС НАТЯЖЕНИЯ'}{' '}
                  <span>{sideNames[view.side]}</span>
                </div>
                <div className="side-buttons">
                  {sideNames.map((name, i) => (
                    <button
                      key={name}
                      onClick={() => {
                        game.current.side = i;
                        setView({ ...game.current });
                      }}
                      className={view.side === i ? 'selected' : ''}
                    >
                      <span>{name}</span>
                      <b>
                        {view.phase === 'rods'
                          ? `${Math.round(view.rods[i] * 100)}%`
                          : `${view.clips[i]}/4`}
                      </b>
                    </button>
                  ))}
                </div>
                {holdButton(
                  'KeyE',
                  view.phase === 'rods'
                    ? 'Держи E · Вставить спицу'
                    : 'E · Закрепить скрепку',
                )}
              </>
            )}
            {view.phase === 'drill' && (
              <>
                <div className="panel-caption">
                  БАЛАНС СТУЛЬЕВ{' '}
                  <span>
                    {view.players === 1
                      ? 'Напарник страхует'
                      : 'Держи маркер по центру'}
                  </span>
                </div>
                <div className="balance-track">
                  <div className="balance-safe" />
                  <i style={{ left: `${50 + view.balance * 46}%` }} />
                </div>
                <div className="drill-options">
                  <button
                    className={view.chairs === 1 ? 'selected' : ''}
                    onClick={() => {
                      game.current.chairs = 1;
                      game.current.aim = 5.1;
                    }}
                  >
                    1 стул · попроще
                  </button>
                  <button
                    className={view.chairs === 2 ? 'selected' : ''}
                    onClick={() => {
                      game.current.chairs = 2;
                      game.current.aim = 6;
                    }}
                  >
                    2 стула · повыше
                  </button>
                  <button
                    aria-label="Поискать стремянку"
                    onClick={() => {
                      game.current.message =
                        'Нашли зарядку от Nokia и один носок. Стремянка осталась в параллельной вселенной.';
                    }}
                  >
                    <Search size={16} />
                  </button>
                </div>
                <div className="drill-stats">
                  <span>Высота: {view.aim.toFixed(2)} м</span>
                  <span>Сверление: {Math.round(view.drill * 100)}%</span>
                </div>
                <div className="touch-row">
                  {holdButton('KeyA', 'A · ← держать')}
                  {holdButton('KeyD', 'D · держать →')}
                  {holdButton('ArrowUp', '↑')}
                  {holdButton('ArrowDown', '↓')}
                  {holdButton('KeyE', 'E · Сверлить')}
                </div>
              </>
            )}
            {view.phase === 'lift' && (
              <>
                <div className="panel-caption">
                  ПОПАДАЕМ НА КРЮЧКИ <span>Точность ± 23 см</span>
                </div>
                <div className="lift-readout">
                  <span>
                    Левый{' '}
                    <b
                      className={
                        Math.abs(view.liftLeft - view.holes[0]) < 0.23
                          ? 'good'
                          : ''
                      }
                    >
                      {view.liftLeft.toFixed(2)} / {view.holes[0].toFixed(2)} м
                    </b>
                  </span>
                  <span>
                    Сдвиг{' '}
                    <b className={Math.abs(view.liftX) < 0.23 ? 'good' : ''}>
                      {view.liftX.toFixed(2)} м
                    </b>
                  </span>
                  <span>
                    Правый{' '}
                    <b
                      className={
                        Math.abs(view.liftRight - view.holes[1]) < 0.23
                          ? 'good'
                          : ''
                      }
                    >
                      {view.liftRight.toFixed(2)} / {view.holes[1].toFixed(2)} м
                    </b>
                  </span>
                </div>
                <div className="touch-row">
                  {holdButton('KeyW', 'W ↑ левый')}
                  {holdButton('KeyS', 'S ↓')}
                  {holdButton('KeyA', 'A ←')}
                  {holdButton('KeyD', 'D →')}
                  {holdButton('ArrowUp', '↑ правый')}
                  {holdButton('ArrowDown', '↓')}
                  {holdButton('KeyE', 'E · Зацепить')}
                </div>
              </>
            )}
            {view.phase === 'level' && (
              <>
                <div className="panel-caption">
                  ПОТОЛОК — НЕ ОРИЕНТИР{' '}
                  <span>
                    Уклон: {((view.angle * 180) / Math.PI).toFixed(1)}°
                  </span>
                </div>
                <div className="spirit-level">
                  <span />
                  <i style={{ left: `${50 + view.angle * 270}%` }} />
                </div>
                <div className="touch-row">
                  {holdButton('ArrowLeft', '← Опустить слева')}
                  {holdButton('ArrowRight', 'Поднять слева →')}
                  <button
                    className="small-primary"
                    disabled={Math.abs(view.angle) >= 0.018}
                    onClick={action}
                  >
                    <Check size={15} /> Вот теперь ровно
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="game-message" aria-live="polite" key={view.message}>
            <span>БРИГАДА</span> «{view.message}»
          </div>
          <div className="game-controls">
            {controls[view.phase]?.map(([key, label]) => (
              <span key={key}>
                <kbd>{key}</kbd>
                {label}
              </span>
            ))}
            {view.players === 3 && (
              <span>
                <kbd>J / L</kbd>Игрок 3 · страховка стульев
              </span>
            )}
          </div>
        </>
      )}
      {view.phase === 'result' && (
        <div className="result-overlay">
          <div className="result-card">
            <span className="result-stamp">
              ЗАДАНИЕ ВЫПОЛНЕНО · ПОЧТИ ПО ГОСТУ
            </span>
            <Trophy className="result-trophy" size={38} />
            <h2>Кино будет!</h2>
            <p>И пусть весь потолок подождёт.</p>
            <div className="big-score">
              {view.score.toLocaleString('ru')}
              <small>ОЧКОВ БРИГАДЫ</small>
            </div>
            <div className="result-stats">
              <span>
                {Math.round(view.elapsed)} сек.<small>Вместо получаса</small>
              </span>
              <span>
                {view.falls}
                <small>Полётов на диван</small>
              </span>
              <span>
                {view.penalties}
                <small>Проверок дружбы</small>
              </span>
            </div>
            <button className="play-button" onClick={onExit}>
              К другим историям <ArrowRight size={18} />
            </button>
            <button
              className="help-link"
              onClick={() => {
                game.current = freshGame(players);
                saved.current = false;
                keys.current.clear();
                setView({ ...game.current });
              }}
            >
              <RotateCcw size={14} /> Переделаем нормально
            </button>
          </div>
        </div>
      )}
      <Dialog
        open={view.paused && view.phase !== 'result'}
        onOpenChange={(open) => {
          game.current.paused = open;
          keys.current.clear();
          setView({ ...game.current });
        }}
      >
        <DialogContent className="help-dialog">
          <DialogTitle>Перекур</DialogTitle>
          <DialogDescription>
            Стулья замерли. Дружба тоже на паузе.
          </DialogDescription>
          <button className="play-button" onClick={pause}>
            <Play size={18} /> Продолжить
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              game.current = freshGame(players);
              saved.current = false;
              keys.current.clear();
              setView({ ...game.current });
            }}
          >
            <RotateCcw size={16} /> Начать историю заново
          </button>
          <button className="secondary-button" onClick={onExit}>
            <ArrowLeft size={16} /> К выбору историй
          </button>
        </DialogContent>
      </Dialog>
    </section>
  );
}

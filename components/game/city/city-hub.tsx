'use client';
import { useRef, useState, type RefObject } from 'react';
import {
  ArrowUpRight,
  MapPin,
  RotateCcw,
  Pause,
  Play,
  Camera,
} from 'lucide-react';
import { useGameLoop } from '@/hooks/use-game-loop';
import {
  gamepadPrompt,
  keyboardPrompt,
  type PadFrame,
} from '@/lib/game/input/gamepads';
import {
  freshCity,
  resetCityCar,
  type CityState,
} from '@/lib/game/city/engine';
import { cityStops, type CityMission } from '@/lib/game/city/layout';
import CityScene from './scene';
import { useGameInspection } from '@/hooks/use-game-inspection';
import { useNetworkSession } from '@/hooks/use-network-session';
import {
  disconnectNetwork,
  isNetworkDrive,
  passNetworkWheel,
  tickNetworkCity,
} from '@/lib/game/network/session';
import { useControlSettings } from '@/hooks/use-control-settings';

export default function CityHub({
  game: savedGame,
  onPlay,
  onStories,
  players,
  onPlayers,
  onGamepads,
}: {
  game: RefObject<CityState>;
  onPlay: (story: CityMission) => void;
  onStories: () => void;
  players: number;
  onPlayers: (count: number) => void;
  onGamepads?: (status: Pick<PadFrame, 'assignments' | 'unsupported'>) => void;
}) {
  const game = useRef(savedGame.current);
  const network = useNetworkSession();
  const { settings } = useControlSettings();
  const shared = network.role !== null;
  const [view, setView] = useState(freshCity);
  const [target, setTarget] = useState(0);
  const [closeView, setCloseView] = useState(false);
  const [pads, setPads] = useState<
    Pick<PadFrame, 'assignments' | 'unsupported'>
  >({ assignments: [], unsupported: [] });
  const keys = useRef(new Set<string>());
  useGameInspection(game, keys);
  const pause = () => {
    if (isNetworkDrive() && (!document.hasFocus() || network.role === 'guest'))
      return;
    game.current.paused = !game.current.paused;
    keys.current.clear();
    setView({ ...game.current });
  };
  const launch = () => {
    const s = game.current,
      stop = cityStops[s.nearStop];
    if (!isNetworkDrive() && stop?.mission && s.speed < 2.3) {
      s.vx = s.vz = s.speed = 0;
      s.paused = true;
      onPlay(stop.mission);
    }
  };
  useGameLoop({
    game,
    keys,
    tick: (s, dt, input) => {
      tickNetworkCity(s, dt, input);
      if (s.interaction) {
        const id = s.interaction as CityMission;
        s.interaction = null;
        s.paused = true;
        onPlay(id);
      }
    },
    action: () => {},
    pause,
    snapshot: setView,
    onGamepads: (status) => {
      setPads(status);
      onGamepads?.(status);
    },
    tickWhileBlocked: shared,
    padMenu: {
      enabled: view.paused,
      onMove: () => {},
      onConfirm: pause,
      onBack: pause,
    },
  });
  const stop = cityStops[view.nearStop];
  const control = (key: Parameters<typeof keyboardPrompt>[1]) =>
    gamepadPrompt(pads, 0, key) || keyboardPrompt(0, key);
  return (
    <section
      className="city-hub"
      aria-label="Поездка по Красноярску между историями"
    >
      <div className="city-world">
        <CityScene game={game} targetStop={target} closeView={closeView} />
        <div className="city-heading">
          <span>КРАСНОЯРСК · КАРТА ИСТОРИЙ</span>
          <h1>Ну что, куда едем?</h1>
          <p>Трое друзей. Один Mustang. Вечер воспоминаний.</p>
        </div>
        <div className="city-actions">
          <button
            aria-label={
              closeView ? 'Показать весь город' : 'Приблизить Mustang'
            }
            aria-pressed={closeView}
            onClick={() => setCloseView(!closeView)}
          >
            <Camera size={16} />
            {closeView ? 'Карта' : 'Ближе'}
          </button>
          <button disabled={shared} onClick={onStories}>
            Все истории <ArrowUpRight size={14} />
          </button>
          <button
            aria-label="Вернуть машину на дорогу"
            title="Вернуть машину на дорогу"
            disabled={shared && network.role === 'guest'}
            onClick={() => {
              resetCityCar(game.current);
              setView({ ...game.current });
            }}
          >
            <RotateCcw size={16} />
          </button>
          <button aria-label="Пауза на карте" onClick={pause}>
            <Pause size={16} />
          </button>
        </div>
        <div className="city-speed">
          <strong>{Math.round(view.speed * 3.6)}</strong>
          <span>км/ч</span>
          {view.drifting && <b>БОКОМ!</b>}
        </div>
        {stop && !view.paused && (
          <div className="city-arrival">
            <MapPin size={18} />
            <div>
              <strong>{stop.title}</strong>
              <span>{stop.subtitle}</span>
            </div>
            {stop.mission && !shared && (
              <button onClick={launch} disabled={view.speed >= 2.3}>
                <kbd>{control('action')}</kbd>
                {view.speed >= 2.3 ? 'Остановись' : 'Начать историю'}
              </button>
            )}
          </div>
        )}
        {settings.showWorldPrompts && !stop && !view.paused && (
          <div className="city-drive-hints">
            <span>
              <kbd>{control('vertical')}</kbd> газ / назад
            </span>
            <span>
              <kbd>{control('horizontal')}</kbd> руль
            </span>
            <span>
              <kbd>{control('secondary')}</kbd> дрифт
            </span>
          </div>
        )}
        {view.paused && (
          <div className="city-pause">
            <button className="play-button" onClick={pause}>
              <Play size={17} /> Поехали дальше
            </button>
          </div>
        )}
        {view.elapsed < view.radioUntil && (
          <output className="city-radio">{view.radio}</output>
        )}
      </div>
      <div className="city-bottom">
        {shared && (
          <div className="city-network">
            <span>
              {network.status === 'connected'
                ? `Онлайн · руль ${network.driver === network.role ? 'у тебя' : 'у друга'}`
                : network.status === 'failed' || network.status === 'closed'
                  ? 'Нет связи · выйди из поездки, чтобы играть локально'
                  : 'Подключение · открой сетевое меню для обмена кодами'}
            </span>
            {network.role === 'host' && (
              <button
                disabled={network.status !== 'connected'}
                onClick={passNetworkWheel}
              >
                Передать руль
              </button>
            )}
            <button onClick={disconnectNetwork}>Выйти из поездки</button>
          </div>
        )}
        <nav aria-label="Места на карте">
          {cityStops.map((point, i) => (
            <button
              key={point.id}
              aria-pressed={i === target}
              onClick={() => setTarget(i)}
            >
              <span style={{ background: point.color }} />
              {point.title}
            </button>
          ))}
        </nav>
        {!shared && (
          <div className="city-players">
            <span>ИГРОКОВ В ИСТОРИИ</span>
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                aria-pressed={players === n}
                onClick={() => onPlayers(n)}
              >
                {n}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

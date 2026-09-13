'use client';
import { isRoomLeader } from '@/lib/game/network/room-roles';
import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  ArrowUpRight,
  MapPin,
  RotateCcw,
  Pause,
  Play,
  Camera,
} from 'lucide-react';
import { useCityAudio } from '@/hooks/use-city-audio';
import { useGameLoop } from '@/hooks/use-game-loop';
import {
  gamepadPrompt,
  keyboardPrompt,
  type PadFrame,
} from '@/lib/game/input/gamepads';
import {
  freshCity,
  tickCity,
  resetCityCar,
  type CityState,
} from '@/lib/game/city/engine';
import { cityStops, type CityMission } from '@/lib/game/city/layout';
import CityScene from './scene';
import CityMinimap from './minimap';
import { CITY_CAMERA_MODES, type CityCameraMode } from './camera';
import { useGameInspection } from '@/hooks/use-game-inspection';
import { useRoom } from '@/hooks/use-room';
import {
  closeRoomSession,
  roomActive,
  roomFresh,
} from '@/lib/game/network/room-client';
import { roomCommand, tickRoomCity } from '@/lib/game/network/room-game';
const disconnectNetwork = () => {
  void closeRoomSession();
};
const isNetworkDrive = roomActive;
const passNetworkWheel = () => roomCommand({ kind: 'wheel' });
import { useControlSettings } from '@/hooks/use-control-settings';

export default function CityHub({
  game: savedGame,
  sound,
  onPlay,
  onStories,
  players,
  onPlayers,
  onGamepads,
  onControls,
  onFullscreen,
}: {
  game: RefObject<CityState>;
  sound: boolean;
  onPlay: (story: CityMission) => void;
  onStories: () => void;
  onControls: () => void;
  onFullscreen: () => void;
  players: number;
  onPlayers: (count: number) => void;
  onGamepads?: (status: Pick<PadFrame, 'assignments' | 'unsupported'>) => void;
}) {
  const game = useRef(savedGame.current);
  const room = useRoom();
  const network = {
    role: room.code
      ? isRoomLeader(room.world, room.slot)
        ? 'host'
        : 'guest'
      : null,
    status: room.status,
    driver: (room.world?.driver ?? 0) === 0 ? 'host' : 'guest',
  };
  const { settings } = useControlSettings();
  const shared = network.role !== null;
  const canManage = !shared || isRoomLeader(room.world, room.slot);
  const canStart =
    !shared ||
    (canManage &&
      roomFresh() &&
      room.roster.length >= 2 &&
      room.roster.every((p) => p.connected));
  const canResume = canManage && (!shared || roomFresh());
  const isDriver = !shared || (room.world?.driver ?? 0) === room.slot;
  const [view, setView] = useState(freshCity);
  useCityAudio(sound, view);
  const [target, setTarget] = useState(0);
  const [cameraMode, setCameraMode] = useState<CityCameraMode>('drive');
  const cameraNames = { drive: 'За машиной', map: 'Весь город', faces: 'Лица' };
  const nextCamera =
    CITY_CAMERA_MODES[
      (CITY_CAMERA_MODES.indexOf(cameraMode) + 1) % CITY_CAMERA_MODES.length
    ];
  const cycleCamera = () => setCameraMode(nextCamera);
  const [pauseSelected, setPauseSelected] = useState(0);
  const pauseButtons = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (view.paused)
      pauseButtons.current[pauseSelected]?.scrollIntoView({ block: 'nearest' });
  }, [pauseSelected, view.paused]);
  const [pads, setPads] = useState<
    Pick<PadFrame, 'assignments' | 'unsupported'>
  >({ assignments: [], unsupported: [] });
  const keys = useRef(new Set<string>());
  useGameInspection(game, keys);
  const pause = () => {
    if (isNetworkDrive()) {
      const resume = document.hasFocus() && game.current.paused;
      if (resume && !canResume) return;
      roomCommand({ kind: resume ? 'resume' : 'pause' });
      keys.current.clear();
      return;
    }
    game.current.paused = !game.current.paused;
    setPauseSelected(0);
    keys.current.clear();
    setView({ ...game.current });
  };
  const launch = () => {
    const s = game.current,
      stop = cityStops[s.nearStop];
    if (canStart && stop?.mission && s.speed < 2.3) {
      if (!shared) {
        s.vx = s.vz = s.speed = 0;
        s.paused = true;
      }
      onPlay(stop.mission);
    }
  };
  const resetCar = () => {
    if (!canManage) return;
    keys.current.clear();
    if (shared) roomCommand({ kind: 'restart' });
    else {
      resetCityCar(game.current);
      setView({ ...game.current });
    }
  };
  const pauseItems = [
    {
      id: 'resume',
      label: !canManage
        ? 'Продолжит ведущий'
        : !canResume
          ? 'Ждём связи с комнатой'
          : 'Продолжить поездку',
      disabled: !canResume,
    },
    { id: 'stories', label: 'Все истории', disabled: shared },
    { id: 'players', label: `Игроков в истории: ${players}`, disabled: shared },
    { id: 'target', label: `Куда едем: ${cityStops[target].title}` },
    {
      id: 'camera',
      label: `Камера: ${cameraNames[cameraMode]} → ${cameraNames[nextCamera]}`,
    },
    {
      id: 'reset',
      label: 'Вернуть машину на дорогу',
      disabled: shared && network.role === 'guest',
    },
    { id: 'controls', label: 'Управление' },
    { id: 'fullscreen', label: 'Полный экран / окно' },
    ...(shared && network.role === 'host'
      ? [
          {
            id: 'wheel',
            label: 'Передать ведущего и руль следующему игроку',
            disabled: !roomFresh() || room.roster.length < 2,
          },
        ]
      : []),
    ...(shared
      ? [{ id: 'disconnect', label: 'Выйти из сетевой поездки' }]
      : []),
  ];
  const runPauseAction = (id: string) => {
    if (pauseItems.find((item) => item.id === id)?.disabled) return;
    switch (id) {
      case 'resume':
        pause();
        break;
      case 'stories':
        onStories();
        break;
      case 'players':
        onPlayers((players % 3) + 1);
        break;
      case 'target':
        setTarget((target + 1) % cityStops.length);
        break;
      case 'camera':
        cycleCamera();
        if (canResume) pause();
        break;
      case 'reset':
        resetCar();
        if (canResume) pause();
        break;
      case 'controls':
        onControls();
        break;
      case 'fullscreen':
        onFullscreen();
        break;
      case 'wheel':
        passNetworkWheel();
        pause();
        break;
      case 'disconnect':
        disconnectNetwork();
        break;
    }
  };
  const movePause = (direction: 'up' | 'down' | 'left' | 'right') => {
    if (
      (direction === 'left' || direction === 'right') &&
      pauseItems[pauseSelected].id === 'players' &&
      !shared
    ) {
      onPlayers(
        Math.max(1, Math.min(3, players + (direction === 'right' ? 1 : -1))),
      );
      return;
    }
    const delta = direction === 'up' || direction === 'left' ? -1 : 1;
    let next = pauseSelected;
    do {
      next = (next + delta + pauseItems.length) % pauseItems.length;
    } while (pauseItems[next].disabled);
    setPauseSelected(next);
  };
  useGameLoop({
    game,
    keys,
    tick: (s, dt, input, axes) => {
      if (shared) tickRoomCity(s, dt, input, axes);
      else tickCity(s, dt, input, axes);
      if (s.interaction) {
        const id = s.interaction as CityMission;
        s.interaction = null;
        s.paused = true;
        onPlay(id);
      }
    },
    action: () => {
      if (shared) launch();
    },
    pause,
    snapshot: setView,
    onGamepads: (status) => {
      setPads(status);
      onGamepads?.(status);
    },
    tickWhileBlocked: shared,
    inputPlayers: shared ? 1 : undefined,
    profile: 'city',
    padMenu: {
      enabled: view.paused,
      onMove: movePause,
      onConfirm: () => {
        const item = pauseItems[pauseSelected];
        if (!item.disabled) runPauseAction(item.id);
      },
      onBack: pause,
    },
  });
  const stop = cityStops[view.nearStop];
  const control = (key: Parameters<typeof keyboardPrompt>[1]) =>
    gamepadPrompt(pads, 0, key, 'city') || keyboardPrompt(0, key, 'city');
  return (
    <section
      className={`city-hub city-view-${cameraMode}`}
      aria-label="Поездка по Красноярску между историями"
    >
      <div className="city-world">
        <CityScene game={game} targetStop={target} cameraMode={cameraMode} />
        {cameraMode !== 'map' && !view.paused && (
          <CityMinimap
            state={view}
            target={target}
            onExpand={() => setCameraMode('map')}
          />
        )}
        <div className="city-heading">
          <span>КРАСНОЯРСК · КАРТА ИСТОРИЙ</span>
          <h1>{cityStops[target].title}</h1>
          <p>
            {Math.round(
              Math.hypot(
                view.x - cityStops[target].x,
                view.z - cityStops[target].z,
              ),
            )}{' '}
            м по прямой
          </p>
        </div>
        <div className="city-actions">
          <button
            aria-label={`Камера: ${cameraNames[cameraMode]}. Показать: ${cameraNames[nextCamera]}`}
            title={`Следующий вид: ${cameraNames[nextCamera]}`}
            onClick={cycleCamera}
          >
            <Camera size={16} />
            {cameraNames[cameraMode]}
          </button>
          <button disabled={shared} onClick={onStories}>
            Все истории <ArrowUpRight size={14} />
          </button>
          <button
            aria-label="Вернуть машину на дорогу"
            title={
              canManage
                ? 'Вернуть машину на дорогу'
                : 'Машину возвращает ведущий'
            }
            disabled={shared && network.role === 'guest'}
            onClick={resetCar}
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
            {stop.mission && canManage && (
              <button
                onClick={launch}
                disabled={view.speed >= 2.3 || !canStart}
              >
                <kbd>{control('action')}</kbd>
                {view.speed >= 2.3
                  ? 'Остановись'
                  : shared
                    ? 'Начать вместе'
                    : 'Начать историю'}
              </button>
            )}
            {shared && stop.mission && !canManage && (
              <span>Историю запускает ведущий</span>
            )}
          </div>
        )}
        {settings.showWorldPrompts && isDriver && !stop && !view.paused && (
          <div className="city-drive-hints">
            <span>
              <kbd>{control('vertical')}</kbd> газ / тормоз
            </span>
            <span>
              <kbd>{control('horizontal')}</kbd> руль
            </span>
            <span>
              <kbd>{control('secondary')}</kbd> сильнее занос
            </span>
          </div>
        )}
        {view.paused && (
          <div className="city-pause">
            <section className="city-pause-menu" aria-label="Пауза на карте">
              <h2>Куда дальше?</h2>
              {pauseItems.map((item, i) => (
                <button
                  key={item.id}
                  ref={(node) => {
                    pauseButtons.current[i] = node;
                  }}
                  className={i === pauseSelected ? 'pad-selected' : ''}
                  disabled={item.disabled}
                  onClick={() => runPauseAction(item.id)}
                  onFocus={() => setPauseSelected(i)}
                >
                  {item.id === 'resume' && <Play size={15} />}
                  {item.label}
                </button>
              ))}
              {!canManage && (
                <small>Пауза общая. Продолжить поездку может ведущий.</small>
              )}
              <small>
                ↑↓ / стик — выбрать · E / A / × — подтвердить · Esc / B / ○ —
                назад
              </small>
            </section>
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
                ? `Онлайн · руль ${(room.world?.driver ?? 0) === room.slot ? 'у тебя' : 'у друга'}`
                : network.status === 'failed'
                  ? 'Нет связи · выйди из поездки, чтобы играть локально'
                  : 'Ждём связь с комнатой…'}
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

'use client';
import { isRoomLeader } from '@/lib/game/network/room-roles';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  ArrowUpRight,
  MapPin,
  RotateCcw,
  Pause,
  Play,
  Camera,
  Map as MapIcon,
} from 'lucide-react';
import { useCityAudio } from '@/hooks/use-city-audio';
import { useGameLoop } from '@/hooks/use-game-loop';
import {
  gamepadPrompt,
  keyboardPrompt,
  padButtonLabel,
  readGamepads,
  type PadFrame,
} from '@/lib/game/input/gamepads';
import {
  freshCity,
  tickCity,
  resetCityCar,
  teleportCityCar,
  type CityState,
} from '@/lib/game/city/engine';
import { cityStops, type CityMission } from '@/lib/game/city/layout';
import CityScene from './scene';
import { citySpeech } from '@/lib/game/city/dialogue';
import { SpeechBubble } from '../world/speech-bubble';
import CityMinimap from './minimap';
import { CityMap, type CityMapHandle } from './city-map';
import './city-map.css';
import { CITY_CAMERA_MODES, type CityCameraMode } from './camera';
import { useGameInspection } from '@/hooks/use-game-inspection';
import { useRoom } from '@/hooks/use-room';
import {
  closeRoomSession,
  roomActive,
  roomFresh,
  roomWorld,
  roomSnapshot,
} from '@/lib/game/network/room-client';
import { roomCommand, tickRoomCity } from '@/lib/game/network/room-game';
const disconnectNetwork = () => {
  void closeRoomSession();
};
const isNetworkDrive = roomActive;
const passNetworkWheel = () => roomCommand({ kind: 'wheel' });
import { useControlSettings } from '@/hooks/use-control-settings';
import {
  canonicalKeyForPhysical,
  resolvePadGlyphBrand,
} from '@/lib/game/input/settings';
import { isControlInputBlocked } from '@/lib/game/input/settings-store';

export default function CityHub({
  game: savedGame,
  sound,
  onPlay,
  onStories,
  onRaces,
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
  onRaces: () => void;
  onControls: () => void;
  onFullscreen: () => void;
  players: number;
  onPlayers: (count: number) => void;
  onGamepads?: (status: Pick<PadFrame, 'assignments' | 'unsupported'>) => void;
}) {
  const game = useRef(savedGame.current);
  const speechRef = useRef<HTMLOutputElement>(null);
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
  const [target, setTarget] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  const mapOpenRef = useRef(false);
  const mapControl = useRef<CityMapHandle>(null);
  const [travel, setTravel] = useState<'idle' | 'out' | 'in'>('idle');
  const [mapMessage, setMapMessage] = useState('');
  const seenTravelRevision = useRef<number | null>(null);
  const pendingTravel = useRef<{ index: number; revision: number } | null>(
    null,
  );
  const mapBusy = travel !== 'idle';
  useCityAudio(sound && !mapOpen && !mapBusy, view);
  const openMap = useCallback(() => {
    if (mapBusy) return;
    keys.current.clear();
    mapOpenRef.current = true;
    setMapOpen(true);
    setMapMessage('');
  }, [mapBusy]);
  const closeMap = useCallback(() => {
    if (mapBusy) return;
    keys.current.clear();
    mapOpenRef.current = false;
    setMapOpen(false);
  }, [mapBusy]);
  const navigateTo = (index: number) => {
    setTarget(index);
    closeMap();
  };
  const travelTo = (index: number) => {
    if (!canManage || mapBusy || (shared && !roomFresh())) return;
    keys.current.clear();
    pendingTravel.current = {
      index,
      revision: game.current.travelRevision ?? 0,
    };
    setMapMessage('');
    setTravel('out');
  };
  const completeTravel = () => {
    pendingTravel.current = null;
    keys.current.clear();
    mapOpenRef.current = false;
    setMapOpen(false);
    setTravel('in');
  };
  useEffect(() => {
    if (travel !== 'out') return;
    const commit = window.setTimeout(() => {
      const pending = pendingTravel.current;
      if (!pending) return;
      const stop = cityStops[pending.index];
      if (isNetworkDrive()) {
        const world = roomWorld();
        if (
          !world ||
          world.scene !== 'city' ||
          !roomFresh() ||
          !isRoomLeader(world, roomSnapshot().slot)
        ) {
          pendingTravel.current = null;
          setTravel('idle');
          setMapMessage('Перемещение доступно ведущему при активной связи.');
          return;
        }
        roomCommand({ kind: 'city-travel', value: stop.id });
      } else if (teleportCityCar(game.current, stop.id)) {
        setTarget(pending.index);
        setView({ ...game.current });
        completeTravel();
      } else {
        pendingTravel.current = null;
        setTravel('idle');
        setMapMessage(
          'Не удалось найти свободный подъезд. Выбери другое место.',
        );
      }
    }, 220);
    const deadline = window.setTimeout(() => {
      if (pendingTravel.current) {
        pendingTravel.current = null;
        setTravel('idle');
        setMapMessage(
          'Ждём подтверждения комнаты. Попробуй после восстановления связи.',
        );
      }
    }, 7000);
    return () => {
      window.clearTimeout(commit);
      window.clearTimeout(deadline);
    };
  }, [travel]);
  useEffect(() => {
    const pending = pendingTravel.current;
    const revision = view.travelRevision ?? 0;
    if (revision !== seenTravelRevision.current) {
      const wasInitialized = seenTravelRevision.current !== null;
      seenTravelRevision.current = revision;
      // Passengers receive the same authoritative arrival without initiating it.
      if (wasInitialized && !pending && travel === 'idle') setTravel('in');
    }
    if (travel === 'out' && pending && revision > pending.revision) {
      setTarget(pending.index);
      completeTravel();
    }
  }, [view.travelRevision, travel]);
  useEffect(() => {
    if (travel !== 'in') return;
    const timer = window.setTimeout(() => setTravel('idle'), 240);
    return () => window.clearTimeout(timer);
  }, [travel]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.code !== 'KeyM' ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isControlInputBlocked() ||
        canonicalKeyForPhysical(settings, 'KeyM', 'city') ||
        (event.target instanceof HTMLElement &&
          event.target.closest(
            'input,textarea,select,[contenteditable="true"]',
          ))
      )
        return;
      event.preventDefault();
      if (mapOpenRef.current) closeMap();
      else openMap();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [settings, closeMap, openMap]);
  const [cameraMode, setCameraMode] = useState<CityCameraMode>('drive');
  const cameraNames = {
    drive: 'За машиной',
    cruise: 'Низкая камера',
    map: 'Весь город',
    faces: 'Лица',
  };
  const nextCamera =
    CITY_CAMERA_MODES[
      (CITY_CAMERA_MODES.indexOf(cameraMode) + 1) % CITY_CAMERA_MODES.length
    ];
  const cycleCamera = () =>
    setCameraMode(
      (current) =>
        CITY_CAMERA_MODES[
          (CITY_CAMERA_MODES.indexOf(current) + 1) % CITY_CAMERA_MODES.length
        ],
    );
  const cameraPad = useRef({
    id: '',
    held: false,
    ready: false,
    mapHeld: false,
    mapReady: false,
  });
  const cameraKeyboard = !canonicalKeyForPhysical(settings, 'KeyC', 'city');
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.code !== 'KeyC' ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        !cameraKeyboard ||
        mapOpenRef.current ||
        mapBusy ||
        isControlInputBlocked()
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          'input, textarea, select, [contenteditable="true"]',
        )
      )
        return;
      event.preventDefault();
      setCameraMode(
        (current) =>
          CITY_CAMERA_MODES[
            (CITY_CAMERA_MODES.indexOf(current) + 1) % CITY_CAMERA_MODES.length
          ],
      );
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [cameraKeyboard, mapBusy]);
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
    if (mapOpenRef.current || mapBusy) {
      if (document.hasFocus()) closeMap();
      return;
    }
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
    if (mapOpenRef.current || mapBusy) return;
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
    { id: 'races', label: 'Гонки', disabled: !canManage },
    { id: 'players', label: `Игроков в истории: ${players}`, disabled: shared },
    { id: 'map', label: 'Карта города и перемещение' },
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
      case 'races':
        onRaces();
        break;
      case 'stories':
        onStories();
        break;
      case 'players':
        onPlayers((players % 3) + 1);
        break;
      case 'map':
        openMap();
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
      // The unused top face button changes only this client's camera, including
      // when another online player owns the wheel. Hotplug requires a release.
      const pad =
        !s.paused &&
        !document.hidden &&
        document.hasFocus() &&
        !isControlInputBlocked()
          ? readGamepads().find((p) => p?.connected && p.mapping === 'standard')
          : null;
      const memory = cameraPad.current;
      const padId = pad ? `${pad.index}:${pad.id}` : '';
      if (memory.id !== padId)
        Object.assign(memory, {
          id: padId,
          ready: false,
          held: false,
          mapHeld: false,
          mapReady: false,
        });
      const held =
        !!pad &&
        (!!pad.buttons[3]?.pressed || (pad.buttons[3]?.value ?? 0) > 0.5);
      if (!held) memory.ready = true;
      if (
        pad &&
        memory.ready &&
        held &&
        !memory.held &&
        !mapOpenRef.current &&
        !mapBusy
      )
        cycleCamera();
      const mapHeld =
        !!pad &&
        (!!pad.buttons[8]?.pressed || (pad.buttons[8]?.value ?? 0) > 0.5);
      if (!mapHeld) memory.mapReady = true;
      if (pad && memory.mapReady && mapHeld && !memory.mapHeld) {
        if (mapOpenRef.current) closeMap();
        else openMap();
      }
      memory.mapHeld = mapHeld;
      memory.held = held;
      if (shared)
        tickRoomCity(
          s,
          dt,
          mapOpenRef.current || mapBusy ? new Set() : input,
          mapOpenRef.current || mapBusy ? { throttle: 0, steer: 0 } : axes,
        );
      else if (!mapOpenRef.current && !mapBusy) tickCity(s, dt, input, axes);
      if (s.interaction && !mapOpenRef.current && !mapBusy) {
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
      enabled: mapOpen || mapBusy || view.paused,
      onMove: (direction) => {
        if (mapBusy) return;
        if (mapOpen) mapControl.current?.move(direction);
        else movePause(direction);
      },
      onConfirm: () => {
        if (mapBusy) return;
        if (mapOpen) {
          mapControl.current?.confirm();
          return;
        }
        const item = pauseItems[pauseSelected];
        if (!item.disabled) runPauseAction(item.id);
      },
      onBack: () => {
        if (mapBusy) return;
        if (mapOpen) closeMap();
        else pause();
      },
    },
  });
  const stop = cityStops[view.nearStop];
  const speech = citySpeech(view);
  const control = (key: Parameters<typeof keyboardPrompt>[1]) =>
    gamepadPrompt(pads, 0, key, 'city') || keyboardPrompt(0, key, 'city');
  const cameraAssignment = pads.assignments.find((pad) => pad.player === 0);
  const cameraShortcut = cameraAssignment
    ? padButtonLabel(
        resolvePadGlyphBrand(settings.padGlyphs[0], cameraAssignment.brand),
        3,
      )
    : cameraKeyboard
      ? 'C'
      : '';
  return (
    <section
      className={`city-hub city-view-${cameraMode}${mapOpen ? ' city-map-open' : ''}`}
      aria-label="Поездка по Красноярску между историями"
    >
      <div className="city-world">
        <CityScene
          game={game}
          targetStop={target}
          cameraMode={cameraMode}
          speechRef={speechRef}
        />
        <SpeechBubble
          bubbleRef={speechRef}
          speaker={speech?.speaker ?? ''}
          text={speech?.text ?? ''}
          visible={!!speech}
        />
        {!mapOpen && !view.paused && (
          <CityMinimap state={view} target={target} onExpand={openMap} />
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
            onClick={openMap}
            aria-label="Открыть карту города"
            aria-keyshortcuts="M"
          >
            <MapIcon size={16} />
            Карта <kbd>M</kbd>
          </button>
          <button
            aria-label={`Камера: ${cameraNames[cameraMode]}. Показать: ${cameraNames[nextCamera]}`}
            title={`Следующий вид: ${cameraNames[nextCamera]}${cameraShortcut ? ` · ${cameraShortcut}` : ''}`}
            aria-keyshortcuts={cameraKeyboard ? 'C' : undefined}
            onClick={cycleCamera}
          >
            <Camera size={16} />
            {cameraNames[cameraMode]}
            {cameraShortcut && <kbd>{cameraShortcut}</kbd>}
          </button>
          <button disabled={!canManage} onClick={onRaces}>
            Гонки
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
        {view.paused && !mapOpen && (
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
        {mapOpen && (
          <CityMap
            ref={mapControl}
            state={view}
            target={target}
            canTravel={canManage && (!shared || roomFresh())}
            busy={mapBusy}
            message={mapMessage}
            travelReason={
              !canManage
                ? 'Перемещает машину ведущий комнаты. GPS можно выбрать самому.'
                : 'Ждём связь с комнатой.'
            }
            onClose={closeMap}
            onNavigate={navigateTo}
            onTravel={travelTo}
          />
        )}
        <div
          className={`city-travel-fade ${travel === 'out' ? 'is-out' : travel === 'in' ? 'is-in' : ''}`}
          aria-hidden={travel === 'idle'}
        >
          {travel === 'out' && 'Перемещаемся…'}
        </div>
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

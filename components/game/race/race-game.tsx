'use client';
import {
  useRef,
  useState,
  useEffect,
  useMemo,
  type CSSProperties,
} from 'react';
import {
  Flag,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  ArrowLeft,
  Maximize,
} from 'lucide-react';
import { useGameLoop } from '@/hooks/use-game-loop';
import { useControlSettings } from '@/hooks/use-control-settings';
import { useCityAudio } from '@/hooks/use-city-audio';
import { useRaceCues } from '@/hooks/use-race-cues';
import {
  freshRace,
  changeLocalRacers,
  configureCar,
  startRace,
  returnToLobby,
  resetReady,
  tickRace,
  raceStandings,
  RACE_TIME_LIMIT,
} from '@/lib/game/race/engine';
import { raceCourse } from '@/lib/game/race/course';
import { CAR_COLORS, VEHICLES, type VehicleId } from '@/lib/game/race/vehicles';
import type { RaceState, Racer } from '@/lib/game/race/types';
import {
  gamepadPrompt,
  keyboardPrompt,
  type PadFrame,
} from '@/lib/game/input/gamepads';
import RaceScene from './scene';
import { useRoom } from '@/hooks/use-room';
import { roomCommand, tickRoomRace } from '@/lib/game/network/room-game';
import {
  raceLobbyConfirmed,
  roomFresh,
  roomWorld,
} from '@/lib/game/network/room-client';
import { isRoomLeader } from '@/lib/game/network/room-roles';
import type { RoomCommand } from '@/lib/game/network/room-types';
import type { ColorId } from '@/lib/game/race/vehicles';
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}.${Math.floor((seconds % 1) * 10)}`;
function Minimap({ state, racer }: { state: RaceState; racer: Racer }) {
  const course = raceCourse(state.trackId);
  const { x, z, w, h, scale, path } = useMemo(() => {
    const xs = course.points.map((p) => p.x),
      zs = course.points.map((p) => p.z);
    const x = Math.min(...xs) - 12,
      z = Math.min(...zs) - 12;
    const w = Math.max(...xs) - x + 12,
      h = Math.max(...zs) - z + 12;
    return {
      x,
      z,
      w,
      h,
      scale: Math.max(w, h) / 200,
      path: course.points
        .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.z.toFixed(1)}`)
        .join(' '),
    };
  }, [course]);
  const gate = course.gates[racer.nextGate];
  return (
    <svg
      className="race-minimap"
      viewBox={`${x} ${z} ${w} ${h}`}
      aria-label="Трасса и участники"
    >
      <path
        d={path}
        fill="none"
        stroke="#142c30"
        strokeWidth={7 * scale}
        strokeLinejoin="round"
      />
      <path
        d={path}
        fill="none"
        stroke="#b7c8bd"
        strokeWidth={2 * scale}
        strokeLinejoin="round"
      />
      <circle cx={gate.x} cy={gate.z} r={5 * scale} fill="#eeff9d" />
      {state.racers.map((r) => (
        <circle
          key={r.id}
          cx={r.car.x}
          cy={r.car.z}
          r={(r.id === racer.id ? 4 : 3) * scale}
          stroke="#183438"
          strokeWidth={scale}
          fill={CAR_COLORS.find((c) => c.id === r.colorId)!.hex}
        />
      ))}
      <path
        d={`M0 ${-7 * scale} L${4 * scale} ${4 * scale} L0 ${2 * scale} L${-4 * scale} ${4 * scale}Z`}
        fill="white"
        transform={`translate(${racer.car.x} ${racer.car.z}) rotate(${(racer.car.heading * 180) / Math.PI})`}
      />
    </svg>
  );
}
function RaceAudio({
  racer,
  enabled,
  mix,
}: {
  racer: Racer;
  enabled: boolean;
  mix: number;
}) {
  useCityAudio(
    enabled,
    { ...racer.car },
    racer.vehicleId === 'amg-one' ? 'v6' : 'v8',
    mix,
  );
  return null;
}
export default function RaceGame({
  sound,
  online = false,
  externalMenuOpen = false,
  onExit,
  onControls,
  onFullscreen,
  onGamepads,
  onLocalPlayers,
}: {
  sound: boolean;
  onLocalPlayers?: (count: number) => void;
  online?: boolean;
  externalMenuOpen?: boolean;
  onExit: () => void;
  onControls: () => void;
  onFullscreen: () => void;
  onGamepads?: (p: Pick<PadFrame, 'assignments' | 'unsupported'>) => void;
}) {
  const room = useRoom(),
    slot = online ? room.slot : 0;
  const canManage = !online || isRoomLeader(room.world, room.slot);
  const [view, setView] = useState<RaceState>(() =>
    online && roomWorld()?.scene === 'race'
      ? (structuredClone(roomWorld()!.state) as unknown as RaceState)
      : freshRace(),
  );
  const game = useRef(view),
    keys = useRef(new Set<string>()),
    menu = useRef<HTMLDivElement>(null);
  const localCount = Math.max(
    1,
    view.racers.filter((r) => r.memberSlot === slot).length,
  ) as 1 | 2;
  useEffect(() => {
    onLocalPlayers?.(localCount);
  }, [localCount, onLocalPlayers]);
  const [pads, setPads] = useState<
    Pick<PadFrame, 'assignments' | 'unsupported'>
  >({ assignments: [], unsupported: [] });
  const { settings } = useControlSettings();
  useRaceCues(sound, view, slot);
  const refresh = () => setView({ ...game.current });
  const pause = () => {
    if (['countdown', 'racing'].includes(game.current.phase)) {
      if (online) {
        if (!game.current.paused || canManage)
          roomCommand({ kind: game.current.paused ? 'resume' : 'pause' });
      } else game.current.paused = !game.current.paused;
      keys.current.clear();
      refresh();
    }
  };
  const course = raceCourse(view.trackId),
    local = view.racers.filter((r) => r.memberSlot === slot);
  useEffect(() => {
    if (externalMenuOpen && !game.current.paused) {
      if (online) roomCommand({ kind: 'pause' });
      else game.current.paused = true;
    }
  }, [externalMenuOpen, online]);
  const lobby = () => {
    if (online) roomCommand({ kind: 'race-lobby' });
    else {
      returnToLobby(game.current);
      refresh();
    }
  };
  const editCar = (r: Racer, vehicleId: VehicleId, colorId: ColorId) => {
    if (online)
      roomCommand({
        kind: 'race-car',
        localIndex: r.localIndex,
        vehicleId,
        colorId,
      });
    else {
      configureCar(game.current, slot, r.localIndex, vehicleId, colorId);
      refresh();
    }
  };
  const menuEnabled =
    view.phase === 'lobby' || view.phase === 'result' || view.paused;
  const menuItems = () =>
    Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled)',
      ) ?? [],
    );
  useGameLoop({
    game,
    keys,
    profile: 'race',
    inputPlayers: localCount,
    tickWhileBlocked: true,
    action: () => {},
    pause,
    snapshot: setView,
    tick: (s, dt, _keys, _drive, inputs) =>
      online
        ? tickRoomRace(s, dt, inputs ?? [])
        : tickRace(
            s,
            dt,
            new Map(
              s.racers
                .filter((r) => r.memberSlot === slot)
                .map((r, i) => [r.id, inputs![i]]),
            ),
            raceCourse(s.trackId),
          ),
    onGamepads: (p) => {
      setPads(p);
      onGamepads?.(p);
    },
    padMenu: {
      enabled: menuEnabled,
      onMove: (direction) => {
        const items = menuItems(),
          index = items.indexOf(document.activeElement as HTMLButtonElement),
          delta = direction === 'up' || direction === 'left' ? -1 : 1;
        items[(index + delta + items.length) % items.length]?.focus();
      },
      onConfirm: () => {
        const items = menuItems();
        (items.includes(document.activeElement as HTMLButtonElement)
          ? (document.activeElement as HTMLButtonElement)
          : items[0]
        )?.click();
      },
      onBack: () => (view.phase === 'lobby' ? onExit() : pause()),
    },
  });
  const configure = (fn: (s: RaceState) => void, command: RoomCommand) => {
    if (online) {
      roomCommand(command);
      return;
    }
    fn(game.current);
    resetReady(game.current);
    refresh();
  };
  const standings = raceStandings(view, course),
    configuration = `${view.trackId}:${view.racers.map((r) => `${r.id}/${r.vehicleId}/${r.colorId}`).join(',')}`;
  const prompt = (
    i: number,
    c: 'vertical' | 'horizontal' | 'secondary' | 'action',
  ) => gamepadPrompt(pads, i, c, 'race') ?? keyboardPrompt(i, c, 'race');
  return (
    <section className="race-stage" aria-label="Гонки">
      {local.map((r) => (
        <RaceAudio
          key={`${r.id}/${r.vehicleId}/${local.length}`}
          racer={r}
          enabled={
            sound &&
            r.finishTime === null &&
            !view.paused &&
            ['countdown', 'racing'].includes(view.phase)
          }
          mix={local.length === 2 ? 0.6 : 1}
        />
      ))}
      <RaceScene
        game={game}
        localIds={local.map((r) => r.id)}
        configuration={configuration}
      />
      {view.phase !== 'lobby' &&
        local.map((r, i) => (
          <div
            className="race-player-view"
            key={r.id}
            style={{
              left: `${(i * 100) / local.length}%`,
              width: `${100 / local.length}%`,
            }}
          >
            <div className="race-ranking">
              <span>
                {view.mode === 'drift' ? 'ДРИФТ' : 'ГОНКА'} · {course.name}
              </span>
              <ol>
                {standings.map((p, index) => (
                  <li key={p.id} data-self={p.id === r.id}>
                    <b>{index + 1}</b>
                    <i
                      style={{
                        background: CAR_COLORS.find((c) => c.id === p.colorId)!
                          .hex,
                      }}
                    />
                    <span>{p.name}</span>
                    <strong>
                      {view.mode === 'drift'
                        ? p.score.toLocaleString('ru-RU')
                        : p.finishTime !== null
                          ? 'Финиш'
                          : `${Math.min(p.laps + 1, view.laps)}/${view.laps}`}
                    </strong>
                  </li>
                ))}
              </ol>
            </div>
            <div className="race-lap">
              <b>
                {Math.min(r.laps + 1, view.laps)}
                <small> / {view.laps}</small>
              </b>
              <span>{time(view.elapsed)}</span>
              {RACE_TIME_LIMIT - view.elapsed < 60 &&
                view.phase === 'racing' && (
                  <small>
                    До итога {Math.ceil(RACE_TIME_LIMIT - view.elapsed)} с
                  </small>
                )}
            </div>
            <Minimap state={view} racer={r} />
            <div className="race-speed">
              <strong>{Math.round(r.car.speed * 3.6)}</strong>
              <span>км/ч · {r.car.powertrain?.gear ?? 1}</span>
            </div>
            {view.mode === 'drift' && r.combo >= 1 && (
              <output className="race-combo">
                <b>+{Math.floor(r.combo).toLocaleString('ru-RU')}</b>
                <span>в заносе</span>
              </output>
            )}
            {r.feedback && view.elapsed < r.feedbackUntil && (
              <output
                className="race-feedback"
                key={`${r.feedback}/${r.feedbackUntil}`}
              >
                {r.feedback}
              </output>
            )}
            {settings.showWorldPrompts && (
              <div className="race-input-hints">
                <span>
                  <kbd>{prompt(i, 'vertical')}</kbd> газ / тормоз
                </span>
                <span>
                  <kbd>{prompt(i, 'secondary')}</kbd> дрифт
                </span>
                <span>
                  <kbd>{prompt(i, 'action')}</kbd> на трассу
                </span>
              </div>
            )}
            {view.phase === 'countdown' && (
              <output
                className="race-countdown"
                key={Math.ceil(view.countdown)}
              >
                {Math.ceil(view.countdown)}
              </output>
            )}
          </div>
        ))}
      {!menuEnabled && (
        <div className="race-corner-controls">
          <button onClick={pause} aria-label="Пауза">
            <Pause size={18} />
          </button>
          <button onClick={onFullscreen} aria-label="На весь экран">
            <Maximize size={18} />
          </button>
        </div>
      )}
      {menuEnabled && (
        <div
          className={`race-menu-layer ${view.phase === 'lobby' ? 'race-lobby-layer' : ''}`}
          ref={menu}
        >
          {view.phase === 'lobby' ? (
            <div className="race-lobby">
              <header>
                <span>FRIENDSLOP · ГОНКИ</span>
                <button onClick={onExit} aria-label="Вернуться в город">
                  <ArrowLeft size={19} />
                </button>
              </header>
              <h1>Ну что, наперегонки?</h1>
              <div className="race-choice-row">
                {(['krasnoyarsk', 'nordschleife'] as const).map((id) => (
                  <button
                    key={id}
                    disabled={!canManage}
                    aria-pressed={view.trackId === id}
                    onClick={() =>
                      configure((s) => (s.trackId = id), {
                        kind: 'race-track',
                        value: id,
                      })
                    }
                  >
                    <Flag size={18} />
                    <span>
                      {raceCourse(id).name}
                      <small>
                        {id === 'krasnoyarsk' ? 'Два берега' : 'Зелёный ад'}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
              <div className="race-choice-row">
                {(['circuit', 'drift'] as const).map((mode) => (
                  <button
                    key={mode}
                    disabled={!canManage}
                    aria-pressed={view.mode === mode}
                    onClick={() =>
                      configure((s) => (s.mode = mode), {
                        kind: 'race-mode',
                        value: mode,
                      })
                    }
                  >
                    {mode === 'circuit' ? 'Кто первый' : 'На очки дрифта'}
                  </button>
                ))}
              </div>
              <div className="race-options">
                <span>Круги</span>
                {([1, 3] as const).map((n) => (
                  <button
                    key={n}
                    disabled={!canManage}
                    aria-pressed={view.laps === n}
                    onClick={() =>
                      configure((s) => (s.laps = n), {
                        kind: 'race-laps',
                        value: n,
                      })
                    }
                  >
                    {n}
                  </button>
                ))}
                <span>За этим экраном</span>
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    aria-pressed={localCount === n}
                    onClick={() => {
                      if (online) roomCommand({ kind: 'race-local', value: n });
                      else {
                        changeLocalRacers(game.current, slot, n, 'Игрок');
                        refresh();
                      }
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="race-garage">
                {local.map((r) => (
                  <section key={r.id}>
                    <strong>{r.name}</strong>
                    <div className="race-choice-row">
                      {(Object.keys(VEHICLES) as VehicleId[]).map((id) => (
                        <button
                          key={id}
                          aria-pressed={r.vehicleId === id}
                          onClick={() => {
                            editCar(r, id, r.colorId);
                          }}
                        >
                          {VEHICLES[id].name}
                        </button>
                      ))}
                    </div>
                    <small>{VEHICLES[r.vehicleId].character}</small>
                    <div className="race-colors">
                      {CAR_COLORS.map((c) => (
                        <button
                          key={c.id}
                          style={{ '--car-color': c.hex } as CSSProperties}
                          aria-label={`${r.name}: ${c.name}`}
                          aria-pressed={r.colorId === c.id}
                          disabled={view.racers.some(
                            (other) => other !== r && other.colorId === c.id,
                          )}
                          onClick={() => {
                            editCar(r, r.vehicleId, c.id);
                          }}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <footer>
                <button onClick={onControls} aria-label="Управление">
                  <Settings2 size={20} />
                </button>
                <button
                  className="race-start"
                  onClick={() => {
                    if (online)
                      roomCommand({
                        kind: 'race-ready',
                        revision: view.revision,
                      });
                    else {
                      game.current.racers.forEach((r) => (r.ready = true));
                      startRace(game.current, course);
                      refresh();
                    }
                  }}
                >
                  <Play size={18} />{' '}
                  {online
                    ? local.every((r) => r.ready)
                      ? 'Готовы'
                      : 'Готов'
                    : 'На старт'}
                </button>
                {online && canManage && (
                  <button
                    className="race-start"
                    disabled={
                      !roomFresh() ||
                      !raceLobbyConfirmed() ||
                      view.racers.some((r) => !r.ready)
                    }
                    onClick={() =>
                      roomCommand({
                        kind: 'race-start',
                        revision: view.revision,
                      })
                    }
                  >
                    Старт
                  </button>
                )}
              </footer>
              {online && (
                <div className="race-room-ready">
                  {room.roster.map((m) => (
                    <span key={m.id}>
                      {m.name} ·{' '}
                      {
                        view.racers.filter((r) => r.memberSlot === m.slot)
                          .length
                      }{' '}
                      {view.racers
                        .filter((r) => r.memberSlot === m.slot)
                        .every((r) => r.ready)
                        ? '✓'
                        : '…'}
                    </span>
                  ))}
                </div>
              )}
              {view.trackId === 'nordschleife' && (
                <small className="race-attribution">
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noreferrer"
                  >
                    © OpenStreetMap contributors
                  </a>{' '}
                  ·{' '}
                  <a
                    href="https://www.govdata.de/dl-de/by-2-0"
                    target="_blank"
                    rel="noreferrer"
                  >
                    ©GeoBasis-DE / LVermGeoRP 2026 · Daten bearbeitet
                  </a>
                </small>
              )}
            </div>
          ) : view.phase === 'result' ? (
            <div className="race-results">
              <span>ФИНИШ · {course.name}</span>
              <h1>{standings[0].name} забирает заезд</h1>
              <ol>
                {standings.map((r, i) => (
                  <li key={r.id}>
                    <b>{i + 1}</b>
                    <span>
                      {r.name}
                      <small>{VEHICLES[r.vehicleId].name}</small>
                    </span>
                    <strong>
                      {view.mode === 'drift'
                        ? `${r.score} очков`
                        : r.finishTime === null
                          ? 'Не финишировал'
                          : time(r.finishTime)}
                    </strong>
                  </li>
                ))}
              </ol>
              <div className="race-choice-row">
                <button disabled={!canManage} onClick={lobby}>
                  <RotateCcw size={17} /> Ещё заезд
                </button>
                <button onClick={onExit}>В город</button>
              </div>
            </div>
          ) : (
            <div className="race-pause">
              <span>ПАУЗА</span>
              <h1>Моторы подождут.</h1>
              {online && room.message && <p>{room.message}</p>}
              <button
                className="race-start"
                disabled={!canManage || (online && !roomFresh())}
                onClick={pause}
              >
                <Play size={18} /> Продолжить
              </button>
              <button onClick={onControls}>Управление</button>
              <button onClick={onFullscreen}>На весь экран</button>
              <button disabled={!canManage} onClick={lobby}>
                Заново выбрать заезд
              </button>
              <button onClick={onExit}>В город</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

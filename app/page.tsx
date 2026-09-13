'use client';
import { isRoomLeader } from '@/lib/game/network/room-roles';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Gamepad2,
  Map,
  Radio,
  Maximize,
  Minimize,
  Play,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import Scene from '@/components/game/screen/scene';
import { FpsMeter } from '@/components/game/fps-meter';
import { EveningResults } from '@/components/game/evening-results';
import CleanScene from '@/components/game/clean/scene';
import CityHub from '@/components/game/city/city-hub';
import { freshCity } from '@/lib/game/city/engine';
import MovingGame from '@/components/game/moving/moving-game';
import MovingScene from '@/components/game/moving/scene';
import { freshMoving } from '@/lib/game/moving/engine';
import { ControlSettings } from '@/components/game/input/control-settings';
import { NetworkDialog } from '@/components/game/network/network-dialog';
import { useRoom } from '@/hooks/use-room';
import {
  initializeRoomCity,
  roomCommand,
  roomRoleName,
} from '@/lib/game/network/room-game';
import ScreenGame from '@/components/game/screen/screen-game';
import CleanGame from '@/components/game/clean/clean-game';
import { useGameFullscreen } from '@/hooks/use-game-fullscreen';
import { useDialogInput } from '@/hooks/use-dialog-input';
import { useGameResults } from '@/hooks/use-game-results';
import { registerGameTools } from '@/lib/game/webmcp';
import { useGamepadNavigation } from '@/hooks/use-gamepad-navigation';
import { type PadFrame } from '@/lib/game/input/gamepads';
import { freshClean } from '@/lib/game/clean/engine';
import { people } from '@/lib/game/presets';

type Story = 'screen' | 'clean' | 'moving';
const episodes = [
  {
    id: 'screen' as const,
    number: '01',
    tabTitle: 'Экран на полстены',
    kicker: 'КВАРТИРНЫЙ ВОПРОС',
    title: 'Да тут на полчаса.',
    line: 'Огромный экран. Одна отвёртка. Три специалиста.',
    duration: 'Три акта',
  },
  {
    id: 'clean' as const,
    number: '02',
    tabTitle: 'Чистый проход',
    kicker: 'БАЙКА ИЗ ДРУГОЙ РОТЫ',
    title: 'Без лишних вопросов.',
    line: 'Одна неловкая смена. Очень большая уборка.',
    duration: 'Три акта',
  },
  {
    id: 'moving' as const,
    number: '03',
    tabTitle: 'Переезд Ярика',
    kicker: 'ПЕРЕЕЗД ЯРИКА',
    title: 'Это ещё не всё.',
    line: 'Ярик, Настя, жёлтые сумки и ещё одна последняя вещь.',
    duration: 'Упаковать и вынести · 1–3 игрока',
  },
];
function Preview({ story }: { story: Story }) {
  const barracks = useRef(freshClean(3));
  const moving = useRef(freshMoving(3));
  return story === 'moving' ? (
    <MovingScene game={moving} />
  ) : story === 'screen' ? (
    <Scene preview />
  ) : (
    <CleanScene players={3} game={barracks} cameraMode="wide" />
  );
}
export default function Home() {
  const city = useRef(freshCity());
  const [localHubMode, setHubMode] = useState<'city' | 'stories'>('city');
  const [networkOpen, setNetworkOpen] = useState(false);
  const room = useRoom();
  const online = room.code.length > 0;
  useEffect(() => {
    initializeRoomCity();
  }, [room.status, room.world]);
  const hubMode = online ? 'city' : localHubMode;
  const [players, setPlayers] = useState(2),
    [sound, setSound] = useState(true),
    [localActive, setActive] = useState<Story | null>(null);
  const active = online
    ? room.world?.scene && room.world.scene !== 'city'
      ? room.world.scene
      : null
    : localActive;
  const storyPlayers = online
    ? Number(room.world?.state.players ?? room.capacity)
    : players;
  const [selected, setSelected] = useState(0),
    [panel, setPanel] = useState<'people' | 'scores' | 'controls' | null>(null);
  const [transition, setTransition] = useState<{
    target: Story | null;
    label: string;
  } | null>(null);
  const [pads, setPads] = useState<
    Pick<PadFrame, 'assignments' | 'unsupported'>
  >({ assignments: [], unsupported: [] });
  const [results, recordResult] = useGameResults();
  const runId =
    online && room.world
      ? `${room.code}:${room.world.scene}:${room.world.attempt ?? room.world.epoch}`
      : undefined;
  const finish = useCallback<typeof recordResult>(
    (result) => recordResult({ ...result, runId }),
    [recordResult, runId],
  );
  const fullscreen = useGameFullscreen();
  useDialogInput(panel === 'people' || panel === 'scores', () =>
    setPanel(null),
  );
  const episode = episodes[selected];
  const play = (story: Story) => {
    if (online) {
      if (isRoomLeader(room.world, room.slot))
        roomCommand({ kind: 'start-story', value: story });
      return;
    }
    if (!transition)
      setTransition({
        target: story,
        label: episodes.find((e) => e.id === story)!.kicker,
      });
  };
  const exit = () => {
    if (online) {
      if (isRoomLeader(room.world, room.slot)) roomCommand({ kind: 'exit' });
      else setNetworkOpen(true);
      return;
    }
    city.current.paused = false;
    city.current.interaction = null;
    setHubMode('city');
    setTransition({ target: null, label: 'ЕЩЁ ОДНА ИСТОРИЯ · ПОЕХАЛИ' });
  };
  const changeEpisode = (direction: number) =>
    setSelected((n) => (n + direction + episodes.length) % episodes.length);
  useGamepadNavigation({
    enabled: !active && !transition && hubMode === 'stories' && !networkOpen,
    onMove: (direction) => {
      if (panel) return;
      if (direction === 'left' || direction === 'right')
        changeEpisode(direction === 'left' ? -1 : 1);
      else
        setPlayers((n) =>
          Math.max(1, Math.min(3, n + (direction === 'up' ? 1 : -1))),
        );
    },
    onConfirm: () => {
      if (panel) setPanel(null);
      else play(episode.id);
    },
    onBack: () => {
      if (panel) setPanel(null);
      else {
        setHubMode('city');
        city.current.paused = false;
      }
    },
    onGamepads: setPads,
  });
  useEffect(() => {
    if (!transition) return;
    const change = window.setTimeout(() => {
      setActive(transition.target);
      window.scrollTo({ top: 0, behavior: 'instant' });
    }, 400);
    const done = window.setTimeout(() => setTransition(null), 950);
    return () => {
      window.clearTimeout(change);
      window.clearTimeout(done);
    };
  }, [transition]);
  useEffect(
    () =>
      registerGameTools((story, count) => {
        setPlayers(count);
        setActive(story);
      }),
    [],
  );
  const total = results.reduce((sum, r) => sum + r.score, 0);
  return (
    <main
      className={`shell${active || hubMode === 'city' ? ' play-viewport' : ''}${active ? ' game-active' : ' hub'}${!active && hubMode === 'city' ? ' city-mode' : ''}${fullscreen.mode === 'window' ? ' window-fullscreen' : ''}`}
    >
      <FpsMeter />
      <header className="topbar">
        <button
          className="hub-brand"
          onClick={() => {
            if (active) exit();
            else {
              city.current.paused = false;
              setHubMode('city');
            }
          }}
          aria-label="К выбору историй"
        >
          <span>↗</span>
          <span className="brand-title">НУ, С ВОЗВРАЩЕНИЕМ!</span>
        </button>
        <div className="top-actions">
          {!active && (
            <>
              <button
                className="icon-button"
                onClick={() => setPanel('people')}
                aria-label="Наша бригада"
              >
                <Users size={18} />
              </button>
              <button
                className="evening-score"
                onClick={() => setPanel('scores')}
                aria-label={`Счёт вечера: ${total}`}
              >
                <Trophy size={16} />
                {total.toLocaleString('ru')}
              </button>
              <button
                className="icon-button"
                onClick={() => setNetworkOpen(true)}
                aria-label="Онлайн-комната"
              >
                <Radio size={18} />
              </button>
              <button
                className="icon-button"
                onClick={() => setPanel('controls')}
                aria-label="Клавиатура и геймпады"
              >
                <Gamepad2 size={19} />
              </button>
            </>
          )}
          <button
            className="icon-button"
            aria-label={sound ? 'Выключить звук' : 'Включить звук'}
            onClick={() => setSound(!sound)}
          >
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            className="fullscreen-button"
            aria-label={
              fullscreen.active
                ? 'Выйти из полноэкранного режима'
                : 'На весь экран'
            }
            aria-pressed={fullscreen.active}
            title={
              fullscreen.mode === 'window'
                ? 'Игра развёрнута в окне. Esc — свернуть'
                : 'Полноэкранный режим · F'
            }
            onClick={fullscreen.toggle}
          >
            {fullscreen.active ? (
              <Minimize size={17} />
            ) : (
              <Maximize size={17} />
            )}
            <span>
              {fullscreen.mode === 'window'
                ? 'На всё окно'
                : fullscreen.active
                  ? 'Свернуть'
                  : 'На весь экран'}
            </span>
            <kbd>F</kbd>
          </button>
        </div>
      </header>
      {online && (
        <div className="room-strip">
          <button onClick={() => setNetworkOpen(true)}>
            Комната {room.code} ·{' '}
            {room.roster.filter((p) => p.connected).length}/{room.capacity}
          </button>
          <span>
            {room.message ||
              (active
                ? `Ты — ${roomRoleName(room.world, room.slot)}`
                : `Руль: ${room.roster.find((p) => p.slot === (room.world?.driver ?? 0))?.name ?? 'ведущий'}`)}
          </span>
          <small>{room.ping ? `${room.ping} мс` : 'Соединяемся…'}</small>
        </div>
      )}
      {online && !room.world ? (
        <div className="room-recovery" aria-live="polite">
          <span>ИСТОРИЯ ПОДОЖДЁТ</span>
          <h1>Возвращаемся в игру…</h1>
          <p>
            {room.message || 'Получаем сохранённый этап и твоего персонажа.'}
          </p>
          <button
            className="secondary-button"
            onClick={() => setNetworkOpen(true)}
          >
            Открыть комнату
          </button>
        </div>
      ) : active === 'screen' ? (
        <ScreenGame
          key={
            online ? `${room.code}-${room.world?.epoch}` : `screen-${players}`
          }
          players={storyPlayers}
          online={online}
          externalMenuOpen={networkOpen}
          sound={sound}
          onExit={exit}
          onFinish={finish}
          onNext={exit}
        />
      ) : active === 'clean' ? (
        <CleanGame
          key={
            online
              ? `${room.code}:clean:${room.world?.epoch}`
              : `clean-${players}`
          }
          players={storyPlayers}
          online={online}
          externalMenuOpen={networkOpen}
          sound={sound}
          onExit={exit}
          onFinish={finish}
          onNext={exit}
        />
      ) : active === 'moving' ? (
        <MovingGame
          key={
            online
              ? `${room.code}:moving:${room.world?.epoch}`
              : `moving-${players}`
          }
          players={storyPlayers}
          online={online}
          externalMenuOpen={networkOpen}
          sound={sound}
          onExit={exit}
          onFinish={finish}
          onNext={exit}
        />
      ) : hubMode === 'city' ? (
        <CityHub
          sound={sound}
          onControls={() => setPanel('controls')}
          onFullscreen={() => {
            fullscreen.toggle();
          }}
          onGamepads={setPads}
          game={city}
          onPlay={play}
          onStories={() => setHubMode('stories')}
          players={players}
          onPlayers={setPlayers}
        />
      ) : (
        <>
          <button
            className="hud-text-button"
            onClick={() => {
              city.current.paused = false;
              setHubMode('city');
            }}
          >
            <Map size={15} /> На карту города
          </button>
          <section className="hub-stage" aria-label="Выбор истории">
            <div className="hub-preview" key={episode.id}>
              <Preview story={episode.id} />
            </div>
            <div className="hub-shade" />
            <div className="hub-welcome">
              РОМА, МЫ ТЕБЯ ЖДАЛИ<span>Вот что ты пропустил.</span>
            </div>
            <div className="hub-story" key={`title-${episode.id}`}>
              <span className="hub-kicker">
                {episode.number} / {episode.kicker}
              </span>
              <h1>{episode.title}</h1>
              <p>{episode.line}</p>
              <button className="play-button" onClick={() => play(episode.id)}>
                <Play size={16} fill="currentColor" />
                Начать историю
                <ArrowRight size={18} />
              </button>
            </div>
            <div className="hub-team" aria-label="Сколько игроков">
              <span>БРИГАДА</span>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  aria-pressed={players === n}
                  onClick={() => setPlayers(n)}
                >
                  {n === 1 ? 'Один' : n === 2 ? 'Вдвоём' : 'Втроём'}
                  {players === n && <Check size={12} />}
                </button>
              ))}
            </div>
            <div className="hub-scene-caption">
              {pads.assignments.length
                ? 'A / × — начать · ↑↓ — бригада'
                : episode.duration}{' '}
              · {players === 1 ? 'Ты и напарник' : 'Один вечер на всех'}
            </div>
          </section>
          <nav className="episode-selector" aria-label="Истории вечера">
            <button
              className="icon-button"
              onClick={() => changeEpisode(-1)}
              aria-label="Предыдущая история"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="episode-tabs">
              {episodes.map((e, i) => (
                <button
                  key={e.id}
                  aria-pressed={selected === i}
                  onClick={() => setSelected(i)}
                >
                  <span>{e.number}</span>
                  {e.tabTitle}
                </button>
              ))}
            </div>
            <button
              className="icon-button"
              onClick={() => changeEpisode(1)}
              aria-label="Следующая история"
            >
              <ArrowRight size={18} />
            </button>
            <span className="coming-story">Mustang ждёт на карте города</span>
          </nav>
        </>
      )}
      <Dialog
        open={panel !== null && panel !== 'controls'}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <DialogContent className="help-dialog hub-dialog">
          <DialogTitle>
            {panel === 'people'
              ? 'Вся бригада'
              : panel === 'scores'
                ? 'Счёт вечера'
                : 'На одном диване'}
          </DialogTitle>
          <DialogDescription>
            {panel === 'people'
              ? 'Ярослав, Никита и Рома.'
              : panel === 'scores'
                ? 'Каждое законченное прохождение добавляется к общему счёту.'
                : 'Одна клавиатура, геймпады или всё вместе.'}
          </DialogDescription>
          {panel === 'people' && (
            <div className="hub-people">
              {people.map((p, i) => (
                <div key={p.id}>
                  <span
                    className="person-initial"
                    style={{ background: p.color }}
                  >
                    {p.name[0]}
                  </span>
                  <strong>{p.name}</strong>
                  <small>{i === 2 ? 'Ждём домой' : p.role}</small>
                </div>
              ))}
            </div>
          )}
          {panel === 'scores' && (
            <EveningResults
              results={results}
              titles={Object.fromEntries(
                episodes.map((episode) => [episode.id, episode.title]),
              )}
            />
          )}

          <button className="secondary-button" onClick={() => setPanel(null)}>
            <X size={15} />
            Понятно
          </button>
        </DialogContent>
      </Dialog>
      <ControlSettings
        profile={hubMode === 'city' ? 'city' : 'game'}
        open={panel === 'controls'}
        onOpenChange={(open) => setPanel(open ? 'controls' : null)}
        players={players}
        pads={pads}
      />
      <NetworkDialog
        open={networkOpen}
        onOpenChange={setNetworkOpen}
        onDrive={() => {
          setActive(null);
          setHubMode('city');
          city.current.paused = false;
        }}
      />
      {transition && (
        <output className="story-transition">
          <span>НУ, С ВОЗВРАЩЕНИЕМ!</span>
          <strong>{transition.label}</strong>
          <i />
        </output>
      )}
    </main>
  );
}

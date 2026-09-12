'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Gamepad2,
  Maximize,
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
import CleanScene from '@/components/game/clean/scene';
import ScreenGame from '@/components/game/screen/screen-game';
import CleanGame from '@/components/game/clean/clean-game';
import { useGameResults } from '@/hooks/use-game-results';
import { registerGameTools } from '@/lib/game/webmcp';
import { useGamepadNavigation } from '@/hooks/use-gamepad-navigation';
import { gamepadHint, type PadFrame } from '@/lib/game/input/gamepads';
import { freshClean } from '@/lib/game/clean/engine';
import { people } from '@/lib/game/presets';

type Story = 'screen' | 'clean';
const episodes = [
  {
    id: 'screen' as const,
    number: '01',
    kicker: 'КВАРТИРНЫЙ ВОПРОС',
    title: 'Да тут на полчаса.',
    line: 'Огромный экран. Одна отвёртка. Три специалиста.',
    duration: 'Три акта',
  },
  {
    id: 'clean' as const,
    number: '02',
    kicker: 'БАЙКА ИЗ ДРУГОЙ РОТЫ',
    title: 'Без лишних вопросов.',
    line: 'Одна неловкая смена. Очень большая уборка.',
    duration: 'Три акта',
  },
];
function Preview({ story }: { story: Story }) {
  const barracks = useRef(freshClean(3));
  return story === 'screen' ? (
    <Scene preview />
  ) : (
    <CleanScene game={barracks} cameraMode="wide" />
  );
}
export default function Home() {
  const [players, setPlayers] = useState(2),
    [sound, setSound] = useState(true),
    [active, setActive] = useState<Story | null>(null);
  const [selected, setSelected] = useState(0),
    [panel, setPanel] = useState<'people' | 'scores' | 'controls' | null>(null);
  const [transition, setTransition] = useState<{
    target: Story | null;
    label: string;
  } | null>(null);
  const [pads, setPads] = useState<
    Pick<PadFrame, 'assignments' | 'unsupported'>
  >({ assignments: [], unsupported: [] });
  const [results, finish] = useGameResults();
  const episode = episodes[selected];
  const play = (story: Story) => {
    if (!transition)
      setTransition({
        target: story,
        label: episodes.find((e) => e.id === story)!.kicker,
      });
  };
  const exit = () =>
    setTransition({ target: null, label: 'ВЕЧЕР ПРОДОЛЖАЕТСЯ' });
  const changeEpisode = (direction: number) =>
    setSelected((n) => (n + direction + episodes.length) % episodes.length);
  useGamepadNavigation({
    enabled: !active && !transition,
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
    onBack: () => setPanel(null),
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
    <main className={`shell${active ? ' game-active' : ' hub'}`}>
      <header className="topbar">
        <button
          className="hub-brand"
          onClick={() => {
            if (active) exit();
          }}
          aria-label="К выбору историй"
        >
          <span>↗</span> НУ, С ВОЗВРАЩЕНИЕМ!
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
            className="icon-button"
            aria-label="На весь экран"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen?.();
              else
                document.documentElement.requestFullscreen?.().catch(() => {});
            }}
          >
            <Maximize size={17} />
          </button>
        </div>
      </header>
      {active === 'screen' ? (
        <ScreenGame
          key={`screen-${players}`}
          players={players}
          sound={sound}
          onExit={exit}
          onFinish={finish}
          onNext={() => play('clean')}
        />
      ) : active === 'clean' ? (
        <CleanGame
          key={`clean-${players}`}
          players={players}
          sound={sound}
          onExit={exit}
          onFinish={finish}
          onNext={() => play('screen')}
        />
      ) : (
        <>
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
                  {i === 0 ? 'Экран на полстены' : 'Чистый проход'}
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
            <span className="coming-story">03 · Mustang — история впереди</span>
          </nav>
        </>
      )}
      <Dialog
        open={panel !== null}
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
              ? 'Ярослав, Никита и Рома. Истории свои, роли игровые.'
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
            <>
              <div className="hub-total">
                <Trophy size={26} />
                <strong>{total.toLocaleString('ru')}</strong>
                <span>очков за вечер</span>
              </div>
              {results.length ? (
                <div className="hub-results">
                  {results
                    .slice()
                    .reverse()
                    .map((r, i) => (
                      <div key={r.date + i}>
                        <span>
                          {r.story === 'screen'
                            ? 'Экран на полстены'
                            : 'Чистый проход'}
                          <small>
                            {r.players} чел. · {r.seconds} сек.
                          </small>
                        </span>
                        <strong>{r.score}</strong>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="quiet">
                  Сыграйте первую историю — здесь появится ваш результат.
                </p>
              )}
            </>
          )}
          {panel === 'controls' && (
            <div className="hub-input-help">
              <p className="quiet">{gamepadHint(pads)}</p>
              <p>
                <kbd>WASD</kbd> + <kbd>E</kbd> — первый игрок
                <br />
                <kbd>Стрелки</kbd> + <kbd>Enter</kbd> — второй игрок
                <br />
                <kbd>IJKL</kbd> + <kbd>O</kbd> — третий игрок
              </p>
              <p>
                <kbd>Стик / крестовина</kbd> — движение
                <br />
                <kbd>A / ×</kbd> — действие
                <br />
                <kbd>RB / R1</kbd> — бросок / сдержаться
                <br />
                <kbd>LT / L2</kbd> — пылесос
                <br />
                <kbd>B / ○</kbd> или <kbd>Start</kbd> — пауза
              </p>
              <p className="quiet">
                Экран: Никита слева, Ярик справа, Рома помогает третьим. При
                уборке: Рома, Никита, Ярик. В соло убирается Рома; при сверлении
                ты управляешь Яриком, а Никита страхует сам. Пылесос: левый
                Shift в соло, правый Shift у Ярика вдвоём. Нужные кнопки
                появляются прямо во время игры.
              </p>
              <p className="quiet">
                Нажмите кнопку на подключённом геймпаде. Один геймпад в
                совместной игре — у второго игрока, клавиатура — у первого. Если
                геймпадов несколько, они занимают места по порядку.
              </p>
            </div>
          )}
          <button className="secondary-button" onClick={() => setPanel(null)}>
            <X size={15} />
            Понятно
          </button>
        </DialogContent>
      </Dialog>
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

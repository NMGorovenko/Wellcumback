'use client';
import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Volume2,
  VolumeX,
  Maximize,
  Gamepad2,
  MoveUpRight,
  Trophy,
  Users,
  ChevronRight,
  Lock,
  Keyboard,
  Check,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import Scene from '@/components/game/screen/scene';
import ScreenGame from '@/components/game/screen/screen-game';
import { useGameResults } from '@/hooks/use-game-results';
import Link from 'next/link';
import Image from 'next/image';
import { registerGameTools } from '@/lib/game/webmcp';
import CleanGame from '@/components/game/clean/clean-game';
import { people, stories } from '@/lib/game/presets';

export default function Home() {
  const [players, setPlayers] = useState(2),
    [sound, setSound] = useState(true),
    [active, setActive] = useState<'screen' | 'clean' | null>(null),
    [help, setHelp] = useState(false);
  const [results, finish] = useGameResults();
  useEffect(
    () =>
      registerGameTools((story, count) => {
        setPlayers(count);
        setActive(story);
      }),
    [],
  );
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="На главную">
          <span className="brand-icon">
            <MoveUpRight size={24} />
          </span>
          <span>
            НУ, С ВОЗВРАЩЕНИЕМ<span className="brand-dot">!</span>
            <small>ИСТОРИИ, КОТОРЫЕ СТОИЛО ПРОПУСТИТЬ</small>
          </span>
        </Link>
        <div className="top-actions">
          <span className="local-dot" /> Вечер для своих{' '}
          <button
            className="icon-button"
            aria-label={sound ? 'Выключить звук' : 'Включить звук'}
            onClick={() => setSound(!sound)}
          >
            {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
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
            <Maximize size={18} />
          </button>
        </div>
      </header>
      <div className="intro-line">
        <span>
          <span className="tiny-label">СЕЗОН 01</span> Рома, вот что ты
          пропустил
        </span>
        <span className="build-label">
          ПИЛОТНЫЙ ЭПИЗОД <span>●</span>
        </span>
      </div>
      {active === 'screen' ? (
        <ScreenGame
          key={`screen-${players}`}
          players={players}
          sound={sound}
          onExit={() => setActive(null)}
          onFinish={finish}
        />
      ) : active === 'clean' ? (
        <CleanGame
          key={`clean-${players}`}
          players={players}
          sound={sound}
          onExit={() => setActive(null)}
          onFinish={finish}
        />
      ) : (
        <section className="stage">
          <Scene />
          <div className="scene-vignette" />
          {!active && (
            <>
              <div className="story-intro">
                <div className="episode">
                  <span>01</span> КВАРТИРНЫЙ ВОПРОС
                </div>
                <h1>
                  Экран
                  <br />
                  на <em>полстены.</em>
                </h1>
                <p>
                  Хотели домашний кинотеатр.
                  <br />
                  Получили проверку дружбы.
                </p>
                <div className="story-meta">
                  <span>
                    <Users size={15} /> 1–3 игрока
                  </span>
                  <span>3 акта</span>
                  <span>~ 8 минут</span>
                </div>
                <button
                  className="play-button"
                  onClick={() => setActive('screen')}
                >
                  <Gamepad2 size={21} /> Собрать бригаду{' '}
                  <ArrowRight size={20} />
                </button>
                <button className="help-link" onClick={() => setHelp(true)}>
                  <Keyboard size={16} /> Как это работает
                </button>
              </div>
              <div className="scene-note">
                <span className="note-arrow">↙</span> 135 дюймов.
                <br />В воспоминаниях — все 500.
              </div>
              <div className="scene-caption">
                <span className="live-dot" /> КВАРТИРА. СУББОТА. «ДА ТУТ НА
                ПОЛЧАСА».
              </div>
              <div className="scene-tag">
                3D · CO-OP <ArrowUpRight size={14} />
              </div>
            </>
          )}
        </section>
      )}
      <section className="below-stage">
        <div className="acts">
          <div className="section-kicker">ОДНА ЗАТЕЯ. ТРИ СТАДИИ ПРИНЯТИЯ.</div>
          <div className="act-list">
            {[
              ['01', 'До щелчка', 'Собрать рамку'],
              ['02', 'Тяни равномерно', 'Спицы, полотно и нервы'],
              ['03', 'Потолок виноват', 'Повесить. Переделать.'],
            ].map(([n, t, d]) => (
              <div className="act" key={n}>
                <span className="act-number">{n}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
                <ChevronRight size={17} />
              </div>
            ))}
          </div>
        </div>
        <div className="team-selector">
          <div className="section-kicker">СКОЛЬКО ВАС В БРИГАДЕ?</div>
          <div className="player-options">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                disabled={Boolean(active)}
                aria-pressed={players === n}
                className={players === n ? 'selected' : ''}
                onClick={() => setPlayers(n)}
              >
                {n === 1 ? 'Один' : n === 2 ? 'Вдвоём' : 'Втроём'}
                {players === n && <Check size={13} />}
              </button>
            ))}
          </div>
          <p>
            {players === 1
              ? 'Ты + терпеливый помощник'
              : 'Одна клавиатура. Общая ответственность.'}
          </p>
        </div>
      </section>
      <Tabs defaultValue="stories" className="bottom-tabs">
        <TabsList variant="line">
          <TabsTrigger value="stories">
            Все истории <span className="count">03</span>
          </TabsTrigger>
          <TabsTrigger value="people">Наша бригада</TabsTrigger>
          <TabsTrigger value="scores">Доска почёта</TabsTrigger>
        </TabsList>
        <TabsContent value="stories">
          <div className="story-list">
            {stories.map((story, i) => (
              <button
                disabled={!story.available}
                className={'story-card ' + (story.available ? 'available' : '')}
                onClick={() => {
                  const id = story.id === 'clean' ? 'clean' : 'screen';
                  setActive(id);
                }}
                key={story.id}
              >
                <span className="story-index">0{i + 1}</span>
                <div>
                  <small>{story.subtitle}</small>
                  <h3>{story.title}</h3>
                </div>
                {story.available ? (
                  <ArrowUpRight size={21} />
                ) : (
                  <Lock size={17} />
                )}
                <span className="story-status">
                  {story.available ? 'МОЖНО ИГРАТЬ' : 'ПРОДОЛЖЕНИЕ СЛЕДУЕТ'}
                </span>
              </button>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="people">
          <div className="people-grid">
            {people.map((p, i) => (
              <div className="person-card" key={p.name}>
                {p.portrait ? (
                  <Image
                    unoptimized
                    className="character-portrait"
                    src={p.portrait}
                    alt={`Игровой портрет: ${p.name}`}
                    width={84}
                    height={84}
                  />
                ) : (
                  <span className="avatar" style={{ background: p.color }}>
                    {p.name[0]}
                  </span>
                )}
                <div>
                  <h3>{p.name}</h3>
                  <p>
                    {p.role} · Игрок {i + 1}
                  </p>
                </div>
                <span className="preset">
                  {p.id === 'roma' ? 'ЖДЁМ ДОМОЙ' : 'БРИГАДА'}
                </span>
              </div>
            ))}
          </div>
          <p className="quiet">
            Портреты по вашим фотографиям. Ярик держит, Никита рассчитывает,
            Рома возвращается.
          </p>
        </TabsContent>
        <TabsContent value="scores">
          {results.length ? (
            <>
              <div className="total-score">
                <span>Счёт вечера · {results.length} прохождений</span>
                <strong>
                  {results
                    .reduce((n, r) => n + r.score, 0)
                    .toLocaleString('ru')}{' '}
                  очков
                </strong>
              </div>
              <table className="score-table">
                <thead>
                  <tr>
                    <th>История</th>
                    <th>Бригада</th>
                    <th>Время</th>
                    <th>Счёт</th>
                  </tr>
                </thead>
                <tbody>
                  {results
                    .slice()
                    .reverse()
                    .map((r, i) => (
                      <tr key={r.date + i}>
                        <td>
                          {r.story === 'screen'
                            ? 'Экран на полстены'
                            : 'Чистый проход'}
                        </td>
                        <td>{r.players} чел.</td>
                        <td>{r.seconds} сек.</td>
                        <td>{r.score.toLocaleString('ru')}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="quiet">
                Результаты сохраняются в этом браузере. Повторные прохождения
                тоже входят в счёт вечера.
              </p>
            </>
          ) : (
            <div className="score-empty">
              <Trophy size={28} />
              <div>
                <h3>Легенда ещё не написана</h3>
                <p>
                  Завершите первую историю — здесь появится счёт вашей бригады.
                </p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
      <footer>
        <span>
          СДЕЛАНО ДЛЯ СВОИХ <span className="footer-star">✳</span>
        </span>
        <span>Ни один потолок не признаёт свою вину.</span>
        <span>VOL. 01 / 2026</span>
      </footer>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="help-dialog">
          <DialogTitle>Инструкция к дружбе</DialogTitle>
          <DialogDescription>
            Играйте на одной клавиатуре. В одиночку напарник поможет
            автоматически.
          </DialogDescription>
          <p>
            <b>Акт 1.</b> Останавливайте бегунок в зелёной зоне, чтобы
            защёлкнуть четыре угла рамки.
          </p>
          <p>
            <b>Акт 2.</b> Вставьте спицы и закрепляйте противоположные стороны
            по очереди. Перетянете — скрепка слетит.
          </p>
          <p>
            <b>Акт 3.</b> Один держит стулья, другой сверлит. Затем поднимите
            экран на крючки и выровняйте по пузырьку.
          </p>
          <p className="quiet">
            Управление будет перед глазами в каждом акте. Esc — пауза.
          </p>
        </DialogContent>
      </Dialog>
    </main>
  );
}

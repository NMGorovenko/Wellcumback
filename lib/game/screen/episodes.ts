import { announceScreenPhase } from './dialogue.ts';
import { freshGame, phases, titles, type Phase } from './engine.ts';

export type ScreenEpisode = Exclude<Phase, 'result'>;
export const screenEpisodes: {
  id: ScreenEpisode;
  title: string;
  description: string;
}[] = [
  {
    id: 'frame',
    title: 'Рамка',
    description: 'Совместить профили и защёлкнуть углы',
  },
  {
    id: 'rods',
    title: 'Спицы',
    description: 'Вставить спицы в кулиски полотна',
  },
  {
    id: 'tension',
    title: 'Пружины',
    description: 'Натянуть полотно и перекидывать отвёртку',
  },
  {
    id: 'drill',
    title: 'Стулья, дрель и пылесос',
    description: 'Забраться, сходить за приборами и просверлить',
  },
  {
    id: 'lift',
    title: 'Попасть на крючки',
    description: 'Поднять экран за два края',
  },
  {
    id: 'level',
    title: 'Кривой потолок',
    description: 'Выставить экран по уровню',
  },
];

/** Every checkpoint starts a new practice run. Previous penalties, queued input
 * and earned points never leak into it; no partial story can earn a party score. */
export function createScreenEpisode(players: number, phase: ScreenEpisode) {
  const s = freshGame(players);
  if (!screenEpisodes.some((episode) => episode.id === phase)) return s;
  const stage = phases.indexOf(phase);
  s.practice = true;
  s.phase = phase;
  s.message = titles[phase];
  announceScreenPhase(s, phase);
  if (stage >= 1) s.corners = 4;
  if (stage >= 2) s.rods = [1, 1, 1, 1];
  if (stage >= 3) {
    s.clips = [4, 4, 4, 4];
    s.tension = [1, 1, 1, 1];
    s.simulation.clipBest = [4, 4, 4, 4];
  }
  if (stage >= 4) s.holes = [5.9, 6.03];
  if (stage >= 5) {
    s.latched = [true, true];
    s.latchProgress = [1, 1];
    s.latch = 1;
    s.liftLeft = s.holes[0];
    s.liftRight = s.holes[1];
    s.liftX = 0;
    s.angle = 0.047;
    s.bubble = s.angle;
  }
  return s;
}

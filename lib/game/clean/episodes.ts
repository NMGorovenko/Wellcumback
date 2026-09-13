import {
  cleanAction,
  cleanTick,
  freshClean,
  planRoute,
  stations,
  type CleanState,
} from './engine.ts';

export const cleanEpisodes = [
  {
    id: 'duty',
    title: 'Заступить на смену',
    description: 'Безымянный солдат на посту. Пока всё спокойно.',
  },
  {
    id: 'find',
    title: 'Разрешите доложить',
    description: 'Дойди до дневального, сдерживаясь в ритме Q / E.',
  },
  {
    id: 'accident',
    title: 'Доклад прорвало',
    description: 'Происшествие у тумбы и реакция дневального.',
  },
  {
    id: 'toilet',
    title: 'Добежать до туалета',
    description: 'Коридор, следы на полу и спасительная кабинка.',
  },
  {
    id: 'shower',
    title: 'Смыть последствия',
    description: 'Туалет позади. Пора в душ и в чистую форму.',
  },
  {
    id: 'laundry',
    title: 'Большая стирка',
    description: 'Отнеси пакет со штанами в прачечную.',
  },
  {
    id: 'spin',
    title: 'Отжим особого назначения',
    description: 'Машина уже загружена. Придержи корпус.',
  },
  {
    id: 'response',
    title: 'Вызов химзащиты',
    description: 'Сослуживцы идут на шум и собирают бригаду.',
  },
  {
    id: 'clean',
    title: 'Рома выходит на уборку',
    description: 'Рома и безымянные сослуживцы — по числу игроков. Отмой всё.',
  },
] as const;

export type CleanEpisodeId = (typeof cleanEpisodes)[number]['id'];

/** A checkpoint is a normal engine run up to that chapter. This preserves
 * stains, pants, the washer and NPC handoffs when their prerequisites change. */
export function createCleanEpisode(
  players: number,
  id: CleanEpisodeId,
): CleanState {
  if (!cleanEpisodes.some((episode) => episode.id === id))
    throw new RangeError(`Unknown clean episode: ${String(id)}`);
  const state = freshClean(players);
  const empty = new Set<string>();
  let remainingSteps = 12000;
  const tick = (keys: Set<string>, dt = 0.025) => {
    if (--remainingSteps < 0)
      throw new Error(`Could not prepare clean episode ${id}`);
    cleanTick(state, dt, keys);
  };
  const until = (ready: () => boolean, seconds: number, keys = empty) => {
    for (let i = 0; i < Math.ceil(seconds / 0.025) && !ready(); i++) tick(keys);
    if (!ready())
      throw new Error(`Clean episode ${id} stopped at ${state.phase}`);
  };
  const approach = (station: (typeof stations)[number], rhythm = false) => {
    const initialPhase = state.phase;
    const route = planRoute({ x: state.x[0], y: state.y[0] }, station, 48);
    let cursor = 0;
    while (
      state.phase === initialPhase &&
      Math.hypot(state.x[0] - station.x, state.y[0] - station.y) >= 53
    ) {
      const waypoint = route[cursor];
      if (!waypoint)
        throw new Error(`Clean episode ${id}: no route to ${station.id}`);
      if (Math.hypot(waypoint.x - state.x[0], waypoint.y - state.y[0]) < 3) {
        cursor++;
        continue;
      }
      const keys = new Set<string>();
      const dx = waypoint.x - state.x[0],
        dy = waypoint.y - state.y[0];
      if (Math.abs(dx) > 1.2) keys.add(dx > 0 ? 'KeyD' : 'KeyA');
      if (Math.abs(dy) > 1.2) keys.add(dy > 0 ? 'KeyS' : 'KeyW');
      if (
        rhythm &&
        state.rhythm.active &&
        state.rhythm.clock >= state.rhythm.period - 0.04
      )
        keys.add(state.rhythm.expected);
      tick(keys, 0.01);
    }
  };
  const checkpoint = () => {
    // Preparation uses normal play. Only the returned checkpoint is practice;
    // its points remain zero and the UI excludes it from persisted results.
    state.practice = true;
    state.score = 0;
    state.simulation.previousE = false;
    state.simulation.previousQ = false;
    return state;
  };
  cleanAction(state);
  if (id === 'duty') return checkpoint();
  until(() => state.phase === 'find', 5);
  if (id === 'find') return checkpoint();
  approach(stations[0], true);
  if (state.phase === 'find') cleanAction(state);
  if (id === 'accident') return checkpoint();
  until(() => state.phase === 'toilet', 25);
  if (id === 'toilet') return checkpoint();
  approach(stations[1]);
  until(() => state.phase === 'shower', 4, new Set(['KeyE']));
  if (id === 'shower') return checkpoint();
  approach(stations[2]);
  until(() => state.phase === 'laundry', 4, new Set(['KeyE']));
  if (id === 'laundry') return checkpoint();
  approach(stations[3]);
  until(() => state.phase === 'spin', 3, new Set(['KeyE']));
  if (id === 'spin') return checkpoint();
  until(() => state.phase === 'response', 6);
  if (id === 'response') return checkpoint();
  until(() => state.phase === 'clean', 45);
  return checkpoint();
}

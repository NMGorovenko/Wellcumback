export type CleanPhase = 'brief' | 'find' | 'wash' | 'clean' | 'result';
export type CleanState = {
  phase: CleanPhase;
  players: number;
  x: number[];
  y: number[];
  elapsed: number;
  timer: number;
  score: number;
  message: string;
  paused: boolean;
  station: number;
  washed: boolean;
  spots: { x: number; y: number; progress: number }[];
  machine: number;
  cooldown: number;
};
export const stations = [
  { x: 790, y: 270, label: 'ТУМБОЧКА' },
  { x: 145, y: 405, label: 'ДУШ' },
  { x: 805, y: 405, label: 'СТИРАЛКА' },
];
export function freshClean(players = 1): CleanState {
  return {
    phase: 'brief',
    players,
    x: [110, 155, 200],
    y: [270, 295, 270],
    elapsed: 0,
    timer: 35,
    score: 0,
    message: 'Другая рота. Обычный вечер. Очень срочный вопрос.',
    paused: false,
    station: 0,
    washed: false,
    spots: [
      { x: 650, y: 270, progress: 0 },
      { x: 730, y: 295, progress: 0 },
      { x: 560, y: 280, progress: 0 },
      { x: 470, y: 300, progress: 0 },
      { x: 375, y: 265, progress: 0 },
      { x: 290, y: 305, progress: 0 },
      { x: 695, y: 380, progress: 0 },
      { x: 770, y: 400, progress: 0 },
    ],
    machine: 0,
    cooldown: 0,
  };
}
export function cleanAction(s: CleanState) {
  if (s.paused || s.cooldown > 0) return;
  if (s.phase === 'brief') {
    s.phase = 'find';
    s.message =
      'Найди дневального у тумбочки. Туалет не отмечен на карте. Очень удобно.';
    return;
  }
  if (s.phase === 'find' && Math.hypot(s.x[0] - 790, s.y[0] - 270) < 75) {
    s.score += Math.round(s.timer * 10);
    s.phase = 'wash';
    s.station = 1;
    s.message =
      '«Разрешите…» — «УЖЕ РАЗРЕШАЮ! В душ, бегом!» Камера деликатно отвернулась.';
    s.cooldown = 0.5;
  } else if (s.phase === 'wash') {
    const target = stations[s.station];
    if (Math.hypot(s.x[0] - target.x, s.y[0] - target.y) < 75) {
      if (s.station === 1) {
        s.score += 200;
        s.station = 2;
        s.washed = true;
        s.message =
          'Форма заменена. Осталось закинуть старую в стиралку. Что может пойти не так?';
      } else {
        s.score += 200;
        s.phase = 'clean';
        s.timer = 90;
        s.message =
          'Отжим: 1200 об/мин. Репутация: 0. Бригада, химзащиту надеть! Держите E / Enter / O рядом с пятнами.';
      }
      s.cooldown = 0.5;
    }
  }
}
export function cleanTick(s: CleanState, dt: number, keys: Set<string>) {
  if (s.paused || s.phase === 'result' || s.phase === 'brief') return;
  s.elapsed += dt;
  s.cooldown = Math.max(0, s.cooldown - dt);
  const bindings = [
    ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyE'],
    ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'],
    ['KeyJ', 'KeyL', 'KeyI', 'KeyK', 'KeyO'],
  ];
  for (let i = 0; i < s.players; i++) {
    if (s.phase !== 'clean' && i > 0) continue;
    const [l, r, u, d] = bindings[i],
      dx = Number(keys.has(r)) - Number(keys.has(l)),
      dy = Number(keys.has(d)) - Number(keys.has(u)),
      len = Math.hypot(dx, dy) || 1;
    const x = Math.max(65, Math.min(845, s.x[i] + (dx / len) * dt * 155)),
      y = Math.max(235, Math.min(430, s.y[i] + (dy / len) * dt * 155));
    s.x[i] = x;
    s.y[i] = y;
  }
  if (s.phase === 'find') {
    s.timer = Math.max(0, s.timer - dt);
    if (s.timer === 0) {
      s.phase = 'wash';
      s.station = 1;
      s.message =
        'Доклад задержался. Ситуация — нет. Следующий пункт: душ. Камера смотрит в потолок.';
    }
  }
  if (s.phase === 'clean') {
    s.timer = Math.max(0, s.timer - dt);
    s.machine += dt;
    for (const spot of s.spots) {
      const was = spot.progress >= 1;
      for (let i = 0; i < s.players; i++) {
        if (
          keys.has(bindings[i][4]) &&
          Math.hypot(s.x[i] - spot.x, s.y[i] - spot.y) < 60
        )
          spot.progress = Math.min(1, spot.progress + dt * 0.38);
      }
      if (!was && spot.progress >= 1) {
        s.score += 150;
        s.message = [
          'Здесь вообще ничего не было.',
          'Химзащита — новый домашний дресс-код.',
          'Крест на полу чист. На репутации — пока нет.',
          'Чистота — залог молчания.',
        ][Math.floor(s.machine) % 4];
      }
    }
    if (s.players === 1) {
      const target = s.spots.find((p) => p.progress < 1);
      if (target) {
        const was = target.progress >= 1;
        target.progress = Math.min(1, target.progress + dt * 0.045);
        if (!was && target.progress >= 1) s.score += 150;
      }
    }
    if (s.spots.every((p) => p.progress >= 1)) {
      s.score += Math.round(s.timer * 8) + 300;
      s.phase = 'result';
      s.message = 'Коридор блестит. Все подписали соглашение о неразглашении.';
    } else if (s.timer === 0) {
      s.message =
        'Сверхурочная химзащита. Убираем до победы, бонус за время уже убежал.';
    }
  }
}

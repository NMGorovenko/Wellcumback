export type Phase =
  | 'frame'
  | 'rods'
  | 'tension'
  | 'drill'
  | 'lift'
  | 'level'
  | 'result';
export type GameState = {
  phase: Phase;
  players: number;
  elapsed: number;
  phaseTime: number;
  score: number;
  penalties: number;
  paused: boolean;
  corners: number;
  cursor: number;
  side: number;
  rods: number[];
  clips: number[];
  message: string;
  chairs: number;
  balance: number;
  drill: number;
  holes: number[];
  aim: number;
  falls: number;
  cooldown: number;
  liftLeft: number;
  liftRight: number;
  liftX: number;
  latch: number;
  angle: number;
  hold: number;
  awards: { label: string; value: number }[];
};
export const phases: Phase[] = [
  'frame',
  'rods',
  'tension',
  'drill',
  'lift',
  'level',
  'result',
];
export const titles: Record<Phase, string> = {
  frame: 'До щелчка',
  rods: 'Спицы в дело',
  tension: 'Тяни равномерно',
  drill: 'Выше только потолок',
  lift: 'Попади на крючки',
  level: 'Потолок виноват',
  result: 'Кино будет!',
};
export function freshGame(players = 1): GameState {
  return {
    phase: 'frame',
    players,
    elapsed: 0,
    phaseTime: 0,
    score: 0,
    penalties: 0,
    paused: false,
    corners: 0,
    cursor: 0,
    side: 0,
    rods: [0, 0, 0, 0],
    clips: [0, 0, 0, 0],
    message: 'Лови зелёную зону. Остальное почти по инструкции.',
    chairs: 1,
    balance: 0,
    drill: 0,
    holes: [],
    aim: 5.1,
    falls: 0,
    cooldown: 0,
    liftLeft: 2.6,
    liftRight: 2.6,
    liftX: -1.3,
    latch: 0,
    angle: 0,
    hold: 0,
    awards: [],
  };
}
export function transition(s: GameState, phase: Phase, message: string) {
  s.phase = phase;
  s.phaseTime = 0;
  s.message = message;
  s.hold = 0;
}
export function award(s: GameState, label: string, value: number) {
  s.score += value;
  s.awards.push({ label, value });
}
export function act(s: GameState) {
  if (s.paused || s.cooldown > 0) return;
  if (s.phase === 'frame') {
    if (Math.abs(s.cursor - 0.5) < 0.14) {
      s.corners++;
      s.score += 150;
      s.message = [
        'Щёлк! Это было профессионально.',
        'Держится. Пока не трогай.',
        'Инструкция начинает подозревать неладное.',
        'Четыре угла. Ни одного лишнего.',
      ][s.corners - 1];
      if (s.corners === 4)
        transition(
          s,
          'rods',
          'Выбирай сторону стрелками и держи E: вставляем спицы.',
        );
    } else {
      s.score = Math.max(0, s.score - 25);
      s.penalties++;
      s.message = 'Не щёлкнуло. Убедительности недостаточно.';
    }
    s.cooldown = 0.25;
  } else if (s.phase === 'tension') {
    const a = s.clips,
      i = s.side;
    if (a[i] >= 4) {
      s.message = 'Эта сторона уже готова. Переходи на другую.';
      return;
    }
    a[i]++;
    const low = Math.min(...a),
      high = Math.max(...a);
    if (high - low > 1) {
      const j = a.indexOf(high);
      a[j]--;
      s.penalties++;
      s.score = Math.max(0, s.score - 20);
      s.message = 'ДЗЫНЬ! Перетянули. Скрепка слетела — чередуйте стороны.';
    } else {
      s.score += 50;
      s.message = 'Скрепка на месте. Теперь противоположную сторону.';
    }
    if (a.every((n) => n === 4)) {
      award(s, 'Полотно без морщин', 200);
      transition(
        s,
        'drill',
        'Стремянки нет. Выбирай стулья и сверли. Напарник держит A / D.',
      );
    }
    s.cooldown = 0.18;
  } else if (s.phase === 'level' && Math.abs(s.angle) < 0.018) {
    award(
      s,
      'Наконец-то ровно',
      Math.round(600 + Math.max(0, 600 - s.elapsed * 2)),
    );
    transition(s, 'result', 'Потолок кривой. Экран — нет. Включай кино!');
  }
}
export function tick(s: GameState, dt: number, keys: Set<string>) {
  if (s.paused || s.phase === 'result') return;
  s.elapsed += dt;
  s.phaseTime += dt;
  s.cooldown = Math.max(0, s.cooldown - dt);
  const pressed = (...codes: string[]) => codes.some((k) => keys.has(k));
  if (s.phase === 'frame') {
    s.cursor = (Math.sin(s.phaseTime * 2.6) + 1) / 2;
    return;
  }
  if (['rods', 'tension'].includes(s.phase)) {
    if (pressed('ArrowUp', 'KeyW')) s.side = 0;
    if (pressed('ArrowRight', 'KeyD')) s.side = 1;
    if (pressed('ArrowDown', 'KeyS')) s.side = 2;
    if (pressed('ArrowLeft', 'KeyA')) s.side = 3;
    if (s.phase === 'rods' && pressed('KeyE', 'Space')) {
      s.rods[s.side] = Math.min(1, s.rods[s.side] + dt * 0.65);
      if (s.rods.every((n) => n === 1)) {
        award(s, 'Спицы на месте', 400);
        transition(
          s,
          'tension',
          'По четыре скрепки на сторону. Разница больше одной — и всё отлетит.',
        );
      }
    }
  } else if (s.phase === 'drill') {
    if (s.cooldown > 0) return;
    const support = (pressed('KeyD') ? 1 : 0) - (pressed('KeyA') ? 1 : 0);
    s.balance +=
      (Math.sin(s.phaseTime * 1.9) * 0.24 + s.balance * 0.42 + support * 0.95) *
      dt *
      (s.chairs === 2 ? 1.65 : 1);
    if (s.players === 1) s.balance *= Math.exp(-dt * 2.4);
    if (s.players === 3 && pressed('KeyJ', 'KeyL'))
      s.balance *= Math.exp(-dt * 2);
    s.aim +=
      ((pressed('ArrowUp') ? 1 : 0) - (pressed('ArrowDown') ? 1 : 0)) *
      dt *
      0.7;
    s.aim = Math.max(
      s.chairs === 1 ? 4.6 : 5.4,
      Math.min(s.chairs === 1 ? 5.35 : 7, s.aim),
    );
    if (Math.abs(s.balance) > 1) {
      s.falls++;
      s.penalties++;
      s.score = Math.max(0, s.score - 100);
      s.balance = 0;
      s.drill = 0;
      s.cooldown = 1.3;
      s.message =
        'БУХ. Боец приземлился на диван. Минус 100 за доверие мебели.';
      return;
    }
    if (pressed('KeyE', 'Space'))
      s.drill += dt * (Math.abs(s.balance) < 0.55 ? 0.27 : 0.1);
    if (s.drill >= 1) {
      s.holes.push(s.aim);
      award(s, 'Отверстие ' + s.holes.length, 300);
      s.drill = 0;
      s.balance = 0;
      s.phaseTime = 0;
      s.cooldown = 0.5;
      if (s.holes.length === 2)
        transition(
          s,
          'lift',
          'Поднимайте оба края. Кольца должны совпасть с крючками. Держи E для зацепа.',
        );
      else {
        s.aim += 0.13;
        s.message =
          'Переставили стулья направо. Потолок говорит: «тут тоже 15 см». Не верь.';
      }
    }
  } else if (s.phase === 'lift') {
    s.liftX +=
      ((pressed('KeyD') ? 1 : 0) - (pressed('KeyA') ? 1 : 0)) * dt * 1.2;
    s.liftX = Math.max(-2, Math.min(2, s.liftX));
    s.liftLeft +=
      ((pressed('KeyW') ? 1 : 0) - (pressed('KeyS') ? 1 : 0)) * dt * 1.15;
    s.liftRight +=
      ((pressed('ArrowUp') ? 1 : 0) - (pressed('ArrowDown') ? 1 : 0)) *
      dt *
      1.15;
    if (s.players === 1)
      s.liftRight +=
        (s.liftLeft + (s.holes[1] - s.holes[0]) - s.liftRight) *
        Math.min(1, dt * 6);
    s.liftLeft = Math.max(2, Math.min(7.5, s.liftLeft));
    s.liftRight = Math.max(2, Math.min(7.5, s.liftRight));
    const error = Math.max(
      Math.abs(s.liftLeft - s.holes[0]),
      Math.abs(s.liftRight - s.holes[1]),
      Math.abs(s.liftX),
    );
    s.latch = error < 0.23 && pressed('KeyE', 'Space') ? s.latch + dt : 0;
    if (s.latch > 1) {
      award(s, 'Оба крючка', 500);
      s.angle = Math.atan2(s.holes[1] - s.holes[0], 8.8) + 0.035;
      transition(
        s,
        'level',
        'Слева 15, справа 15. А пузырёк не согласен. Стрелки ← → — регулируй подвесы; E — принять.',
      );
    }
  } else if (s.phase === 'level') {
    s.angle +=
      ((pressed('ArrowRight', 'KeyD') ? 1 : 0) -
        (pressed('ArrowLeft', 'KeyA') ? 1 : 0)) *
      dt *
      0.055;
    s.angle = Math.max(-0.15, Math.min(0.15, s.angle));
  }
}

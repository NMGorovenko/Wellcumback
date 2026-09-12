import {
  award,
  emit,
  penalty,
  setChairs,
  transition,
  type GameState,
  type Input,
} from './engine.ts';

/** The drilling beat keeps tool ownership and body movement explicit. Worker 0
 * is always Nikita (assistant), worker 1 always Yarik (climber), even in solo. */
export type DrillingState = {
  drillMode: 'position' | 'climb' | 'handoff' | 'drill' | 'descend' | 'fallen';
  drillGear: 'none' | 'drill' | 'ready';
  handoffProgress: number;
  drillRunning: boolean;
  vacuumRunning: boolean;
  braceHeld: boolean;
  dustGenerated: number;
  dustCaptured: number;
  wallDust: [number, number];
  fallProgress: number;
  fallHeight: number;
};
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export const ASSISTANT = 0;
export const CLIMBER = 1;

function putToolsDown(s: GameState) {
  s.drillGear = 'none';
  s.handoffProgress = 0;
  s.drillRunning = false;
  s.vacuumRunning = false;
}
function finishDrilling(s: GameState) {
  const tidy = s.dustGenerated ? s.dustCaptured / s.dustGenerated : 1;
  award(s, 'Белая стена', Math.round(250 * tidy));
  transition(
    s,
    'lift',
    'Стулья убрали. Никита берёт левый край, Ярик — правый. Поднимайте вместе и ловите крючки.',
  );
}
function fall(s: GameState) {
  s.falls++;
  penalty(
    s,
    'БУХ! Ярик цел. Никита: «Я же сказал — держу, а не приклеил!» Залезай заново, инструменты подадим ещё раз.',
    100,
  );
  s.balance = 0;
  s.drill = 0;
  s.drillMark = null;
  s.drillHeat = 0;
  s.fallHeight = s.climb;
  s.fallProgress = 0;
  s.drillMode = 'fallen';
  s.workers[CLIMBER].animation = 'fall';
  putToolsDown(s);
  emit(s, 'fall', CLIMBER, s.holes.length);
}

function balanceStep(s: GameState, dt: number, input: Input[]) {
  const solo = s.players === 1;
  const held = solo || input[ASSISTANT].held;
  s.braceHeld = held;
  const correction = solo
    ? clamp(-s.balance * 2.4, -0.9, 0.9)
    : held
      ? input[ASSISTANT].x
      : 0;
  s.balance +=
    (Math.sin(s.phaseTime * 1.9) * 0.24 +
      s.balance * (held ? 0.52 : 1.1) +
      correction * 0.95 +
      (!held ? 0.44 : 0) +
      (s.drillRunning ? Math.sin(s.phaseTime * 29) * 0.13 : 0)) *
    dt *
    (s.chairs === 2 ? 1.65 : 1);
  if (s.players === 3 && input[2].held) s.balance *= Math.exp(-dt * 1.3);
  s.workers[ASSISTANT].animation = held ? 'hold' : 'idle';
  if (Math.abs(s.balance) > 1) {
    fall(s);
    return false;
  }
  return true;
}

export function drillStep(s: GameState, dt: number, input: Input[]) {
  const solo = s.players === 1;
  const climber = input[solo ? 0 : CLIMBER];
  s.drillRunning =
    s.drillMode === 'drill' &&
    s.drillGear === 'ready' &&
    climber.held &&
    s.cooldown === 0;
  s.vacuumRunning = false;
  if (s.drillMode === 'fallen') {
    s.fallProgress = Math.min(1, s.fallProgress + dt / 1.35);
    s.workers[CLIMBER].animation = 'fall';
    if (s.fallProgress === 1) {
      s.climb = 0;
      s.drillMode = 'position';
      s.cooldown = 0.2;
      if (s.holes.length === 2) finishDrilling(s);
    }
    return;
  }
  if (s.drillMode === 'position') {
    s.braceHeld = false;
    if (s.cooldown > 0) return;
    if (input[0].y > 0 && s.chairs !== 2) setChairs(s, 2);
    if (input[0].y < 0 && s.chairs !== 1) setChairs(s, 1);
    s.chairX = clamp(s.chairX + input[0].x * dt * 2.7, -4.75, 4.75);
    s.workers[0].animation = input[0].x ? 'walk' : 'idle';
    s.workers[1].animation = input[0].x ? 'walk' : 'idle';
    if (input[0].pressed || (!solo && climber.pressed)) {
      const target = s.holes.length === 0 ? -4.4 : 4.4;
      if (Math.abs(s.chairX - target) > 0.35) {
        s.message = 'Стулья — под отметку на стене. Ярик пока подождёт сбоку.';
        return;
      }
      if (!solo && !input[0].held) {
        s.message =
          'Никита, сначала держи E. Ярик, потом держи Enter и забирайся.';
        return;
      }
      s.chairX = target;
      s.drillMode = 'climb';
      s.climb = 0;
      s.balance = 0;
      putToolsDown(s);
      s.message = solo
        ? 'Держи E — Ярик забирается. Никита страхует сам.'
        : 'Никита держит E и балансирует A/D. Ярик держит Enter и забирается.';
    }
    return;
  }
  if (!balanceStep(s, dt, input)) return;
  if (s.drillMode === 'climb') {
    if (climber.held) s.climb = Math.min(1, s.climb + dt * 0.48);
    s.workers[CLIMBER].animation = 'climb';
    if (s.climb === 1) {
      s.drillMode = 'handoff';
      s.message = solo
        ? 'Держи E — прими дрель, потом пылесос. Никита подаёт по очереди.'
        : 'Никита держит E — подаёт. Ярик держит Enter — принимает. Сначала дрель, потом пылесос.';
    }
    return;
  }
  if (s.drillMode === 'handoff') {
    s.workers[CLIMBER].animation = 'handoff';
    s.workers[ASSISTANT].animation = 'handoff';
    if (climber.held && s.braceHeld && s.cooldown === 0)
      s.handoffProgress = Math.min(1, s.handoffProgress + dt * 0.7);
    if (s.handoffProgress === 1) {
      s.handoffProgress = 0;
      s.cooldown = 0.3;
      if (s.drillGear === 'none') {
        s.drillGear = 'drill';
        s.message = 'Дрель у Ярика. Теперь пылесос — белую стену жалко.';
      } else {
        s.drillGear = 'ready';
        s.drillMode = 'drill';
        s.message = solo
          ? 'E — дрель, левый Shift — пылесос. Держи вместе, делай перерывы для охлаждения.'
          : 'Ярик: Enter — дрель, правый Shift — пылесос. Никита: E держать, A/D ловить баланс.';
      }
    }
    return;
  }
  if (s.drillMode === 'descend') {
    s.workers[CLIMBER].animation = 'climb';
    if (climber.held) s.climb = Math.max(0, s.climb - dt * 0.52);
    if (s.climb === 0) {
      putToolsDown(s);
      s.balance = 0;
      if (s.holes.length === 2) {
        finishDrilling(s);
      } else {
        s.drillMode = 'position';
        s.aim = clamp(s.aim + 0.13, 4.6, 7);
        s.message =
          'Ярик на полу. Никита, переставляй стулья направо. Потом снова забраться и подать инструменты.';
      }
    }
    return;
  }
  s.aim = clamp(
    s.aim + climber.y * dt * 0.65,
    s.chairs === 1 ? 4.6 : 5.4,
    s.chairs === 1 ? 5.35 : 7,
  );
  s.vacuumRunning = s.drillGear === 'ready' && climber.secondary;
  s.drillRunning = s.drillGear === 'ready' && climber.held && s.cooldown === 0;
  s.workers[CLIMBER].animation =
    s.drillRunning || s.vacuumRunning ? 'drill' : 'hold';
  if (s.drillRunning) {
    s.drillHeat = Math.min(1, s.drillHeat + dt * 0.26);
    if (s.drillMark === null) s.drillMark = s.aim;
    s.drillMark += (s.aim - s.drillMark) * dt * 1.7;
    if (Math.abs(s.balance) < 0.5 && s.drillHeat < 0.86) {
      s.drill = Math.min(1, s.drill + dt * 0.19);
      const dust = dt * 0.12;
      const captured = dust * (s.vacuumRunning ? 0.985 : 0);
      s.dustGenerated += dust;
      s.dustCaptured += captured;
      s.wallDust[s.holes.length] = Math.min(
        1,
        s.wallDust[s.holes.length] + dust - captured,
      );
    }
    if (s.drillHeat >= 1) {
      s.drillOverheats++;
      penalty(
        s,
        'Дрель перегрелась. Отпусти действие на секунду. Пылесос можно не выключать.',
        35,
      );
      s.drill = Math.max(0, s.drill - 0.12);
      s.drillHeat = 0.45;
      s.cooldown = 0.85;
      emit(s, 'jam', CLIMBER, s.holes.length);
    }
  } else s.drillHeat = Math.max(0, s.drillHeat - dt * 0.5);
  if (s.drill === 1) {
    s.holes.push(s.drillMark ?? s.aim);
    award(s, `Отверстие ${s.holes.length}`, 300);
    emit(s, 'hole', CLIMBER, s.holes.length - 1);
    s.drill = 0;
    s.drillMark = null;
    s.drillHeat = 0;
    s.drillRunning = false;
    s.vacuumRunning = false;
    s.drillMode = 'descend';
    s.message = solo
      ? 'Отверстие есть! Держи E — спустись. Никита страхует.'
      : 'Отверстие есть! Ярик держит Enter и спускается. Никита, E не отпускай.';
  }
}

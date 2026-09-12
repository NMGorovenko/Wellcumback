import { nearChairs } from './drill-space.ts';
import {
  assistantStep,
  drillSay,
  dropClimberTools,
  nextHandoffTool,
  syncDrillGear,
  updateToolPositions,
  type PhysicalDrillTool,
  type DrillAssistant,
  type DrillToolKind,
} from './drill-tools.ts';
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
  drillTools: Record<DrillToolKind, PhysicalDrillTool>;
  drillAssistant: DrillAssistant;
  toolsRemembered: boolean;
  handoffTool: DrillToolKind | null;
  speechText: string;
  messageSpeaker: 0 | 1 | 2 | null;
  messageUntil: number;
  messageSeq: number;
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

function stopTools(s: GameState) {
  s.handoffProgress = 0;
  s.handoffTool = null;
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
  const lostDrill = s.drillTools.drill.location === 'climber';
  const lostVacuum = s.drillTools.vacuum.location === 'climber';
  dropClimberTools(s);
  drillSay(
    s,
    lostDrill && lostVacuum
      ? 'Я цел! Приборы на полу. Никита, подбери их там, где упали.'
      : lostDrill
        ? 'Я цел! А дрель… Никита, подбери её там, где упала.'
        : lostVacuum
          ? 'Я цел! Пылесос улетел. Никита, подбери его, пожалуйста.'
          : 'Я цел! Давай снова залезу. Приборы хотя бы не уронил.',
    1,
  );
  s.balance = 0;
  s.drill = 0;
  s.drillMark = null;
  s.drillHeat = 0;
  s.fallHeight = s.climb;
  s.fallProgress = 0;
  s.drillMode = 'fallen';
  s.workers[CLIMBER].animation = 'fall';
  stopTools(s);
  emit(s, 'fall', CLIMBER, s.holes.length);
}

function balanceStep(s: GameState, dt: number, input: Input[]) {
  const solo = s.players === 1;
  const held = s.braceHeld;
  const climber = input[solo ? 0 : CLIMBER];
  const correction = held
    ? solo
      ? clamp(-s.balance * 2.4, -0.9, 0.9)
      : input[ASSISTANT].x
    : climber.x * 0.85;
  // Yarik can correct his own stance while Nikita fetches tools. The unbraced
  // chair still becomes unstable if nobody reacts, especially with two seats.
  const load =
    s.drillMode === 'climb' || s.drillMode === 'descend'
      ? 0.16 + 0.84 * s.climb
      : s.drillMode === 'handoff'
        ? 0.55
        : 1;
  const disturbance =
    Math.sin(s.phaseTime * 1.9) * 0.2 +
    s.balance * (held ? 0.42 : 0.3) +
    (!held ? 0.018 : 0) +
    (s.drillRunning ? Math.sin(s.phaseTime * 29) * 0.13 : 0);
  s.balance +=
    (disturbance * load + correction * 1.2) * dt * (s.chairs === 2 ? 1.65 : 1);
  if (Math.abs(s.balance) > 1) {
    fall(s);
    return false;
  }
  return true;
}

export function drillStep(s: GameState, dt: number, input: Input[]) {
  const solo = s.players === 1;
  const climber = input[solo ? 0 : CLIMBER];
  syncDrillGear(s);
  updateToolPositions(s, dt);
  assistantStep(s, dt, input[ASSISTANT]);
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
    if (s.cooldown > 0) return;
    const canMove = nearChairs(s) && (solo || input[0].held);
    if (canMove) {
      if (input[0].y > 0 && s.chairs !== 2) setChairs(s, 2);
      if (input[0].y < 0 && s.chairs !== 1) setChairs(s, 1);
      const before = s.chairX;
      s.chairX = clamp(s.chairX + input[0].x * dt * 2.7, -4.75, 4.75);
      s.drillAssistant.x += (s.chairX - before) * 0.49;
      s.drillAssistant.target = null;
      s.drillAssistant.route = [];
      if (input[0].x) {
        s.workers[0].animation = 'walk';
        s.workers[1].animation = 'walk';
        s.drillAssistant.activity = 'walk';
      }
    }
    if (climber.pressed) {
      const target = s.holes.length === 0 ? -4.4 : 4.4;
      if (Math.abs(s.chairX - target) > 0.12) {
        drillSay(s, 'Стулья сначала под отметку. Я пока постою сбоку.', 1);
        return;
      }
      if (!nearChairs(s) || (!solo && !s.braceHeld)) {
        drillSay(s, 'Никита, подойди и подержи, пока я залезаю.', 1);
        return;
      }
      s.drillMode = 'climb';
      s.climb = 0;
      s.balance = 0;
      stopTools(s);
      drillSay(s, 'Держу. Забирайся!', 0);
    }
    return;
  }
  if (!balanceStep(s, dt, input)) return;
  if (s.drillMode === 'climb') {
    if (climber.held) s.climb = Math.min(1, s.climb + dt * 0.48);
    s.workers[CLIMBER].animation = 'climb';
    if (s.climb === 1) {
      if (s.drillGear === 'ready') s.drillMode = 'drill';
      else {
        s.drillMode = 'handoff';
        if (!s.toolsRemembered) {
          s.toolsRemembered = true;
          drillSay(
            s,
            'Я залез. А дрель-то… на полке осталась! И пылесос захвати.',
            1,
          );
        } else
          drillSay(
            s,
            'Никита, подай приборы. Теперь постараюсь не уронить.',
            1,
          );
      }
    }
    return;
  }
  if (s.drillMode === 'handoff') {
    s.workers[CLIMBER].animation = 'hold';
    const kind = nextHandoffTool(s);
    const passing =
      kind !== null && s.braceHeld && climber.held && s.cooldown === 0;
    if (passing) {
      if (s.handoffTool !== kind) {
        s.handoffTool = kind;
        s.handoffProgress = 0;
      }
      s.workers[CLIMBER].animation = 'handoff';
      s.workers[ASSISTANT].animation = 'handoff';
      s.drillAssistant.activity = 'handoff';
      s.handoffProgress = Math.min(1, s.handoffProgress + dt / 0.9);
      if (s.handoffProgress === 1) {
        s.drillTools[kind].location = 'climber';
        s.handoffTool = null;
        s.handoffProgress = 0;
        s.cooldown = 0.2;
        syncDrillGear(s);
        if (s.drillGear === 'ready') {
          s.drillMode = 'drill';
          drillSay(s, 'Всё, держу дрель и пылесос. Поехали.', 1);
        } else
          drillSay(
            s,
            kind === 'drill'
              ? 'Дрель есть. Теперь пылесос.'
              : 'Пылесос есть. Ещё дрель.',
            1,
          );
      }
    } else {
      s.handoffTool = null;
      s.handoffProgress = 0;
    }
    return;
  }
  if (s.drillMode === 'descend') {
    s.workers[CLIMBER].animation = 'climb';
    if (climber.held) s.climb = Math.max(0, s.climb - dt * 0.52);
    if (s.climb === 0) {
      stopTools(s);
      s.balance = 0;
      if (s.holes.length === 2) {
        finishDrilling(s);
      } else {
        s.drillMode = 'position';
        s.aim = clamp(s.aim + 0.13, 4.6, 7);
        s.message =
          'Ярик на полу. Переставляем стулья направо. Приборы у Ярика на поясе.';
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

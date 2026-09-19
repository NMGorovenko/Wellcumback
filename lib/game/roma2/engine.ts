import { PLAYER_BINDINGS } from '../input/bindings.ts';
import {
  stallX,
  TOILET_EXIT,
  TOILET_SCREEN,
  SIGHT_RANGE,
  SIGHT_HALF_ANGLE,
  insideToiletStall,
  atOwnStall,
  atToiletRags,
  toiletCanStand,
  toiletSightDistance,
} from './layout.ts';
export {
  stallX,
  TOILET_EXIT,
  TOILET_RAGS,
  atOwnStall,
  atToiletRags,
} from './layout.ts';
export type ToiletStage =
  | 'relief'
  | 'paper'
  | 'call'
  | 'rag'
  | 'return'
  | 'wipe'
  | 'escape'
  | 'done';
export type ToiletActor = {
  stage: ToiletStage;
  x: number;
  z: number;
  heading: number;
  progress: number;
  stageTime: number;
  cycle: number;
  strokes: number;
  scratches: number;
  calls: number;
  itch: number;
  ragDirt: number;
  mess: number;
  moving: boolean;
  working: boolean;
  previousAction: boolean;
  previousSecondary: boolean;
  release: boolean;
  reaction: number;
  callCooldown: number;
  line: string;
  lineUntil: number;
  carryingRag: boolean;
  exposure: number;
  caught: number;
  recovery: number;
};
export type ToiletVisitor = {
  stage: 'away' | 'warning' | 'enter' | 'wash' | 'inspect' | 'leave';
  time: number;
  visits: number;
  x: number;
  z: number;
  heading: number;
  gaze: number;
  moving: boolean;
  alert: number;
};
export type Roma2State = {
  phase: 'brief' | 'playing' | 'result';
  players: number;
  actorCount: number;
  paused: boolean;
  elapsed: number;
  score: number;
  actors: ToiletActor[];
  visitor: ToiletVisitor;
};
export const TIMING_WINDOW = { from: 0.64, to: 0.88 };
export const inToiletWindow = (cycle: number) =>
  cycle >= TIMING_WINDOW.from && cycle <= TIMING_WINDOW.to;
export const visitorPresent = (v: ToiletVisitor) =>
  !['away', 'warning'].includes(v.stage);
export const walkingToiletStage = (a: ToiletActor) =>
  ['rag', 'return', 'escape'].includes(a.stage);
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);
export function freshRoma2(players: number): Roma2State {
  const count = Math.max(1, Math.min(3, Math.floor(players) || 1));
  return {
    phase: 'brief',
    players: count,
    actorCount: count,
    paused: false,
    elapsed: 0,
    score: 0,
    visitor: {
      stage: 'away',
      time: 0,
      visits: 0,
      ...TOILET_EXIT,
      heading: Math.PI,
      gaze: Math.PI,
      moving: false,
      alert: 0,
    },
    actors: Array.from({ length: count }, (_, i) => ({
      stage: 'relief',
      x: stallX(i),
      z: -1.3,
      heading: 0,
      progress: 0,
      stageTime: 0,
      cycle: 0,
      strokes: 0,
      scratches: 0,
      calls: 0,
      itch: 0,
      ragDirt: 0,
      mess: 0,
      moving: false,
      working: false,
      previousAction: true,
      previousSecondary: true,
      release: true,
      reaction: 0,
      callCooldown: 0,
      line: '',
      lineUntil: 0,
      carryingRag: false,
      exposure: 0,
      caught: 0,
      recovery: 0,
    })),
  };
}
export function roma2Action(state: Roma2State) {
  if (state.phase !== 'brief') return;
  state.phase = 'playing';
  state.paused = false;
  say(state, state.actors[0], 'Наконец-то пять минут тишины.');
}
function say(s: Roma2State, a: ToiletActor, text: string) {
  a.line = text;
  a.lineUntil = s.elapsed + 4.8;
}
function advance(a: ToiletActor, stage: ToiletStage) {
  a.stage = stage;
  a.stageTime = a.progress = a.cycle = 0;
  a.release = true;
  a.working = false;
}
export function visitorCanSee(
  v: ToiletVisitor,
  a: Pick<ToiletActor, 'x' | 'z'>,
) {
  if (!visitorPresent(v) || insideToiletStall(a)) return false;
  const d = distance(v, a),
    angle = Math.atan2(a.x - v.x, a.z - v.z);
  return (
    d < SIGHT_RANGE &&
    Math.abs(wrap(angle - v.gaze)) < SIGHT_HALF_ANGLE &&
    toiletSightDistance(v, angle) >= d - 0.03
  );
}
export function toiletHidden(s: Roma2State, a: ToiletActor) {
  if (insideToiletStall(a)) return true;
  if (
    !(
      a.x > TOILET_SCREEN.x + 0.3 &&
      Math.abs(a.z - TOILET_SCREEN.z) < TOILET_SCREEN.d / 2 - 0.15
    )
  )
    return false;
  return (
    !visitorPresent(s.visitor) ||
    toiletSightDistance(
      s.visitor,
      Math.atan2(a.x - s.visitor.x, a.z - s.visitor.z),
    ) <
      distance(s.visitor, a) - 0.1
  );
}
export function toiletCue(a: ToiletActor) {
  if (a.recovery > 0) return 'Спалился! Пережди в кабинке';
  if (a.stage === 'done') return 'Добрался. Ждём остальных';
  if (a.release) return 'Отпусти кнопки';
  switch (a.stage) {
    case 'relief':
      return 'Держи · собраться с силами';
    case 'paper':
      return 'Бумаги нет · идти за тряпкой';
    case 'call':
      return 'Никто не отвечает… Можно идти';
    case 'rag':
      return atToiletRags(a)
        ? 'Держи · взять половую тряпку'
        : 'За тряпкой · к ведру в дальнем углу';
    case 'return':
      return 'Верни тряпку в свою кабинку';
    case 'wipe':
      return 'Нажми в зелёном секторе';
    case 'escape':
      return a.itch > 28
        ? 'Нажми в секторе · почесать'
        : 'К выходу · избегай чужих глаз';
  }
}
export function visitorCue(v: ToiletVisitor) {
  if (v.stage === 'warning')
    return `Шаги за дверью · ${Math.max(1, Math.ceil(2.8 - v.time))} сек.`;
  if (v.stage === 'away') return 'Коридор свободен';
  if (v.alert > 0) return 'Тебя заметили! В кабинку!';
  if (v.stage === 'wash') return 'Посетитель у раковины · следи за взглядом';
  if (v.stage === 'leave') return 'Посетитель уходит';
  return 'Посетитель осматривается · прячься от света';
}
function visitorTick(v: ToiletVisitor, dt: number) {
  v.time += dt;
  v.alert = Math.max(0, v.alert - dt);
  v.moving = false;
  const sinkZ = v.visits % 2 ? 5.4 : 4.2;
  const move = (x: number, z: number, speed = 1.6) => {
    const dx = x - v.x,
      dz = z - v.z,
      d = Math.hypot(dx, dz);
    if (d < 0.04) return true;
    const amount = Math.min(d, speed * dt);
    v.x += (dx / d) * amount;
    v.z += (dz / d) * amount;
    v.heading = Math.atan2(dx, dz);
    v.gaze = v.heading;
    v.moving = true;
    return d <= speed * dt;
  };
  const next = (stage: ToiletVisitor['stage']) => {
    v.stage = stage;
    v.time = 0;
  };
  if (v.stage === 'away' && v.time >= (v.visits ? 13 : 11)) next('warning');
  else if (v.stage === 'warning' && v.time >= 2.8) {
    v.visits++;
    v.x = TOILET_EXIT.x;
    v.z = TOILET_EXIT.z;
    next('enter');
  } else if (v.stage === 'enter' && move(-3.65, sinkZ)) next('wash');
  else if (v.stage === 'wash') {
    v.heading = -Math.PI / 2;
    v.gaze = v.heading + Math.sin(v.time * 0.8) * 0.14;
    if (v.time >= 4.2) next('inspect');
  } else if (v.stage === 'inspect') {
    if (v.time < 2.6) move(v.visits % 2 ? -0.8 : 0.8, 2.4, 1.45);
    v.gaze = Math.PI + Math.sin((v.time - 2.6) * 0.9) * 1.25;
    v.heading = v.gaze;
    if (v.time >= 7.2) next('leave');
  } else if (v.stage === 'leave' && move(TOILET_EXIT.x, TOILET_EXIT.z, 1.7))
    next('away');
}
function walk(
  a: ToiletActor,
  i: number,
  dt: number,
  keys: ReadonlySet<string>,
) {
  const binding = PLAYER_BINDINGS[i];
  let dx = Number(keys.has(binding.right)) - Number(keys.has(binding.left));
  let dz = Number(keys.has(binding.down)) - Number(keys.has(binding.up));
  const length = Math.hypot(dx, dz);
  if (!length) return;
  dx /= length;
  dz /= length;
  const speed =
    a.stage === 'escape'
      ? 2.35 * (1 - a.itch / 180) * (a.reaction ? 0.45 : 1)
      : 2.15;
  const nx = a.x + dx * speed * dt,
    nz = a.z + dz * speed * dt;
  const beforeX = a.x,
    beforeZ = a.z;
  if (toiletCanStand(nx, a.z)) a.x = nx;
  if (toiletCanStand(a.x, nz)) a.z = nz;
  a.heading = Math.atan2(dx, dz);
  a.moving = Math.hypot(a.x - beforeX, a.z - beforeZ) > 0.0001;
}
function caught(s: Roma2State, a: ToiletActor, i: number) {
  a.caught++;
  a.recovery = 2.3;
  a.exposure = 0;
  a.x = stallX(i);
  a.z = -1.3;
  a.heading = 0;
  a.moving = a.working = false;
  a.release = true;
  if (a.stage === 'return') {
    advance(a, 'rag');
    a.carryingRag = false;
  }
  a.progress = 0;
  s.score = Math.max(0, s.score - 35);
  s.visitor.alert = 2.3;
  say(s, a, 'Бля, спалился! Пережду здесь.');
}
/** Serializable patrol, perception and player actions run only on the host. */
export function roma2Tick(
  s: Roma2State,
  dt: number,
  keys: ReadonlySet<string>,
) {
  if (s.paused || s.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0)
    return;
  dt = Math.min(dt, 0.05);
  s.elapsed += dt;
  visitorTick(s.visitor, dt);
  s.actors.forEach((a, i) => {
    const b = PLAYER_BINDINGS[i],
      action = keys.has(b.action),
      secondary = keys.has(b.secondary);
    const press = action && !a.previousAction,
      call = secondary && !a.previousSecondary;
    a.previousAction = action;
    a.previousSecondary = secondary;
    a.stageTime += dt;
    a.reaction = Math.max(0, a.reaction - dt);
    a.callCooldown = Math.max(0, a.callCooldown - dt);
    a.moving = a.working = false;
    if (!Object.values(b).some((key) => keys.has(key))) a.release = false;
    if (a.stage === 'done') return;
    if (a.recovery > 0) {
      a.recovery = Math.max(0, a.recovery - dt);
      a.release = true;
      return;
    }
    if (
      call &&
      !a.release &&
      !a.callCooldown &&
      ['paper', 'call', 'rag', 'return', 'wipe'].includes(a.stage)
    ) {
      a.calls++;
      a.callCooldown = 5;
      if (a.stage === 'paper') advance(a, 'call');
      say(
        s,
        a,
        a.calls === 1
          ? 'Мужики! Бумагу кто-нибудь принесите!'
          : 'Да понял я. Каждый сам за себя.',
      );
    }
    if (a.stage === 'call' && a.calls && a.callCooldown < 1) {
      advance(a, 'rag');
      say(s, a, 'Тишина. Только тряпки у ведра в другом конце. Придётся идти.');
    }
    if (!a.release)
      switch (a.stage) {
        case 'relief':
          a.working = action;
          a.progress = Math.max(
            0,
            Math.min(1, a.progress + (action ? dt / 5.5 : -dt / 16)),
          );
          a.mess = Math.max(a.mess, a.progress);
          if (a.progress >= 1) {
            advance(a, 'paper');
            say(s, a, 'Фух… Блядь. Один картон. Ни листочка?!');
            s.score += 100;
          }
          break;
        case 'paper':
          if (press) {
            advance(a, 'rag');
            say(s, a, 'Тряпки у ведра в дальнем конце. Ладно, сам схожу.');
          }
          break;
        case 'call':
          if (press) {
            advance(a, 'rag');
            say(s, a, 'Не слышат. Придётся самому.');
          }
          break;
        case 'rag':
          walk(a, i, dt, keys);
          a.working = atToiletRags(a) && action && !a.moving;
          a.progress = Math.max(
            0,
            Math.min(1, a.progress + (a.working ? dt / 1.25 : -dt / 2)),
          );
          if (a.progress >= 1) {
            advance(a, 'return');
            a.carryingRag = true;
            say(
              s,
              a,
              'Половая тряпка… Назад в свою кабинку, пока никто не увидел.',
            );
          }
          break;
        case 'return':
          walk(a, i, dt, keys);
          if (atOwnStall(a, i)) {
            a.x = stallX(i);
            a.z = -1.3;
            advance(a, 'wipe');
            say(s, a, 'Дверь закрыл. Ну, тряпка, не подведи.');
          }
          break;
        case 'wipe':
          a.cycle = (a.cycle + dt / 1.9) % 1;
          if (press) {
            a.reaction = 0.55;
            if (inToiletWindow(a.cycle)) {
              a.strokes++;
              a.ragDirt = a.strokes / 4;
              s.score += 75;
              if (a.strokes === 2) say(s, a, 'Полы ею больше не мыть. Вообще.');
              if (a.strokes >= 4) {
                advance(a, 'escape');
                a.carryingRag = false;
                a.itch = 72;
                say(s, a, 'Ай, бля! Теперь ещё и чешется!');
              }
            } else say(s, a, 'Тихо-тихо… тряпка как наждак!');
          }
          break;
        case 'escape':
          a.cycle = (a.cycle + dt / 1.7) % 1;
          a.itch = Math.min(100, a.itch + dt * 3.5);
          if (press) {
            a.reaction = 0.65;
            if (inToiletWindow(a.cycle) && a.itch > 28) {
              a.itch = Math.max(0, a.itch - 38);
              a.scratches++;
              if (a.scratches <= 3) s.score += 30;
            }
          }
          walk(a, i, dt, keys);
          if (distance(a, TOILET_EXIT) < 0.65 && !visitorCanSee(s.visitor, a)) {
            advance(a, 'done');
            say(s, a, 'В следующий наряд — со своим рулоном.');
            s.score += 200;
          }
          break;
      }
    if (walkingToiletStage(a) && visitorCanSee(s.visitor, a))
      a.exposure = Math.min(1, a.exposure + dt / 1.1);
    else a.exposure = Math.max(0, a.exposure - dt * 1.7);
    if (a.exposure >= 1) caught(s, a, i);
  });
  for (let i = 0; i < s.actors.length; i++)
    for (let j = i + 1; j < s.actors.length; j++) {
      const a = s.actors[i],
        b = s.actors[j];
      if (
        !walkingToiletStage(a) ||
        !walkingToiletStage(b) ||
        a.recovery ||
        b.recovery
      )
        continue;
      const dx = b.x - a.x,
        dz = b.z - a.z,
        d = Math.hypot(dx, dz);
      if (d >= 0.5) continue;
      const amount = (0.5 - d) / 2,
        nx = d > 0.001 ? dx / d : 1,
        nz = d > 0.001 ? dz / d : 0;
      for (const [actor, sign] of [
        [a, -1],
        [b, 1],
      ] as const) {
        const x = actor.x + nx * amount * sign,
          z = actor.z + nz * amount * sign;
        if (toiletCanStand(x, z)) {
          actor.x = x;
          actor.z = z;
        }
      }
    }
  if (s.actors.every((a) => a.stage === 'done' && a.stageTime > 2.5))
    s.phase = 'result';
}

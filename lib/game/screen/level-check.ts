import {
  award,
  PHYSICAL_LAYOUT,
  transition,
  type GameState,
  type Input,
} from './engine.ts';
import { screenSay, PROJECTOR_MOVING_LINE } from './dialogue.ts';
import { drillStaging } from './staging.ts';

export type LevelCheck = {
  mode:
    | 'fetch'
    | 'pickup'
    | 'chairs'
    | 'position'
    | 'climb'
    | 'place'
    | 'settle'
    | 'celebrate';
  x: number;
  z: number;
  rotation: number;
  chairX: number;
  chairZ: number;
  progress: number;
};
export const LEVEL_SHELF = { x: 3.52, y: 0.99, z: -2.77 };
export const LEVEL_APPROACH = { x: 3.45, z: -2.4 };
export const LEVEL_CHAIR_PARK = { x: 2.65, z: -1.05 };
export const LEVEL_CHAIR_TARGET = { x: 0, z: -2.23 };
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);
export const freshLevelCheck = (): LevelCheck => ({
  mode: 'fetch',
  x: 2.04,
  z: -2.25,
  rotation: Math.PI,
  chairX: LEVEL_CHAIR_PARK.x,
  chairZ: LEVEL_CHAIR_PARK.z,
  progress: 0,
});
/** Pure fallback also works on a received legacy snapshot before its first tick. */
export const levelCheck = (s: GameState) => s.levelCheck ?? freshLevelCheck();
export const levelChairGrip = (c: LevelCheck) => ({
  x: c.chairX + 0.68,
  z: c.chairZ + 0.22,
});
export const levelChairsCentered = (c: LevelCheck) =>
  distance({ x: c.chairX, z: c.chairZ }, LEVEL_CHAIR_TARGET) < 0.18;
export const levelLabels: Record<LevelCheck['mode'], string> = {
  fetch: 'Взять уровень с полки',
  pickup: 'Берём уровень',
  chairs: 'Вернуться к стульям',
  position: 'Стулья — к середине экрана',
  climb: 'Ярик поднимается',
  place: 'Положить уровень на экран',
  settle: 'Проверить уровень',
  celebrate: 'Вот теперь кино',
};
/** The screen has left the floor. Sweep walking and furniture carrying in room
 * metres; a direction key cannot tunnel through the console, shelf or a friend. */
function clear(
  x: number,
  z: number,
  radius: number,
  c: LevelCheck,
  carrying = false,
  players = 2,
) {
  const b = PHYSICAL_LAYOUT.bounds;
  if (
    x - radius < b.minX ||
    x + radius > b.maxX ||
    z - radius < b.minZ ||
    z + radius > b.maxZ
  )
    return false;
  const objects = [
    ...PHYSICAL_LAYOUT.furniture.slice(0, -2),
    { minX: 3.075, maxX: 4.025, minZ: -3.21, maxZ: -2.79 },
  ];
  if (!carrying)
    objects.push({
      minX: c.chairX - 0.25,
      maxX: c.chairX + 0.25,
      minZ: c.chairZ - 0.3,
      maxZ: c.chairZ + 0.3,
    });
  if (
    objects.some(
      (r) =>
        x > r.minX - radius &&
        x < r.maxX + radius &&
        z > r.minZ - radius &&
        z < r.maxZ + radius,
    )
  )
    return false;
  return (
    Math.hypot(x + 2.25, z + 1.65) > radius + 0.25 &&
    (players < 3 || Math.hypot(x + 0.9, z - 0.1) > radius + 0.25)
  );
}
function move(
  c: LevelCheck,
  input: Input,
  dt: number,
  carrying: boolean,
  players: number,
) {
  const magnitude = Math.hypot(input.x, input.y);
  if (!magnitude) return false;
  const speed = ((carrying ? 1 : 1.7) * dt) / Math.max(1, magnitude);
  const dx = input.x * speed,
    dz = -input.y * speed;
  const attempt = (x: number, z: number) => {
    if (!clear(x, z, 0.255, c, carrying, players)) return false;
    const chairX = c.chairX + x - c.x,
      chairZ = c.chairZ + z - c.z;
    if (carrying && !clear(chairX, chairZ, 0.31, c, true, players))
      return false;
    c.x = x;
    c.z = z;
    if (carrying) {
      c.chairX = chairX;
      c.chairZ = chairZ;
    }
    c.rotation = carrying ? -Math.PI / 2 : Math.atan2(dx, dz);
    return true;
  };
  return (
    attempt(c.x + dx, c.z + dz) ||
    attempt(c.x + dx, c.z) ||
    attempt(c.x, c.z + dz)
  );
}
export function levelCheckStage(s: GameState) {
  const c = levelCheck(s);
  const elevated = ['climb', 'place', 'settle', 'celebrate'].includes(c.mode);
  const stage = drillStaging({
    chairs: 2,
    chairX: c.chairX / 0.49,
    drillMode: elevated ? 'climb' : 'position',
    climb: c.mode === 'climb' ? c.progress : elevated ? 1 : 0,
    fallHeight: 0,
    fallProgress: 0,
    balance: 0,
    aim: s.aim,
  });
  const dz = c.chairZ - stage.stools[0].z;
  stage.stools.forEach((stool) => {
    stool.z += dz;
  });
  const yarik = stage.workers[1];
  yarik.z += dz;
  if (!elevated)
    Object.assign(yarik, {
      x: c.x,
      y: 0,
      z: c.z,
      rotation: c.rotation,
      crouch: 0,
      lean: 0,
    });
  else if (c.mode !== 'climb') yarik.crouch = 0.08;
  else {
    const blend = Math.min(1, c.progress / 0.16);
    yarik.x = c.x + (yarik.x - c.x) * blend;
    yarik.z = c.z + (yarik.z - c.z) * blend;
  }
  Object.assign(stage.workers[0], {
    x: -2.25,
    z: -1.65,
    rotation: 0.6,
    crouch: 0,
  });
  Object.assign(stage.workers[2], {
    x: -0.9,
    z: 0.1,
    rotation: Math.PI,
    crouch: 0,
  });
  return stage;
}
export function levelStep(s: GameState, dt: number, input: Input[]) {
  const c = (s.levelCheck ??= freshLevelCheck());
  const player = s.players === 1 ? 0 : 1,
    control = input[player];
  const enter = (mode: LevelCheck['mode']) => {
    c.mode = mode;
    c.progress = 0;
    s.message = levelLabels[mode];
    if (mode === 'pickup') c.rotation = Math.PI;
  };
  if (c.mode === 'fetch' || c.mode === 'chairs' || c.mode === 'position') {
    if (move(c, control, dt, c.mode === 'position', s.players))
      s.workers[1].animation = 'walk';
    if (
      c.mode === 'fetch' &&
      distance(c, LEVEL_APPROACH) < 0.42 &&
      control.held
    )
      enter('pickup');
    else if (
      c.mode === 'chairs' &&
      distance(c, levelChairGrip(c)) < 0.4 &&
      control.pressed
    ) {
      // Align to the outside handle before moving the stack as one solid body.
      if (distance(c, levelChairGrip(c)) > 0.08) {
        const target = levelChairGrip(c);
        c.x += (target.x - c.x) * Math.min(1, dt * 8);
        c.z += (target.z - c.z) * Math.min(1, dt * 8);
      }
      enter('position');
    } else if (
      c.mode === 'position' &&
      levelChairsCentered(c) &&
      control.pressed
    )
      enter('climb');
    return;
  }
  if (c.mode === 'pickup' || c.mode === 'climb' || c.mode === 'place') {
    // Context action first aligns feet/furniture, then begins the hand/ascent
    // animation. This makes every allowed approach physically reachable.
    const align =
      c.mode === 'pickup'
        ? LEVEL_APPROACH
        : c.mode === 'climb' && c.progress === 0
          ? {
              x: c.x + LEVEL_CHAIR_TARGET.x - c.chairX,
              z: c.z + LEVEL_CHAIR_TARGET.z - c.chairZ,
            }
          : null;
    if (align && distance(c, align) > 0.015) {
      if (
        control.held &&
        move(
          c,
          { ...control, x: align.x - c.x, y: c.z - align.z },
          dt * 4,
          c.mode === 'climb',
          s.players,
        )
      )
        s.workers[1].animation = 'walk';
      return;
    }
    if (c.mode === 'pickup') c.rotation = Math.PI;
    if (control.held)
      c.progress = Math.min(
        1,
        c.progress + dt / (c.mode === 'climb' ? 2.1 : 0.9),
      );
    s.workers[1].animation = c.mode === 'climb' ? 'climb' : 'hold';
    if (c.progress === 1) {
      if (c.mode === 'pickup') {
        enter('chairs');
        screenSay(s, 'Щас проверим. Уровень-то не врёт.', 1, 3.5);
      } else if (c.mode === 'climb') enter('place');
      else {
        enter('settle');
        s.bubble = s.angle;
        s.levelStable = 0;
      }
    }
    return;
  }
  if (c.mode === 'celebrate') {
    const before = c.progress;
    c.progress += dt;
    if (before < 5.5 && c.progress >= 5.5)
      screenSay(s, PROJECTOR_MOVING_LINE, 0, 6);
    if (c.progress >= 11.5) {
      award(s, 'Потолок кривой. Экран — нет.', 600);
      award(
        s,
        'Слаженность бригады',
        Math.max(0, Math.round(1200 - s.elapsed * 1.4 - s.tool.misses * 20)),
      );
      transition(
        s,
        'result',
        'Включай кино. Про полчаса больше никому не рассказываем.',
      );
    }
    return;
  }
  const steering = input.slice(0, s.players).filter((c) => c.x !== 0);
  const direction = steering.length
    ? steering.reduce((sum, c) => sum + c.x, 0) / steering.length
    : 0;
  s.angle = clamp(s.angle + direction * dt * 0.045, -0.22, 0.22);
  s.bubble += (s.angle - s.bubble) * Math.min(1, dt * 4);
  s.levelStable =
    Math.abs(s.angle) < 0.012 && Math.abs(s.bubble) < 0.013 && !direction
      ? Math.min(1.2, s.levelStable + dt)
      : 0;
  if (s.levelStable >= 1 && input.some((c, p) => p < s.players && c.pressed)) {
    enter('celebrate');
    screenSay(s, 'нихуя с первого раза и по уровню вышло xD', 1, 5.5);
  }
}

/** Barracks v3: deterministic story, physical traces, shared cleanup and controller-friendly Q/E rhythm. */
export type CleanPhase =
  | 'brief'
  | 'duty'
  | 'find'
  | 'accident'
  | 'toilet'
  | 'shower'
  | 'laundry'
  | 'spin'
  | 'response'
  | 'clean'
  | 'result';
export type Point = { x: number; y: number };
export type TraceKind = 'spill' | 'trail' | 'footprint' | 'foam';
export type CleanSpot = Point & {
  id: number;
  size: number;
  weight: number;
  progress: number;
  kind: TraceKind;
  foam: boolean;
  rotation: number;
  createdAt: number;
};
export type Activity =
  | 'idle'
  | 'walk'
  | 'strain'
  | 'relief'
  | 'shower'
  | 'load'
  | 'brace'
  | 'valve'
  | 'mop'
  | 'rinse'
  | 'react'
  | 'gear'
  | 'guard';
type Navigation = { path: Point[]; goal: string };
export type CleanNpc = Point & {
  id: 'duty' | 'witness1' | 'witness2';
  action: Activity;
  line: string;
  suited: boolean;
  navigation: Navigation;
};
export type Rhythm = {
  active: boolean;
  expected: 'KeyQ' | 'KeyE';
  clock: number;
  period: number;
  window: number;
  combo: number;
  hits: number;
  misses: number;
  feedback: 'waiting' | 'good' | 'early' | 'late' | 'wrong';
  feedbackTime: number;
};
export type CleanState = {
  practice?: boolean;
  phase: CleanPhase;
  phaseTime: number;
  players: number;
  actorCount: number;
  x: number[];
  y: number[];
  elapsed: number;
  timer: number;
  score: number;
  message: string;
  paused: boolean;
  station: number;
  urge: number;
  baselineUrge: number;
  rhythm: Rhythm;
  accidentSeverity: number;
  spillActive: boolean;
  containment: {
    stamina: number;
    cooldown: number;
    held: boolean;
    suppressed: boolean;
  };
  soiled: boolean;
  relief: number;
  shower: number;
  washed: boolean;
  pants: 'worn' | 'soiled' | 'bagged' | 'loaded';
  pantsLoaded: boolean;
  laundryProgress: number;
  machine: number;
  spin: number;
  balance: number;
  valve: number;
  leaks: number;
  leakClock: number;
  machineClean: number;
  responseStage: 'none' | 'approach' | 'react' | 'gear' | 'ready';
  responseTime: number;
  npcs: CleanNpc[];
  spots: CleanSpot[];
  dirt: number[];
  rinse: number[];
  activity: Activity[];
  teamwork: number;
  penalties: number;
  cooldown: number;
  navigation: Navigation[];
  simulation: {
    previousE: boolean;
    previousQ: boolean;
    traceDistance: number;
    footprintDistance: number;
    dripTime: number;
    foot: number;
    nextTrace: number;
    missedWindows: number;
    incidentAtDesk: boolean;
  };
};
/** Cleanup role slots are independent of the apartment cast order. */
export const cleanCrew = [
  { id: 'roma', name: 'Рома' },
  { id: 'nikita', name: 'Никита' },
  { id: 'yaroslav', name: 'Ярик' },
] as const;
export const dutyReprimand = 'Ты охуел, боец?! Иди, блять, сри в туалете!';
export const mapSize = { width: 1200, height: 800 };
export const bounds = { minX: 60, maxX: 1140, minY: 60, maxY: 750 };
export const stations = [
  { id: 'desk', x: 1030, y: 365, label: 'ДНЕВАЛЬНЫЙ' },
  { id: 'toilet', x: 170, y: 670, label: 'ТУАЛЕТ' },
  { id: 'shower', x: 420, y: 675, label: 'ДУШ' },
  { id: 'washer', x: 1040, y: 670, label: 'СТИРАЛКА' },
  { id: 'valve', x: 900, y: 650, label: 'ВЕНТИЛЬ' },
  { id: 'bucket', x: 650, y: 675, label: 'ВЕДРО' },
  { id: 'gear', x: 735, y: 490, label: 'ХИМЗАЩИТА' },
  { id: 'duty', x: 135, y: 355, label: 'ДЕЖУРСТВО' },
] as const;
export const obstacles = [
  ...Array.from({ length: 7 }, (_, i) => ({
    x: 105 + i * 145,
    y: 95,
    w: 100,
    h: 135,
    label: 'КРОВАТЬ',
    kind: 'bed',
  })),
  { x: 450, y: 315, w: 180, h: 65, label: 'СКАМЬЯ', kind: 'bench' },
  { x: 285, y: 550, w: 20, h: 200, label: 'СТЕНА ТУАЛЕТА', kind: 'wall' },
  { x: 505, y: 550, w: 18, h: 200, label: 'СТЕНА ДУША', kind: 'wall' },
  { x: 835, y: 550, w: 18, h: 200, label: 'СТЕНА ПРАЧЕЧНОЙ', kind: 'wall' },
  // Door openings remain real walkable gaps; rendered walls use these same colliders.
  { x: 60, y: 535, w: 70, h: 16, label: 'ВХОД В ТУАЛЕТ', kind: 'wall' },
  { x: 305, y: 535, w: 25, h: 16, label: 'ВХОД В ДУШ', kind: 'wall' },
  { x: 460, y: 535, w: 45, h: 16, label: 'ВХОД В ДУШ', kind: 'wall' },
  { x: 523, y: 535, w: 87, h: 16, label: 'ВХОД В ХОЗКОМНАТУ', kind: 'wall' },
  { x: 795, y: 535, w: 40, h: 16, label: 'ВХОД В ХОЗКОМНАТУ', kind: 'wall' },
  { x: 853, y: 535, w: 67, h: 16, label: 'ВХОД В ПРАЧЕЧНУЮ', kind: 'wall' },
  { x: 1050, y: 535, w: 90, h: 16, label: 'ВХОД В ПРАЧЕЧНУЮ', kind: 'wall' },
  { x: 60, y: 280, w: 220, h: 16, label: 'СПАЛЬНОЕ ПОМЕЩЕНИЕ', kind: 'wall' },
  { x: 350, y: 280, w: 280, h: 16, label: 'СПАЛЬНОЕ ПОМЕЩЕНИЕ', kind: 'wall' },
  { x: 750, y: 280, w: 180, h: 16, label: 'СПАЛЬНОЕ ПОМЕЩЕНИЕ', kind: 'wall' },
];
export const furniture = [
  { x: 985, y: 305, w: 90, h: 45, label: 'ТУМБА', kind: 'desk' },
  { x: 1000, y: 625, w: 80, h: 60, label: 'СТИРАЛКА', kind: 'washer' },
  { x: 680, y: 435, w: 110, h: 28, label: 'ШКАФ ХИМЗАЩИТЫ', kind: 'gear' },
  { x: 148, y: 700, w: 44, h: 42, label: 'УНИТАЗ', kind: 'toilet' },
];
export const cleanBindings = [
  ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyE'],
  ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'],
  ['KeyJ', 'KeyL', 'KeyI', 'KeyK', 'KeyO'],
];
const solids = [...obstacles, ...furniture];
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const position = (s: CleanState, i: number): Point => ({
  x: s.x[i],
  y: s.y[i],
});
const near = (s: CleanState, i: number, target: Point, radius = 70) =>
  distance(position(s, i), target) < radius;
const active = (s: CleanState) =>
  !s.paused && !['brief', 'result'].includes(s.phase);
const navigation = (): Navigation => ({ path: [], goal: '' });
export function canStand(x: number, y: number) {
  return (
    x >= bounds.minX &&
    x <= bounds.maxX &&
    y >= bounds.minY &&
    y <= bounds.maxY &&
    !solids.some(
      (o) =>
        x > o.x - 13 &&
        x < o.x + o.w + 13 &&
        y > o.y - 13 &&
        y < o.y + o.h + 13,
    )
  );
}
export function freshClean(players = 1): CleanState {
  return {
    phase: 'brief',
    phaseTime: 0,
    players: clamp(Math.floor(players) || 1, 1, 3),
    actorCount: 1,
    x: [135, 715, 755],
    y: [355, 505, 505],
    elapsed: 0,
    timer: 0,
    score: 0,
    message:
      'Другая рота. Безымянный солдат. До конца дежурства всё было совершенно обычно.',
    paused: false,
    station: 7,
    urge: 0.14,
    baselineUrge: 0.14,
    rhythm: {
      active: false,
      expected: 'KeyQ',
      clock: 0,
      period: 0.84,
      window: 0.2,
      combo: 0,
      hits: 0,
      misses: 0,
      feedback: 'waiting',
      feedbackTime: 0,
    },
    containment: { stamina: 1, cooldown: 0, held: false, suppressed: false },
    accidentSeverity: 0,
    spillActive: false,
    soiled: false,
    relief: 0,
    shower: 0,
    washed: false,
    pants: 'worn',
    pantsLoaded: false,
    laundryProgress: 0,
    machine: 0,
    spin: 0,
    balance: 0.2,
    valve: 0,
    leaks: 0,
    leakClock: 0,
    machineClean: 0,
    responseStage: 'none',
    responseTime: 0,
    npcs: [
      {
        id: 'duty',
        x: 1030,
        y: 285,
        action: 'guard',
        line: '',
        suited: false,
        navigation: navigation(),
      },
      {
        id: 'witness1',
        x: 560,
        y: 255,
        action: 'idle',
        line: '',
        suited: false,
        navigation: navigation(),
      },
      {
        id: 'witness2',
        x: 740,
        y: 255,
        action: 'idle',
        line: '',
        suited: false,
        navigation: navigation(),
      },
    ],
    spots: [],
    dirt: [0, 0, 0],
    rinse: [0, 0, 0],
    activity: ['guard', 'idle', 'idle'],
    teamwork: 0,
    penalties: 0,
    cooldown: 0,
    navigation: [navigation(), navigation(), navigation()],
    simulation: {
      previousE: false,
      previousQ: false,
      traceDistance: 0,
      footprintDistance: 0,
      dripTime: 0,
      foot: 0,
      nextTrace: 0,
      missedWindows: 0,
      incidentAtDesk: false,
    },
  };
}
function phase(s: CleanState, value: CleanPhase, message: string) {
  s.phase = value;
  if (value === 'shower') {
    s.npcs[0].action = 'idle';
    s.npcs[0].line = '';
  }
  s.phaseTime = 0;
  s.message = message;
}
function award(s: CleanState, points: number) {
  if (!s.practice) s.score += points;
}
function addTrace(
  s: CleanState,
  kind: TraceKind,
  point: Point,
  size: number,
  weight: number,
  rotation = 0,
) {
  if (kind !== 'footprint') {
    const old = s.spots.find(
      (p) => p.kind === kind && p.progress === 0 && distance(p, point) < 24,
    );
    if (old) {
      old.size = Math.min(48, old.size + size * 0.15);
      old.weight = Math.min(2.8, old.weight + weight * 0.2);
      return;
    }
  }
  s.spots.push({
    id: ++s.simulation.nextTrace,
    ...point,
    size,
    weight,
    progress: 0,
    kind,
    foam: kind === 'foam',
    rotation,
    createdAt: s.elapsed,
  });
}
function accident(s: CleanState, atDesk: boolean) {
  s.rhythm.active = false;
  s.spillActive = true;
  s.soiled = true;
  s.pants = 'soiled';
  s.station = 1;
  s.simulation.incidentAtDesk = atDesk;
  s.accidentSeverity = clamp(
    0.45 + s.urge * 0.55 + s.rhythm.misses * 0.018,
    0.45,
    1.3,
  );
  s.urge = 1;
  addTrace(
    s,
    'spill',
    position(s, 0),
    22 + s.accidentSeverity * 12,
    1 + s.accidentSeverity,
  );
  phase(
    s,
    'accident',
    atDesk
      ? '«Товарищ дневальный, разрешите…» Клапан согласования сорвало прямо у тумбы.'
      : 'Дотерпел. Дневальный заметил проблему и идёт разбираться. Оставайся на месте.',
  );
  s.npcs[0].action = 'walk';
  s.npcs[0].line = 'Боец, ты что, обосрался?!';
}
export function cleanAction(s: CleanState) {
  if (s.paused || s.cooldown > 0 || s.phase === 'result') return;
  if (s.phase === 'brief')
    phase(
      s,
      'duty',
      'Обычное дежурство. Походи немного. Организм уже готовит внеплановый доклад.',
    );
  else if (s.phase === 'find' && near(s, 0, stations[0])) {
    award(s, 120 + s.rhythm.hits * 15);
    accident(s, true);
  }
}
/** Compatibility for old callers; the story now uses contextual actions, not dialogue choices. */
export function cleanChoice(s: CleanState, _option: number) {
  cleanAction(s);
}
function rhythmPress(s: CleanState, key: 'KeyQ' | 'KeyE') {
  const r = s.rhythm;
  if (!r.active) return;
  const correct =
    key === r.expected && Math.abs(r.clock - r.period) <= r.window;
  if (correct) {
    r.hits++;
    r.combo++;
    r.feedback = 'good';
    r.expected = key === 'KeyQ' ? 'KeyE' : 'KeyQ';
    r.clock = Math.max(0, r.clock - r.period);
    s.urge = Math.max(s.baselineUrge, s.urge - 0.075);
    award(s, 8);
  } else {
    r.misses++;
    r.combo = 0;
    r.feedback =
      key !== r.expected ? 'wrong' : r.clock < r.period ? 'early' : 'late';
    s.urge = clamp(s.urge + 0.045);
    s.penalties++;
  }
  r.feedbackTime = 0.45;
}
function move(point: Point, dx: number, dy: number, dt: number, speed = 166) {
  const length = Math.hypot(dx, dy) || 1,
    x = clamp(point.x + (dx / length) * dt * speed, bounds.minX, bounds.maxX),
    y = clamp(point.y + (dy / length) * dt * speed, bounds.minY, bounds.maxY);
  if (canStand(x, point.y)) point.x = x;
  if (canStand(point.x, y)) point.y = y;
}
const GRID = 20,
  COLS = 55,
  ROWS = 35;
const cell = (id: number): Point => ({
  x: bounds.minX + (id % COLS) * GRID,
  y: bounds.minY + Math.floor(id / COLS) * GRID,
});
function clearLine(a: Point, b: Point) {
  const steps = Math.max(1, Math.ceil(distance(a, b) / 5));
  for (let i = 1; i <= steps; i++)
    if (
      !canStand(
        a.x + ((b.x - a.x) * i) / steps,
        a.y + ((b.y - a.y) * i) / steps,
      )
    )
      return false;
  return true;
}
/** Grid routing is only for NPCs. Human movement still uses held directional controls. */
export function planRoute(
  start: Point,
  target: Point,
  radius = 55,
  avoid: Point[] = [],
): Point[] {
  const passable = (p: Point) =>
    canStand(p.x, p.y) && avoid.every((other) => distance(p, other) >= 33);
  if (distance(start, target) < radius) return [];
  const candidates: number[] = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    const p = cell(i);
    if (distance(p, start) < 35 && passable(p) && clearLine(start, p))
      candidates.push(i);
  }
  candidates.sort(
    (a, b) => distance(cell(a), start) - distance(cell(b), start),
  );
  const first = candidates[0];
  if (first === undefined) return [];
  const queue = [first],
    previous = new Map<number, number>([[first, -1]]);
  let end = -1;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor],
      p = cell(id);
    if (distance(p, target) < radius) {
      end = id;
      break;
    }
    for (const next of [id + COLS, id + 1, id - COLS, id - 1]) {
      if (next < 0 || next >= COLS * ROWS || previous.has(next)) continue;
      const q = cell(next);
      if (distance(p, q) > GRID + 1 || !passable(q)) continue;
      previous.set(next, id);
      queue.push(next);
    }
  }
  if (end < 0) return [];
  const route: Point[] = [];
  for (let id = end; id >= 0; id = previous.get(id) ?? -1)
    route.unshift(cell(id));
  return route;
}
function navigate(
  point: Point,
  nav: Navigation,
  target: Point,
  dt: number,
  radius = 55,
  speed = 151,
  avoid: Point[] = [],
) {
  if (distance(point, target) < radius) {
    nav.path = [];
    return true;
  }
  const goal =
    `${Math.round(target.x / 10)},${Math.round(target.y / 10)},${radius}/` +
    avoid
      .map((p) => `${Math.round(p.x / 20)},${Math.round(p.y / 20)}`)
      .join(';');
  if (nav.goal !== goal || !nav.path.length) {
    nav.goal = goal;
    nav.path = planRoute(point, target, radius, avoid);
  }
  const waypoint = nav.path[0];
  if (waypoint) {
    const dist = distance(point, waypoint);
    // A final grid point may only just enter the action radius. Discarding it
    // from 3 units away can rebuild the same route forever without arriving.
    // Walk the remaining distance normally; the speed clamp prevents overshoot.
    if (dist <= 1e-7) nav.path.shift();
    else
      move(
        point,
        waypoint.x - point.x,
        waypoint.y - point.y,
        dt,
        Math.min(speed, dist / dt),
      );
  }
  return distance(point, target) < radius;
}
function startMachine(s: CleanState) {
  s.pants = 'loaded';
  s.pantsLoaded = true;
  s.machineClean = 0;
  s.responseStage = 'approach';
  for (const npc of s.npcs.slice(1)) {
    npc.action = 'walk';
    npc.line = '';
  }
  phase(
    s,
    'spin',
    'Штаны в барабане. Отжим 1200. Остальные услышали, что стиралка делает не «вжух», а «бульк».',
  );
}
function startCleanup(s: CleanState) {
  s.responseStage = 'ready';
  s.actorCount = s.players;
  s.timer = 160;
  // A narrative handoff: the anonymous soldier leaves the playable role; the cleanup crew exits the gear cabinet.
  for (let i = 0; i < 3; i++) {
    s.x[i] = stations[6].x + (i - 1) * 34;
    s.y[i] = 505;
    s.activity[i] = 'idle';
  }
  phase(
    s,
    'clean',
    s.players === 1
      ? 'Рома надел химзащиту. Теперь ты за Рому: перекрой воду, отмой машинку и все следы. Грязную швабру полоскай в ведре.'
      : `${cleanCrew
          .slice(0, s.players)
          .map((person) => person.name)
          .join(
            ', ',
          )} надели химзащиту. Перекройте воду, отмойте машинку и все следы. Грязную швабру полоскайте в ведре.`,
  );
}
function updateWitnesses(s: CleanState, dt: number) {
  const witnesses = s.npcs.slice(1);
  if (s.responseStage === 'approach') {
    const arrived = witnesses.map((npc, i) => {
      npc.action = 'walk';
      return navigate(
        npc,
        npc.navigation,
        { x: 950 + i * 100, y: 595 },
        dt,
        40,
      );
    });
    if (arrived.every(Boolean)) {
      s.responseStage = 'react';
      s.responseTime = 0;
      witnesses[0].line = 'Это, блять, какой режим стирки?';
      witnesses[1].line = 'Нам нужна химзащита. И новая стиралка.';
      s.message =
        '«Это, блять, какой режим стирки?» — «Нам нужна химзащита. И новая стиралка». ';
    }
  } else if (s.responseStage === 'react') {
    s.responseTime += dt;
    witnesses.forEach((npc) => {
      npc.action = 'react';
    });
    if (s.responseTime >= 2.5) {
      s.responseStage = 'gear';
      witnesses.forEach((npc) => {
        npc.line = '';
      });
    }
  } else if (s.responseStage === 'gear') {
    const ready = witnesses.map((npc, i) => {
      npc.action = 'walk';
      const arrived = navigate(
        npc,
        npc.navigation,
        { x: stations[6].x + (i ? 25 : -25), y: 505 },
        dt,
        28,
      );
      if (arrived) {
        npc.action = 'gear';
        npc.suited = true;
      }
      return arrived;
    });
    if (ready.every(Boolean)) startCleanup(s);
  }
}
function recordTrail(s: CleanState, from: Point, to: Point, dt: number) {
  if (!s.soiled) return;
  const length = distance(from, to),
    angle = Math.atan2(to.y - from.y, to.x - from.x);
  s.simulation.footprintDistance += length;
  s.simulation.traceDistance += length;
  if (length > 0.1 && s.simulation.footprintDistance >= 48) {
    s.simulation.footprintDistance -= 48;
    const side = (++s.simulation.foot % 2 ? 1 : -1) * 7;
    addTrace(
      s,
      'footprint',
      { x: to.x - Math.sin(angle) * side, y: to.y + Math.cos(angle) * side },
      s.containment.suppressed ? 6 : 8,
      s.containment.suppressed ? 0.1 : 0.16,
      angle,
    );
  }
  if (s.spillActive) {
    s.simulation.dripTime += dt;
    if (s.simulation.traceDistance >= 145 || s.simulation.dripTime >= 1.7) {
      s.simulation.traceDistance = 0;
      s.simulation.dripTime = 0;
      addTrace(
        s,
        s.phase === 'accident' ? 'spill' : 'trail',
        to,
        13 + s.accidentSeverity * 9,
        0.4 + s.accidentSeverity * 0.2,
      );
    }
  }
}
function machineStep(
  s: CleanState,
  dt: number,
  braces: number,
  valves: number,
) {
  if (!s.pantsLoaded || s.spin >= 1) return;
  s.machine += dt;
  s.spin = clamp(s.machine / 34);
  s.valve = clamp(s.valve + (valves * dt) / 2);
  s.balance = clamp(
    s.balance +
      (0.27 + Math.abs(Math.sin(s.machine * 2.1)) * 0.08 - braces * 0.37) * dt,
  );
  s.leakClock =
    s.valve < 1 && s.balance > 0.5
      ? s.leakClock + dt
      : Math.max(0, s.leakClock - dt);
  if (s.leakClock > 2.1 && s.leaks < 6) {
    const places = [
      { x: 955, y: 605 },
      { x: 1095, y: 610 },
      { x: 1040, y: 715 },
      { x: 945, y: 710 },
      { x: 920, y: 580 },
      { x: 1100, y: 720 },
    ];
    addTrace(s, 'foam', places[s.leaks], 24, 0.75);
    s.leaks++;
    s.leakClock = 0;
  }
}
function work(s: CleanState, i: number, dt: number) {
  if (near(s, i, stations[4]) && s.valve < 1) {
    s.activity[i] = 'valve';
    s.valve = clamp(s.valve + dt / 2);
    return 'valve';
  }
  if (near(s, i, stations[3]) && s.spin < 1) {
    s.activity[i] = 'brace';
    return 'brace';
  }
  if (near(s, i, stations[5]) && s.dirt[i] > 0.001) {
    s.activity[i] = 'rinse';
    s.rinse[i] = clamp(s.rinse[i] + dt / 1.5);
    if (s.rinse[i] >= 1) {
      s.dirt[i] = 0;
      s.rinse[i] = 0;
    }
    return 'rinse';
  }
  s.rinse[i] = 0;
  if (s.dirt[i] >= 0.98 - 1e-8) return '';
  let budget = Math.min(dt * 0.62, (0.98 - s.dirt[i]) / 0.44),
    spent = 0;
  if (near(s, i, stations[3]) && s.spin >= 1 && s.machineClean < 1) {
    spent = Math.min(budget, (1 - s.machineClean) * 2.6);
    s.machineClean = clamp(s.machineClean + spent / 2.6);
    s.activity[i] = 'mop';
    if (s.machineClean === 1) award(s, 240);
  } else {
    const targets = s.spots
      .filter((p) => p.progress < 1 && near(s, i, p, 57))
      .sort(
        (a, b) => distance(a, position(s, i)) - distance(b, position(s, i)),
      );
    for (const target of targets) {
      const amount = Math.min(budget, (1 - target.progress) * target.weight);
      target.progress = clamp(target.progress + amount / target.weight);
      budget -= amount;
      spent += amount;
      if (target.progress > 1 - 1e-8) {
        target.progress = 1;
        award(s, target.kind === 'footprint' ? 12 : 65);
      }
      if (budget <= 1e-8) break;
    }
    if (spent) s.activity[i] = 'mop';
  }
  s.dirt[i] = clamp(s.dirt[i] + spent * 0.44, 0, 0.98);
  return spent ? 'mop' : '';
}
/** Soft body separation plus a sideways yield keeps two people from blocking the same doorway forever. */
function separateActors(s: CleanState, dt: number) {
  const place = (i: number, x: number, y: number) => {
    if (canStand(x, y)) {
      s.x[i] = x;
      s.y[i] = y;
      return true;
    }
    return false;
  };
  for (let pass = 0; pass < 4; pass++)
    for (let i = 0; i < s.actorCount; i++)
      for (let j = i + 1; j < s.actorCount; j++) {
        const dx = s.x[j] - s.x[i],
          dy = s.y[j] - s.y[i],
          length = Math.hypot(dx, dy);
        if (length >= 32) continue;
        const nx = length > 0.01 ? dx / length : 1,
          ny = length > 0.01 ? dy / length : 0;
        const push = (32 - length + 0.08) / 2,
          yieldStep = pass === 0 ? dt * 52 : 0;
        const ix = s.x[i],
          iy = s.y[i],
          jx = s.x[j],
          jy = s.y[j];
        const ax = ix - nx * push - ny * yieldStep,
          ay = iy - ny * push + nx * yieldStep;
        const bx = jx + nx * push + ny * yieldStep,
          by = jy + ny * push - nx * yieldStep;
        const a = canStand(ax, ay),
          b = canStand(bx, by);
        if (a && b) {
          place(i, ax, ay);
          place(j, bx, by);
        } else if (
          a &&
          place(
            i,
            ix - nx * push * 2 - ny * yieldStep,
            iy - ny * push * 2 + nx * yieldStep,
          )
        )
          continue;
        else if (
          b &&
          place(
            j,
            jx + nx * push * 2 + ny * yieldStep,
            jy + ny * push * 2 - nx * yieldStep,
          )
        )
          continue;
        else {
          const side = 32 - length + 2;
          place(i, ix - ny * side, iy + nx * side);
          place(j, jx + ny * side, jy - nx * side);
        }
      }
}

function finish(s: CleanState) {
  award(
    s,
    Math.max(
      0,
      Math.round(
        s.timer * 5 + Math.min(s.teamwork, 60) * 5 + 350 - s.penalties * 12,
      ),
    ),
  );
  phase(
    s,
    'result',
    'Все следы отмыты. Стиралка чистая. В журнале написали: «дежурство без происшествий».',
  );
}
function step(s: CleanState, dt: number, keys: Set<string>) {
  s.elapsed += dt;
  s.phaseTime += dt;
  s.cooldown = Math.max(0, s.cooldown - dt);
  s.rhythm.feedbackTime = Math.max(0, s.rhythm.feedbackTime - dt);
  if (s.rhythm.feedbackTime === 0) s.rhythm.feedback = 'waiting';
  const holding = [false, false, false],
    from = position(s, 0);
  const humans = s.phase === 'clean' ? s.players : 1;
  for (let i = 0; i < humans; i++) {
    s.activity[i] = 'idle';
    const [l, r, u, d, action] = cleanBindings[i];
    holding[i] = keys.has(action) || (i === 0 && keys.has('Space'));
    if (s.phase === 'accident') {
      s.activity[i] = 'strain';
      continue;
    }
    const stationIndex =
      s.phase === 'toilet'
        ? 1
        : s.phase === 'shower'
          ? 2
          : s.phase === 'laundry'
            ? 3
            : -1;
    const stationTarget =
      stationIndex === -1 ? undefined : stations[stationIndex];
    const stationaryAction =
      i === 0 &&
      holding[i] &&
      !!stationTarget &&
      near(s, i, stationTarget, stationIndex === 3 ? 70 : 62);
    const dx = stationaryAction ? 0 : Number(keys.has(r)) - Number(keys.has(l)),
      dy = stationaryAction ? 0 : Number(keys.has(d)) - Number(keys.has(u));
    const actor = position(s, i),
      speed =
        s.phase === 'find'
          ? 166 * (1 - s.urge * 0.28)
          : s.spillActive
            ? 143
            : 166;
    const wet = s.spots.some(
      (p) => p.foam && p.progress < 1 && distance(p, actor) < 28,
    );
    move(actor, dx, dy, dt, speed * (wet ? 0.68 : 1));
    s.x[i] = actor.x;
    s.y[i] = actor.y;
    if (dx || dy) s.activity[i] = 'walk';
  }
  const containment = s.containment;
  containment.cooldown = Math.max(0, containment.cooldown - dt);
  containment.held =
    keys.has('KeyQ') &&
    ['accident', 'toilet'].includes(s.phase) &&
    s.relief < 1;
  containment.suppressed =
    containment.held &&
    containment.stamina > 1e-8 &&
    containment.cooldown === 0;
  if (containment.suppressed) {
    containment.stamina = Math.max(0, containment.stamina - dt * 0.34);
    if (containment.stamina === 0) {
      containment.cooldown = 1.3;
      containment.suppressed = false;
    }
  } else if (!containment.held)
    containment.stamina = Math.min(1, containment.stamina + dt * 0.09);
  if (['accident', 'toilet'].includes(s.phase))
    s.spillActive = s.relief < 1 && !containment.suppressed;
  recordTrail(s, from, position(s, 0), dt);
  if (s.phase === 'duty' || s.phase === 'find') {
    s.baselineUrge = clamp(0.14 + s.elapsed * 0.014);
    s.urge = Math.max(s.baselineUrge, clamp(s.urge + dt * 0.027));
    if (s.phase === 'duty' && s.phaseTime >= 4) {
      phase(
        s,
        'find',
        'Срочно к дневальному справа. По пути чередуй Q и E в подсвеченном окне. RB/R1 и A/× на геймпаде. Надолго это не спасёт.',
      );
      s.station = 0;
      s.rhythm.active = true;
    }
    if (s.rhythm.active) {
      s.rhythm.clock += dt;
      if (s.rhythm.clock > s.rhythm.period + s.rhythm.window) {
        s.rhythm.clock -= s.rhythm.period;
        s.rhythm.misses++;
        s.rhythm.combo = 0;
        s.rhythm.feedback = 'late';
        s.rhythm.feedbackTime = 0.4;
        s.simulation.missedWindows++;
        s.urge = clamp(s.urge + 0.035);
      }
    }
    if (s.urge >= 1) accident(s, false);
  } else if (s.phase === 'accident') {
    const duty = s.npcs[0],
      arrived = navigate(duty, duty.navigation, position(s, 0), dt, 62, 180);
    duty.action = arrived ? 'react' : 'walk';
    if (arrived) {
      duty.line = dutyReprimand;
      s.message = `Дневальный: «${dutyReprimand}»`;
    }
    if (arrived && s.phaseTime >= 3.2)
      phase(
        s,
        'toilet',
        `Дневальный: «${dutyReprimand}» Кабинка внизу слева. По дороге останутся следы.`,
      );
  } else if (s.phase === 'toilet') {
    if (holding[0] && near(s, 0, stations[1], 62)) {
      s.activity[0] = 'relief';
      s.relief = clamp(s.relief + dt / 3);
      s.urge = Math.max(0, 1 - s.relief);
      if (s.relief === 1) {
        s.spillActive = false;
        s.station = 2;
        award(s, 160);
        phase(
          s,
          'shower',
          'Облегчение наступило. Штаны ещё не в курсе. В душ справа от туалета, удерживай E.',
        );
      }
    }
  } else if (s.phase === 'shower') {
    if (holding[0] && near(s, 0, stations[2], 62)) {
      s.activity[0] = 'shower';
      s.shower = clamp(s.shower + dt / 3.5);
      if (s.shower === 1) {
        s.washed = true;
        s.soiled = false;
        s.pants = 'bagged';
        s.station = 3;
        award(s, 180);
        phase(
          s,
          'laundry',
          'Свежая форма. Старые штаны в пакете. Отнеси их в прачечную справа и держи E у стиралки.',
        );
      }
    }
  } else if (s.phase === 'laundry') {
    if (holding[0] && near(s, 0, stations[3])) {
      s.activity[0] = 'load';
      s.laundryProgress = clamp(s.laundryProgress + dt / 2.5);
      if (s.laundryProgress === 1) startMachine(s);
    }
  }
  let braces = 0;
  if (s.phase === 'spin' || s.phase === 'response') {
    if (holding[0] && near(s, 0, stations[3])) {
      braces = 1;
      s.activity[0] = 'brace';
    }
    updateWitnesses(s, dt);
    if (s.phase === 'spin' && s.phaseTime >= 4)
      phase(
        s,
        'response',
        'Сослуживцы пришли на звук. Теперь идут за химзащитой. Придётся отмывать и коридор, и машинку.',
      );
  }
  if (s.phase === 'clean') {
    s.timer = Math.max(0, s.timer - dt);
    let working = 0;
    for (let i = 0; i < s.actorCount; i++) {
      if (!holding[i]) {
        s.rinse[i] = 0;
        continue;
      }
      const task = work(s, i, dt);
      if (task) working++;
      if (task === 'brace') braces++;
    }
    if (working > 1) s.teamwork += dt;
  }
  if (s.phase === 'clean') separateActors(s, dt);
  machineStep(s, dt, braces, 0);
  if (
    s.phase === 'clean' &&
    s.spin >= 1 &&
    s.valve >= 1 &&
    s.machineClean >= 1 &&
    s.spots.every((p) => p.progress >= 1)
  )
    finish(s);
}
export function cleanTick(s: CleanState, dt: number, keys: Set<string>) {
  if (!active(s) || !Number.isFinite(dt) || dt <= 0) return;
  const e = keys.has('KeyE') || keys.has('Space'),
    q = keys.has('KeyQ');
  if (e && !s.simulation.previousE) cleanAction(s);
  if (q && !s.simulation.previousQ) rhythmPress(s, 'KeyQ');
  if (e && !s.simulation.previousE) rhythmPress(s, 'KeyE');
  s.simulation.previousE = e;
  s.simulation.previousQ = q;
  let remaining = Math.min(dt, 0.25);
  while (remaining > 1e-9 && active(s)) {
    const delta = Math.min(0.025, remaining);
    step(s, delta, keys);
    remaining -= delta;
  }
}
export function getDrops(s: CleanState) {
  return s.spots.filter((p) => p.kind !== 'footprint');
}
export function getFootprints(s: CleanState) {
  return s.spots.filter((p) => p.kind === 'footprint');
}
export function cleanPrompt(s: CleanState, actor = 0) {
  if (s.phase === 'duty') return 'Обойди пост · скоро понадобится дневальный';
  if (s.phase === 'find')
    return near(s, 0, stations[0])
      ? 'E · спросить дневального'
      : `${s.rhythm.expected === 'KeyQ' ? 'Q' : 'E'} в такт · двигайся к тумбе`;
  if (s.phase === 'accident')
    return 'Дневальный идёт. Организм уже никуда не идёт.';
  if (s.phase === 'toilet')
    return 'К туалету · Q временно сдержать; E в кабинке';
  if (s.phase === 'shower') return 'Душ рядом с туалетом · держи E';
  if (s.phase === 'laundry')
    return 'Прачечная справа · держи E, чтобы загрузить штаны';
  if (s.phase === 'spin' || s.phase === 'response')
    return 'Можно держать стиралку: E. Сослуживцы скоро вернутся.';
  if (s.phase === 'clean' && s.valve < 1)
    return 'Вентиль открыт · подойди и держи действие, чтобы перекрыть воду';
  if (s.phase === 'clean')
    return s.dirt[actor] >= 0.98 - 1e-8
      ? 'Швабра грязная · у ведра держи действие'
      : s.spin < 1
        ? 'Прикрой вентиль / придержи машинку / отмывай следы'
        : 'Отмой все следы и саму стиралку · удерживай действие';
  return '';
}

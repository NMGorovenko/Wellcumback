import { announceScreenPhase, screenSay, SCREEN_DIALOGUE } from './dialogue.ts';
import { freshDrillTools, freshDrillAssistant } from './drill-tools.ts';
import { CARRY_SHIFT_LIMIT } from './carrier-staging.ts';
/** Pure, deterministic screen story simulation. Coordinates are logical metres;
 * renderers may uniformly scale the floor scene. No DOM, Three.js, or timers. */
import { drillStep, type DrillingState } from './drilling.ts';
import { PLAYER_BINDINGS } from '../input/gamepads.ts';
export type Phase =
  | 'frame'
  | 'rods'
  | 'tension'
  | 'drill'
  | 'lift'
  | 'level'
  | 'result';
export type WorkerAction =
  | 'idle'
  | 'walk'
  | 'hold'
  | 'feed'
  | 'pull'
  | 'throw'
  | 'catch'
  | 'drill'
  | 'climb'
  | 'handoff'
  | 'fall'
  | 'lift';
export type Worker = {
  x: number;
  z: number;
  side: number;
  targetSide: number;
  route: number;
  animation: WorkerAction;
  actionTime: number;
  navigation: FloorPoint[];
  navGoal: FloorPoint;
  navDelay: number;
  yielding: boolean;
  yieldUntil: number;
  blocked: boolean;
  waitTime: number;
};
export type GameEvent = {
  id: number;
  kind:
    | 'snap'
    | 'jam'
    | 'spring'
    | 'pop'
    | 'throw'
    | 'catch'
    | 'miss'
    | 'hole'
    | 'fall'
    | 'latch'
    | 'phase';
  worker: number;
  side: number;
  at: number;
  value: number;
};
export type ToolState = {
  owner: number;
  target: number;
  status: 'held' | 'charging' | 'flight' | 'ground';
  charge: number;
  flight: number;
  duration: number;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  x: number;
  y: number;
  z: number;
  goodThrow: boolean;
  groundSide: number;
  lastWorker: number;
  needsPass: boolean;
  catches: number;
  misses: number;
};
export type GameState = DrillingState & {
  phase: Phase;
  players: number;
  elapsed: number;
  phaseTime: number;
  score: number;
  penalties: number;
  paused: boolean;
  practice: boolean;
  heldKeys: string[];
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
  workers: Worker[];
  events: GameEvent[];
  frameStage: 'align' | 'lock';
  frameFit: number;
  frameTwist: number;
  frameBrace: number;
  rodAlignment: number[];
  rodTarget: number[];
  rodPressure: number[];
  rodJam: number[];
  tool: ToolState;
  spring: { worker: number; side: number; power: number; active: boolean };
  springTarget: number;
  tension: number[];
  recommendedSide: number;
  chairX: number;
  drillHeat: number;
  drillMark: number | null;
  drillOverheats: number;
  climb: number;
  liftVelocity: [number, number];
  liftXVelocity: number;
  latched: [boolean, boolean];
  latchProgress: [number, number];
  fatigue: [number, number];
  bubble: number;
  levelStable: number;
  /** Internal simulation bookkeeping. Persist along with public fields for replay. */
  simulation: {
    accumulator: number;
    previousActions: boolean[];
    previousThrow: boolean;
    pendingActions: boolean[];
    eventId: number;
    clipBest: number[];
    tossCooldown: number;
  };
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
  frame: 'Четыре угла и одно мнение',
  rods: 'Спицы — в полотно',
  tension: 'Одна отвёртка на всех',
  drill: 'Стремянка не приехала',
  lift: 'Левее. Нет, твоё левее',
  level: 'Потолок виноват',
  result: 'Кино будет!',
};
export const SIDE_NAMES = [
  'Дальняя сторона',
  'Правая сторона',
  'Ближняя сторона',
  'Левая сторона',
];
export const CONTROLS = PLAYER_BINDINGS;
const STEP = 1 / 60;
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
const activeWorkers = (s: GameState) => Math.max(2, s.players);
const finished = (s: GameState) => s.phase === 'result';
const opposite = (side: number) => (side + 2) % 4;
const arrived = (w: Worker) => Math.abs(w.route - w.targetSide) < 0.025;
export function positionOnPerimeter(route: number): { x: number; z: number } {
  // Four work stations; interpolation follows the exterior of the fabric.
  const r = ((route % 4) + 4) % 4,
    side = Math.floor(r),
    t = r - side;
  const stations = [
    { x: 0, z: -3.7 },
    { x: 5.55, z: 0 },
    { x: 0, z: 3.7 },
    { x: -5.55, z: 0 },
  ];
  const corners = [
    { x: 5.55, z: -3.7 },
    { x: 5.55, z: 3.7 },
    { x: -5.55, z: 3.7 },
    { x: -5.55, z: -3.7 },
  ];
  const a = t < 0.5 ? stations[side] : corners[side];
  const b = t < 0.5 ? corners[side] : stations[(side + 1) % 4];
  const p = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  return { x: a.x + (b.x - a.x) * p, z: a.z + (b.z - a.z) * p };
}
function worker(side: number): Worker {
  const position =
    side % 2 === 0
      ? { x: -4.25, z: side === 0 ? -3.58 : 3.48 }
      : { x: side === 1 ? 5.66 : -5.66, z: 2.36 };
  return {
    ...position,
    side,
    targetSide: side,
    route: side,
    animation: 'idle',
    actionTime: 0,
    navigation: [],
    navGoal: position,
    navDelay: 0,
    yielding: false,
    yieldUntil: 0,
    blocked: false,
    waitTime: 0,
  };
}
export function freshGame(players = 1): GameState {
  return {
    phase: 'frame',
    players: clamp(Math.round(players), 1, 3),
    elapsed: 0,
    phaseTime: 0,
    score: 0,
    penalties: 0,
    paused: false,
    practice: false,
    heldKeys: [],
    corners: 0,
    cursor: 0,
    side: 2,
    rods: [0, 0, 0, 0],
    clips: [0, 0, 0, 0],
    message:
      'WASD совмести профиль и угол. E вставь. Напарник держит свой E / Enter.',
    chairs: 2,
    balance: 0,
    drill: 0,
    holes: [],
    aim: 5.9,
    falls: 0,
    cooldown: 0,
    liftLeft: 2.6,
    liftRight: 2.6,
    liftX: -0.8,
    latch: 0,
    angle: 0,
    hold: 0,
    awards: [],
    workers: [worker(2), worker(0), worker(1)],
    events: [],
    frameStage: 'align',
    frameFit: 0.48,
    frameTwist: -0.3,
    frameBrace: 0,
    rodAlignment: [0, 0, 0, 0],
    rodTarget: [0, 0, 0, 0],
    rodPressure: [0, 0, 0, 0],
    rodJam: [0, 0, 0, 0],
    tool: {
      owner: 0,
      target: 1,
      status: 'held',
      charge: 0,
      flight: 0,
      duration: 0.8,
      fromX: 0,
      fromZ: 3.7,
      toX: 0,
      toZ: -3.7,
      x: 0,
      y: 1,
      z: 3.7,
      goodThrow: false,
      groundSide: 0,
      lastWorker: -1,
      needsPass: false,
      catches: 0,
      misses: 0,
    },
    spring: { worker: -1, side: 2, power: 0, active: false },
    springTarget: 0.64,
    tension: [0, 0, 0, 0],
    recommendedSide: 2,
    drillTools: freshDrillTools(),
    drillAssistant: freshDrillAssistant(),
    toolsRemembered: false,
    handoffTool: null,
    speechText: SCREEN_DIALOGUE.frame.text,
    messageSpeaker: SCREEN_DIALOGUE.frame.speaker,
    messageUntil: 5.5,
    messageSeq: 1,
    drillMode: 'position',
    chairX: -4.4,
    drillGear: 'none',
    handoffProgress: 0,
    drillRunning: false,
    vacuumRunning: false,
    dustGenerated: 0,
    dustCaptured: 0,
    wallDust: [0, 0],
    fallProgress: 0,
    fallHeight: 0,
    braceHeld: false,
    drillHeat: 0,
    drillMark: null,
    drillOverheats: 0,
    climb: 0,
    liftVelocity: [0, 0],
    liftXVelocity: 0,
    latched: [false, false],
    latchProgress: [0, 0],
    fatigue: [0, 0],
    bubble: 0,
    levelStable: 0,
    simulation: {
      accumulator: 0,
      previousActions: [false, false, false],
      previousThrow: false,
      pendingActions: [false, false, false],
      eventId: 0,
      clipBest: [0, 0, 0, 0],
      tossCooldown: 0,
    },
  };
}
export function emit(
  s: GameState,
  kind: GameEvent['kind'],
  worker = 0,
  side = s.side,
  value = 0,
) {
  s.events.push({
    id: ++s.simulation.eventId,
    kind,
    worker,
    side,
    at: s.elapsed,
    value,
  });
  if (s.events.length > 12) s.events.shift();
}
export function award(s: GameState, label: string, value: number) {
  if (s.practice) return;
  s.score += value;
  s.awards.push({ label, value });
}
export function penalty(s: GameState, message: string, amount = 25) {
  s.penalties++;
  s.score = Math.max(0, s.score - amount);
  s.message = message;
}
export function transition(s: GameState, phase: Phase, message: string) {
  s.phase = phase;
  s.phaseTime = 0;
  s.message = message;
  announceScreenPhase(s, phase);
  s.hold = 0;
  s.cooldown = 0.35;
  emit(s, 'phase');
}
/** A UI click/keyboard edge is consumed once on the next fixed step. Holding is
 * supplied through tick(keys); the shared game loop may call this on E keydown. */
export function act(s: GameState, player = 0) {
  if (s.paused || s.phase === 'result' || player < 0 || player >= s.players)
    return;
  s.simulation.pendingActions[player] = true;
}
/** Accessible side buttons use this rather than mutating worker coordinates. */
export function moveToSide(s: GameState, player: number, side: number) {
  const w = s.workers[player];
  if (!w || player >= s.players || !['rods', 'tension'].includes(s.phase))
    return;
  if (s.spring.active && s.spring.worker === player) return;
  w.targetSide = ((Math.round(side) % 4) + 4) % 4;
  if (player === 0) s.side = w.targetSide;
}
export function setPaused(s: GameState, paused: boolean) {
  s.paused = paused;
  if (!paused) return;
  s.heldKeys = [];
  s.drillRunning = false;
  s.vacuumRunning = false;
  s.simulation.previousActions.fill(false);
  s.simulation.pendingActions.fill(false);
  s.simulation.previousThrow = false;
  if (s.tool.status === 'charging') {
    s.tool.status = 'held';
    s.tool.charge = 0;
  }
  s.spring.active = false;
  s.spring.worker = -1;
}
export function setChairs(s: GameState, count: 1 | 2) {
  if (s.phase !== 'drill' || s.drillMode !== 'position') return;
  s.chairs = count;
  s.aim = count === 1 ? 5.1 : 5.9;
}
export function throwTargetPower(s: GameState) {
  return 0.64 + (s.tool.target === 2 ? 0.035 : 0);
}
export function rodTargetAt(s: GameState, side: number) {
  return Math.sin(s.rods[side] * 7 + side * 0.8) * 0.47;
}
export function springWindow(s: GameState): [number, number] {
  const center = 0.62 + s.clips[s.spring.side] * 0.018;
  return [center - 0.09, center + 0.09];
}
export type Input = {
  x: number;
  y: number;
  held: boolean;
  pressed: boolean;
  released: boolean;
  secondary: boolean;
};
function buildInputs(s: GameState, keys: Set<string>): Input[] {
  return CONTROLS.map((c, p) => {
    const held =
      p < s.players && (keys.has(c.action) || (p === 0 && keys.has('Space')));
    const previous = s.simulation.previousActions[p];
    const pending = s.simulation.pendingActions[p];
    const input = {
      x: (keys.has(c.right) ? 1 : 0) - (keys.has(c.left) ? 1 : 0),
      y: (keys.has(c.up) ? 1 : 0) - (keys.has(c.down) ? 1 : 0),
      held,
      pressed: (held && !previous) || pending,
      released: !held && previous,
      secondary: p < s.players && keys.has(c.secondary),
    };
    s.simulation.previousActions[p] = held;
    s.simulation.pendingActions[p] = false;
    return input;
  });
}
/** World-space furniture authored in the same floor layout as Scene. Keeping
 * these landmarks explicit makes collision geometry reviewable and testable. */
export const PHYSICAL_LAYOUT = {
  scale: 0.49,
  offsetZ: -0.56,
  sofaZ: 2.82,
  parkedStools: [
    { x: -3.8, z: 0.45 },
    { x: -3.15, z: 2.6 },
  ],
  bounds: { minX: -5.35, maxX: 5.72, minZ: -3.23, maxZ: 3.38 },
  furniture: [
    { minX: -1.98, maxX: 1.57, minZ: 2.23, maxZ: 3.4 },
    { minX: -1.76, maxX: -0.68, minZ: 1.52, maxZ: 2.94 },
    { minX: -4.35, maxX: -3.22, minZ: -2.24, maxZ: -0.26 },
    { minX: -1.71, maxX: 1.71, minZ: -3.23, maxZ: -2.76 },
    { minX: 3.87, maxX: 5.23, minZ: -2.68, maxZ: -1.26 },
    { minX: 4.48, maxX: 5.49, minZ: 0.1, maxZ: 2.08 },
    { minX: 3.59, maxX: 4.34, minZ: 0.65, maxZ: 1.59 },
    { minX: -4.12, maxX: -3.48, minZ: 0.12, maxZ: 0.78 },
    { minX: -3.47, maxX: -2.83, minZ: 2.27, maxZ: 2.93 },
  ],
} as const;
export const WORKER_RADIUS = 0.52;
export type FloorPoint = { x: number; z: number };
const GRID = 0.38,
  NAV_MIN_X = -10.5,
  NAV_MIN_Z = -4.8,
  COLS = 57,
  ROWS = 35;
const sqDistance = (a: FloorPoint, b: FloorPoint) =>
  (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
export function floorPointIsClear(
  point: FloorPoint,
  radius = WORKER_RADIUS,
): boolean {
  const { scale, offsetZ, bounds, furniture } = PHYSICAL_LAYOUT;
  const x = point.x * scale,
    z = point.z * scale + offsetZ,
    r = radius * scale;
  if (
    x < bounds.minX + r ||
    x > bounds.maxX - r ||
    z < bounds.minZ + r ||
    z > bounds.maxZ - r
  )
    return false;
  const rectangles = [
    { minX: -2.44, maxX: 2.44, minZ: offsetZ - 1.39, maxZ: offsetZ + 1.39 },
    ...furniture,
  ];
  return rectangles.every((box) => {
    const dx = x - clamp(x, box.minX, box.maxX),
      dz = z - clamp(z, box.minZ, box.maxZ);
    return dx * dx + dz * dz >= r * r;
  });
}
function worldSegmentClear(
  a: FloorPoint,
  b: FloorPoint,
  others: FloorPoint[],
): boolean {
  const { scale, offsetZ, furniture } = PHYSICAL_LAYOUT,
    r = (WORKER_RADIUS + 0.012) * scale;
  if (!floorPointIsClear(b, WORKER_RADIUS + 0.012)) return false;
  const x = a.x * scale,
    z = a.z * scale + offsetZ,
    dx = (b.x - a.x) * scale,
    dz = (b.z - a.z) * scale;
  const rectangles = [
    { minX: -2.44, maxX: 2.44, minZ: offsetZ - 1.39, maxZ: offsetZ + 1.39 },
    ...furniture,
  ];
  for (const box of rectangles) {
    let near = 0,
      far = 1;
    for (const [origin, delta, min, max] of [
      [x, dx, box.minX - r, box.maxX + r],
      [z, dz, box.minZ - r, box.maxZ + r],
    ]) {
      if (Math.abs(delta) < 1e-10) {
        if (origin < min || origin > max) {
          near = 2;
          break;
        }
      } else {
        const t1 = (min - origin) / delta,
          t2 = (max - origin) / delta;
        near = Math.max(near, Math.min(t1, t2));
        far = Math.min(far, Math.max(t1, t2));
      }
    }
    if (near <= far && far > 1e-9 && near <= 1) return false;
  }
  const length = sqDistance(a, b);
  return others.every((w) => {
    const t = length
      ? clamp(
          ((w.x - a.x) * (b.x - a.x) + (w.z - a.z) * (b.z - a.z)) / length,
          0,
          1,
        )
      : 0;
    return (
      sqDistance(w, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }) >=
      (WORKER_RADIUS * 2 + 0.025) ** 2
    );
  });
}
/** Each worker gets a distinct point along the edge. The current tool owner
 * approaches the actual next spring; helpers occupy separate support points. */
export function workPosition(s: GameState, p: number): FloorPoint {
  const w = s.workers[p],
    side = w.targetSide;
  const occupants = s.workers
    .slice(0, activeWorkers(s))
    .map((v, i) => ({ v, i }))
    .filter((v) => v.v.targetSide === side);
  const rank = occupants.findIndex((v) => v.i === p);
  let tangent =
    side % 2 === 0 ? [-4.25, -2.55, -0.85][rank] : [2.36, 0.66, -1.04][rank];
  if (s.phase === 'tension') {
    const owner = s.tool.owner,
      ownerHere = s.workers[owner]?.targetSide === side;
    const next = Math.min(3, s.clips[side]),
      t = (next + 0.5) / 4 - 0.5;
    const activeTangent =
      side % 2 === 0
        ? (t * 4.3) / PHYSICAL_LAYOUT.scale
        : (-t * 2.26) / PHYSICAL_LAYOUT.scale;
    if (p === owner) tangent = activeTangent;
    else if (ownerHere) {
      const candidates = side % 2 === 0 ? [-4, -2, 0, 2, 4] : [-2.2, 0, 2.2];
      const safe = candidates.filter((v) => Math.abs(v - activeTangent) > 1.16);
      tangent =
        safe[
          occupants.filter((v) => v.i !== owner).findIndex((v) => v.i === p)
        ] ?? safe[0];
    }
  }
  return side % 2 === 0
    ? { x: tangent, z: side === 0 ? -3.58 : 3.48 }
    : { x: side === 1 ? 5.66 : -5.66, z: tangent };
}
function findPath(
  from: FloorPoint,
  to: FloorPoint,
  others: FloorPoint[],
): FloorPoint[] {
  if (worldSegmentClear(from, to, others)) return [to];
  const point = (id: number) => ({
    x: NAV_MIN_X + (id % COLS) * GRID,
    z: NAV_MIN_Z + Math.floor(id / COLS) * GRID,
  });
  const idFor = (p: FloorPoint) =>
    clamp(Math.round((p.x - NAV_MIN_X) / GRID), 0, COLS - 1) +
    clamp(Math.round((p.z - NAV_MIN_Z) / GRID), 0, ROWS - 1) * COLS;
  const start = idFor(from),
    goal = idFor(to),
    cost = new Float64Array(COLS * ROWS).fill(Infinity),
    parent = new Int32Array(COLS * ROWS).fill(-1),
    closed = new Uint8Array(COLS * ROWS),
    open = [start];
  cost[start] = 0;
  let end = -1;
  for (let iteration = 0; open.length && iteration < 1800; iteration++) {
    let best = 0,
      bestF = Infinity;
    for (let i = 0; i < open.length; i++) {
      const p = point(open[i]),
        f = cost[open[i]] + Math.hypot(p.x - to.x, p.z - to.z);
      if (f < bestF) {
        best = i;
        bestF = f;
      }
    }
    const current = open.splice(best, 1)[0];
    if (closed[current]) continue;
    closed[current] = 1;
    const a = current === start ? from : point(current);
    if (current === goal || sqDistance(a, to) < GRID * GRID * 3) {
      if (worldSegmentClear(a, to, others)) {
        end = current;
        break;
      }
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const x = (current % COLS) + dx,
        z = Math.floor(current / COLS) + dz;
      if (x < 0 || x >= COLS || z < 0 || z >= ROWS) continue;
      const id = x + z * COLS,
        b = point(id);
      if (closed[id] || !worldSegmentClear(a, b, others)) continue;
      const candidate = cost[current] + Math.hypot(b.x - a.x, b.z - a.z);
      if (candidate < cost[id]) {
        cost[id] = candidate;
        parent[id] = current;
        open.push(id);
      }
    }
  }
  if (end < 0) return [];
  const reversed: FloorPoint[] = [to];
  for (let id = end; id !== start && id >= 0; id = parent[id])
    reversed.push(point(id));
  const route = reversed.reverse(),
    smoothed: FloorPoint[] = [];
  let a = from;
  for (let i = 0; i < route.length;) {
    let far = i;
    while (
      far + 1 < route.length &&
      worldSegmentClear(a, route[far + 1], others)
    )
      far++;
    smoothed.push(route[far]);
    a = route[far];
    i = far + 1;
  }
  return smoothed;
}
function requestYield(s: GameState, requester: number) {
  if (s.spring.active || (s.phase === 'tension' && s.tool.status !== 'held'))
    return;
  const blocked = s.workers[requester],
    goal = workPosition(s, requester);
  const staticPath = findPath(blocked, goal, []);
  if (!staticPath.length) return;
  const candidates = s.workers
    .slice(0, activeWorkers(s))
    .map((w, p) => ({ w, p }))
    .filter(
      ({ w, p }) =>
        p !== requester &&
        !w.yielding &&
        w.navigation.length === 0 &&
        !(s.spring.active && s.spring.worker === p),
    );
  candidates.sort(
    (a, b) => sqDistance(a.w, blocked) - sqDistance(b.w, blocked),
  );
  for (const { w, p } of candidates) {
    const bayPoints = [
      { x: -6.45, z: -4.5 },
      { x: 6.45, z: -4.5 },
      { x: 6.45, z: 4.55 },
      { x: -6.45, z: 4.55 },
    ];
    bayPoints.sort((a, b) => sqDistance(a, w) - sqDistance(b, w));
    const others = s.workers
      .slice(0, activeWorkers(s))
      .filter((_, i) => i !== p);
    for (const bay of bayPoints) {
      const path = findPath(w, bay, others);
      if (path.length) {
        w.navigation = path;
        w.yielding = true;
        w.yieldUntil = s.elapsed + 3.5;
        w.navGoal = bay;
        w.navDelay = 0.4;
        return;
      }
    }
  }
}
function moveWorkers(s: GameState, dt: number, input: Input[]) {
  const count = activeWorkers(s);
  for (let p = 0; p < count; p++) {
    const w = s.workers[p],
      c = input[p];
    if (
      p < s.players &&
      !c.held &&
      !(s.spring.active && s.spring.worker === p)
    ) {
      if (c.y > 0) w.targetSide = 0;
      else if (c.x > 0) w.targetSide = 1;
      else if (c.y < 0) w.targetSide = 2;
      else if (c.x < 0) w.targetSide = 3;
    }
    if (p === 0) s.side = w.targetSide;
    const others = s.workers.slice(0, count).filter((_, i) => i !== p);
    if (w.yielding && s.elapsed > w.yieldUntil) {
      w.yielding = false;
      w.navigation = [];
      w.navDelay = 0;
    }
    const goal = w.yielding ? w.navGoal : workPosition(s, p);
    w.navDelay = Math.max(0, w.navDelay - dt);
    if (sqDistance(w, goal) < 0.0025) {
      w.navigation = [];
      w.blocked = false;
      w.waitTime = 0;
      if (!w.yielding) {
        w.route = w.targetSide;
        w.side = w.targetSide;
      }
      continue;
    }
    w.route = w.targetSide + 0.15;
    w.animation = 'walk';
    if (sqDistance(goal, w.navGoal) > 0.01) {
      w.navigation = [];
      w.navDelay = 0;
    }
    if (w.navDelay === 0) {
      w.navigation = findPath(w, goal, others);
      w.navGoal = { ...goal };
      w.navDelay = 0.3;
    }
    const next = w.navigation[0];
    if (next) {
      const distance = Math.sqrt(sqDistance(w, next)),
        step = Math.min(distance, dt * 3.65),
        candidate = {
          x: w.x + ((next.x - w.x) * step) / distance,
          z: w.z + ((next.z - w.z) * step) / distance,
        };
      if (distance < 0.018) {
        w.navigation.shift();
        continue;
      }
      if (worldSegmentClear(w, candidate, others)) {
        w.x = candidate.x;
        w.z = candidate.z;
        w.blocked = false;
        w.waitTime = 0;
        if (distance <= step + 0.015) w.navigation.shift();
      } else {
        w.navigation = [];
        w.blocked = true;
        w.waitTime += dt;
      }
    } else {
      w.blocked = true;
      w.waitTime += dt;
    }
    if (w.blocked) {
      w.animation = 'idle';
      if (w.waitTime > 0.65) {
        requestYield(s, p);
        w.waitTime = 0;
      }
    }
  }
}

function frameStep(s: GameState, dt: number, input: Input[]) {
  s.frameBrace =
    s.players === 1
      ? 0.82
      : (input[1].held ? 0.8 : 0) +
        (s.players === 3 && input[2].held ? 0.2 : 0);
  const brace = clamp(s.frameBrace, 0, 1);
  s.workers[1].animation = brace > 0 ? 'hold' : 'idle';
  if (s.frameStage === 'align') {
    s.frameFit = clamp(
      s.frameFit +
        input[0].x * dt * 0.62 +
        Math.sin(s.phaseTime * 1.4) * (1 - brace) * dt * 0.09,
      -1,
      1,
    );
    s.frameTwist = clamp(s.frameTwist + input[0].y * dt * 0.56, -1, 1);
    s.workers[0].animation = input[0].x || input[0].y ? 'hold' : 'idle';
    if (input[0].pressed && s.cooldown === 0) {
      if (Math.abs(s.frameFit) < 0.1 && Math.abs(s.frameTwist) < 0.1) {
        s.frameStage = 'lock';
        s.message =
          'Профиль в пазу. Теперь E в зелёной зоне: до настоящего щелчка.';
        s.cooldown = 0.2;
      } else {
        penalty(s, 'Профиль упёрся. Сначала совмести сдвиг и поворот.');
        s.cooldown = 0.4;
      }
    }
  } else {
    s.cursor = (Math.sin(s.phaseTime * (2.8 + s.corners * 0.35)) + 1) / 2;
    if (input[0].pressed && s.cooldown === 0) {
      if (Math.abs(s.cursor - 0.5) < 0.075 + brace * 0.08) {
        s.corners++;
        award(s, `Угол ${s.corners}`, 150);
        emit(s, 'snap', 0, s.corners - 1);
        s.message = [
          'Щёлк. Пока всё даже по инструкции.',
          'Есть! У нас совпали уже два мнения.',
          'Рамка большая. Место для неё — теоретическое.',
          'Рамка готова. Полотно пока отдельно, на полу.',
        ][s.corners - 1];
        screenSay(s, s.message, s.corners % 2 ? 0 : 1, 3.6);
        s.frameStage = 'align';
        s.frameFit = [0.48, -0.38, 0.55, -0.46][s.corners % 4];
        s.frameTwist = [-0.3, 0.42, -0.36, 0.28][s.corners % 4];
        s.cooldown = 0.4;
        if (s.corners === 4)
          transition(
            s,
            'rods',
            'Подойди к краю полотна. Держи E и A/D направляй спицу в кулиску.',
          );
      } else {
        penalty(s, 'Не защёлкнулось. Спешка — это лишняя деталь.');
        s.cooldown = 0.4;
      }
    }
  }
}
function rodsStep(s: GameState, dt: number, input: Input[]) {
  if (s.players === 1) {
    s.workers[1].targetSide = opposite(s.workers[0].targetSide);
    input[1].held = true;
  }
  moveWorkers(s, dt, input);
  const active = new Set<number>();
  for (let p = 0; p < s.players; p++) {
    const w = s.workers[p],
      c = input[p],
      side = w.side;
    if (
      !arrived(w) ||
      !c.held ||
      s.rods[side] >= 1 ||
      s.rodJam[side] > 0 ||
      active.has(side)
    )
      continue;
    active.add(side);
    w.animation = 'feed';
    s.rodAlignment[side] = clamp(s.rodAlignment[side] + c.x * dt * 0.8, -1, 1);
    s.rodTarget[side] = rodTargetAt(s, side);
    const braced = s.workers.some(
      (helper, i) =>
        i !== p &&
        i < activeWorkers(s) &&
        helper.side === opposite(side) &&
        arrived(helper) &&
        input[i].held,
    );
    const error = Math.abs(s.rodAlignment[side] - s.rodTarget[side]);
    if (error < 0.19) {
      s.rods[side] = Math.min(1, s.rods[side] + dt * (braced ? 0.2 : 0.155));
      s.rodPressure[side] = Math.max(0, s.rodPressure[side] - dt * 0.35);
      if (s.rods[side] === 1) {
        award(s, 'Спица в кулиске', 100);
        emit(s, 'snap', p, side);
        s.message = 'Спица внутри полотна. Рамку она пока не касается.';
      }
    } else {
      s.rodPressure[side] = Math.min(
        1,
        s.rodPressure[side] + dt * (braced ? 0.65 : 0.95),
      );
      if (s.rodPressure[side] >= 1) {
        s.rodJam[side] = 0.85;
        s.rods[side] = Math.max(0, s.rods[side] - 0.08);
        penalty(
          s,
          'Спица закусила ткань. Отпусти E, дай ей выпрямиться и поправь направление.',
        );
        emit(s, 'jam', p, side);
      }
    }
  }
  for (let p = 0; p < activeWorkers(s); p++)
    if (
      arrived(s.workers[p]) &&
      input[p].held &&
      s.workers[p].animation === 'idle'
    )
      s.workers[p].animation = 'hold';
  for (let i = 0; i < 4; i++) {
    s.rodTarget[i] = rodTargetAt(s, i);
    if (!active.has(i))
      s.rodPressure[i] = Math.max(0, s.rodPressure[i] - dt * 1.25);
    const stillPushing = s.workers.some(
      (w, p) => p < s.players && w.side === i && arrived(w) && input[p].held,
    );
    if (!stillPushing) s.rodJam[i] = Math.max(0, s.rodJam[i] - dt);
  }
  if (s.rods.every((n) => n === 1)) {
    s.tool.owner = 0;
    s.tool.status = 'held';
    s.recommendedSide = s.side;
    transition(
      s,
      'tension',
      'Подцепи пружину: держи E и отпусти в зелёной зоне. Одна отвёртка на всю бригаду.',
    );
  }
}
function chooseReceiver(s: GameState, owner: number): number {
  const candidates = s.workers
    .slice(0, activeWorkers(s))
    .map((w, p) => ({
      p,
      d: Math.hypot(w.x - s.workers[owner].x, w.z - s.workers[owner].z),
    }))
    .filter((v) => v.p !== owner);
  candidates.sort(
    (a, b) =>
      Number(
        s.workers[b.p].targetSide === opposite(s.workers[owner].targetSide),
      ) -
        Number(
          s.workers[a.p].targetSide === opposite(s.workers[owner].targetSide),
        ) || b.d - a.d,
  );
  return candidates[0].p;
}
function launchTool(s: GameState) {
  const t = s.tool,
    from = s.workers[t.owner],
    to = s.workers[t.target];
  const power = throwTargetPower(s),
    error = t.charge - power;
  t.goodThrow = Math.abs(error) < 0.105;
  t.fromX = from.x;
  t.fromZ = from.z;
  t.toX = from.x + (to.x - from.x) * (1 + error * 1.3);
  t.toZ = from.z + (to.z - from.z) * (1 + error * 1.3);
  t.flight = 0;
  t.duration = 0.7 + Math.hypot(to.x - from.x, to.z - from.z) * 0.028;
  t.status = 'flight';
  t.groundSide = to.targetSide;
  s.workers[t.owner].animation = 'throw';
  emit(s, 'throw', t.owner, from.side, t.charge);
  s.message =
    'Лови! Получатель держит свою клавишу действия, когда отвёртка подлетает.';
}
function toolStep(
  s: GameState,
  dt: number,
  input: Input[],
  throwing: boolean,
  throwRelease: boolean,
) {
  const t = s.tool;
  if (t.status === 'held' || t.status === 'charging') {
    const w = s.workers[t.owner];
    t.x = w.x;
    t.z = w.z;
    t.y = 1.15;
    if (
      throwing &&
      !s.spring.active &&
      arrived(w) &&
      s.simulation.tossCooldown === 0
    ) {
      if (t.status !== 'charging') {
        t.charge = 0;
        t.target = chooseReceiver(s, t.owner);
      }
      t.status = 'charging';
      t.charge = Math.min(1, t.charge + dt * 0.75);
      w.animation = 'throw';
    }
    if (t.status === 'charging' && throwRelease) launchTool(s);
  } else if (t.status === 'flight') {
    t.flight = Math.min(1, t.flight + dt / t.duration);
    t.x = t.fromX + (t.toX - t.fromX) * t.flight;
    t.z = t.fromZ + (t.toZ - t.fromZ) * t.flight;
    t.y = 1.15 + Math.sin(Math.PI * t.flight) * 2;
    const target = s.workers[t.target];
    if (t.flight > 0.73 && input[t.target].held) target.animation = 'catch';
    if (t.flight === 1) {
      const close = Math.hypot(target.x - t.toX, target.z - t.toZ) < 1.3;
      if (t.goodThrow && close && input[t.target].held) {
        t.owner = t.target;
        t.status = 'held';
        t.catches++;
        if (t.catches === 1)
          screenSay(
            s,
            'Поймал! Всё, дружба проверена.',
            t.owner as 0 | 1 | 2,
            3.6,
          );
        t.needsPass = false;
        s.simulation.tossCooldown = 0.3;
        emit(s, 'catch', t.owner, target.side);
        s.message =
          'Поймал! Дружба выдержала ещё один тест. Теперь тяни свою сторону.';
        s.cooldown = 0.2;
      } else {
        t.status = 'ground';
        t.y = 0.1;
        t.misses++;
        s.simulation.tossCooldown = 0.3;
        penalty(
          s,
          'Мимо! Отвёртка на полу. Подойди к отмеченной стороне и нажми действие.',
          20,
        );
        emit(s, 'miss', t.target, t.groundSide);
      }
    }
  } else {
    // The retrieval zone deliberately stays outside the cloth. A miss never
    // makes the unique required tool inaccessible under the screen.
    for (let p = 0; p < activeWorkers(s); p++) {
      const w = s.workers[p];
      if (
        w.side === t.groundSide &&
        arrived(w) &&
        input[p].pressed &&
        s.simulation.tossCooldown === 0
      ) {
        t.needsPass = p === t.lastWorker && t.owner === p;
        t.owner = p;
        t.status = 'held';
        s.cooldown = 0.25;
        emit(s, 'catch', p, w.side);
        s.message = 'Подняли. Теперь кидаем человеку, а не в ипотеку.';
        break;
      }
    }
  }
}
function completeSpring(s: GameState) {
  const { worker: p, side, power } = s.spring,
    w = s.workers[p];
  s.spring.active = false;
  s.spring.worker = -1;
  s.cooldown = 0.28;
  const [min, max] = springWindow(s);
  if (power < min || power > max) {
    penalty(
      s,
      power < min
        ? 'Не дотянул. Пружина вернулась домой.'
        : 'Перетянул! Пружина решила уйти первой.',
    );
    emit(s, 'pop', p, side, power);
    return;
  }
  s.clips[side]++;
  if (Math.max(...s.clips) - Math.min(...s.clips) > 1) {
    s.clips[side]--;
    const loose = opposite(side);
    if (s.clips[loose] > 0) s.clips[loose]--;
    penalty(
      s,
      'ДЗЫНЬ! Противоположный край оторвался. Чередуйте все четыре стороны.',
      40,
    );
    emit(s, 'pop', p, loose, power);
  } else {
    if (s.clips[side] > s.simulation.clipBest[side]) {
      s.score += 65;
      s.simulation.clipBest[side] = s.clips[side];
    }
    emit(s, 'spring', p, side, power);
    w.animation = 'pull';
    s.message =
      'Крючок на раме. Передай отвёртку: Q держать, отпустить в зелёной зоне.';
  }
  s.tool.lastWorker = p;
  s.tool.needsPass = true;
  const minimum = Math.min(...s.clips),
    across = opposite(side);
  s.recommendedSide =
    s.clips[across] === minimum ? across : s.clips.indexOf(minimum);
  if (s.clips.every((n) => n === 4)) {
    award(s, 'Полотно натянуто', 300);
    transition(
      s,
      'drill',
      'Перевези стулья к отметке: A/D. E — залезть. Напарник страхует.',
    );
  }
}
function tensionStep(
  s: GameState,
  dt: number,
  input: Input[],
  throwing: boolean,
  throwRelease: boolean,
) {
  const ai = s.players === 1,
    t = s.tool;
  if (ai) {
    s.workers[1].targetSide =
      t.status === 'ground' && t.target === 1
        ? t.groundSide
        : opposite(s.workers[0].targetSide);
    input[1].held = t.status === 'flight' && t.target === 1;
    input[1].pressed = t.status === 'ground' && s.simulation.tossCooldown === 0;
    if (
      t.status === 'held' &&
      t.owner === 1 &&
      arrived(s.workers[1]) &&
      arrived(s.workers[0]) &&
      s.cooldown === 0
    ) {
      if (
        t.needsPass ||
        s.clips[s.workers[1].side] >= 4 ||
        s.clips[s.workers[1].side] > Math.min(...s.clips)
      )
        throwing = true;
      else if (!s.spring.active) input[1].pressed = true;
    }
    if (s.spring.active && s.spring.worker === 1) {
      const [min, max] = springWindow(s);
      input[1].held = s.spring.power < (min + max) / 2;
      input[1].released = !input[1].held;
    }
    if (t.status === 'charging' && t.owner === 1) {
      throwing = t.charge < throwTargetPower(s);
      throwRelease = !throwing;
    }
  }
  moveWorkers(s, dt, input);
  toolStep(s, dt, input, throwing, throwRelease);
  if (s.cooldown > 0 || t.status !== 'held') return;
  const p = t.owner,
    c = input[p],
    w = s.workers[p];
  if (s.spring.active) {
    s.spring.power = Math.min(1, s.spring.power + dt * 0.53);
    w.animation = 'pull';
    if (c.released || (!c.held && !c.pressed)) completeSpring(s);
    else if (s.spring.power >= 1) {
      completeSpring(s);
    }
  } else if (c.pressed && arrived(w)) {
    if (t.needsPass) {
      s.message =
        'Отвёртку — напарнику. После каждого крючка меняемся: Q держать и отпустить.';
      return;
    }
    if (s.clips[w.side] >= 4) {
      s.message = 'Здесь все четыре. Обойди рамку к свободной стороне.';
      return;
    }
    s.spring = { worker: p, side: w.side, power: 0, active: true };
    s.springTarget = (springWindow(s)[0] + springWindow(s)[1]) / 2;
    s.message =
      'Тяни и отпусти действие в зелёном секторе. Держать до упора — плохая идея.';
  }
  for (let i = 0; i < 4; i++)
    s.tension[i] =
      s.clips[i] / 4 +
      (s.spring.active && s.spring.side === i ? s.spring.power * 0.09 : 0);
}
function liftStep(s: GameState, dt: number, input: Input[]) {
  if (s.holes.length < 2) return;
  if (s.players === 1) {
    const desired = s.liftLeft + s.holes[1] - s.holes[0];
    input[1].y = clamp((desired - s.liftRight) * 2.5, -1, 1);
    input[1].held = input[0].held;
  }
  const damping = s.players === 3 && input[2].held ? 6.5 : 4.5;
  s.liftXVelocity += (input[0].x * 3.4 - s.liftXVelocity * damping) * dt;
  s.liftX = clamp(
    s.liftX + s.liftXVelocity * dt,
    -CARRY_SHIFT_LIMIT,
    CARRY_SHIFT_LIMIT,
  );
  const heights = [s.liftLeft, s.liftRight];
  for (let p = 0; p < 2; p++) {
    s.workers[p].animation = 'lift';
    if (s.latched[p]) {
      heights[p] = s.holes[p];
      s.liftVelocity[p] = 0;
      continue;
    }
    s.liftVelocity[p] += (input[p].y * 4.8 - s.liftVelocity[p] * 3.8) * dt;
    heights[p] = clamp(heights[p] + s.liftVelocity[p] * dt, 2, 7.5);
    s.fatigue[p] = clamp(
      s.fatigue[p] + dt * (Math.abs(s.liftVelocity[p]) > 0.65 ? 0.055 : -0.15),
      0,
      1,
    );
    const near =
      Math.abs(heights[p] - s.holes[p]) < 0.12 &&
      Math.abs(s.liftX) < 0.16 &&
      Math.abs(s.liftVelocity[p]) < 0.2;
    s.latchProgress[p] =
      near && input[p].held
        ? Math.min(1, s.latchProgress[p] + dt * 1.6)
        : Math.max(0, s.latchProgress[p] - dt * 3);
    if (s.latchProgress[p] === 1) {
      s.latched[p] = true;
      heights[p] = s.holes[p];
      emit(s, 'latch', p, p);
      s.message =
        p === 0
          ? 'Левый зацепился. Правый ещё живёт своей жизнью.'
          : 'Правый зацепился. Держим второй край.';
      screenSay(s, s.message, p as 0 | 1, 3.6);
    }
  }
  s.liftLeft = heights[0];
  s.liftRight = heights[1];
  s.latch = (s.latchProgress[0] + s.latchProgress[1]) / 2;
  const skew = Math.abs(s.liftRight - s.liftLeft - (s.holes[1] - s.holes[0]));
  if (skew > 1.4 && s.cooldown === 0) {
    const high = s.liftLeft > s.liftRight ? 0 : 1;
    if (high === 0) s.liftLeft = Math.max(2, s.liftLeft - 0.65);
    else s.liftRight = Math.max(2, s.liftRight - 0.65);
    s.liftVelocity[high] = 0;
    s.latched[high] = false;
    s.latchProgress[high] = 0;
    s.cooldown = 1.5;
    penalty(
      s,
      'Перекосило! Один край выскользнул. Поднимайте примерно вместе.',
      45,
    );
    emit(s, 'fall', high, high);
  }
  if (s.latched.every(Boolean)) {
    award(s, 'Оба крючка', 500);
    s.angle = Math.atan2(s.holes[1] - s.holes[0], 8.8) + 0.027;
    s.bubble = s.angle;
    s.levelStable = 0;
    transition(
      s,
      'level',
      'A/D регулирует подвесы. Дождись, пока пузырёк успокоится, и нажми E. Потолку не верь.',
    );
  }
}
function levelStep(s: GameState, dt: number, input: Input[]) {
  const direction = input[0].x || (s.players > 1 ? input[1].x : 0);
  s.angle = clamp(s.angle + direction * dt * 0.045, -0.22, 0.22);
  s.bubble += (s.angle - s.bubble) * Math.min(1, dt * 4);
  s.levelStable =
    Math.abs(s.angle) < 0.012 && Math.abs(s.bubble) < 0.013 && !direction
      ? Math.min(1.2, s.levelStable + dt)
      : 0;
  if (input[0].pressed && s.cooldown === 0) {
    if (s.levelStable < 1) {
      s.message = 'Пузырёк ещё думает. Поправь подвесы и дай ему секунду.';
      return;
    }
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
}
function fixedStep(s: GameState, dt: number, keys: Set<string>) {
  s.heldKeys = [...keys];
  const input = buildInputs(s, keys),
    throwing = keys.has('KeyQ');
  const throwRelease = !throwing && s.simulation.previousThrow;
  s.simulation.previousThrow = throwing;
  s.elapsed += dt;
  s.phaseTime += dt;
  s.cooldown = Math.max(0, s.cooldown - dt);
  s.simulation.tossCooldown = Math.max(0, s.simulation.tossCooldown - dt);
  const previousAnimations = s.workers.map((w) => w.animation);
  s.workers.forEach((w) => {
    w.animation = 'idle';
  });
  if (s.phase === 'frame') frameStep(s, dt, input);
  else if (s.phase === 'rods') rodsStep(s, dt, input);
  else if (s.phase === 'tension')
    tensionStep(s, dt, input, throwing, throwRelease);
  else if (s.phase === 'drill') drillStep(s, dt, input);
  else if (s.phase === 'lift') liftStep(s, dt, input);
  else if (s.phase === 'level') levelStep(s, dt, input);
  s.workers.forEach((w, p) => {
    w.actionTime =
      w.animation === previousAnimations[p] ? w.actionTime + dt : 0;
  });
}
/** A fixed 60 Hz accumulator makes simulation independent of renderer frame rate.
 * Input changes are timestamped at tick boundaries; long suspended frames are
 * bounded, not fast-forwarded into an unavoidable failure. */
export function tick(s: GameState, dt: number, keys: Set<string>) {
  if (s.paused || s.phase === 'result' || !Number.isFinite(dt) || dt <= 0)
    return;
  s.simulation.accumulator += Math.min(dt, 0.25);
  while (s.simulation.accumulator + 1e-9 >= STEP && !finished(s)) {
    s.simulation.accumulator -= STEP;
    fixedStep(s, STEP, keys);
  }
}

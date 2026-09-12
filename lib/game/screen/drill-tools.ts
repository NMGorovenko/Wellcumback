import { screenSay } from './dialogue.ts';
import type { GameState, Input } from './engine.ts';
import { drillStaging, type StagePoint } from './staging.ts';
import { toolGripTarget } from './tool-staging.ts';
import {
  DRILL_SHELF,
  bracePoint,
  drillDistance,
  drillPointIsClear,
  followAssistantPath,
  moveAssistant,
  nearChairs,
  type DrillPoint,
} from './drill-space.ts';
export type DrillToolKind = 'drill' | 'vacuum';
export type PhysicalDrillTool = {
  location: 'shelf' | 'assistant' | 'climber' | 'falling' | 'ground';
  position: StagePoint;
  fallFrom: StagePoint | null;
  fallTo: StagePoint | null;
  fallProgress: number;
};
export type DrillAssistant = {
  x: number;
  z: number;
  rotation: number;
  activity: 'idle' | 'walk' | 'brace' | 'pickup' | 'handoff';
  target: DrillPoint | null;
  route: DrillPoint[];
  pickupProgress: number;
  pickupTool: DrillToolKind | null;
};
export const DRILL_TOOL_KINDS: DrillToolKind[] = ['drill', 'vacuum'];
export function freshDrillTools(): Record<DrillToolKind, PhysicalDrillTool> {
  const make = (kind: DrillToolKind): PhysicalDrillTool => ({
    location: 'shelf',
    position: { ...DRILL_SHELF[kind] },
    fallFrom: null,
    fallTo: null,
    fallProgress: 0,
  });
  return { drill: make('drill'), vacuum: make('vacuum') };
}
export function freshDrillAssistant(): DrillAssistant {
  return {
    x: -4.4 * 0.49 - 0.67,
    z: -2.3,
    rotation: Math.PI,
    activity: 'idle',
    target: null,
    route: [],
    pickupProgress: 0,
    pickupTool: null,
  };
}
export function drillSay(s: GameState, text: string, speaker: 0 | 1 | 2 = 1) {
  s.message = text;
  screenSay(s, text, speaker);
}

export function syncDrillGear(s: GameState) {
  s.drillGear =
    s.drillTools.drill.location === 'climber'
      ? s.drillTools.vacuum.location === 'climber'
        ? 'ready'
        : 'drill'
      : 'none';
}
/** Mirrors the deterministic hand targets shared by the rendered rigs. */
export function climberToolPoint(
  s: GameState,
  kind: DrillToolKind,
): StagePoint {
  const stage = drillStaging(s),
    body = stage.workers[1],
    side = kind === 'drill' ? 1 : -1;
  if (s.drillMode === 'drill') {
    const mark = stage.wallTarget;
    return toolGripTarget(
      kind,
      {
        x: mark.x,
        y: mark.y - (kind === 'vacuum' ? 0.05 : 0),
        z: mark.z + 0.006,
      },
      { x: body.x + side * 0.22, y: body.y + 1.2, z: body.z },
    );
  }
  if (s.drillMode === 'handoff')
    return {
      x: stage.handoffTarget.x + side * 0.1,
      y: stage.handoffTarget.y,
      z: stage.handoffTarget.z,
    };
  return { x: body.x + side * 0.24, y: body.y + 0.91, z: body.z - 0.06 };
}
export function updateToolPositions(s: GameState, dt: number) {
  for (const kind of DRILL_TOOL_KINDS) {
    const t = s.drillTools[kind];
    if (t.location === 'assistant')
      t.position = {
        x: s.drillAssistant.x + (kind === 'drill' ? 0.18 : -0.18),
        y: 1.05,
        z: s.drillAssistant.z - 0.12,
      };
    else if (t.location === 'climber') t.position = climberToolPoint(s, kind);
    else if (t.location === 'falling' && t.fallFrom && t.fallTo) {
      t.fallProgress = Math.min(1, t.fallProgress + dt / 0.95);
      const p = t.fallProgress,
        travel = Math.min(1, p / 0.6),
        smooth = travel * travel * (3 - 2 * travel);
      t.position = {
        x: t.fallFrom.x + (t.fallTo.x - t.fallFrom.x) * smooth,
        z: t.fallFrom.z + (t.fallTo.z - t.fallFrom.z) * smooth,
        y: Math.max(
          0.16,
          t.fallFrom.y +
            (t.fallTo.y - t.fallFrom.y) * p * p +
            Math.sin(Math.PI * p) * 0.08,
        ),
      };
      if (p === 1) {
        t.location = 'ground';
        t.position = { ...t.fallTo };
      }
    }
  }
}
export function dropClimberTools(s: GameState) {
  for (const [index, kind] of DRILL_TOOL_KINDS.entries()) {
    const t = s.drillTools[kind];
    if (t.location !== 'climber') continue;
    const from = { ...t.position },
      desired = { x: s.chairX * 0.49 + 0.9 + index * 0.28, z: -2.28 };
    let landing: DrillPoint | null = null;
    // Prefer the open aisle beside Yarik, never inside a sofa, cloth or chair.
    for (let radius = 0; radius <= 1.5 && !landing; radius += 0.12)
      for (let n = 0; n < 16; n++) {
        const p = {
          x: desired.x + Math.cos((n * Math.PI) / 8) * radius,
          z: desired.z + Math.sin((n * Math.PI) / 8) * radius,
        };
        if (drillPointIsClear(s, p, 0.255, false)) {
          landing = p;
          break;
        }
      }
    landing ??= bracePoint(s);
    t.location = 'falling';
    t.fallFrom = from;
    t.fallTo = { ...landing, y: 0.16 };
    t.fallProgress = 0;
  }
  s.handoffTool = null;
  s.handoffProgress = 0;
  syncDrillGear(s);
}
export function pickupCandidate(s: GameState): DrillToolKind | null {
  if (!s.toolsRemembered) return null;
  return (
    DRILL_TOOL_KINDS.find((kind) => {
      const t = s.drillTools[kind];
      return (
        (t.location === 'shelf' &&
          drillDistance(s.drillAssistant, DRILL_SHELF.approach) < 0.3) ||
        (t.location === 'ground' &&
          drillDistance(s.drillAssistant, t.position) < 0.55)
      );
    }) ?? null
  );
}
export function nextHandoffTool(s: GameState): DrillToolKind | null {
  return (
    DRILL_TOOL_KINDS.find(
      (kind) => s.drillTools[kind].location === 'assistant',
    ) ?? null
  );
}
export function assistantObjective(s: GameState): DrillPoint {
  if (s.toolsRemembered) {
    const ground = DRILL_TOOL_KINDS.find(
      (kind) => s.drillTools[kind].location === 'ground',
    );
    if (ground) {
      const p = s.drillTools[ground].position;
      if (drillPointIsClear(s, p)) return { x: p.x, z: p.z };
      // Yarik may stand near the landing; approach from a reachable side.
      for (let n = 0; n < 16; n++) {
        const q = {
          x: p.x + Math.cos((n * Math.PI) / 8) * 0.515,
          z: p.z + Math.sin((n * Math.PI) / 8) * 0.515,
        };
        if (drillPointIsClear(s, q)) return q;
      }
    }
    if (
      DRILL_TOOL_KINDS.some((kind) => s.drillTools[kind].location === 'shelf')
    )
      return { ...DRILL_SHELF.approach };
  }
  return bracePoint(s);
}
/** Context action is local. While E braces, horizontal input corrects balance;
 * releasing E gives Nikita ordinary collision-constrained room movement. */
export function assistantStep(s: GameState, dt: number, input: Input): boolean {
  const a = s.drillAssistant,
    solo = s.players === 1;
  a.activity = 'idle';
  let held = input.held;
  if (solo) {
    const target = assistantObjective(s),
      distance = drillDistance(a, target);
    if (distance > 0.03) {
      followAssistantPath(s, target, dt);
      held = false;
    } else {
      a.route = [];
      a.target = null;
      held = true;
    }
  } else {
    a.route = [];
    a.target = null;
    const localAction = held && (nearChairs(s) || pickupCandidate(s) !== null);
    if (!localAction) moveAssistant(s, input.x, -input.y, dt);
  }
  const candidate = held ? pickupCandidate(s) : null;
  if (candidate) {
    if (a.pickupTool !== candidate) {
      a.pickupTool = candidate;
      a.pickupProgress = 0;
    }
    a.activity = 'pickup';
    s.workers[0].animation = 'feed';
    a.pickupProgress = Math.min(1, a.pickupProgress + dt / 0.55);
    if (a.pickupProgress === 1) {
      s.drillTools[candidate].location = 'assistant';
      a.pickupTool = null;
      a.pickupProgress = 0;
      drillSay(
        s,
        candidate === 'drill'
          ? 'Дрель нашёл. И пылесос возьму.'
          : 'Всё взял. Только не падай, я уже иду!',
        0,
      );
    }
  } else {
    a.pickupProgress = 0;
    a.pickupTool = null;
  }
  const braced = held && nearChairs(s) && !candidate;
  if (braced) {
    a.activity = 'brace';
    a.rotation = Math.PI;
    s.workers[0].animation = 'hold';
  }
  s.braceHeld = braced;
  s.workers[0].x = a.x / 0.49;
  s.workers[0].z = (a.z + 0.56) / 0.49;
  return braced;
}

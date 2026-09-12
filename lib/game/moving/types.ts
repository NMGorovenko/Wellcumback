import type { MovingDialogueId } from './dialogue.ts';
export type Point = { x: number; y: number };
export type MovingActivity =
  | 'free'
  | 'packing'
  | 'rest'
  | 'alert-walk'
  | 'laptop'
  | 'toilet-walk'
  | 'toilet';
export type MovingTaskTarget = Point & {
  kind: 'item' | 'bag' | 'sofa' | 'laptop' | 'toilet' | 'entry';
  id: number | null;
};
export type MovingActor = Point & {
  id: number;
  vx: number;
  vy: number;
  facing: number;
  stamina: number;
  heldItem: number | null;
  bagId: number | null;
  zipping: number | null;
  working: boolean;
  bumpUntil: number;
  activity: MovingActivity;
  activityProgress: number;
  taskTarget: MovingTaskTarget | null;
  packingBag: number | null;
  route: Point[];
  routeKey: string;
  routeBlocked: number;
};
export type MovingItem = Point & {
  id: number;
  label: string;
  weight: number;
  kind: string;
  status: 'floor' | 'held' | 'packed';
  carrier: number | null;
  bagId: number | null;
};
export type MovingBag = Point & {
  id: number;
  weight: number;
  capacity: number;
  zip: number;
  status: 'open' | 'closed' | 'carried' | 'delivered';
  carriers: number[];
};
export type MovingDuty = {
  active: boolean;
  count: number;
  progress: number;
  nextAt: number;
};
export type MovingState = {
  players: number;
  actorCount: number;
  phase: 'brief' | 'moving' | 'result';
  chapter: 'packing' | 'carrying';
  paused: boolean;
  elapsed: number;
  dayRemaining: number;
  score: number;
  actors: MovingActor[];
  items: MovingItem[];
  bags: MovingBag[];
  message: string;
  messageUntil: number;
  messageSeq: number;
  speaker: string;
  dialogueId: MovingDialogueId | null;
  teamwork: number;
  bumps: number;
  delivered: number;
  alert: MovingDuty & {
    operation: number;
    awaitingRelease: boolean;
    inputMismatch: boolean;
  };
  toilet: MovingDuty;
  dutyGraceUntil: number;
  previousAction: boolean[];
  previousSecondary: boolean[];
};
export type MovingIntent = {
  kind:
    | 'item'
    | 'pack'
    | 'zip'
    | 'carry'
    | 'join'
    | 'travel'
    | 'blocked'
    | 'search'
    | 'reopen'
    | 'rest'
    | 'laptop'
    | 'duty';
  target: number | null;
  label: string;
  hold?: boolean;
  control?: 'action' | 'secondary';
  release?: boolean;
};
export type MovingInput = {
  x: number;
  y: number;
  action: boolean;
  alternate: boolean;
};

import { PLAYER_BINDINGS } from './bindings.ts';
import { getControlSettings } from './settings-store.ts';
import {
  getPhysicalBinding,
  physicalKeyLabel,
  type CanonicalKey,
  type InputProfile,
} from './settings.ts';
import { analogAxis, neutralDrive, type DriveAxes } from './drive.ts';
export { PLAYER_BINDINGS } from './bindings.ts';
/** Standard Gamepad layout: https://www.w3.org/TR/gamepad/#remapping
 * Device identity selects prompt labels only; the browser owns button remapping. */
export type PadButton = { pressed: boolean; value: number };
export type PadLike = {
  index: number;
  id: string;
  mapping: string;
  connected: boolean;
  axes: readonly number[];
  buttons: readonly PadButton[];
};
export type PadDirection = 'up' | 'down' | 'left' | 'right';
export type PadBrand = 'playstation' | 'xbox' | 'generic';
export type PadIdentity = { brand: PadBrand; label: string };
export type PadAssignment = PadIdentity & {
  index: number;
  player: number;
  ready: boolean;
};
export type PadFrame = {
  keys: Set<string>;
  drive?: DriveAxes;
  raceDrives?: DriveAxes[];
  primaryActionPressed: boolean;
  pausePressed: boolean;
  assignments: PadAssignment[];
  unsupported: number[];
  navigation: { x: number; y: number; confirm: boolean; back: boolean };
};
type PadMemory = {
  id: string;
  player: number;
  ready: boolean;
  x: number;
  y: number;
  action: boolean;
  secondary: boolean;
  pause: boolean;
  profile: InputProfile;
};
export type PadInputState = { pads: Map<number, PadMemory> };
export type PadNavigationState = {
  direction: PadDirection | null;
  repeatAt: number;
};
export type PadNavigation = {
  direction: PadDirection | null;
  confirm: boolean;
  back: boolean;
};
export const createPadInput = (): PadInputState => ({ pads: new Map() });
export const createPadNavigation = (): PadNavigationState => ({
  direction: null,
  repeatAt: 0,
});
const buttonValue = (pad: PadLike, index: number) => {
  const value = pad.buttons[index]?.value ?? 0;
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
};
const pushed = (pad: PadLike, index: number) =>
  !!pad.buttons[index]?.pressed || buttonValue(pad, index) > 0.5;
const secondaryHeld = (pad: PadLike, previous: boolean) =>
  !!pad.buttons[6]?.pressed || buttonValue(pad, 6) > (previous ? 0.25 : 0.5);
const axisValue = (pad: PadLike, index: number) =>
  Number.isFinite(pad.axes[index])
    ? Math.max(-1, Math.min(1, pad.axes[index]))
    : 0;
/** Engage past .4, release below .25. A drifting stick cannot chatter around a single threshold. */
export function digitalAxis(value: number, previous: number) {
  if (!Number.isFinite(value)) return 0;
  if (value >= 0.4) return 1;
  if (value <= -0.4) return -1;
  if (previous === 1 && value > 0.25) return 1;
  if (previous === -1 && value < -0.25) return -1;
  return 0;
}
/** After hotplug, assignment changes, tab blur or resume, release controls before re-arming. */
export function resetPadInput(state: PadInputState) {
  for (const memory of state.pads.values()) {
    memory.ready = false;
    memory.x = memory.y = 0;
    memory.action = memory.secondary = memory.pause = false;
  }
}
/** Keyboard and touch remain source-owned. Never write pad keys into their mutable Set. */
export function mergeInputKeys(
  keyboard: ReadonlySet<string>,
  pad: ReadonlySet<string>,
): Set<string> {
  return new Set([...keyboard, ...pad]);
}
/** Some chapters expose one playable actor before the cooperative crew arrives.
 * AI helpers count as actors, but never create extra human input slots. */
export function inputPlayerCount(state: {
  players?: number;
  actorCount?: number;
}): number {
  return Math.min(state.players ?? 1, state.actorCount ?? 3);
}
/** One pad in multiplayer is the keyboard player's partner (player 2).
 * Two or more pads fill players 1/2/3 by browser index. Every keyboard binding remains usable. */
export function mapGamepads(
  state: PadInputState,
  raw: readonly (PadLike | null)[],
  players = 1,
  profile: InputProfile = 'game',
): PadFrame {
  const count =
    profile === 'city'
      ? 1
      : Math.min(
          profile === 'race' ? 2 : 3,
          Math.max(1, Math.floor(players) || 1),
        );
  const connected = raw
    .filter((pad): pad is PadLike => !!pad?.connected)
    .sort((a, b) => a.index - b.index);
  const standard = connected
    .filter((pad) => pad.mapping === 'standard')
    .slice(0, count);
  const live = new Set(standard.map((pad) => pad.index));
  for (const index of state.pads.keys())
    if (!live.has(index)) state.pads.delete(index);
  const frame: PadFrame = {
    keys: new Set(),
    ...(profile === 'city' ? { drive: neutralDrive() } : {}),
    ...(profile === 'race'
      ? { raceDrives: Array.from({ length: count }, () => neutralDrive()) }
      : {}),
    primaryActionPressed: false,
    pausePressed: false,
    assignments: [],
    unsupported: connected
      .filter((pad) => pad.mapping !== 'standard')
      .map((pad) => pad.index),
    navigation: { x: 0, y: 0, confirm: false, back: false },
  };
  standard.forEach((pad, ordinal) => {
    let player = count > 1 && standard.length === 1 ? 1 : ordinal;
    if (profile === 'race') {
      const old = state.pads.get(pad.index);
      if (old?.profile === 'race' && old.id === pad.id && old.player < count)
        player = old.player;
      else {
        const occupied = new Set(
          [...state.pads.values()]
            .filter((m) => m.profile === 'race')
            .map((m) => m.player),
        );
        player =
          [player, ...Array.from({ length: count }, (_, i) => i)].find(
            (i) => !occupied.has(i),
          ) ?? player;
      }
    }
    let memory = state.pads.get(pad.index);
    if (
      !memory ||
      memory.id !== pad.id ||
      memory.player !== player ||
      memory.profile !== profile
    ) {
      memory = {
        id: pad.id,
        player,
        ready: false,
        x: 0,
        y: 0,
        action: false,
        secondary: false,
        pause: false,
        profile,
      };
      state.pads.set(pad.index, memory);
    }
    const neutral =
      Math.abs(axisValue(pad, 0)) <= 0.25 &&
      Math.abs(axisValue(pad, 1)) <= 0.25 &&
      !pad.buttons[6]?.pressed &&
      buttonValue(pad, 6) <= 0.25 &&
      [
        0,
        1,
        5,
        9,
        12,
        13,
        14,
        15,
        ...(profile !== 'game' ? [2, 3, 7] : []),
      ].every((index) => !pushed(pad, index)) &&
      (profile === 'game' ||
        (buttonValue(pad, 7) <= 0.05 &&
          buttonValue(pad, 6) <= 0.05 &&
          Math.abs(axisValue(pad, 0)) <= 0.15));
    const identity = identifyGamepad(pad.id);
    if (!memory.ready) {
      memory.ready = neutral;
      frame.assignments.push({
        ...identity,
        index: pad.index,
        player,
        ready: memory.ready,
      });
      return;
    }
    const horizontal = Number(pushed(pad, 15)) - Number(pushed(pad, 14));
    const vertical = Number(pushed(pad, 13)) - Number(pushed(pad, 12));
    memory.x = horizontal || digitalAxis(axisValue(pad, 0), memory.x);
    memory.y = vertical || digitalAxis(axisValue(pad, 1), memory.y);
    const action = pushed(pad, 0),
      pause = pushed(pad, 1) || pushed(pad, 9);
    const actionPressed = action && !memory.action,
      pausePressed = pause && !memory.pause;
    const keys = PLAYER_BINDINGS[player];
    if (profile === 'game') {
      if (memory.x < 0) frame.keys.add(keys.left);
      if (memory.x > 0) frame.keys.add(keys.right);
      if (memory.y < 0) frame.keys.add(keys.up);
      if (memory.y > 0) frame.keys.add(keys.down);
    } else {
      const trigger = (index: number) =>
        analogAxis(
          buttonValue(pad, index) || Number(!!pad.buttons[index]?.pressed),
          0.05,
        );
      const drive = {
        steer: horizontal || analogAxis(axisValue(pad, 0)),
        throttle: trigger(7) - trigger(6),
      };
      if (profile === 'race') frame.raceDrives![player] = drive;
      else frame.drive = drive;
    }
    if (profile === 'race' ? pushed(pad, 3) : action)
      frame.keys.add(keys.action);
    memory.secondary =
      profile !== 'game'
        ? pushed(pad, 2)
        : secondaryHeld(pad, memory.secondary);
    if (memory.secondary) frame.keys.add(keys.secondary);
    if (profile !== 'race' && pushed(pad, 5)) frame.keys.add('KeyQ'); // Shared screwdriver; the engine determines its current owner.
    if (player === 0 && actionPressed) frame.primaryActionPressed = true;
    frame.pausePressed ||= pausePressed;
    // Every teammate can resume a pause they opened. Simultaneous direction
    // input is deterministic: the lowest active browser index wins.
    if (!frame.navigation.x && !frame.navigation.y) {
      frame.navigation.x = memory.x;
      frame.navigation.y = memory.y;
    }
    frame.navigation.confirm ||= actionPressed;
    frame.navigation.back ||= pausePressed;
    memory.action = action;
    memory.pause = pause;
    frame.assignments.push({
      ...identity,
      index: pad.index,
      player,
      ready: true,
    });
  });
  return frame;
}
/** Repeating navigation is explicit and time-based, independent of animation frame rate. */
export function navigateGamepad(
  state: PadNavigationState,
  frame: PadFrame,
  now: number,
): PadNavigation {
  const input = frame.navigation;
  if (input.back || input.confirm)
    return {
      direction: null,
      confirm: input.confirm && !input.back,
      back: input.back,
    };
  const direction: PadDirection | null =
    input.y < 0
      ? 'up'
      : input.y > 0
        ? 'down'
        : input.x < 0
          ? 'left'
          : input.x > 0
            ? 'right'
            : null;
  if (!direction) {
    state.direction = null;
    state.repeatAt = 0;
    return { direction: null, confirm: false, back: false };
  }
  if (direction !== state.direction) {
    state.direction = direction;
    state.repeatAt = now + 0.36;
    return { direction, confirm: false, back: false };
  }
  if (now >= state.repeatAt) {
    state.repeatAt = now + 0.13;
    return { direction, confirm: false, back: false };
  }
  return { direction: null, confirm: false, back: false };
}
/** HTTPS/localhost and a user gesture may be needed before a browser exposes pads. */
export function readGamepads(): readonly (PadLike | null)[] {
  try {
    return typeof navigator !== 'undefined' &&
      typeof navigator.getGamepads === 'function'
      ? Array.from(navigator.getGamepads())
      : [];
  } catch {
    return [];
  } // Unsupported browser / permissions policy: keyboard input continues.
}
/** IDs vary by browser and transport. Unknown IDs keep positional labels;
 * a familiar name never makes a nonstandard device safe to map. */
export function identifyGamepad(id: string): PadIdentity {
  const sony = /\b054c\b/i.test(id);
  if (/dualsense/i.test(id) || (sony && /\b(?:0ce6|0df2)\b/i.test(id)))
    return { brand: 'playstation', label: 'DualSense' };
  if (/dualshock/i.test(id) || (sony && /\b(?:05c4|09cc|0ba0)\b/i.test(id)))
    return { brand: 'playstation', label: 'DualShock' };
  if (sony || /\b(?:sony|playstation|ps[345])\b/i.test(id))
    return { brand: 'playstation', label: 'PlayStation' };
  if (
    /\b(?:xbox|xinput)\b/i.test(id) ||
    (/\b045e\b/i.test(id) &&
      /\b(?:028e|02d1|02dd|02e0|02e3|02ea|02fd|0719|0b00|0b05|0b06|0b0a|0b12|0b13|0b20|0b22)\b/i.test(
        id,
      ))
  )
    return { brand: 'xbox', label: 'Xbox' };
  return { brand: 'generic', label: 'Геймпад' };
}
const PAD_BUTTON_LABELS: Record<PadBrand, readonly string[]> = {
  playstation: [
    '×',
    '○',
    '□',
    '△',
    'L1',
    'R1',
    'L2',
    'R2',
    'Create / Share',
    'Options',
  ],
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu'],
  generic: [
    'нижняя кнопка',
    'правая кнопка',
    'левая кнопка',
    'верхняя кнопка',
    'левый бампер',
    'правый бампер',
    'левый триггер',
    'правый триггер',
    'выбор',
    'меню',
  ],
};
export function padButtonLabel(brand: PadBrand, button: number): string {
  return PAD_BUTTON_LABELS[brand][button] ?? `Кнопка ${button + 1}`;
}
export type InputControl =
  | 'move'
  | 'horizontal'
  | 'vertical'
  | 'action'
  | 'secondary'
  | 'throw'
  | 'pause';
export function keyPrompt(
  code: string,
  profile: InputProfile = 'game',
): string {
  const physical =
    getPhysicalBinding(getControlSettings(), code as CanonicalKey, profile) ||
    code;
  return physicalKeyLabel(physical);
}
export function keyboardPrompt(
  player: number,
  control: InputControl,
  profile: InputProfile = 'game',
): string {
  const prompt = (code: string) => keyPrompt(code, profile);
  const keys = PLAYER_BINDINGS[player];
  if (!keys) return '';
  if (control === 'move')
    return [keys.up, keys.left, keys.down, keys.right].map(prompt).join('');
  if (control === 'horizontal')
    return `${prompt(keys.left)}/${prompt(keys.right)}`;
  if (control === 'vertical') return `${prompt(keys.up)}/${prompt(keys.down)}`;
  return prompt(
    control === 'throw'
      ? 'KeyQ'
      : control === 'pause'
        ? 'Escape'
        : keys[control],
  );
}
/** Resolve by playable actor, never by physical browser index. */
export function gamepadPrompt(
  frame: Pick<PadFrame, 'assignments'>,
  player: number,
  control: InputControl,
  profile: InputProfile = 'game',
): string | null {
  const assignment = frame.assignments.find((pad) => pad.player === player);
  if (!assignment) return null;
  if (control === 'move') return 'левый стик / крестовина';
  if (control === 'horizontal') return 'стик ←/→';
  if (control === 'vertical')
    return profile !== 'game'
      ? `${padButtonLabel(assignment.brand, 7)} / ${padButtonLabel(assignment.brand, 6)}`
      : 'стик ↑/↓';
  const label = (button: number) => padButtonLabel(assignment.brand, button);
  if (profile !== 'game' && control === 'secondary') return label(2);
  if (profile === 'race' && control === 'action') return label(3);
  if (control === 'pause') return `${label(1)} / ${label(9)}`;
  return label(control === 'action' ? 0 : control === 'secondary' ? 6 : 5);
}
/** Keyboard stays usable even while a pad is assigned to the same actor. */
export function inputPrompt(
  frame: Pick<PadFrame, 'assignments'>,
  player: number,
  control: InputControl,
): string {
  return [
    keyboardPrompt(player, control),
    gamepadPrompt(frame, player, control),
  ]
    .filter(Boolean)
    .join(' / ');
}
export function gamepadHint(
  frame: Pick<PadFrame, 'assignments' | 'unsupported'>,
): string {
  if (!frame.assignments.length)
    return frame.unsupported.length
      ? 'Нестандартный геймпад: используй клавиатуру.'
      : 'Клавиатура · подключи геймпад и нажми любую кнопку';
  const assigned = frame.assignments
    .map(
      ({ index, player, ready, label }) =>
        `${label} ${index + 1} → игрок ${player + 1}${ready ? '' : ' · отпусти кнопки'}`,
    )
    .join(' / ');
  return (
    assigned +
    (frame.unsupported.length
      ? ' · Нестандартный геймпад: используй клавиатуру.'
      : '')
  );
}

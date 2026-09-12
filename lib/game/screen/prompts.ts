import type { GameState } from './engine.ts';
import {
  gamepadPrompt,
  keyboardPrompt,
  keyPrompt,
  PLAYER_BINDINGS,
  type InputControl,
  type PadFrame,
} from '../input/gamepads.ts';

export type ScreenPrompt = {
  control: InputControl;
  text: string;
  mode?: 'hold' | 'release' | 'tap';
  direction?: 'left' | 'right';
  emphasis?: 'safe' | 'correct' | 'danger';
  satisfied?: boolean;
};
export type WorkerPrompt = {
  worker: number;
  player: number | null;
  role: string;
  prompts: ScreenPrompt[];
};
/** Positive balance drifts right. A/left is the real negative-x engine input;
 * both horizontal keys cancel, and a direction alone never braces the chair. */
export function chairBalanceCue(s: GameState) {
  const magnitude = Math.abs(s.balance);
  const direction: 'left' | 'right' | null =
    magnitude <= 0.14 ? null : s.balance > 0 ? 'left' : 'right';
  const held = s.braceHeld;
  const x =
    Number(s.heldKeys.includes('KeyD')) - Number(s.heldKeys.includes('KeyA'));
  const correcting =
    held &&
    (direction === null ? x === 0 : x === (direction === 'left' ? -1 : 1));
  const emphasis: NonNullable<ScreenPrompt['emphasis']> =
    !held || magnitude >= 0.72 ? 'danger' : direction ? 'correct' : 'safe';
  const text = !held
    ? 'Стулья отпущены!'
    : direction === 'left'
      ? 'Клонит вправо — тяни влево'
      : direction === 'right'
        ? 'Клонит влево — тяни вправо'
        : 'Ровно — отпусти направление';
  return { direction, held, correcting, emphasis, text };
}

/** Shared by footer and projected in-world badges. Resolve the exact key/stick
 * direction here so a warning never highlights an unrelated player's arrows. */
export function screenPromptInput(
  pads: Pick<PadFrame, 'assignments'>,
  player: number,
  prompt: ScreenPrompt,
  heldKeys: readonly string[],
) {
  const binding = PLAYER_BINDINGS[player];
  const { control, direction } = prompt;
  if (direction) {
    const opposite = direction === 'left' ? 'right' : 'left';
    const pad = pads.assignments.some((p) => p.player === player);
    return {
      label: pad
        ? `стик ${direction === 'left' ? '←' : '→'}`
        : keyPrompt(binding[direction]),
      held:
        heldKeys.includes(binding[direction]) &&
        !heldKeys.includes(binding[opposite]),
    };
  }
  const code =
    control === 'action' || control === 'secondary'
      ? binding[control]
      : control === 'throw'
        ? 'KeyQ'
        : '';
  const held =
    control === 'horizontal'
      ? heldKeys.includes(binding.left) || heldKeys.includes(binding.right)
      : heldKeys.includes(code) ||
        (player === 0 && control === 'action' && heldKeys.includes('Space'));
  return {
    label:
      gamepadPrompt(pads, player, control) || keyboardPrompt(player, control),
    held,
  };
}
/** Movie-style cues describe the next action, not every possible binding. The
 * controls remain fixed; solo's drill beat directs Yarik while Nikita assists. */
export function screenPrompts(s: GameState): WorkerPrompt[] {
  const solo = s.players === 1;
  const drilling = s.phase === 'drill';
  return Array.from({ length: Math.max(2, s.players) }, (_, worker) => {
    const player = solo
      ? drilling
        ? worker === 1
          ? 0
          : null
        : worker === 0
          ? 0
          : null
      : worker;
    const role = drilling
      ? ['страхует и подаёт', 'на стульях', 'помогает страховать'][worker]
      : ['левый край', 'правый край', 'на подхвате'][worker];
    const row: WorkerPrompt = { worker, player, role, prompts: [] };
    const cue = (
      control: InputControl,
      text: string,
      mode?: ScreenPrompt['mode'],
      details?: Pick<ScreenPrompt, 'direction' | 'emphasis' | 'satisfied'>,
    ) => row.prompts.push({ control, text, mode, ...details });
    if (player === null) return row;
    if (s.phase === 'frame') {
      if (worker === 0) {
        if (s.frameStage === 'align') {
          cue('horizontal', 'совместить');
          cue('vertical', 'повернуть');
          cue('action', 'вставить', 'tap');
        } else cue('action', 'щёлкнуть в зелёном', 'tap');
      } else cue('action', 'держать профиль', 'hold');
    } else if (s.phase === 'rods') {
      const w = s.workers[worker];
      if (s.rodJam[w.side] > 0) cue('action', 'освободить спицу', 'release');
      else if (s.heldKeys.includes(['KeyE', 'Enter', 'KeyO'][player])) {
        cue('action', 'вставлять спицу', 'hold');
        cue('horizontal', 'в зелёную зону');
      } else {
        cue('move', 'обойти полотно');
        cue('action', 'вставлять спицу', 'hold');
      }
    } else if (s.phase === 'tension') {
      const t = s.tool;
      if (t.status === 'flight' && t.target === worker)
        cue('action', 'ЛОВИ!', 'hold');
      else if (t.status === 'ground') {
        cue('move', 'к отвёртке');
        cue('action', 'подобрать', 'tap');
      } else if (t.owner === worker && (t.status === 'charging' || t.needsPass))
        cue(
          'throw',
          t.status === 'charging' ? 'отпустить в зелёном' : 'зарядить бросок',
          t.status === 'charging' ? 'release' : 'hold',
        );
      else if (t.owner === worker) {
        cue('move', 'к свободной стороне');
        cue(
          'action',
          s.spring.active ? 'отпустить в зелёном' : 'натянуть пружину',
          s.spring.active ? 'release' : 'hold',
        );
      } else {
        cue('move', 'встать напротив');
        cue('action', 'ловить отвёртку', 'hold');
      }
    } else if (drilling) {
      if (s.drillMode === 'position') {
        if (worker === 0 || solo) {
          cue('horizontal', 'стулья к отметке');
          cue('vertical', '2 / 1 стул');
        }
        cue(
          'action',
          worker === 0 && !solo ? 'страховать' : 'забраться',
          'hold',
        );
      } else if (s.drillMode === 'fallen') {
        // Recovery plays out before any new action can begin.
      } else if (worker === 0) {
        const balance = chairBalanceCue(s);
        cue(
          'action',
          !balance.held
            ? 'стулья отпущены!'
            : s.drillMode === 'handoff'
              ? s.drillGear === 'none'
                ? 'держать + подать дрель'
                : 'держать + подать пылесос'
              : 'держать стулья',
          'hold',
          {
            emphasis: balance.held ? 'safe' : 'danger',
            satisfied: balance.held,
          },
        );
        cue(
          'horizontal',
          balance.direction
            ? balance.direction === 'left'
              ? 'клонит вправо — тяни влево'
              : 'клонит влево — тяни вправо'
            : 'стулья ровно',
          balance.direction ? 'hold' : 'release',
          {
            direction: balance.direction ?? undefined,
            emphasis: balance.emphasis,
            satisfied: balance.correcting,
          },
        );
      } else if (worker === 1) {
        if (s.drillMode === 'climb' || s.drillMode === 'descend')
          cue(
            'action',
            s.drillMode === 'climb' ? 'забираться' : 'спускаться',
            'hold',
          );
        else if (s.drillMode === 'handoff')
          cue(
            'action',
            s.drillGear === 'none' ? 'принять дрель' : 'принять пылесос',
            'hold',
          );
        else {
          cue('vertical', 'высота отверстия');
          cue(
            'action',
            s.drillHeat > 0.75 ? 'остудить дрель' : 'сверлить',
            s.drillHeat > 0.75 ? 'release' : 'hold',
          );
          cue('secondary', 'пылесосить', 'hold');
        }
      } else cue('action', 'страховать вместе', 'hold');
    } else if (s.phase === 'lift') {
      if (worker < 2) {
        cue(
          'vertical',
          s.latched[worker] ? 'край зацеплен ✓' : 'поднять / опустить',
        );
        if (worker === 0) cue('horizontal', 'совместить крючки');
        if (!s.latched[worker]) cue('action', 'зацепить', 'hold');
      } else cue('action', 'гасить раскачку', 'hold');
    } else if (s.phase === 'level' && worker === 0) {
      cue('horizontal', 'выставить уровень');
      cue('action', s.levelStable >= 1 ? 'ГОТОВО' : 'дождаться уровня', 'tap');
    }
    return row;
  });
}

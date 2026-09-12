import type { GameState } from './engine.ts';
import type { InputControl } from '../input/gamepads.ts';

export type ScreenPrompt = {
  control: InputControl;
  text: string;
  mode?: 'hold' | 'release' | 'tap';
};
export type WorkerPrompt = {
  worker: number;
  player: number | null;
  role: string;
  prompts: ScreenPrompt[];
};
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
    ) => row.prompts.push({ control, text, mode });
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
        cue(
          'action',
          s.drillMode === 'handoff'
            ? s.drillGear === 'none'
              ? 'подать дрель'
              : 'подать пылесос'
            : 'ДЕРЖАТЬ стулья',
          'hold',
        );
        cue('horizontal', 'ловить баланс');
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

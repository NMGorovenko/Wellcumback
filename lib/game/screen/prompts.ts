import { nearChairs } from './drill-space.ts';
import { pickupCandidate, nextHandoffTool } from './drill-tools.ts';
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
  const controller = PLAYER_BINDINGS[held || s.players === 1 ? 0 : 1];
  const x =
    Number(s.heldKeys.includes(controller.right)) -
    Number(s.heldKeys.includes(controller.left));
  const correcting =
    direction === null ? x === 0 : x === (direction === 'left' ? -1 : 1);
  const emphasis: NonNullable<ScreenPrompt['emphasis']> =
    magnitude >= 0.72 ? 'danger' : direction ? 'correct' : 'safe';
  const text = !held
    ? direction === 'left'
      ? 'Ярик, вес влево'
      : direction === 'right'
        ? 'Ярик, вес вправо'
        : 'Никита отошёл — баланс у Ярика'
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
      : control === 'vertical'
        ? heldKeys.includes(binding.up) || heldKeys.includes(binding.down)
        : control === 'move'
          ? [binding.up, binding.down, binding.left, binding.right].some(
              (key) => heldKeys.includes(key),
            )
          : heldKeys.includes(code) ||
            (player === 0 &&
              control === 'action' &&
              heldKeys.includes('Space'));
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
      ? [
          s.drillAssistant.activity === 'walk'
            ? 'идёт за приборами'
            : s.drillAssistant.activity === 'pickup'
              ? 'подбирает прибор'
              : s.drillAssistant.activity === 'handoff'
                ? 'подаёт прибор'
                : 'страхует и подаёт',
          'на стульях',
          'подсказывает наклон',
        ][worker]
      : s.phase === 'frame'
        ? [
            'совмещает профиль',
            'поворачивает уголок',
            'направляет и защёлкивает',
          ][worker]
        : s.phase === 'tension'
          ? worker === s.tool.owner
            ? 'с отвёрткой'
            : 'готовит следующий край'
          : s.phase === 'level'
            ? ['левый подвес', 'правый подвес', 'сверяет уровень'][worker]
            : ['левый край', 'правый край', 'направляет экран'][worker];
    const row: WorkerPrompt = { worker, player, role, prompts: [] };
    const cue = (
      control: InputControl,
      text: string,
      mode?: ScreenPrompt['mode'],
      details?: Pick<ScreenPrompt, 'direction' | 'emphasis' | 'satisfied'>,
    ) => row.prompts.push({ control, text, mode, ...details });
    if (player === null) return row;
    const actionHeld =
      s.heldKeys.includes(PLAYER_BINDINGS[player].action) ||
      (player === 0 && s.heldKeys.includes('Space'));
    if (s.phase === 'frame') {
      if (s.frameStage === 'lock')
        cue(
          'action',
          actionHeld ? 'затем щёлкни в зелёном' : 'щёлкнуть в зелёном',
          actionHeld ? 'release' : 'tap',
        );
      else if (worker === 1) {
        if (Math.abs(s.frameTwist) >= 0.1)
          cue('vertical', s.frameTwist < 0 ? 'поверни вверх' : 'поверни вниз');
        else cue('action', 'угол ровно · придержать', 'hold');
      } else if (Math.abs(s.frameFit) >= 0.1)
        cue('horizontal', 'профиль к центру', 'hold', {
          direction: s.frameFit < 0 ? 'right' : 'left',
        });
      else if (worker === 0 && Math.abs(s.frameTwist) >= 0.1)
        cue('vertical', solo ? 'повернуть уголок' : 'помочь Ярику повернуть');
      else if (worker === 0) cue('action', 'вставить в паз', 'tap');
      else cue('action', 'придержать до щелчка', 'hold');
    } else if (s.phase === 'rods') {
      const w = s.workers[worker];
      const moving = Math.abs(w.route - w.targetSide) >= 0.025;
      const next = s.rods.indexOf(Math.min(...s.rods));
      const across = (w.side + 2) % 4;
      const supporting =
        s.rods[w.side] === 1 &&
        s.workers.some(
          (other, p) =>
            p !== worker &&
            p < s.players &&
            other.side === across &&
            other.animation === 'feed',
        );
      if (moving) cue('move', 'к выбранному краю');
      else if (s.rodJam[w.side] > 0)
        cue('action', 'освободить спицу', 'release');
      else if (supporting) cue('action', 'поддержать край напротив', 'hold');
      else if (s.rods[w.side] === 1)
        cue(
          'move',
          `дальше: ${['дальний', 'правый', 'ближний', 'левый'][next]} край`,
        );
      else if (actionHeld) {
        const error = s.rodTarget[w.side] - s.rodAlignment[w.side];
        cue('action', 'вставлять спицу', 'hold');
        if (Math.abs(error) >= 0.15)
          cue('horizontal', 'направь спицу', 'hold', {
            direction: error > 0 ? 'right' : 'left',
            emphasis: s.rodPressure[w.side] > 0.6 ? 'danger' : 'correct',
          });
      } else cue('action', 'вставлять спицу', 'hold');
    } else if (s.phase === 'tension') {
      const t = s.tool,
        w = s.workers[worker];
      const moving = Math.abs(w.route - w.targetSide) >= 0.025;
      const sideName = (side: number) =>
        ['дальний', 'правый', 'ближний', 'левый'][side];
      if (t.status === 'flight') {
        if (t.target === worker) cue('action', 'ЛОВИ!', 'hold');
      } else if (t.status === 'ground') {
        if (w.side !== t.groundSide || moving)
          cue('move', `к отвёртке: ${sideName(t.groundSide)} край`);
        else cue('action', 'подобрать отвёртку', 'tap');
      } else if (t.owner === worker && (t.status === 'charging' || t.needsPass))
        cue(
          'throw',
          t.status === 'charging'
            ? 'отпустить в зелёном'
            : 'передать готовому напарнику',
          t.status === 'charging' ? 'release' : 'hold',
        );
      else if (t.owner === worker) {
        const uneven = s.clips[w.side] > Math.min(...s.clips);
        if (s.spring.active)
          cue('action', 'отпустить в зелёном', 'release', {
            emphasis: uneven ? 'danger' : undefined,
          });
        else if (moving || s.clips[w.side] === 4 || uneven)
          cue(
            'move',
            `к свободному краю: ${sideName(s.recommendedSide)}`,
            undefined,
            {
              emphasis: uneven ? 'danger' : undefined,
            },
          );
        else cue('action', 'натянуть пружину', 'hold');
      } else {
        const opposite = (s.workers[t.owner].targetSide + 2) % 4;
        const next =
          worker === 2
            ? ([0, 1, 2, 3].find(
                (side) =>
                  side !== s.workers[t.owner].targetSide &&
                  side !== s.workers[1].targetSide &&
                  s.clips[side] === Math.min(...s.clips),
              ) ?? opposite)
            : t.needsPass
              ? s.recommendedSide
              : opposite;
        if (moving || w.side !== next)
          cue('move', `готовь ${sideName(next)} край`);
        else cue('action', 'готов принять · держать край', 'hold');
      }
    } else if (drilling) {
      const balance = chairBalanceCue(s);
      const balancePrompt = () =>
        cue(
          'horizontal',
          balance.direction
            ? balance.direction === 'left'
              ? 'вес влево'
              : 'вес вправо'
            : 'держи равновесие',
          balance.direction ? 'hold' : 'release',
          {
            direction: balance.direction ?? undefined,
            emphasis: balance.emphasis,
            satisfied: balance.correcting,
          },
        );
      if (worker === 0 && !solo) {
        const pickup = pickupCandidate(s),
          near = nearChairs(s);
        if (pickup)
          cue(
            'action',
            pickup === 'drill' ? 'подобрать дрель' : 'подобрать пылесос',
            'hold',
          );
        else if (s.drillMode === 'position') {
          if (near) {
            cue('action', 'взяться за стулья', 'hold');
            cue('horizontal', 'с E — передвинуть');
            cue('vertical', 'с E — 2 / 1 стул');
          } else cue('move', 'к стульям');
        } else if (
          s.drillMode !== 'fallen' &&
          s.toolsRemembered &&
          s.drillGear !== 'ready' &&
          s.drillTools.drill.location !== 'assistant' &&
          s.drillTools.vacuum.location !== 'assistant'
        ) {
          cue(
            'move',
            Object.values(s.drillTools).some(
              (tool) => tool.location === 'ground',
            )
              ? 'к упавшему прибору'
              : 'к полке за приборами',
          );
          if (near) cue('action', 'отпусти — можно идти', 'release');
        } else if (near) {
          cue(
            'action',
            s.drillMode === 'handoff' && nextHandoffTool(s)
              ? 'подать прибор'
              : 'держать стулья',
            'hold',
            { satisfied: s.braceHeld },
          );
          balancePrompt();
        } else cue('move', nextHandoffTool(s) ? 'назад к Ярику' : 'к стульям');
      } else if (worker === 1) {
        if (s.drillMode === 'position') {
          if (solo) {
            cue('horizontal', 'стулья к отметке');
            cue('vertical', '2 / 1 стул');
          }
          cue('action', 'забраться', 'hold');
        } else if (s.drillMode === 'fallen') {
          // Actual recovery finishes before a fresh ascent can start.
        } else {
          if (!s.braceHeld) balancePrompt();
          if (s.drillMode === 'climb' || s.drillMode === 'descend')
            cue(
              'action',
              s.drillMode === 'climb' ? 'забираться' : 'спускаться',
              'hold',
            );
          else if (s.drillMode === 'handoff') {
            if (nearChairs(s) && nextHandoffTool(s))
              cue(
                'action',
                nextHandoffTool(s) === 'drill'
                  ? 'принять дрель'
                  : 'принять пылесос',
                'hold',
              );
          } else {
            cue('vertical', 'высота отверстия');
            cue(
              'action',
              s.drillHeat > 0.75 ? 'остудить дрель' : 'сверлить',
              s.drillHeat > 0.75 ? 'release' : 'hold',
            );
            cue('secondary', 'пылесосить', 'hold');
          }
        }
      } else if (
        worker === 2 &&
        s.drillMode !== 'position' &&
        s.drillMode !== 'fallen'
      ) {
        cue(
          'horizontal',
          'подскажи наклон',
          balance.direction ? 'hold' : 'release',
          {
            direction: balance.direction ?? undefined,
            emphasis: balance.emphasis,
            satisfied:
              balance.direction === null ||
              s.heldKeys.includes(PLAYER_BINDINGS[player][balance.direction]),
          },
        );
      }
    } else if (s.phase === 'lift') {
      if (worker < 2) {
        const height = worker === 0 ? s.liftLeft : s.liftRight;
        if (!s.latched[worker] && Math.abs(height - s.holes[worker]) >= 0.12)
          cue(
            'vertical',
            height < s.holes[worker] ? 'подними свой край' : 'опусти свой край',
          );
        else if (worker === 0 && Math.abs(s.liftX) >= 0.16)
          cue('horizontal', 'совмести крючки', 'hold', {
            direction: s.liftX < 0 ? 'right' : 'left',
          });
        else if (!s.latched[worker])
          cue(
            'action',
            Math.abs(s.liftVelocity[worker]) >= 0.2
              ? 'притормози у крючка'
              : 'зацепить край',
            'hold',
          );
      } else if (Math.abs(s.liftX) >= 0.16)
        cue('horizontal', 'направь к крючкам', 'hold', {
          direction: s.liftX < 0 ? 'right' : 'left',
        });
      else cue('action', 'придержать раскачку', 'hold');
    } else if (s.phase === 'level') {
      if (Math.abs(s.angle) >= 0.012)
        cue(
          'horizontal',
          worker === 2 ? 'подскажи поправку' : 'поправь подвес',
          'hold',
          {
            direction: s.angle < 0 ? 'right' : 'left',
          },
        );
      else if (s.levelStable >= 1) {
        cue(
          'action',
          actionHeld ? 'затем проверь уровень' : 'ГОТОВО · проверить',
          actionHeld ? 'release' : 'tap',
        );
      } else cue('horizontal', 'дай пузырьку успокоиться', 'release');
    }
    return row;
  });
}

import { cleanSupportTask } from './support.ts';
import {
  cleanBindings,
  stations,
  type CleanState,
  type Point,
} from './engine.ts';
import {
  gamepadPrompt,
  keyboardPrompt,
  type InputControl,
  type PadFrame,
} from '../input/gamepads.ts';

export type CleanPrompt = {
  control: InputControl;
  text: string;
  mode?: 'hold' | 'tap' | 'release';
};

/** Match work() priority and its exact action radii. A badge offers movement
 * until an ordinary held action can actually reach the target. */
export function cleanPrompts(s: CleanState, actor = 0): CleanPrompt[] {
  const count = s.actorCount;
  if (
    s.paused ||
    ['brief', 'result'].includes(s.phase) ||
    actor < 0 ||
    actor >= count
  )
    return [];
  const distance = (point: Point) =>
    Math.hypot(s.x[actor] - point.x, s.y[actor] - point.y);
  const near = (station: number, radius = 70) =>
    distance(stations[station]) < radius;
  const action = (text: string): CleanPrompt[] => [
    { control: 'action', text, mode: 'hold' },
  ];
  const move = (text: string): CleanPrompt[] => [{ control: 'move', text }];
  const containment = (): CleanPrompt =>
    s.containment.cooldown > 0 || s.containment.stamina <= 1e-8
      ? { control: 'throw', text: 'восстановить силы', mode: 'release' }
      : { control: 'throw', text: 'сдержаться', mode: 'hold' };
  if (actor > 0 && s.phase !== 'clean') {
    const task = cleanSupportTask(s, actor);
    if (!task) return move('всё готово · к прачечной');
    return distance(task.target) < task.radius
      ? action(
          task.progress > 0 && task.id !== 'brace'
            ? `${task.label} · ${Math.round(task.progress * 100)}%`
            : task.label,
        )
      : move(task.destination);
  }
  if (s.phase === 'clean') {
    if (near(4) && s.valve < 1) return action('перекрыть воду');
    if (near(3) && s.spin < 1) return action('придержать стиралку');
    if (near(5) && s.dirt[actor] > 0.001) return action('прополоскать швабру');
    if (s.dirt[actor] >= 0.98 - 1e-8) return move('к ведру · швабра грязная');
    if (near(3) && s.spin >= 1 && s.machineClean < 1)
      return action('драить стиралку');
    const pending = s.spots.filter((spot) => spot.progress < 1);
    if (pending.some((spot) => distance(spot) < 57))
      return action('отмывать следы');
    if (s.valve < 1) return move('к вентилю · перекрыть воду');
    if (s.spin < 1) return move('к стиралке · придержать корпус');
    if (s.machineClean < 1) return move('к стиралке · отмыть корпус');
    return pending.length ? move('к грязным следам') : [];
  }
  if (s.phase === 'duty') return move('обойти пост');
  if (s.phase === 'find')
    return near(0)
      ? [{ control: 'action', text: 'спросить дневального', mode: 'tap' }]
      : [
          ...move('к дневальному'),
          {
            control: s.rhythm.expected === 'KeyQ' ? 'throw' : 'action',
            text: 'в такт',
            mode: 'tap',
          },
        ];
  if (s.phase === 'accident') return [containment()];
  if (s.phase === 'toilet')
    return near(1, 62)
      ? action('наконец-то туалет')
      : [...move('к туалету'), containment()];
  if (s.phase === 'shower')
    return near(2, 62) ? action('принять душ') : move('к душевой');
  if (s.phase === 'laundry')
    return near(3) ? action('загрузить штаны') : move('к стиралке');
  if (s.phase === 'spin' || s.phase === 'response')
    return s.spin < 1
      ? near(3)
        ? action('придержать стиралку')
        : move('к стиралке · придержать корпус')
      : [];
  return [];
}

/** Read the merged keyboard/touch/gamepad keys passed to cleanTick, never an
 * activity animation: walking and clenching can both be real held inputs. */
export function cleanPromptInput(
  pads: Pick<PadFrame, 'assignments'>,
  actor: number,
  prompt: CleanPrompt,
  heldKeys: ReadonlySet<string>,
) {
  const binding = cleanBindings[actor];
  if (!binding) return { label: '', held: false };
  const [left, right, up, down, action] = binding;
  const horizontal = Number(heldKeys.has(right)) - Number(heldKeys.has(left));
  const vertical = Number(heldKeys.has(down)) - Number(heldKeys.has(up));
  const held =
    prompt.control === 'move'
      ? horizontal !== 0 || vertical !== 0
      : prompt.control === 'horizontal'
        ? horizontal !== 0
        : prompt.control === 'vertical'
          ? vertical !== 0
          : prompt.control === 'throw'
            ? actor === 0 && heldKeys.has('KeyQ')
            : prompt.control === 'action'
              ? heldKeys.has(action) || (actor === 0 && heldKeys.has('Space'))
              : false;
  return {
    label:
      gamepadPrompt(pads, actor, prompt.control) ||
      keyboardPrompt(actor, prompt.control),
    held,
  };
}

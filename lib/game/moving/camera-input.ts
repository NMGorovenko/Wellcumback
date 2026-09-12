import { PLAYER_BINDINGS } from '../input/bindings.ts';
import { movingCameraSide } from './camera.ts';

const fromPositiveX = new Map<string, string>(
  PLAYER_BINDINGS.flatMap((binding) => [
    [binding.up, binding.left],
    [binding.right, binding.up],
    [binding.down, binding.right],
    [binding.left, binding.down],
  ]),
);

/** Rotate canonical movement commands immediately before movingTick, after
 * keyboard preferences, touch and gamepads have been merged. Menus and action
 * buttons keep their existing meaning; the source-owned Set is never mutated. */
export function mapMovingCameraKeys(
  keys: ReadonlySet<string>,
  aspect: number,
): Set<string> {
  if (movingCameraSide(aspect) === 'z') return new Set(keys);
  return new Set(Array.from(keys, (key) => fromPositiveX.get(key) ?? key));
}

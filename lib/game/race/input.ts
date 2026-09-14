import { PLAYER_BINDINGS } from '../input/bindings.ts';
import { boundedAxis, type DriveAxes } from '../input/drive.ts';
import type { RaceInput } from './types.ts';
export function localRaceInputs(
  keys: ReadonlySet<string>,
  drives: readonly DriveAxes[] = [],
  count = 1,
): RaceInput[] {
  return PLAYER_BINDINGS.slice(
    0,
    Math.min(3, Math.max(0, Math.floor(count) || 0)),
  ).map((b, i) => ({
    throttle:
      keys.has(b.up) || keys.has(b.down)
        ? Number(keys.has(b.up)) - Number(keys.has(b.down))
        : boundedAxis(drives[i]?.throttle ?? 0),
    steer:
      keys.has(b.left) || keys.has(b.right)
        ? Number(keys.has(b.right)) - Number(keys.has(b.left))
        : boundedAxis(drives[i]?.steer ?? 0),
    handbrake: keys.has(b.secondary),
    reset: keys.has(b.action),
  }));
}

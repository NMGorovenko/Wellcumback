import { CONTROLS } from '../lib/game/screen/engine.ts';
import {
  LEVEL_APPROACH,
  levelCheck,
  levelChairGrip,
  LEVEL_CHAIR_TARGET,
  levelChairsCentered,
} from '../lib/game/screen/level-check.ts';
/** A real keyboard walkthrough: walk to the shelf and chair, move the furniture,
 * climb, place the tool, then measure. Never assign phase/progress to skip a beat. */
export function levelKeys(s) {
  const c = levelCheck(s),
    p = s.players === 1 ? 0 : 1,
    binding = CONTROLS[p];
  const keys = new Set();
  const walk = (x, z) => {
    if (x - c.x > 0.035) keys.add(binding.right);
    if (x - c.x < -0.035) keys.add(binding.left);
    if (z - c.z > 0.035) keys.add(binding.down);
    if (z - c.z < -0.035) keys.add(binding.up);
  };
  const press = () => {
    if (!s.simulation.previousActions[p]) keys.add(binding.action);
  };
  if (c.mode === 'fetch') {
    walk(LEVEL_APPROACH.x, LEVEL_APPROACH.z);
    if (!keys.size) keys.add(binding.action);
  } else if (c.mode === 'chairs') {
    const grip = levelChairGrip(c);
    walk(grip.x, grip.z);
    if (!keys.size) press();
  } else if (c.mode === 'position') {
    if (levelChairsCentered(c)) press();
    else
      walk(
        c.x + LEVEL_CHAIR_TARGET.x - c.chairX,
        c.z + LEVEL_CHAIR_TARGET.z - c.chairZ,
      );
  } else if (['pickup', 'climb', 'place'].includes(c.mode))
    keys.add(binding.action);
  else if (c.mode === 'settle') {
    if (s.angle > 0.005) keys.add(binding.left);
    else if (s.angle < -0.005) keys.add(binding.right);
    else if (s.levelStable >= 1) press();
  }
  return keys;
}

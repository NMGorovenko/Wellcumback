import type { TimingCue } from '../input/timing-cue.ts';
import { springWindow, throwTargetPower, type GameState } from './engine.ts';

export function screenTimingCue(
  s: GameState,
  worker: number,
): TimingCue | null {
  if (s.paused || worker < 0 || worker >= s.players) return null;
  if (s.phase === 'frame' && s.frameStage === 'lock') {
    const tolerance = 0.075 + s.frameBrace * 0.08;
    return {
      control: 'action',
      mode: 'tap',
      value: s.cursor,
      inclusive: false,
      target: [0.5 - tolerance, 0.5 + tolerance],
    };
  }
  if (s.phase !== 'tension' || s.tool.owner !== worker) return null;
  if (s.tool.status === 'charging') {
    const target = throwTargetPower(s);
    return {
      control: 'throw',
      mode: 'release',
      value: s.tool.charge,
      inclusive: false,
      target: [target - 0.105, target + 0.105],
    };
  }
  if (s.spring.active && s.spring.worker === worker)
    return {
      control: 'action',
      mode: 'release',
      value: s.spring.power,
      target: springWindow(s),
    };
  return null;
}

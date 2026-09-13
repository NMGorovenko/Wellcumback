import type { TimingCue } from '../input/timing-cue.ts';
import { stations, type CleanState } from './engine.ts';

export function cleanTimingCue(s: CleanState, actor: number): TimingCue | null {
  if (s.paused || s.phase !== 'find' || !s.rhythm.active || actor !== 0)
    return null;
  // At the post E asks permission; do not compete with that interaction.
  if (Math.hypot(s.x[0] - stations[0].x, s.y[0] - stations[0].y) < 70)
    return null;
  const r = s.rhythm;
  const interval = r.period + r.window + 0.08;
  return {
    control: r.expected === 'KeyQ' ? 'throw' : 'action',
    mode: 'tap',
    value: r.clock / interval,
    target: [
      (r.period - r.window) / interval,
      (r.period + r.window) / interval,
    ],
    feedback: r.feedback,
  };
}

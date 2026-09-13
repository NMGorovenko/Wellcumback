import type { InputControl } from './gamepads.ts';

export type TimingCue = {
  control: InputControl;
  mode: 'tap' | 'release';
  value: number;
  target: [number, number];
  inclusive?: boolean;
  feedback?: 'waiting' | 'good' | 'early' | 'late' | 'wrong';
};

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** One turn equals the actual input interval, not a separate UI animation. */
export function timingDial(cue: TimingCue) {
  const value = clamp(cue.value);
  const start = clamp(cue.target[0]);
  const end = Math.max(start, clamp(cue.target[1]));
  return {
    angle: value * 360,
    start: start * 100,
    length: (end - start) * 100,
    ready:
      cue.inclusive === false
        ? cue.value > cue.target[0] && cue.value < cue.target[1]
        : cue.value >= cue.target[0] && cue.value <= cue.target[1],
  };
}

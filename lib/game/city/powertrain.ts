/** Arcade six-speed automatic. Shared by authoritative motion and engine sound. */
export type PowertrainState = {
  rpm: number;
  gear: number;
  load: number;
  time: number;
  shiftStartedAt: number;
  shiftUntil: number;
  shiftFromRpm: number;
  shiftToRpm: number;
  shiftReadyAt: number;
};
export const CITY_TOP_SPEED = 32;
export const AUTOMATIC_RATIOS = [4.15, 2.7, 1.88, 1.36, 1.01, 0.74] as const;
export const SHIFT_DURATION = 0.24;
export const freshPowertrain = (): PowertrainState => ({
  rpm: 780,
  gear: 1,
  load: 0,
  time: 0,
  shiftStartedAt: 0,
  shiftUntil: 0,
  shiftFromRpm: 780,
  shiftToRpm: 780,
  shiftReadyAt: 0,
});
const clamp = (v: number, low: number, high: number) =>
  Math.max(low, Math.min(high, Number.isFinite(v) ? v : low));
function shift(s: PowertrainState, nextGear: number) {
  s.shiftFromRpm = s.rpm;
  s.shiftToRpm = clamp(
    (s.rpm * AUTOMATIC_RATIOS[nextGear - 1]) / AUTOMATIC_RATIOS[s.gear - 1],
    1100,
    5400,
  );
  s.shiftStartedAt = s.time;
  s.shiftUntil = s.time + SHIFT_DURATION;
  s.shiftReadyAt = s.shiftUntil + 0.18;
  s.gear = nextGear;
}
export function advancePowertrain(
  s: PowertrainState,
  forward: number,
  throttle: number,
  delta: number,
) {
  const dt = clamp(delta, 0, 0.1);
  const speed = clamp(Math.abs(forward), 0, CITY_TOP_SPEED);
  const reversing = forward < -0.2;
  const pedal = clamp(reversing ? -throttle : throttle, 0, 1);
  s.time += dt;
  let target = 780 + speed * AUTOMATIC_RATIOS[s.gear - 1] * 165 + pedal * 220;
  if (reversing || (speed < 0.35 && pedal < 0.05)) {
    s.gear = 1;
    s.shiftUntil = 0;
    target = 780 + speed * (reversing ? 400 : 165) + pedal * 220;
  } else if (s.time >= s.shiftReadyAt) {
    const shiftPoint = 2900 + pedal * 2100;
    if (
      target > shiftPoint &&
      s.rpm > shiftPoint - 120 &&
      s.gear < AUTOMATIC_RATIOS.length &&
      speed > 2
    ) {
      shift(s, s.gear + 1);
    } else if (target < 1550 && s.gear > 1) {
      shift(s, s.gear - 1);
    }
  }
  target = clamp(target, 740, 5700);
  if (s.time < s.shiftUntil) {
    const progress = clamp((s.time - s.shiftStartedAt) / SHIFT_DURATION, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    s.rpm = s.shiftFromRpm + (s.shiftToRpm - s.shiftFromRpm) * eased;
  } else {
    const change = (target - s.rpm) * (1 - Math.exp(-dt * 13));
    s.rpm += clamp(change, -7500 * dt, 12500 * dt);
  }
  const load = s.time < s.shiftUntil ? 0.025 : pedal;
  s.load += (load - s.load) * (1 - Math.exp(-dt * (load < s.load ? 32 : 11)));
  return s;
}

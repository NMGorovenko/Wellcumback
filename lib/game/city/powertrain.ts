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
/** Deliberate arcade limit, in metres per second (300 km/h on the HUD). */
export const CITY_TOP_SPEED = 300 / 3.6;
export const AUTOMATIC_RATIOS = [4.15, 2.7, 1.65, 1.16, 0.86, 0.62] as const;
export const SHIFT_DURATION = 0.2;
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
export type TransmissionTuning = {
  ratios: readonly number[];
  idle: number;
  maxRpm: number;
  rpmPerSpeed: number;
  shiftRpm: number;
  duration: number;
  maxSpeed: number;
  downshiftRpm?: number;
};
const STANDARD: TransmissionTuning = {
  ratios: AUTOMATIC_RATIOS,
  idle: 780,
  maxRpm: 5700,
  // Spread six gears across the larger road-speed range without
  // raising the V8's pitch, idle or redline.
  rpmPerSpeed: 65,
  shiftRpm: 5000,
  duration: SHIFT_DURATION,
  maxSpeed: CITY_TOP_SPEED,
};
function shift(
  s: PowertrainState,
  nextGear: number,
  tuning: TransmissionTuning,
) {
  s.shiftFromRpm = s.rpm;
  s.shiftToRpm = clamp(
    (s.rpm * tuning.ratios[nextGear - 1]) / tuning.ratios[s.gear - 1],
    Math.max(1100, tuning.idle),
    tuning.maxRpm - 300,
  );
  s.shiftStartedAt = s.time;
  s.shiftUntil = s.time + tuning.duration;
  s.shiftReadyAt = s.shiftUntil + 0.12;
  s.gear = nextGear;
}
export function advancePowertrain(
  s: PowertrainState,
  forward: number,
  throttle: number,
  delta: number,
  tuning: TransmissionTuning = STANDARD,
) {
  const dt = clamp(delta, 0, 0.1);
  const speed = clamp(Math.abs(forward), 0, tuning.maxSpeed);
  const reversing = forward < -0.2;
  const pedal = clamp(reversing ? -throttle : throttle, 0, 1);
  s.time += dt;
  let target =
    tuning.idle +
    speed * tuning.ratios[s.gear - 1] * tuning.rpmPerSpeed +
    pedal * 220;
  if (reversing || (speed < 0.35 && pedal < 0.05)) {
    s.gear = 1;
    s.shiftUntil = 0;
    target = tuning.idle + speed * (reversing ? 400 : 165) + pedal * 220;
  } else if (s.time >= s.shiftReadyAt) {
    const shiftPoint = tuning.shiftRpm * 0.58 + pedal * tuning.shiftRpm * 0.42;
    if (
      target > shiftPoint &&
      s.rpm > shiftPoint - 120 &&
      s.gear < tuning.ratios.length &&
      speed > 2
    ) {
      shift(s, s.gear + 1, tuning);
    } else if (target < (tuning.downshiftRpm ?? 1550) && s.gear > 1) {
      shift(s, s.gear - 1, tuning);
    }
  }
  target = clamp(target, tuning.idle - 40, tuning.maxRpm);
  if (s.time < s.shiftUntil) {
    const progress = clamp((s.time - s.shiftStartedAt) / tuning.duration, 0, 1);
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

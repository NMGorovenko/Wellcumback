/** Sound-only gearbox: never changes vehicle physics or network authority. */
export type V8Input = {
  speed: number;
  throttle: number;
  forward: number;
  lateral: number;
  horn: boolean;
};
export type V8State = {
  rpm: number;
  gear: number;
  load: number;
  time: number;
  shiftStartedAt: number;
  shiftUntil: number;
  shiftFromRpm: number;
  shiftToRpm: number;
  shiftReadyAt: number;
  crackleReadyAt: number;
  previousThrottle: number;
  skid: number;
  crackle: boolean;
  horn: boolean;
};
export const freshV8 = (): V8State => ({
  rpm: 780,
  gear: 1,
  load: 0,
  time: 0,
  shiftStartedAt: 0,
  shiftUntil: 0,
  shiftFromRpm: 780,
  shiftToRpm: 780,
  shiftReadyAt: 0,
  crackleReadyAt: 0,
  previousThrottle: 0,
  skid: 0,
  crackle: false,
  horn: false,
});
const clamp = (v: number, low: number, high: number) =>
  Math.max(low, Math.min(high, Number.isFinite(v) ? v : low));
// Geared for the city's actual 18 m/s speed limit. Top gear must cruise below
// the shift point, even while the player keeps the accelerator fully pressed.
const ratios = [720, 430, 260, 135];
const SHIFT_DURATION = 0.3;
function shift(s: V8State, nextGear: number) {
  s.shiftFromRpm = s.rpm;
  s.shiftToRpm = clamp(
    (s.rpm * ratios[nextGear - 1]) / ratios[s.gear - 1],
    1100,
    3900,
  );
  s.shiftStartedAt = s.time;
  s.shiftUntil = s.time + SHIFT_DURATION;
  s.shiftReadyAt = s.shiftUntil + 0.45;
  s.gear = nextGear;
}
export function advanceV8(s: V8State, input: V8Input, delta: number) {
  const dt = clamp(delta, 0, 0.1);
  const speed = clamp(input.speed, 0, 30);
  const throttle = clamp(input.throttle, -1, 1);
  const reversing = input.forward < -0.2;
  const pedal = reversing ? Math.max(0, -throttle) : Math.max(0, throttle);
  s.time += dt;
  let target = 780 + speed * ratios[s.gear - 1] + pedal * 180;
  if (reversing) {
    s.gear = 1;
    s.shiftUntil = 0;
    target = 780 + speed * 320 + pedal * 180;
  } else if (s.time >= s.shiftReadyAt) {
    const shiftPoint = 2700 + pedal * 1100;
    if (
      target > shiftPoint &&
      s.rpm > shiftPoint - 100 &&
      s.gear < ratios.length &&
      speed > 3
    ) {
      shift(s, s.gear + 1);
    } else if (target < 1550 && s.gear > 1) {
      shift(s, s.gear - 1);
    }
  }
  target = clamp(target, 720, 4400);
  s.crackle =
    s.previousThrottle > 0.55 &&
    pedal < 0.15 &&
    s.rpm > 2800 &&
    s.time >= s.crackleReadyAt;
  if (s.crackle) s.crackleReadyAt = s.time + 1;
  s.previousThrottle = pedal;
  if (s.time < s.shiftUntil) {
    // A complete, audible change of pitch: fast vehicle acceleration cannot
    // overwrite the RPM drop on the frame after an upshift.
    const progress = clamp((s.time - s.shiftStartedAt) / SHIFT_DURATION, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    s.rpm = s.shiftFromRpm + (s.shiftToRpm - s.shiftFromRpm) * eased;
  } else {
    const change = (target - s.rpm) * (1 - Math.exp(-dt * 7));
    s.rpm += clamp(change, -3200 * dt, 4200 * dt);
  }
  const load = s.time < s.shiftUntil ? 0.03 : pedal;
  s.load += (load - s.load) * (1 - Math.exp(-dt * (load < s.load ? 24 : 8)));
  s.skid =
    clamp((Math.abs(input.lateral) - 0.8) / 5, 0, 1) * clamp(speed / 4, 0, 1);
  s.horn = input.horn;
  return s;
}

/** Fourier coefficients for uneven exhaust pulses from one bank of a cross-plane V8. */
export function exhaustWave(bank: 0 | 1, harmonics = 64) {
  const pulses = bank === 0 ? [0, 2, 5, 7] : [1, 3, 4, 6];
  const weights = bank === 0 ? [1, 0.72, 1.22, 0.86] : [0.88, 1.18, 0.74, 1.05];
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let k = 1; k <= harmonics; k++) {
    const envelope = Math.exp(-k * 0.1) / 4;
    for (let i = 0; i < pulses.length; i++) {
      const fire = pulses[i];
      const phase = (2 * Math.PI * k * fire) / 8;
      real[k] += Math.cos(phase) * envelope * weights[i];
      imag[k] -= Math.sin(phase) * envelope * weights[i];
    }
  }
  return { real, imag };
}

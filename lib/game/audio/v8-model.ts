import {
  advancePowertrain,
  freshPowertrain,
  type PowertrainState,
} from '../city/powertrain.ts';
export type V8Input = {
  speed: number;
  throttle: number;
  forward: number;
  lateral: number;
  horn: boolean;
  powertrain?: PowertrainState;
};
export type V8State = PowertrainState & {
  crackleReadyAt: number;
  previousThrottle: number;
  skid: number;
  crackle: boolean;
  horn: boolean;
};
export const freshV8 = (): V8State => ({
  ...freshPowertrain(),
  crackleReadyAt: 0,
  previousThrottle: 0,
  skid: 0,
  crackle: false,
  horn: false,
});
const clamp = (v: number, low: number, high: number) =>
  Math.max(low, Math.min(high, Number.isFinite(v) ? v : low));
export function advanceV8(s: V8State, input: V8Input, delta: number) {
  // Remote clients hear the creator's actual gear, including after reconnect.
  if (input.powertrain) {
    // A restart or restored world has its own clock. Audio-only cooldowns and
    // pedal edges from the previous run must not leak into that new timeline.
    if (input.powertrain.time < s.time) {
      s.crackleReadyAt = 0;
      s.previousThrottle = 0;
    }
    Object.assign(s, input.powertrain);
  } else advancePowertrain(s, input.forward, input.throttle, delta);
  const pedal = clamp(
    input.forward < -0.2 ? -input.throttle : input.throttle,
    0,
    1,
  );
  s.crackle =
    s.previousThrottle > 0.55 &&
    pedal < 0.15 &&
    s.rpm > 2800 &&
    s.time >= s.crackleReadyAt;
  if (s.crackle) s.crackleReadyAt = s.time + 1;
  s.previousThrottle = pedal;
  s.skid =
    clamp((Math.abs(input.lateral) - 0.8) / 5, 0, 1) *
    clamp(input.speed / 4, 0, 1);
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

/** A bank of combustion puffs with cycle variation, rather than a perfectly
 * periodic sawtooth. Fixed seeded variation is shared by realtime/offline audio. */
export const EXHAUST_REFERENCE_RPM = 1500;
export function exhaustPuffs(bank: 0 | 1, sampleRate: number) {
  const cycleLength = 120 / EXHAUST_REFERENCE_RPM;
  const cycles = 24;
  const samples = new Float32Array(
    Math.round(cycleLength * cycles * sampleRate),
  );
  const pulses = bank === 0 ? [0, 2, 5, 7] : [1, 3, 4, 6];
  const weights = bank === 0 ? [1, 0.72, 1.22, 0.86] : [0.88, 1.18, 0.74, 1.05];
  let seed = 8191 + bank * 3571;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 2147483648 - 1;
  };
  for (let cycle = 0; cycle < cycles; cycle++) {
    const breath = 1 + random() * 0.22;
    for (let fire = 0; fire < pulses.length; fire++) {
      const start = Math.round(
        (cycle + pulses[fire] / 8 + random() * 0.008) *
          cycleLength *
          sampleRate,
      );
      const strength = weights[fire] * breath * (1 + random() * 0.15);
      let air = 0;
      for (let n = 0; n < sampleRate * 0.05; n++) {
        const t = n / sampleRate;
        air += (random() - air) * Math.min(1, 1800 / sampleRate);
        const body =
          Math.sin(2 * Math.PI * (94 + bank * 17) * t) * Math.exp(-t * 85);
        const rasp =
          Math.sin(2 * Math.PI * (213 + bank * 29) * t) * Math.exp(-t * 170);
        const puff = (body * 0.6 + rasp * 0.2 + air * 0.8) * strength;
        const index =
          (((start + n) % samples.length) + samples.length) % samples.length;
        samples[index] += puff;
      }
    }
  }
  const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length;
  for (let i = 0; i < samples.length; i++) samples[i] -= mean;
  return samples;
}

import {
  exhaustWave,
  exhaustPuffs,
  EXHAUST_REFERENCE_RPM,
  type V8State,
} from './v8-model.ts';

/** Persistent native Web Audio graph. No oscillators/buffers are created per frame. */
export function createCityFoley(
  context: BaseAudioContext,
  voice: 'v8' | 'v6' = 'v8',
  mix = 1,
) {
  const nodes: AudioNode[] = [];
  const sources: AudioScheduledSourceNode[] = [];
  const own = <T extends AudioNode>(node: T): T => {
    nodes.push(node);
    return node;
  };
  const master = own(context.createGain());
  master.gain.value = 0;
  master.connect(context.destination);
  const compressor = own(context.createDynamicsCompressor());
  compressor.threshold.value = -17;
  compressor.knee.value = 18;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.17;
  compressor.connect(master);
  const saturate = own(context.createWaveShaper());
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++)
    curve[i] =
      Math.tanh(1.15 * ((2 * i) / (curve.length - 1) - 1)) / Math.tanh(1.15);
  saturate.curve = curve;
  saturate.oversample = '2x';
  const dc = own(context.createBiquadFilter());
  dc.type = 'highpass';
  dc.frequency.value = 35;
  const exhaustTone = own(context.createBiquadFilter());
  exhaustTone.type = 'lowpass';
  exhaustTone.frequency.value = 1150;
  exhaustTone.Q.value = 0.5;
  // Roll off distortion harmonics too; filtering only before saturation left
  // a sharp whine at high RPM.
  saturate.connect(dc).connect(exhaustTone).connect(compressor);
  const noiseBuffer = context.createBuffer(
    1,
    context.sampleRate * 2,
    context.sampleRate,
  );
  const data = noiseBuffer.getChannelData(0);
  let seed = 613;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    data[i] = (seed >>> 0) / 2147483648 - 1;
  }
  const noise = own(context.createBufferSource());
  noise.buffer = noiseBuffer;
  noise.loop = true;
  sources.push(noise);
  const noiseLayer = (frequency: number, q: number) => {
    const filter = own(context.createBiquadFilter());
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = own(context.createGain());
    gain.gain.value = 0;
    noise.connect(filter).connect(gain).connect(saturate);
    return { gain, filter };
  };
  const intake = noiseLayer(640, 0.55),
    tyres = noiseLayer(1100, 0.7),
    pop = noiseLayer(360, 0.6);
  const banks = ([0, 1] as const).map((bank) => {
    const oscillator = own(context.createOscillator());
    const wave = exhaustWave(bank, 64, voice);
    oscillator.setPeriodicWave(
      context.createPeriodicWave(wave.real, wave.imag),
    );
    oscillator.frequency.value = 780 / 120;
    const filter = own(context.createBiquadFilter());
    filter.type = 'lowpass';
    filter.Q.value = 0.55;
    filter.frequency.value = bank ? 580 : 490;
    const gain = own(context.createGain());
    gain.gain.value = 0.23;
    oscillator.connect(filter).connect(gain).connect(saturate);
    sources.push(oscillator);
    return { oscillator, gain, filter };
  });
  // Retain the original, liked idle exactly. Loaded combustion adds individual
  // rough puffs; their long loop avoids a turbine-like repeating oscillator.
  const loadedBanks = ([0, 1] as const).map((bank) => {
    const samples = exhaustPuffs(bank, context.sampleRate, voice);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.getChannelData(0).set(samples);
    const source = own(context.createBufferSource());
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = 780 / EXHAUST_REFERENCE_RPM;
    const gain = own(context.createGain());
    gain.gain.value = 0;
    const filter = own(context.createBiquadFilter());
    filter.type = 'lowpass';
    filter.frequency.value = 850;
    filter.Q.value = 0.45;
    source.connect(filter).connect(gain).connect(saturate);
    sources.push(source);
    return { source, gain, filter };
  });
  const horn = own(context.createGain());
  horn.gain.value = 0;
  horn.connect(compressor);
  for (const frequency of [392, 493.88]) {
    const oscillator = own(context.createOscillator());
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency;
    oscillator.connect(horn);
    sources.push(oscillator);
  }
  const startedAt = context.currentTime;
  sources.forEach((source) => source.start(startedAt));
  let disposed = false;
  const target = (
    param: AudioParam,
    value: number,
    now: number,
    lag = 0.035,
  ) => {
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, lag);
  };
  return {
    update(state: V8State, audible: boolean, atTime = context.currentTime) {
      if (disposed) return;
      const now = atTime;
      target(
        master.gain,
        audible ? (voice === 'v6' ? 0.12 : 0.16) * mix : 0,
        now,
        0.025,
      );
      const wobble =
        (Math.sin(state.time * 43) * 0.013 +
          Math.sin(state.time * 71) * 0.006) *
        (1 - state.load * 0.8);
      const power = Math.min(1, Math.max(0, (state.rpm - 1100) / 1700));
      const combustion = power * state.load;
      const rpm = voice === 'v6' ? Math.min(11000, state.rpm) : state.rpm;
      for (let i = 0; i < banks.length; i++) {
        target(
          banks[i].oscillator.frequency,
          (rpm / 120) * (1 + wobble),
          now,
          0.025,
        );
        target(
          banks[i].filter.frequency,
          490 + i * 90 + state.load * 400 + state.rpm * 0.028,
          now,
        );
        // Keep a low bank fundamental below the added exhaust attack.
        target(
          banks[i].gain.gain,
          0.2 + state.load * 0.12 - combustion * 0.22,
          now,
        );
        target(
          loadedBanks[i].source.playbackRate,
          rpm / EXHAUST_REFERENCE_RPM,
          now,
          0.018,
        );
        target(
          loadedBanks[i].gain.gain,
          combustion * (i ? 0.26 : 0.48),
          now,
          0.018,
        );
        target(
          loadedBanks[i].filter.frequency,
          (voice === 'v6' ? 980 : 640) + state.load * 230,
          now,
        );
      }
      target(intake.gain.gain, 0.005 + state.load * 0.009, now);
      target(tyres.gain.gain, state.skid * 0.1, now);
      target(horn.gain, audible && state.horn ? 0.12 : 0, now, 0.015);
      if (audible && state.crackle) {
        pop.gain.gain.cancelScheduledValues(now);
        pop.gain.gain.setValueAtTime(0, now);
        pop.gain.gain.linearRampToValueAtTime(0.22, now + 0.009);
        pop.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        pop.gain.gain.setValueAtTime(0, now + 0.14);
      }
    },
    silence(atTime = context.currentTime) {
      if (disposed) return;
      target(master.gain, 0, atTime, 0.012);
      target(horn.gain, 0, atTime, 0.008);
      target(pop.gain.gain, 0, atTime, 0.008);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.value = 0;
      sources.forEach((source) => {
        try {
          source.stop();
        } catch {
          /* Already stopped. */
        }
      });
      nodes.forEach((node) => node.disconnect());
    },
  };
}

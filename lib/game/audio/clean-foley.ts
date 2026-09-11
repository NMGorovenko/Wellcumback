import type { CleanState } from '../clean/engine';

/** Original procedural effects. No downloaded audio or network speech service. */
export class CleanFoley {
  readonly context: AudioContext;
  private master: GainNode;
  private noise: AudioBuffer;
  private washer: OscillatorNode;
  private washerGain: GainNode;
  private last = {
    phase: 'brief',
    activity: 'idle',
    trace: 0,
    hits: 0,
    x: 135,
    y: 355,
    step: 0,
    wet: 0,
    scrub: 0,
  };
  private sources = new Set<AudioScheduledSourceNode>();
  constructor() {
    const ctx = (this.context = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = 0.65;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 5;
    this.master.connect(compressor).connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 19351;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
    this.washer = ctx.createOscillator();
    this.washer.type = 'sawtooth';
    this.washer.frequency.value = 48;
    this.washerGain = ctx.createGain();
    this.washerGain.gain.value = 0;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 180;
    this.washer.connect(low).connect(this.washerGain).connect(this.master);
    this.washer.start();
  }
  async unlock() {
    if (this.context.state === 'suspended') await this.context.resume();
  }
  private tone(
    start: number,
    end: number,
    duration: number,
    volume = 0.08,
    type: OscillatorType = 'sine',
    delay = 0,
  ) {
    const ctx = this.context,
      t = ctx.currentTime + delay,
      osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(start, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(15, end), t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.master);
    this.sources.add(osc);
    osc.onended = () => {
      this.sources.delete(osc);
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(t);
    osc.stop(t + duration + 0.03);
  }
  private hiss(duration: number, frequency: number, volume: number, delay = 0) {
    const ctx = this.context,
      t = ctx.currentTime + delay,
      src = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    src.buffer = this.noise;
    src.loop = true;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(frequency, t);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(80, frequency * 0.35),
      t + duration,
    );
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(this.master);
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    src.start(t);
    src.stop(t + duration + 0.03);
  }
  private squelch(strength = 1) {
    this.hiss(0.28, 420, 0.2 * strength);
    this.tone(145, 37, 0.3, 0.075 * strength, 'sawtooth');
    this.tone(78, 120, 0.11, 0.055 * strength, 'sine', 0.11);
  }
  update(s: CleanState, enabled: boolean) {
    const ctx = this.context,
      a = this.last,
      running =
        enabled && !s.paused && s.phase !== 'brief' && s.phase !== 'result';
    this.master.gain.setTargetAtTime(
      enabled && !s.paused ? 0.65 : 0,
      ctx.currentTime,
      0.04,
    );
    const machine = running && s.pantsLoaded && s.spin < 1;
    this.washerGain.gain.setTargetAtTime(
      machine ? 0.023 + s.balance * 0.018 : 0,
      ctx.currentTime,
      0.1,
    );
    this.washer.frequency.setTargetAtTime(
      42 + s.spin * 28 + Math.sin(s.machine * 4) * s.balance * 9,
      ctx.currentTime,
      0.08,
    );
    if (ctx.state !== 'running' || !enabled || s.paused) {
      a.phase = s.phase;
      a.activity = s.activity[0];
      a.trace = s.spots.length;
      a.hits = s.rhythm.hits;
      return;
    }
    if (s.phase !== a.phase) {
      if (s.phase === 'accident') {
        this.squelch(1.3);
        this.squelch(0.7);
      }
      if (s.phase === 'shower') {
        this.hiss(1.6, 1600, 0.3);
        this.tone(130, 50, 1.2, 0.055);
      }
      if (s.phase === 'spin') {
        this.tone(700, 1050, 0.08, 0.06);
        this.tone(920, 920, 0.1, 0.06, 'sine', 0.15);
        this.hiss(0.2, 190, 0.22);
      }
      if (s.phase === 'clean') {
        this.hiss(0.25, 1200, 0.12);
        this.tone(380, 510, 0.13, 0.04);
      }
      if (s.phase === 'result') {
        [440, 554, 659].forEach((note, i) =>
          this.tone(note, note, 0.6, 0.05, 'sine', i * 0.12),
        );
      }
      a.phase = s.phase;
    }
    if (s.rhythm.hits > a.hits) {
      this.tone(s.rhythm.expected === 'KeyE' ? 350 : 440, 260, 0.07, 0.045);
      a.hits = s.rhythm.hits;
    }
    if (s.spots.length > a.trace) {
      if (s.spillActive) this.squelch(0.55);
      else if (machine) this.hiss(0.4, 700, 0.13);
      a.trace = s.spots.length;
    }
    if (running) {
      const moved = Math.hypot(s.x[0] - a.x, s.y[0] - a.y);
      if (moved > 2 && s.elapsed - a.step > 0.33) {
        this.hiss(0.055, s.soiled ? 440 : 180, 0.13);
        if (s.soiled) this.tone(105, 55, 0.1, 0.03);
        a.step = s.elapsed;
      }
      if (s.spillActive && s.elapsed - a.wet > 1.45) {
        this.squelch(0.4);
        a.wet = s.elapsed;
      }
      if (s.activity[0] === 'shower' && s.elapsed - a.scrub > 0.55) {
        this.hiss(0.65, 2900, 0.1);
        a.scrub = s.elapsed;
      }
      if (
        (s.activity.includes('mop') || s.activity.includes('rinse')) &&
        s.elapsed - a.scrub > 0.52
      ) {
        this.hiss(0.38, s.activity.includes('rinse') ? 1200 : 780, 0.12);
        a.scrub = s.elapsed;
      }
      if (s.activity[0] === 'relief' && a.activity !== 'relief') {
        this.tone(85, 34, 0.7, 0.065, 'triangle');
        this.hiss(0.3, 450, 0.13);
      }
    }
    a.x = s.x[0];
    a.y = s.y[0];
    a.activity = s.activity[0];
  }
  dispose() {
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
    this.sources.clear();
    this.washer.stop();
    this.washer.disconnect();
    this.master.disconnect();
    void this.context.close();
  }
}

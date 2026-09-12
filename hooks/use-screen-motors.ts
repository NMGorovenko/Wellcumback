'use client';
import { useEffect, useRef, type RefObject } from 'react';
import type { GameState } from '@/lib/game/screen/engine';

/** Uses the caller's gesture-unlocked context; never creates/resumes/closes it. */
export function createScreenMotors(context: AudioContext) {
  const makeMotor = (frequency: number, cutoff: number, volume: number) => {
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const output = context.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = frequency;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    filter.Q.value = 0.6;
    output.gain.value = 0;
    oscillator.connect(filter);
    filter.connect(output);
    output.connect(context.destination);
    oscillator.start();
    let running = false;
    return {
      setRunning(next: boolean) {
        if (running === next) return;
        running = next;
        const now = context.currentTime;
        output.gain.cancelScheduledValues(now);
        output.gain.setValueAtTime(output.gain.value, now);
        output.gain.linearRampToValueAtTime(
          next ? volume : 0,
          now + (next ? 0.075 : 0.045),
        );
        oscillator.frequency.cancelScheduledValues(now);
        oscillator.frequency.setTargetAtTime(
          next ? frequency : frequency * 0.7,
          now,
          0.07,
        );
      },
      dispose() {
        // Fade before stopping. The fallback also releases nodes if the shared
        // context is suspended/closed and its audio clock cannot reach onended.
        const now = context.currentTime;
        output.gain.cancelScheduledValues(now);
        output.gain.setValueAtTime(output.gain.value, now);
        output.gain.linearRampToValueAtTime(0, now + 0.025);
        const disconnect = () => {
          oscillator.onended = null;
          oscillator.disconnect();
          filter.disconnect();
          output.disconnect();
        };
        const fallback = setTimeout(disconnect, 80);
        oscillator.onended = () => {
          clearTimeout(fallback);
          disconnect();
        };
        oscillator.stop(now + 0.03);
      },
    };
  };
  // A brighter drill whine and a softer, lower vacuum hum stay distinguishable
  // when both switches are held, without masking voices or action cues.
  const drill = makeMotor(205, 1450, 0.018);
  const vacuum = makeMotor(79, 390, 0.024);
  let disposed = false;
  return {
    context,
    setRunning(drillOn: boolean, vacuumOn: boolean) {
      if (disposed) return;
      drill.setRunning(drillOn);
      vacuum.setRunning(vacuumOn);
    },
    silence() {
      if (disposed) return;
      drill.setRunning(false);
      vacuum.setRunning(false);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      drill.dispose();
      vacuum.dispose();
    },
  };
}

type Motors = ReturnType<typeof createScreenMotors>;

export function useScreenMotors(
  audio: RefObject<AudioContext | null>,
  state: GameState,
  enabled: boolean,
) {
  const motors = useRef<Motors | null>(null);
  const focused = useRef(true);
  // No dependency list: a gesture may replace audio.current without changing the
  // engine flags. Snapshots still reconcile only two booleans, not rebuild nodes.
  useEffect(() => {
    const context = audio.current;
    if (motors.current && motors.current.context !== context) {
      motors.current.dispose();
      motors.current = null;
    }
    const allowed =
      enabled &&
      !state.paused &&
      state.phase === 'drill' &&
      state.drillMode === 'drill' &&
      focused.current &&
      !document.hidden &&
      context?.state === 'running';
    if (!allowed || !context) {
      motors.current?.silence();
      return;
    }
    motors.current ??= createScreenMotors(context);
    motors.current.setRunning(state.drillRunning, state.vacuumRunning);
  });
  useEffect(() => {
    const blur = () => {
      focused.current = false;
      motors.current?.silence();
    };
    const focus = () => {
      focused.current = true;
    };
    const visibility = () => {
      if (document.hidden) blur();
      else if (document.hasFocus()) focus();
    };
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibility);
      motors.current?.dispose();
      motors.current = null;
    };
  }, []);
}

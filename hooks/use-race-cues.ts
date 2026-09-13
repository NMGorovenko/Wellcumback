'use client';
import { useEffect, useRef } from 'react';
import type { RaceState } from '@/lib/game/race/types';

/** Quiet, brief race signals. Spoken dialogue is deliberately absent. */
export function useRaceCues(enabled: boolean, state: RaceState, slot: number) {
  const audio = useRef<AudioContext | null>(null);
  const previous = useRef({
    phase: state.phase,
    count: Math.ceil(state.countdown),
    events: '',
  });
  useEffect(() => {
    const unlock = () => {
      if (!enabled || typeof AudioContext === 'undefined') return;
      audio.current ??= new AudioContext();
      if (audio.current.state === 'suspended')
        void audio.current.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [enabled]);
  useEffect(() => {
    const local = state.racers.filter((r) => r.memberSlot === slot);
    const events = local
      .map((r) => `${r.id}:${r.passedGates}:${r.feedbackUntil}`)
      .join('|');
    const count = Math.ceil(state.countdown),
      old = previous.current;
    previous.current = { phase: state.phase, count, events };
    const context = audio.current;
    if (
      !context ||
      context.state !== 'running' ||
      !enabled ||
      (state.paused && state.phase !== 'result') ||
      document.hidden ||
      !document.hasFocus()
    )
      return;
    let notes: number[] = [];
    if (
      state.phase === 'countdown' &&
      (old.phase !== 'countdown' || old.count !== count)
    )
      notes = [440];
    else if (state.phase === 'racing' && old.phase === 'countdown')
      notes = [660, 880];
    else if (state.phase === 'result' && old.phase !== 'result')
      notes = [523, 659, 784];
    else if (old.events !== events && state.phase === 'racing') {
      notes = local.some(
        (r) =>
          r.feedbackUntil > state.elapsed && /сгорела|удар/i.test(r.feedback),
      )
        ? [135, 95]
        : [740];
    }
    notes.forEach((frequency, i) => {
      const oscillator = context.createOscillator(),
        gain = context.createGain();
      const start = context.currentTime + i * 0.075;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.045, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + 0.18);
    });
  }, [enabled, state, slot]);
  useEffect(
    () => () => {
      const c = audio.current;
      audio.current = null;
      if (c) void c.close().catch(() => {});
    },
    [],
  );
}

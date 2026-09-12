'use client';
import { useEffect, useRef } from 'react';

/** A few quiet handling cues; optional audio never gates the simulation. */
export function useMovingSound(
  enabled: boolean,
  score: number,
  delivered: number,
  paused = false,
) {
  const audio = useRef<AudioContext | null>(null),
    previous = useRef({ score, delivered });
  useEffect(() => {
    const unlock = () => {
      if (!enabled || typeof AudioContext === 'undefined') return;
      try {
        audio.current ??= new AudioContext();
        void audio.current.resume().catch(() => {});
      } catch {
        /* Optional browser audio. */
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [enabled]);
  useEffect(() => {
    const context = audio.current;
    if (
      enabled &&
      !paused &&
      context?.state === 'running' &&
      score > previous.current.score
    ) {
      const oscillator = context.createOscillator(),
        gain = context.createGain(),
        now = context.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(
        delivered > previous.current.delivered ? 380 : 170,
        now,
      );
      oscillator.frequency.exponentialRampToValueAtTime(90, now + 0.15);
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.18);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }
    previous.current = { score, delivered };
  }, [score, delivered, enabled, paused]);
  useEffect(
    () => () => {
      if (audio.current) void audio.current.close().catch(() => {});
      audio.current = null;
    },
    [],
  );
}

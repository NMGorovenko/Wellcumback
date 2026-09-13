'use client';
import { useEffect, useRef } from 'react';
import type { CityState } from '@/lib/game/city/engine';
import { advanceV8, freshV8 } from '@/lib/game/audio/v8-model';
import { createCityFoley } from '@/lib/game/audio/city-foley';

export function useCityAudio(enabled: boolean, state: CityState) {
  const audio = useRef<{
    context: AudioContext;
    graph: ReturnType<typeof createCityFoley>;
  } | null>(null);
  const motor = useRef(freshV8());
  const clock = useRef<number | null>(null);
  const suspend = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resumePending = useRef(false);
  const resumeAt = useRef(0);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);
  const stop = () => {
    audio.current?.graph.silence();
    if (
      suspend.current === undefined &&
      audio.current?.context.state === 'running'
    )
      suspend.current = setTimeout(() => {
        suspend.current = undefined;
        if (audio.current?.context.state === 'running')
          void audio.current.context.suspend().catch(() => {});
      }, 90);
    clock.current = null;
  };
  useEffect(() => {
    const unlock = () => {
      if (!enabled || typeof AudioContext === 'undefined') return;
      try {
        if (!audio.current) {
          const context = new AudioContext();
          audio.current = { context, graph: createCityFoley(context) };
        }
        if (!latest.current.paused && document.hasFocus())
          void audio.current.context.resume().catch(() => {});
      } catch {
        /* Audio never gates play. */
      }
    };
    const hidden = () => {
      if (document.hidden) stop();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', hidden);
    if (enabled) unlock();
    else stop();
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [enabled]);
  useEffect(() => {
    const current = audio.current;
    if (!current) return;
    if (!enabled || state.paused || document.hidden || !document.hasFocus()) {
      stop();
      return;
    }
    clearTimeout(suspend.current);
    suspend.current = undefined;
    if (
      current.context.state === 'suspended' &&
      !resumePending.current &&
      performance.now() >= resumeAt.current
    ) {
      resumeAt.current = performance.now() + 1500;
      resumePending.current = true;
      void current.context
        .resume()
        .catch(() => {})
        .finally(() => {
          resumePending.current = false;
        });
    }
    const now = performance.now() / 1000;
    const dt =
      clock.current === null
        ? 1 / 30
        : Math.max(0, Math.min(0.1, now - clock.current));
    clock.current = now;
    advanceV8(
      motor.current,
      {
        speed: state.speed,
        forward:
          state.vx * Math.sin(state.heading) -
          state.vz * Math.cos(state.heading),
        lateral:
          state.vx * Math.cos(state.heading) +
          state.vz * Math.sin(state.heading),
        throttle: state.throttle ?? 0,
        horn: state.previousHorn ?? false,
      },
      dt,
    );
    current.graph.update(motor.current, true);
  }, [state, enabled]);
  useEffect(
    () => () => {
      clearTimeout(suspend.current);
      const previous = audio.current;
      audio.current = null;
      previous?.graph.silence();
      if (previous)
        setTimeout(
          () => {
            previous.graph.dispose();
            void previous.context.close().catch(() => {});
          },
          previous.context.state === 'running' ? 65 : 0,
        );
    },
    [],
  );
}

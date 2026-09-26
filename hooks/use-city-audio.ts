'use client';
import { useEffect, useRef } from 'react';
import type { CityState } from '@/lib/game/city/engine';
import { advanceV8, freshV8 } from '@/lib/game/audio/v8-model';
import { createCityFoley } from '@/lib/game/audio/city-foley';
import { breakableObjects, type CityDamage } from '@/lib/game/city/destruction';

/** Read by the development soak page; retains no audio nodes or game snapshots. */
export const cityAudioProfile = {
  updates: 0,
  active: false,
  seconds: 0,
  updateMs: 0,
};

export function useCityAudio(
  enabled: boolean,
  state: CityState,
  voice: 'v8' | 'v6' = 'v8',
  mix = 1,
  damage: CityDamage | undefined = state.damage,
) {
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
  const heardImpact = useRef<string | null>(null);
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
          audio.current = {
            context,
            graph: createCityFoley(context, voice, mix),
          };
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
  }, [enabled, voice, mix]);
  useEffect(() => {
    const current = audio.current;
    if (process.env.NODE_ENV === 'development') {
      cityAudioProfile.active = current?.context.state === 'running';
      cityAudioProfile.seconds = current?.context.currentTime ?? 0;
    }
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
        powertrain: state.powertrain,
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
    const audioStarted =
      process.env.NODE_ENV === 'development' ? performance.now() : 0;
    current.graph.update(motor.current, true);
    if (process.env.NODE_ENV === 'development') {
      cityAudioProfile.updates++;
      cityAudioProfile.updateMs =
        Math.round((performance.now() - audioStarted) * 1000) / 1000;
    }
    const hit = damage?.hits.at(-1);
    const signature = hit ? `${hit[0]}:${hit[1]}` : '';
    if (
      heardImpact.current !== null &&
      heardImpact.current !== signature &&
      hit &&
      state.elapsed - hit[1] >= 0 &&
      state.elapsed - hit[1] < 0.4
    ) {
      const object = breakableObjects[hit[0]];
      if (object && Math.hypot(object.x - state.x, object.z - state.z) < 45)
        current.graph.impact(object.kind, hit[3]);
    }
    heardImpact.current = signature;
  }, [state, enabled, damage]);
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

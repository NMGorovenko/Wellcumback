'use client';
import { useEffect, useRef } from 'react';
import type { CleanState } from '@/lib/game/clean/engine';
import { CleanFoley } from '@/lib/game/audio/clean-foley';

export function useCleanAudio(enabled: boolean, state: CleanState) {
  const foley = useRef<CleanFoley | null>(null);
  useEffect(() => {
    const unlock = () => {
      if (!enabled) return;
      foley.current ??= new CleanFoley();
      void foley.current.unlock();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [enabled]);
  useEffect(() => {
    if (enabled && state.phase !== 'brief' && !foley.current) {
      try {
        foley.current = new CleanFoley();
        void foley.current.unlock();
      } catch {
        /* Audio support is optional. */
      }
    }
    foley.current?.update(state, enabled);
  }, [state, enabled]);
  useEffect(
    () => () => {
      foley.current?.dispose();
      foley.current = null;
    },
    [],
  );
}

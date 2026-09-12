'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { isControlInputBlocked } from '@/lib/game/input/settings-store';

export type GameFullscreenMode = 'native' | 'window' | null;

/** Window mode fills the app viewport; the browser still owns its chrome. */
export function useGameFullscreen() {
  const [mode, setMode] = useState<GameFullscreenMode>(null);
  const currentMode = useRef<GameFullscreenMode>(null);
  const mounted = useRef(false);
  const pending = useRef(false);
  const generation = useRef(0);

  const updateMode = useCallback((next: GameFullscreenMode) => {
    currentMode.current = next;
    setMode(next);
  }, []);

  const toggle = useCallback(() => {
    if (!mounted.current || pending.current) return;
    if (currentMode.current === 'window' && !document.fullscreenElement) {
      updateMode(null);
      return;
    }
    const requestGeneration = generation.current;
    const isCurrent = () =>
      mounted.current && requestGeneration === generation.current;
    pending.current = true;
    // Start the native request synchronously, while the gesture is still active.
    const change = async () => {
      const exiting = !!document.fullscreenElement;
      try {
        if (exiting) {
          await document.exitFullscreen();
        } else if (
          document.fullscreenEnabled === false ||
          typeof document.documentElement.requestFullscreen !== 'function'
        ) {
          if (isCurrent()) updateMode('window');
          return;
        } else {
          await document.documentElement.requestFullscreen();
        }
        if (isCurrent())
          updateMode(document.fullscreenElement ? 'native' : null);
      } catch {
        if (isCurrent())
          updateMode(
            document.fullscreenElement ? 'native' : exiting ? null : 'window',
          );
      } finally {
        if (isCurrent()) pending.current = false;
      }
    };
    void change();
  }, [updateMode]);

  useEffect(() => {
    mounted.current = true;
    const effectGeneration = generation.current;
    const synchronize = () => {
      if (document.fullscreenElement) updateMode('native');
      else if (currentMode.current === 'native') updateMode(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        isControlInputBlocked() ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event
          .composedPath()
          .some(
            (target) =>
              target instanceof HTMLElement &&
              (target.isContentEditable ||
                !!target.closest('input, textarea, select')),
          )
      )
        return;
      if (
        event.code !== 'KeyF' &&
        !(event.code === 'Escape' && currentMode.current === 'window')
      )
        return;
      event.preventDefault();
      // Escape leaves window mode without also opening the game's pause menu.
      event.stopImmediatePropagation();
      if (event.code === 'Escape') updateMode(null);
      else toggle();
    };
    synchronize();
    document.addEventListener('fullscreenchange', synchronize);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      mounted.current = false;
      generation.current = effectGeneration + 1;
      pending.current = false;
      document.removeEventListener('fullscreenchange', synchronize);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [toggle, updateMode]);

  return { active: mode !== null, mode, toggle };
}

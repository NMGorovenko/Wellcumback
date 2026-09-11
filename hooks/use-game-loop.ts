'use client';
import { useEffect, useRef, type RefObject } from 'react';

/** Owns keyboard listeners, focus loss, and one animation loop per mounted game.
 * Simulation is independent of React and receives a bounded real-time step.
 * React receives at most 30 snapshots per second; renderers read the live ref.
 */
export function useGameLoop<T extends { paused: boolean }>({
  game,
  keys,
  tick,
  action,
  pause,
  snapshot,
}: {
  game: RefObject<T>;
  keys: RefObject<Set<string>>;
  tick: (state: T, delta: number, keys: Set<string>) => void;
  action: () => void;
  pause: () => void;
  snapshot: (state: T) => void;
}) {
  const callbacks = useRef({ tick, action, pause, snapshot });
  useEffect(() => {
    callbacks.current = { tick, action, pause, snapshot };
  }, [tick, action, pause, snapshot]);
  useEffect(() => {
    const pressedKeys = keys.current;
    let last = performance.now(),
      frame = 0,
      elapsed = 0;
    const down = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea')) return;
      if (
        ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
          event.code,
        )
      )
        event.preventDefault();
      if (event.code === 'Escape' && !event.repeat) {
        callbacks.current.pause();
        return;
      }
      keys.current.add(event.code);
      if (!event.repeat && ['KeyE', 'Space'].includes(event.code))
        callbacks.current.action();
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.code);
    const blur = () => {
      pressedKeys.clear();
      game.current.paused = true;
      callbacks.current.snapshot({ ...game.current });
    };
    const update = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      callbacks.current.tick(game.current, dt, keys.current);
      elapsed += dt;
      if (elapsed >= 1 / 30) {
        callbacks.current.snapshot({ ...game.current });
        elapsed = 0;
      }
      frame = requestAnimationFrame(update);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      pressedKeys.clear();
    };
  }, [game, keys]);
}

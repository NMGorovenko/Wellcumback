'use client';
import { useEffect, useRef, type RefObject } from 'react';
import {
  createPadInput,
  createPadNavigation,
  mapGamepads,
  inputPlayerCount,
  mergeInputKeys,
  navigateGamepad,
  readGamepads,
  resetPadInput,
  type PadDirection,
  type PadFrame,
} from '@/lib/game/input/gamepads';

export type GamepadMenu = {
  enabled: boolean;
  onMove: (direction: PadDirection) => void;
  onConfirm: () => void;
  onBack: () => void;
  onDirectChoice?: (index: number) => void;
};
type PadStatus = Pick<PadFrame, 'assignments' | 'unsupported'>;
/** One animation loop combines source-owned keyboard/touch and polled gamepad state.
 * Buttons are edge-triggered; held directions/actions still reach deterministic engines. */
export function useGameLoop<
  T extends { paused: boolean; players?: number; actorCount?: number },
>({
  game,
  keys,
  tick,
  action,
  pause,
  snapshot,
  padMenu,
  onGamepads,
}: {
  game: RefObject<T>;
  keys: RefObject<Set<string>>;
  tick: (state: T, delta: number, keys: Set<string>) => void;
  action: () => void;
  pause: () => void;
  snapshot: (state: T) => void;
  padMenu?: GamepadMenu;
  onGamepads?: (status: PadStatus) => void;
}) {
  const callbacks = useRef({
    tick,
    action,
    pause,
    snapshot,
    padMenu,
    onGamepads,
  });
  useEffect(() => {
    callbacks.current = { tick, action, pause, snapshot, padMenu, onGamepads };
  }, [tick, action, pause, snapshot, padMenu, onGamepads]);
  useEffect(() => {
    const sourceKeys = keys.current;
    const padState = createPadInput(),
      navigation = createPadNavigation();
    let last = performance.now(),
      frame = 0,
      elapsed = 0,
      primaryPadHeld = false,
      focused = document.hasFocus();
    let previousPaused = game.current.paused,
      previousMenu = !!callbacks.current.padMenu?.enabled,
      statusKey = '';
    const keyDirections: Record<string, PadDirection> = {
      ArrowUp: 'up',
      KeyW: 'up',
      ArrowDown: 'down',
      KeyS: 'down',
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
    };
    const down = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          'input, textarea, select, [contenteditable="true"]',
        )
      )
        return;
      const menu = callbacks.current.padMenu;
      if (menu?.enabled) {
        if (keyDirections[event.code]) {
          event.preventDefault();
          menu.onMove(keyDirections[event.code]);
        } else if (['KeyE', 'Space', 'Enter'].includes(event.code)) {
          event.preventDefault();
          if (!event.repeat) menu.onConfirm();
        } else if (['Digit1', 'Digit2', 'Digit3'].includes(event.code)) {
          event.preventDefault();
          if (!event.repeat)
            menu.onDirectChoice?.(Number(event.code.slice(-1)) - 1);
        } else if (event.code === 'Escape') {
          event.preventDefault();
          if (!event.repeat) menu.onBack();
        }
        return;
      }
      if (
        [
          'Space',
          'Enter',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
        ].includes(event.code)
      )
        event.preventDefault();
      if (event.code === 'Escape' && !event.repeat) {
        callbacks.current.pause();
        resetPadInput(padState);
        return;
      }
      const actionAlreadyHeld =
        keys.current.has('KeyE') || keys.current.has('Space') || primaryPadHeld;
      keys.current.add(event.code);
      if (
        !event.repeat &&
        !actionAlreadyHeld &&
        ['KeyE', 'Space'].includes(event.code)
      )
        callbacks.current.action();
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.code);
    const blur = () => {
      focused = false;
      keys.current.clear();
      resetPadInput(padState);
      primaryPadHeld = false;
      if (!game.current.paused) callbacks.current.pause();
      callbacks.current.snapshot({ ...game.current });
    };
    const focus = () => {
      focused = true;
      resetPadInput(padState);
    };
    const visibility = () => {
      if (document.hidden) blur();
      else if (document.hasFocus()) focus();
    };
    const update = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const menu = callbacks.current.padMenu,
        menuEnabled = !!menu?.enabled;
      if (
        previousPaused !== game.current.paused ||
        previousMenu !== menuEnabled
      ) {
        resetPadInput(padState);
        navigation.direction = null;
        navigation.repeatAt = 0;
        keys.current.clear();
        primaryPadHeld = false;
      }
      const pads = mapGamepads(
        padState,
        document.hidden || !focused ? [] : readGamepads(),
        inputPlayerCount(game.current),
      );
      const nextStatus =
        pads.assignments
          .map((pad) => `${pad.index}:${pad.player}:${pad.ready}`)
          .join(',') +
        '/' +
        pads.unsupported.join(',');
      if (nextStatus !== statusKey) {
        statusKey = nextStatus;
        callbacks.current.onGamepads?.({
          assignments: pads.assignments,
          unsupported: pads.unsupported,
        });
      }
      let merged = mergeInputKeys(keys.current, pads.keys);
      if (menuEnabled && menu) {
        const nav = navigateGamepad(navigation, pads, now / 1000);
        if (nav.back) menu.onBack();
        else if (nav.confirm) menu.onConfirm();
        else if (nav.direction) menu.onMove(nav.direction);
        merged = new Set();
        primaryPadHeld = false;
      } else if (pads.pausePressed) {
        callbacks.current.pause();
        resetPadInput(padState);
        merged = new Set();
        primaryPadHeld = false;
      } else {
        primaryPadHeld = pads.keys.has('KeyE');
        if (
          pads.primaryActionPressed &&
          !keys.current.has('KeyE') &&
          !keys.current.has('Space') &&
          !game.current.paused
        )
          callbacks.current.action();
      }
      callbacks.current.tick(game.current, dt, merged);
      previousPaused = game.current.paused;
      previousMenu = menuEnabled;
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
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visibility);
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      sourceKeys.clear();
      resetPadInput(padState);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [game, keys]);
}

'use client';
import { useEffect, useRef } from 'react';
import {
  createPadInput,
  createPadNavigation,
  mapGamepads,
  navigateGamepad,
  readGamepads,
  resetPadInput,
  type PadDirection,
  type PadFrame,
} from '@/lib/game/input/gamepads';

import {
  getControlSettings,
  isControlInputBlocked,
} from '@/lib/game/input/settings-store';
import { canonicalKeyForPhysical } from '@/lib/game/input/settings';
import { PLAYER_BINDINGS } from '@/lib/game/input/bindings';

/** Lobby-only polling. Inside a running game use useGameLoop.padMenu instead,
 * so only one owner dispatches controller actions for the current surface. */
export function useGamepadNavigation({
  enabled = true,
  onMove,
  onConfirm,
  onBack,
  onGamepads,
}: {
  enabled?: boolean;
  onMove: (direction: PadDirection) => void;
  onConfirm: () => void;
  onBack: () => void;
  onGamepads?: (status: Pick<PadFrame, 'assignments' | 'unsupported'>) => void;
}) {
  const callbacks = useRef({ onMove, onConfirm, onBack, onGamepads });
  useEffect(() => {
    callbacks.current = { onMove, onConfirm, onBack, onGamepads };
  }, [onMove, onConfirm, onBack, onGamepads]);
  useEffect(() => {
    if (!enabled) return;
    const state = createPadInput(),
      navigation = createPadNavigation();
    let frame = 0,
      statusKey = '',
      focused = document.hasFocus(),
      previousBlocked = isControlInputBlocked();
    const blur = () => {
      focused = false;
      resetPadInput(state);
      navigation.direction = null;
    };
    const focus = () => {
      focused = true;
      resetPadInput(state);
    };
    const keydown = (event: KeyboardEvent) => {
      if (
        isControlInputBlocked() ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]'))
        return;
      if (event.code === 'Escape') {
        event.preventDefault();
        if (!event.repeat) callbacks.current.onBack();
        return;
      }
      // Tab-focused buttons keep their native Enter/Space activation.
      if (
        target?.closest('button, [role="button"]') &&
        ['Enter', 'Space'].includes(event.code)
      )
        return;
      const key = canonicalKeyForPhysical(getControlSettings(), event.code);
      for (const binding of PLAYER_BINDINGS) {
        for (const direction of ['up', 'down', 'left', 'right'] as const) {
          if (key === binding[direction]) {
            event.preventDefault();
            callbacks.current.onMove(direction);
            return;
          }
        }
        if (key === binding.action) {
          event.preventDefault();
          if (!event.repeat) callbacks.current.onConfirm();
          return;
        }
      }
    };
    const update = (now: number) => {
      const blocked = isControlInputBlocked();
      if (blocked !== previousBlocked) {
        resetPadInput(state);
        navigation.direction = null;
        navigation.repeatAt = 0;
      }
      previousBlocked = blocked;
      const pads = mapGamepads(
        state,
        document.hidden || !focused ? [] : readGamepads(),
        1,
      );
      const key =
        pads.assignments
          .map((p) => `${p.index}:${p.ready}:${p.brand}:${p.label}`)
          .join(',') +
        '/' +
        pads.unsupported.join(',');
      if (key !== statusKey) {
        statusKey = key;
        callbacks.current.onGamepads?.(pads);
      }
      const nav = blocked
        ? { back: false, confirm: false, direction: null }
        : navigateGamepad(navigation, pads, now / 1000);
      if (nav.back) callbacks.current.onBack();
      else if (nav.confirm) callbacks.current.onConfirm();
      else if (nav.direction) callbacks.current.onMove(nav.direction);
      frame = requestAnimationFrame(update);
    };
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    window.addEventListener('keydown', keydown);
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      window.removeEventListener('keydown', keydown);
    };
  }, [enabled]);
}

'use client';
import { neutralDrive, type DriveAxes } from '@/lib/game/input/drive';
import type { InputProfile } from '@/lib/game/input/settings';
import { useEffect, useRef, type RefObject } from 'react';
import {
  PLAYER_BINDINGS,
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

import {
  canonicalKeyForPhysical,
  mapPhysicalKeys,
} from '@/lib/game/input/settings';
import {
  getControlSettings,
  initializeControlSettings,
  isControlInputBlocked,
} from '@/lib/game/input/settings-store';

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
  tickWhileBlocked = false,
  profile = 'game',
  inputPlayers,
}: {
  game: RefObject<T>;
  keys: RefObject<Set<string>>;
  tick: (state: T, delta: number, keys: Set<string>, drive?: DriveAxes) => void;
  action: () => void;
  pause: () => void;
  snapshot: (state: T) => void;
  padMenu?: GamepadMenu;
  onGamepads?: (status: PadStatus) => void;
  /** City transport keeps sending neutral heartbeats while a dialog blocks controls. */
  tickWhileBlocked?: boolean;
  profile?: InputProfile;
  /** Online clients own one local controller, later mapped to their room slot. */
  inputPlayers?: number;
}) {
  const callbacks = useRef({
    tick,
    action,
    pause,
    snapshot,
    padMenu,
    onGamepads,
    tickWhileBlocked,
    profile,
    inputPlayers,
  });
  useEffect(() => {
    callbacks.current = {
      tick,
      action,
      pause,
      snapshot,
      padMenu,
      onGamepads,
      tickWhileBlocked,
      profile,
      inputPlayers,
    };
  }, [
    tick,
    action,
    pause,
    snapshot,
    padMenu,
    onGamepads,
    tickWhileBlocked,
    profile,
    inputPlayers,
  ]);
  useEffect(() => {
    initializeControlSettings();
    const sourceKeys = keys.current;
    const physicalKeys = new Set<string>();
    let previousBindings = getControlSettings(),
      previousBlocked = isControlInputBlocked();
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
    const keyDirections = Object.fromEntries(
      PLAYER_BINDINGS.flatMap((binding) => [
        [binding.up, 'up'],
        [binding.down, 'down'],
        [binding.left, 'left'],
        [binding.right, 'right'],
      ]),
    ) as Record<string, PadDirection>;
    const resetInput = () => {
      physicalKeys.clear();
      keys.current.clear();
      resetPadInput(padState);
      navigation.direction = null;
      navigation.repeatAt = 0;
      primaryPadHeld = false;
    };
    const down = (event: KeyboardEvent) => {
      if (
        isControlInputBlocked() ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          'input, textarea, select, [contenteditable="true"]',
        )
      )
        return;
      const menu = callbacks.current.padMenu;
      const code = canonicalKeyForPhysical(
        getControlSettings(),
        event.code,
        menu?.enabled ? 'game' : callbacks.current.profile,
      );
      if (menu?.enabled) {
        if (code && keyDirections[code]) {
          event.preventDefault();
          menu.onMove(keyDirections[code]);
        } else if (
          code &&
          PLAYER_BINDINGS.some((binding) => binding.action === code)
        ) {
          event.preventDefault();
          if (!event.repeat) menu.onConfirm();
        } else if (
          !code &&
          ['Digit1', 'Digit2', 'Digit3'].includes(event.code)
        ) {
          event.preventDefault();
          if (!event.repeat)
            menu.onDirectChoice?.(Number(event.code.slice(-1)) - 1);
        } else if (event.code === 'Escape') {
          event.preventDefault();
          if (!event.repeat) menu.onBack();
        }
        return;
      }
      if (event.code === 'Escape' && !event.repeat) {
        callbacks.current.pause();
        resetInput();
        return;
      }
      if (!code) return;
      event.preventDefault();
      // After a modal, remap or blur, a held physical key must be released before
      // it can act again; browser key-repeat is not a fresh press.
      if (event.repeat && !physicalKeys.has(event.code)) return;
      const actionAlreadyHeld =
        mapPhysicalKeys(
          getControlSettings(),
          physicalKeys,
          callbacks.current.profile,
        ).has('KeyE') ||
        keys.current.has('KeyE') ||
        keys.current.has('Space') ||
        primaryPadHeld;
      physicalKeys.add(event.code);
      if (!event.repeat && !actionAlreadyHeld && code === 'KeyE')
        callbacks.current.action();
    };
    const up = (event: KeyboardEvent) => {
      physicalKeys.delete(event.code);
    };
    const blur = () => {
      focused = false;
      resetInput();
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
        menuEnabled = !!menu?.enabled,
        blocked = isControlInputBlocked(),
        settings = getControlSettings();
      if (
        previousPaused !== game.current.paused ||
        previousMenu !== menuEnabled ||
        previousBlocked !== blocked ||
        previousBindings !== settings
      )
        resetInput();
      if (blocked && !previousBlocked && !game.current.paused)
        callbacks.current.pause();
      previousBlocked = blocked;
      previousBindings = settings;
      const pads = mapGamepads(
        padState,
        document.hidden || !focused ? [] : readGamepads(),
        callbacks.current.inputPlayers ?? inputPlayerCount(game.current),
        callbacks.current.profile,
      );
      const nextStatus =
        pads.assignments
          .map(
            (pad) =>
              `${pad.index}:${pad.player}:${pad.ready}:${pad.brand}:${pad.label}`,
          )
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
      const keyboard = mapPhysicalKeys(
        settings,
        physicalKeys,
        callbacks.current.profile,
      );
      const localKeys = mergeInputKeys(keys.current, keyboard);
      let merged = mergeInputKeys(localKeys, pads.keys);
      let drive = pads.drive;
      if (blocked) {
        merged = new Set();
        drive = neutralDrive();
        primaryPadHeld = false;
      } else if (menuEnabled && menu) {
        const nav = navigateGamepad(navigation, pads, now / 1000);
        if (nav.back) menu.onBack();
        else if (nav.confirm) menu.onConfirm();
        else if (nav.direction) menu.onMove(nav.direction);
        merged = new Set();
        drive = neutralDrive();
        primaryPadHeld = false;
      } else if (pads.pausePressed) {
        callbacks.current.pause();
        resetPadInput(padState);
        merged = new Set();
        drive = neutralDrive();
        primaryPadHeld = false;
      } else {
        primaryPadHeld = pads.keys.has('KeyE');
        if (
          pads.primaryActionPressed &&
          !localKeys.has('KeyE') &&
          !localKeys.has('Space') &&
          !game.current.paused
        )
          callbacks.current.action();
      }
      if (!blocked || callbacks.current.tickWhileBlocked)
        callbacks.current.tick(game.current, dt, merged, drive);
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
      physicalKeys.clear();
      resetPadInput(padState);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [game, keys]);
}

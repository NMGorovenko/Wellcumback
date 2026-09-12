'use client';
import { useEffect, useRef } from 'react';
import {
  createPadInput,
  createPadNavigation,
  mapGamepads,
  navigateGamepad,
  readGamepads,
} from '@/lib/game/input/gamepads';
import { acquireControlInputBlock } from '@/lib/game/input/settings-store';

/** Informational dialogs own confirm/back while the scene underneath is blocked. */
export function useDialogInput(open: boolean, onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const release = acquireControlInputBlock();
    const input = createPadInput(),
      navigation = createPadNavigation();
    let frame = 0;
    const update = (now: number) => {
      const pads = mapGamepads(
        input,
        document.hidden || !document.hasFocus() ? [] : readGamepads(),
        3,
      );
      const action = navigateGamepad(navigation, pads, now / 1000);
      if (action.confirm || action.back) close.current();
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      release();
    };
  }, [open]);
}

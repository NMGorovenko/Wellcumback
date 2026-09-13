'use client';
import { useEffect, useRef, type RefObject } from 'react';
import {
  createPadInput,
  createPadNavigation,
  mapGamepads,
  navigateGamepad,
  readGamepads,
} from '@/lib/game/input/gamepads';
import { acquireControlInputBlock } from '@/lib/game/input/settings-store';

/** A modal owns the controller while the running scene continues neutral network heartbeats. */
export function useFormGamepad(
  open: boolean,
  container: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
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
    const tick = (now: number) => {
      const pads = mapGamepads(
        input,
        document.hidden || !document.hasFocus() ? [] : readGamepads(),
        1,
      );
      const nav = navigateGamepad(navigation, pads, now / 1000);
      const items = [
        ...(container.current?.querySelectorAll<HTMLElement>(
          '[data-form-control]',
        ) ?? []),
      ].filter(
        (el) => !el.hasAttribute('disabled') && el.getClientRects().length,
      );
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (nav.back) close.current();
      else if (nav.direction && items.length) {
        const delta =
          nav.direction === 'up' || nav.direction === 'left' ? -1 : 1;
        items[(index + delta + items.length) % items.length].focus();
      } else if (nav.confirm) {
        const item = items[index < 0 ? 0 : index];
        item?.focus();
        if (item?.matches('button, summary')) item.click();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      release();
    };
  }, [open, container]);
}

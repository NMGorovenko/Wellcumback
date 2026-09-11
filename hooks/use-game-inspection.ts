'use client';
import { useEffect, type RefObject } from 'react';

/** Development-only browser QA bridge. Drives normal held inputs through RAF;
 * it cannot change a phase, award points, or advance the clock itself. */
export function useGameInspection<T>(
  game: RefObject<T>,
  keys: RefObject<Set<string>>,
) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: object,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context) return;
    const abort = new AbortController();
    const supported = [
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'KeyE',
      'KeyQ',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Enter',
      'KeyI',
      'KeyJ',
      'KeyK',
      'KeyL',
      'KeyO',
      'Digit1',
      'Digit2',
      'Digit3',
    ];
    const snapshot = () => JSON.parse(JSON.stringify(game.current)) as unknown;
    const register = (tool: object) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: abort.signal }),
        ).catch(() => {});
      } catch {
        /* Optional development browser capability. */
      }
    };
    register({
      name: 'read_live_game',
      description:
        'Development QA: read the live game state for verifying controls and animations. Does not mutate the game.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: snapshot,
    });
    register({
      name: 'hold_game_keys',
      description:
        'Development QA: hold ordinary gameplay keys for up to 5000 real milliseconds, then release. Uses the normal animation loop; never skips stages or awards points directly.',
      inputSchema: {
        type: 'object',
        properties: {
          keys: { type: 'array', items: { type: 'string', enum: supported } },
          milliseconds: { type: 'integer', minimum: 16, maximum: 5000 },
        },
        required: ['keys', 'milliseconds'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async (input: unknown) => {
        const data = input as { keys?: unknown; milliseconds?: unknown };
        if (
          !Array.isArray(data.keys) ||
          data.keys.some(
            (key) => typeof key !== 'string' || !supported.includes(key),
          ) ||
          typeof data.milliseconds !== 'number' ||
          data.milliseconds < 16 ||
          data.milliseconds > 5000
        )
          throw new Error('Invalid game controls');
        const held = data.keys as string[];
        held.forEach((key) => keys.current.add(key));
        try {
          await new Promise<void>((resolve) =>
            window.setTimeout(resolve, data.milliseconds as number),
          );
        } finally {
          held.forEach((key) => keys.current.delete(key));
        }
        return snapshot();
      },
    });
    return () => {
      abort.abort();
    };
  }, [game, keys]);
}

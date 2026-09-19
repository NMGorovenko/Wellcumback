import type { StoryId } from './types';

type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean };
  execute: (input: unknown) => unknown;
};
type ModelContext = {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};

export function registerGameTools(
  start: (story: StoryId, players: number) => void,
) {
  const context = (document as Document & { modelContext?: ModelContext })
    .modelContext;
  if (!context) return () => {};
  const lifecycle = new AbortController();
  const tool: Tool = {
    name: 'start_game_story',
    description:
      'Start one of the playable stories with 1–3 local players. Opens the game; does not complete it or award points.',
    inputSchema: {
      type: 'object',
      properties: {
        story: { type: 'string', enum: ['screen', 'clean', 'moving', 'roma2'] },
        players: { type: 'integer', minimum: 1, maximum: 3 },
      },
      required: ['story', 'players'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute(input) {
      if (!input || typeof input !== 'object')
        throw new Error('Expected story and players.');
      const { story, players } = input as Record<string, unknown>;
      if (
        (story !== 'screen' &&
          story !== 'clean' &&
          story !== 'moving' &&
          story !== 'roma2') ||
        typeof players !== 'number' ||
        !Number.isInteger(players) ||
        players < 1 ||
        players > 3
      )
        throw new Error(
          'Choose screen, clean, moving or roma2 and 1–3 players.',
        );
      start(story, players);
      return { started: true, story, players };
    },
  };
  try {
    void Promise.resolve(
      context.registerTool(tool, { signal: lifecycle.signal }),
    ).catch(() => {});
  } catch {
    /* Optional API; keyboard and buttons remain available. */
  }
  return () => lifecycle.abort();
}

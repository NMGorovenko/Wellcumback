import type { GameState } from './engine.ts';
import { screenTimingCue } from './timing.ts';

/** Face mode is for reactions; a live timing action keeps its own actor in view. */
export function screenFaceActor(s: GameState, localActor?: number) {
  const actor =
    localActor !== undefined
      ? s.players === 1 && (s.phase === 'drill' || s.phase === 'level')
        ? 1
        : Math.max(0, Math.min(s.players - 1, localActor))
      : s.phase === 'tension'
        ? s.tool.owner
        : s.phase === 'drill' || s.phase === 'level'
          ? 1
          : 0;
  if (screenTimingCue(s, actor)) return actor;
  if (s.elapsed < s.messageUntil && s.speechText) return s.messageSpeaker ?? actor;
  return actor;
}

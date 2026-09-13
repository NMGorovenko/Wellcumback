import type { CleanState } from './engine.ts';
import { cleanRole } from './cast.ts';

export function cleanSay(
  s: CleanState,
  actor: number,
  text: string,
  duration = 4,
) {
  s.actorSpeech = { actor, text, until: s.elapsed + duration, phase: s.phase };
}

/** One readable comic at a time. Role changes must never reuse the soldier's line. */
export function cleanSpeech(s: CleanState) {
  if (s.paused) return null;
  const line = s.actorSpeech;
  if (
    line &&
    line.phase === s.phase &&
    s.elapsed < line.until &&
    line.actor < s.actorCount
  )
    return {
      npc: -1,
      actor: line.actor,
      speaker: cleanRole(s, line.actor).name,
      text: line.text,
    };
  const npc =
    s.phase === 'accident' || (s.phase === 'toilet' && s.phaseTime < 8)
      ? 0
      : s.responseStage === 'react'
        ? 1
        : s.responseStage === 'order'
          ? 2
          : -1;
  if (npc < 0 || !s.npcs[npc].line) return null;
  return {
    npc,
    actor: null,
    speaker: ['Дневальный', 'Рома', 'Старший'][npc],
    text: s.npcs[npc].line,
  };
}

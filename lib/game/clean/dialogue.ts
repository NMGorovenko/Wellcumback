import type { CleanState } from './engine.ts';

/** One readable comic at a time, attached to its actual speaking NPC. */
export function cleanSpeech(s: CleanState) {
  if (s.paused) return null;
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
    speaker: ['Дневальный', 'Рома', 'Старший'][npc],
    text: s.npcs[npc].line,
  };
}

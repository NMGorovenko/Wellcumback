import { MOVING_DIALOGUE, type MovingDialogueId } from './dialogue.ts';
import type { MovingState } from './types.ts';
export function say(s: MovingState, id: MovingDialogueId) {
  const line = MOVING_DIALOGUE[id];
  s.dialogueId = id;
  s.speaker = line.speaker;
  s.message = line.text;
  s.messageUntil = s.elapsed + 7;
  s.messageSeq++;
}
export function movingHint(
  s: MovingState,
  message: string,
  speaker = 'Подсказка',
) {
  if (s.dialogueId && s.elapsed < s.messageUntil) return;
  s.dialogueId = null;
  s.speaker = speaker;
  s.message = message;
  s.messageUntil = s.elapsed + 4;
  s.messageSeq++;
}

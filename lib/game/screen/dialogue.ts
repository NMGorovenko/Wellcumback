import type { GameState, Phase } from './engine.ts';
export const PROJECTOR_MOVING_LINE =
  'В отличии от телека - проектор проще перевозить при переезде..';
export type PendingSpeech = {
  text: string;
  speaker: 0 | 1 | 2;
  duration: number;
  after: number;
};
export const SCREEN_DIALOGUE: Record<Phase, { speaker: 0 | 1; text: string }> =
  {
    frame: {
      speaker: 0,
      text: PROJECTOR_MOVING_LINE,
    },
    rods: {
      speaker: 1,
      text: 'Рамка есть. Теперь бы полотно в неё поместилось.',
    },
    tension: { speaker: 0, text: 'Отвёртка одна. Давай без броска на рекорд.' },
    drill: {
      speaker: 1,
      text: 'Стремянки нет. Зато стульев — целая инженерная мысль.',
    },
    lift: { speaker: 0, text: 'Я держу. Только не поднимай один!' },
    level: {
      speaker: 1,
      text: 'Погоди. А уровень где? На полке же был.',
    },
    result: { speaker: 0, text: 'С возвращением, Рома! Включай кино.' },
  };
/** Dialogue is distinct from the actionable hint. Repeated hints cannot change
 * the speaker's words, refresh their deadline or resurrect an expired bubble. */
export function screenSay(
  s: GameState,
  text: string,
  speaker: 0 | 1 | 2,
  duration = 5.5,
) {
  s.speechText = text;
  s.messageSpeaker = speaker;
  s.messageUntil = s.elapsed + duration;
  s.messageSeq++;
}
export function announceScreenPhase(s: GameState, phase: Phase) {
  const line = SCREEN_DIALOGUE[phase];
  screenSay(s, line.text, line.speaker);
}

export function queueScreenSpeech(
  s: GameState,
  text: string,
  speaker: 0 | 1 | 2,
  duration = 6,
) {
  const queue = (s.pendingSpeech ??= []);
  if (!queue.some((line) => line.text === text))
    queue.push({ text, speaker, duration, after: s.messageUntil });
}

export function advanceScreenSpeech(s: GameState) {
  const next = s.pendingSpeech?.[0];
  if (
    !next ||
    s.phase === 'result' ||
    s.elapsed < next.after ||
    s.elapsed < s.messageUntil
  )
    return;
  s.pendingSpeech!.shift();
  screenSay(s, next.text, next.speaker, next.duration);
}

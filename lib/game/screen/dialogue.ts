import type { GameState, Phase } from './engine.ts';
export const SCREEN_DIALOGUE: Record<Phase, { speaker: 0 | 1; text: string }> =
  {
    frame: {
      speaker: 0,
      text: 'Так. Экран огромный. Диван теперь для масштаба.',
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

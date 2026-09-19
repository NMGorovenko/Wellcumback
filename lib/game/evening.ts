import type { Result, StoryId } from './types.ts';

export const eveningStories: { id: StoryId; title: string }[] = [
  { id: 'screen', title: 'Экран на полстены' },
  { id: 'clean', title: 'Чистый проход' },
  { id: 'moving', title: 'Переезд Ярика' },
  { id: 'roma2', title: 'Байки Ромы 2' },
];
export type EveningAward = { story: StoryId; title: string; evidence: string };
const awardTitles: Record<StoryId, string> = {
  roma2: 'Стратегический запас',
  screen: 'Отвёрточная магия',
  clean: 'Операция «Было чисто»',
  moving: 'Пакет с пакетами',
};
const counters: Record<StoryId, { pattern: RegExp; label: string }> = {
  roma2: { pattern: /^(\d+) криков о помощи/u, label: 'Звали на помощь' },
  screen: {
    pattern: /Поймано отвёрток:\s*(\d+)(?:\.(?!\d)|\s|$)/u,
    label: 'Поймано отвёрток',
  },
  clean: {
    pattern: /(?:^|\s)(\d+) следов отмыто(?:\s|·|$)/u,
    label: 'Отмыто следов',
  },
  moving: {
    pattern: /(?:^|\s)(\d+) сум(?:ка|ки|ок) у двери(?:\s|·|$)/u,
    label: 'Сумок у двери',
  },
};
/** At most one keepsake per story, using one real run for both points and evidence.
 * Legacy/unrecognized details fall back to the recorded score, never guessed stats. */
export function getEveningSummary(results: readonly Result[]) {
  const completed = eveningStories.filter((story) =>
    results.some((run) => run.story === story.id),
  );
  const awards: EveningAward[] = completed.map((story) => {
    const runs = results.filter((run) => run.story === story.id);
    const best = runs.reduce((a, b) => (b.score > a.score ? b : a));
    const counter = counters[story.id],
      match = best.details.match(counter.pattern);
    const count = match ? Number(match[1]) : 0;
    return {
      story: story.id,
      title: awardTitles[story.id],
      evidence:
        Number.isSafeInteger(count) && count > 0
          ? `${counter.label}: ${count} · ${best.score.toLocaleString('ru-RU')} очков за это прохождение`
          : `${best.score.toLocaleString('ru-RU')} очков · лучший счёт этой истории`,
    };
  });
  return {
    total: results.reduce((sum, run) => sum + run.score, 0),
    completed,
    awards,
    welcome: completed.length === eveningStories.length,
  };
}

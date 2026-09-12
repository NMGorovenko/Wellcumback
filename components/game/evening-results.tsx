'use client';
import { Check, Trophy } from 'lucide-react';
import type { Result, StoryId } from '@/lib/game/types';
import { eveningStories, getEveningSummary } from '@/lib/game/evening';

export function EveningResults({
  results,
  titles = {},
}: {
  results: readonly Result[];
  titles?: Partial<Record<StoryId, string>>;
}) {
  const summary = getEveningSummary(results);
  return (
    <section className="evening-results" aria-label="Итоги вечера">
      <div className="hub-total">
        <Trophy size={26} aria-hidden="true" />
        <strong>{summary.total.toLocaleString('ru-RU')}</strong>
        <span>очков за все сохранённые прохождения</span>
      </div>
      <div className="evening-stories" aria-label="Пройденные истории">
        {eveningStories.map((story) => {
          const done = summary.completed.some((item) => item.id === story.id);
          return (
            <span key={story.id} className={done ? 'is-complete' : ''}>
              {done && <Check size={12} aria-hidden="true" />}
              <span>{story.title}</span>
              <small>{done ? 'Пройдена' : 'Ещё впереди'}</small>
            </span>
          );
        })}
      </div>
      {summary.awards.length > 0 && (
        <ul className="evening-awards" aria-label="На память о вечере">
          {summary.awards.map((award) => (
            <li key={award.story}>
              <strong>{award.title}</strong>
              <span>{award.evidence}</span>
            </li>
          ))}
        </ul>
      )}
      <p className={summary.welcome ? 'evening-welcome' : 'quiet'}>
        {summary.welcome
          ? 'Рома, с возвращением. Хорошо, что ты снова с нами.'
          : results.length
            ? 'Байки копятся. Следующая уже ждёт на карте.'
            : 'Сыграйте первую историю — здесь появится ваш результат.'}
      </p>
      {results.length > 0 && (
        <details className="evening-history" open>
          <summary>Все прохождения · {results.length}</summary>
          <div className="hub-results">
            {results
              .slice()
              .reverse()
              .map((run, index) => (
                <div key={`${run.date}-${index}`}>
                  <span>
                    {titles[run.story] ??
                      eveningStories.find((story) => story.id === run.story)
                        ?.title ??
                      'История'}
                    <small>
                      {run.players} чел. · {run.seconds} сек.
                    </small>
                    {run.details && <small>{run.details}</small>}
                  </span>
                  <strong>{run.score.toLocaleString('ru-RU')}</strong>
                </div>
              ))}
          </div>
        </details>
      )}
    </section>
  );
}

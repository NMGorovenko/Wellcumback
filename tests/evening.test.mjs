import test from 'node:test';
import assert from 'node:assert/strict';
import { getEveningSummary } from '../lib/game/evening.ts';
const run = (story, score, details = '') => ({
  story,
  score,
  details,
  players: 2,
  seconds: 80,
  date: '2026-09-12T10:00:00Z',
});

void test('replays retain every point but welcome requires four distinct completed stories', () => {
  const results = [run('screen', 120), run('screen', 80), run('clean', 300)];
  const before = structuredClone(results),
    partial = getEveningSummary(results);
  assert.equal(partial.total, 500);
  assert.equal(partial.completed.length, 2);
  assert.equal(partial.welcome, false);
  assert.deepEqual(
    results,
    before,
    'summary leaves stored history and ordering untouched',
  );
  assert.equal(
    getEveningSummary([...results, run('moving', 1)]).welcome,
    false,
  );
  assert.equal(
    getEveningSummary([...results, run('moving', 1), run('roma2', 1)]).welcome,
    true,
  );
  assert.equal(getEveningSummary([]).awards.length, 0);
});

void test('awards cite one actual run, with no combination of best score and another run’s counts', () => {
  const result = getEveningSummary([
    run('screen', 10, 'Поймано отвёрток: 99. Промахов: 0.'),
    run('screen', 800, 'Поймано отвёрток: 3. Падений: 2.'),
    run('clean', 900, '28 следов отмыто · стиралка чистая · 9 сек. сообща'),
    run('moving', 1000, '12 вещей упаковано · 3 сумки у двери · 8 сек. вдвоём'),
    run('roma2', 750, '2 криков о помощи · все выбрались'),
  ]);
  assert.equal(result.awards.length, 4);
  assert.match(result.awards[0].evidence, /отвёрток: 3 · 800/);
  assert.doesNotMatch(result.awards[0].evidence, /99|без падений/);
  assert.match(result.awards[1].evidence, /следов: 28/);
  assert.match(result.awards[2].evidence, /у двери: 3/);
  assert.match(result.awards[3].evidence, /помощь: 2/);
});

void test('legacy details and zero counters earn only an honest score keepsake', () => {
  for (const details of [
    '',
    'Вроде всё идеально',
    'Поймано отвёрток: -7.',
    'Поймано отвёрток: 2.5.',
    'Поймано отвёрток: 0.',
  ]) {
    const award = getEveningSummary([run('screen', 42, details)]).awards[0];
    assert.equal(award.evidence, '42 очков · лучший счёт этой истории');
  }
});

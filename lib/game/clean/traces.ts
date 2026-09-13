import type { CleanSpot } from './engine.ts';

export const MAX_TRACES = 180;

/** Free one slot for a new effect without changing its kind or location. */
export function reserveTrace(spots: CleanSpot[]) {
  if (spots.length < MAX_TRACES) return false;
  let pair: [number, number] | undefined;
  let nearest = Infinity;
  for (let a = 0; a < spots.length; a++) {
    for (let b = a + 1; b < spots.length; b++) {
      if (spots[a].kind !== spots[b].kind) continue;
      const distance =
        (spots[a].x - spots[b].x) ** 2 + (spots[a].y - spots[b].y) ** 2;
      if (distance < nearest) {
        nearest = distance;
        pair = [a, b];
      }
    }
  }
  // With four trace kinds and 180 slots a same-kind pair always exists.
  if (!pair) throw new Error('Trace capacity has no mergeable pair.');
  const [a, b] = pair,
    first = spots[a],
    second = spots[b];
  const weight = first.weight + second.weight;
  const cleaned =
    first.weight * first.progress + second.weight * second.progress;
  const anchor =
    first.weight * (1 - first.progress) >= second.weight * (1 - second.progress)
      ? first
      : second;
  spots[a] = {
    ...anchor,
    weight,
    progress: cleaned / weight,
    size: Math.min(48, Math.max(first.size, second.size) * 1.1),
  };
  spots.splice(b, 1);
  return true;
}

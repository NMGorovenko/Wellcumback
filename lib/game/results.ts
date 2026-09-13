import type { Result } from './types.ts';

/** Old local results have no runId and remain independent attempts. */
export function appendResult(history: Result[], result: Result) {
  if (
    result.runId &&
    history.some((previous) => previous.runId === result.runId)
  )
    return history;
  return [...history, result].slice(-30);
}

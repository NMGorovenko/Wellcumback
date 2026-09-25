/** Let camera interpolation settle, then retain the last frame under a pause
 * menu. A local visual change wakes rendering immediately without resuming play. */
export function createIdleRenderGate(settleMs = 1000) {
  let previous: readonly unknown[] = [],
    until = 0;
  return (now: number, paused: boolean, visualInputs: readonly unknown[]) => {
    const changed =
      visualInputs.length !== previous.length ||
      visualInputs.some((value, i) => !Object.is(value, previous[i]));
    if (!paused || changed) until = now + settleMs;
    previous = visualInputs;
    return now <= until;
  };
}

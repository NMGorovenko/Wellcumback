import type { RaceState } from './types.ts';

export type RaceStartSignal = 'red' | 'yellow' | 'green' | null;
type StartClock = Pick<RaceState, 'phase' | 'countdown' | 'elapsed'>;
/** The host's race clock drives lamps and sound on every client. */
export function raceStartSignal(state: StartClock): RaceStartSignal {
  if (state.phase === 'countdown')
    return state.countdown > 1 + 1e-8 ? 'red' : 'yellow';
  return state.phase === 'racing' && state.elapsed < 0.85 ? 'green' : null;
}

/** Refresh boundaries immediately; ordinary telemetry can stay at 30 Hz. */
export function raceStartSnapshotKey(state: StartClock): string {
  return `${state.phase}:${raceStartSignal(state)}:${state.phase === 'countdown' ? Math.ceil(Math.max(0, state.countdown - 1e-8)) : ''}`;
}

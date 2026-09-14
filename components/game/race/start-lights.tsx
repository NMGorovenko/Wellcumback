import { raceStartSignal } from '@/lib/game/race/start-signal';
import type { RaceState } from '@/lib/game/race/types';

export function RaceStartLights({ state }: { state: RaceState }) {
  const signal = raceStartSignal(state);
  if (!signal) return null;
  const count = Math.ceil(Math.max(0, state.countdown - 1e-8));
  return (
    <output
      className="race-start-lights"
      data-signal={signal}
      aria-label={
        signal === 'green'
          ? 'Зелёный — старт!'
          : `${signal === 'red' ? 'Красный' : 'Жёлтый'} — ${count}`
      }
    >
      <div className="race-lamps" aria-hidden="true">
        {(['red', 'yellow', 'green'] as const).map((color) => (
          <i key={color} data-color={color} data-lit={color === signal} />
        ))}
      </div>
      <strong key={signal === 'green' ? 'go' : count}>
        {signal === 'green' ? 'Поехали!' : count}
      </strong>
    </output>
  );
}

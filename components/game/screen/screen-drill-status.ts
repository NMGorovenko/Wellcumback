import type { GameState } from '../../../lib/game/screen/engine.ts';
import { nearChairs } from '../../../lib/game/screen/drill-space.ts';

/** Describe the current physical action, including pauses between delivery and
 * acceptance. Entering the handoff chapter alone never means tools are passing. */
export function screenDrillStatus(s: GameState) {
  const a = s.drillAssistant;
  const kinds = ['drill', 'vacuum'] as const;
  const carried = kinds.find(
    (kind) => s.drillTools[kind].location === 'assistant',
  );
  const ground = kinds.some((kind) => s.drillTools[kind].location === 'ground');
  const shelf = kinds.some((kind) => s.drillTools[kind].location === 'shelf');
  const nearby = nearChairs(s);
  const braced = nearby && s.braceHeld;
  const transfer =
    s.drillMode === 'handoff' &&
    braced &&
    a.activity === 'handoff' &&
    s.handoffTool &&
    s.drillTools[s.handoffTool].location === 'assistant' &&
    s.handoffProgress > 0
      ? s.handoffTool
      : null;
  const pickup =
    a.activity === 'pickup' &&
    a.pickupTool &&
    ['shelf', 'ground'].includes(s.drillTools[a.pickupTool].location)
      ? a.pickupTool
      : null;
  const toolName = (kind: 'drill' | 'vacuum') =>
    kind === 'drill' ? 'дрель' : 'пылесос';
  const assistant = transfer
    ? `подаёт ${toolName(transfer)}`
    : pickup
      ? `${s.drillTools[pickup].location === 'shelf' ? 'берёт с полки' : 'подбирает'} ${toolName(pickup)}`
      : carried
        ? nearby
          ? `готов подать ${toolName(carried)}`
          : a.activity === 'walk'
            ? 'возвращается с приборами'
            : 'с приборами'
        : braced
          ? 'страхует стулья'
          : a.activity === 'walk'
            ? ground
              ? 'идёт к упавшим приборам'
              : shelf
                ? 'идёт за приборами'
                : 'идёт к стульям'
            : nearby
              ? 'у стульев'
              : 'отошёл от стульев';
  const climber =
    s.drillMode === 'fallen'
      ? 'поднимается после падения'
      : s.drillMode === 'position' || s.climb === 0
        ? 'у стульев'
        : s.drillMode === 'climb'
          ? 'забирается'
          : s.drillMode === 'descend'
            ? 'спускается'
            : braced
              ? 'на стульях'
              : 'держит равновесие';
  return { assistant, climber, transfer, pickup, braced };
}

export function drillBalanceText(worker: number, direction?: 'left' | 'right') {
  return !direction
    ? 'Ровно · не жми'
    : worker === 2
      ? 'Подскажи наклон'
      : worker === 0
        ? 'Выпрями стулья'
        : 'Держи равновесие';
}

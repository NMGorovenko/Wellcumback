import { movingStations } from './layout.ts';
import {
  bagById,
  carrySetup,
  distance,
  itemById,
  nearest,
  REACH,
} from './physics.ts';
import type { MovingState, MovingIntent } from './types.ts';

export function movingIntent(s: MovingState, index: number): MovingIntent {
  const actor = s.actors[index];
  if (!actor) return { kind: 'search', target: null, label: 'Подойди к вещам' };
  if (actor.activity === 'alert-walk')
    return {
      kind: 'duty',
      target: null,
      label: 'Рабочий алерт · Ярик идёт к ноутбуку',
    };
  if (actor.activity === 'toilet-walk' || actor.activity === 'toilet')
    return {
      kind: 'duty',
      target: null,
      label:
        actor.activity === 'toilet'
          ? 'Минутка после шаурмы…'
          : 'Ярик отлучится на минутку',
    };
  if (actor.activity === 'laptop')
    return {
      kind: 'laptop',
      target: null,
      label: 'Разобрать рабочий алерт',
      hold: true,
    };
  if (actor.activity === 'rest')
    return { kind: 'rest', target: actor.id, label: 'Отложить рилсы и встать' };
  if (actor.bagId !== null)
    return {
      kind: 'travel',
      target: actor.bagId,
      label: 'К двери · вдвоём легче',
    };
  if (actor.heldItem !== null) {
    const item = itemById(s, actor.heldItem)!;
    if (actor.packingBag !== null)
      return {
        kind: 'pack',
        target: actor.packingBag,
        label: `Упаковать: ${item.label}`,
        hold: true,
      };
    const bags = s.bags.filter(
      (b) => b.status === 'open' || b.status === 'closed',
    );
    const nearby = bags.filter((b) => distance(actor, b) <= REACH);
    const fits = nearby.filter((b) => b.weight + item.weight <= b.capacity);
    const bag = nearest(actor, fits.length ? fits : nearby);
    if (!bag) return { kind: 'search', target: null, label: 'К жёлтой сумке' };
    if (bag.weight + item.weight > bag.capacity)
      return {
        kind: 'blocked',
        target: bag.id,
        label: `Не влезает · ${bag.weight}/${bag.capacity} кг`,
      };
    if (bag.status === 'closed')
      return {
        kind: 'reopen',
        target: bag.id,
        label: 'Открыть сумку для этой вещи',
      };
    return {
      kind: 'pack',
      target: bag.id,
      label: `Уложить: ${bag.weight + item.weight}/${bag.capacity} кг`,
      hold: true,
    };
  }
  if (actor.zipping !== null)
    return {
      kind: 'zip',
      target: actor.zipping,
      label: 'Застегнуть молнию',
      hold: true,
    };
  const sofa = movingStations.sofa[index];
  if (
    sofa &&
    distance(actor, sofa) <= 26 &&
    (actor.stamina < 90 ||
      !s.bags.some(
        (b) =>
          b.weight > 0 &&
          b.status !== 'delivered' &&
          distance(actor, b) <= REACH,
      ))
  )
    return {
      kind: 'rest',
      target: index,
      label: 'Сесть на диван · смотреть рилсы',
    };
  const choices = [
    ...s.items
      .filter((item) => item.status === 'floor')
      .map((item) => ({
        ...item,
        intent: {
          kind: 'item' as const,
          target: item.id,
          label: `${item.label} · ${item.weight} кг`,
        },
      })),
    ...s.bags
      .filter(
        (b) =>
          b.weight > 0 && b.status !== 'delivered' && b.carriers.length < 2,
      )
      .map((bag) => {
        const kind =
          bag.status === 'open'
            ? 'zip'
            : bag.status === 'carried'
              ? 'join'
              : s.chapter === 'packing'
                ? 'reopen'
                : 'carry';
        return {
          ...bag,
          intent: {
            kind: kind as MovingIntent['kind'],
            target: bag.id,
            label:
              kind === 'zip'
                ? `Молния · ${bag.weight}/${bag.capacity} кг`
                : kind === 'join'
                  ? 'Взять вторую ручку'
                  : kind === 'reopen'
                    ? 'Открыть · сначала упакуем все вещи'
                    : `Поднять сумку · ${bag.weight} кг`,
            hold: kind === 'zip',
          },
        };
      }),
  ];
  const intent = nearest(actor, choices)?.intent;
  if (
    intent &&
    (intent.kind === 'carry' || intent.kind === 'join') &&
    !carrySetup(s, actor, bagById(s, intent.target)!).clear
  )
    return {
      kind: 'search',
      target: intent.target,
      label: 'Подойди к ручке со свободной стороны.',
    };
  return (
    intent ?? {
      kind: 'search',
      target: null,
      label:
        s.chapter === 'packing'
          ? 'Подойди к вещи или сумке'
          : 'Застегни сумки и отнеси к двери',
    }
  );
}

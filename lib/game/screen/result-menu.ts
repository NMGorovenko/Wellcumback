import type { PadDirection } from '../input/gamepads.ts';

export type ScreenResultAction = 'next' | 'exit' | 'restart';
export type ScreenResultOption = {
  id: ScreenResultAction;
  label: string;
};
/** Mouse and gamepad share the same visible order. */
export function screenResultMenu(hasNext: boolean): ScreenResultOption[] {
  return [
    ...(hasNext
      ? [{ id: 'next' as const, label: 'В машину · дальше по городу' }]
      : []),
    { id: 'exit', label: hasNext ? 'К итогам вечера' : 'К другим историям' },
    { id: 'restart', label: 'Переделаем нормально' },
  ];
}
export function runScreenResultAction(
  id: ScreenResultAction,
  actions: { onNext?: () => void; onExit: () => void; restart: () => void },
) {
  if (id === 'restart') actions.restart();
  else if (id === 'next') (actions.onNext ?? actions.onExit)();
  else actions.onExit();
}
export function moveScreenResultChoice(
  index: number,
  direction: PadDirection,
  options: readonly ScreenResultOption[],
) {
  const delta = direction === 'up' || direction === 'left' ? -1 : 1;
  return (index + delta + options.length) % options.length;
}

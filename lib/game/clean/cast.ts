/** Story identities are independent of network membership and keyboard slots. */
export const cleanCrew = [
  { id: 'relief', name: 'Сослуживец' },
  { id: 'roma', name: 'Рома' },
  { id: 'orderly', name: 'Боец' },
] as const;
const soldier = { id: 'soldier', name: 'Солдат' } as const;
export type CleanRole = (typeof cleanCrew)[number] | typeof soldier;
export type CleanCastState = { phase: string; players: number };
export function cleanRole(state: CleanCastState, actor: number): CleanRole {
  if (actor === 0) {
    if (!['clean', 'result'].includes(state.phase)) return soldier;
    return state.players === 1 ? cleanCrew[1] : cleanCrew[0];
  }
  return cleanCrew[actor] ?? cleanCrew[2];
}
export const cleanCast = (state: CleanCastState) =>
  Array.from({ length: state.players }, (_, actor) => cleanRole(state, actor));
export const isRomaWitness = (_players: number, npc: number) => npc === 1;
export const cleanActiveActorCount = (s: CleanCastState) =>
  ['clean', 'result'].includes(s.phase) ? s.players : 1;

export const ROMA_WASHER_LINE =
  'ебаный рот это казино, ты нахуя обосранные штаны в машинку засунул ? Пиздааа';
export const WASHER_ORDER_LINE =
  'ахуеть вы сделали - быстро надели химзащиту и отмыли все и машинку и полы обосрыши ебаные';

export function cleanNpcVisible(
  s: { phase: string; pantsLoaded: boolean; responseStage: string },
  npc: number,
) {
  if (npc === 0) return true;
  if (['clean', 'result'].includes(s.phase) || !s.pantsLoaded) return false;
  return (
    npc === 1 || ['order-approach', 'order', 'gear'].includes(s.responseStage)
  );
}

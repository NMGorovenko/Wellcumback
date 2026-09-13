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
export const isRomaWitness = (players: number, npc: number) =>
  players === 1 && npc === 1;

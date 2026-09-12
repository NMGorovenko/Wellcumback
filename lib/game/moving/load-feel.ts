import type { MovingState } from './types.ts';
const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));

/** Presentation only. Load is shared by real handle owners; no renderer offset
 * can move a collision body, drain stamina, or change the luggage footprint. */
export function movingLoadFeel(s: MovingState, index: number) {
  const actor = s.actors[index];
  const bag = s.bags.find((b) => b.id === actor.bagId);
  const item = s.items.find((i) => i.id === actor.heldItem);
  const load = bag
    ? bag.weight / Math.max(1, bag.carriers.length)
    : (item?.weight ?? 0);
  const tired = 1 - clamp(actor.stamina / 100);
  const strain = load > 0 ? clamp((load / 18) * 0.8 + tired * 0.2) : 0;
  const walking = Math.hypot(actor.vx, actor.vy) > 0.001;
  const wave = Math.sin(s.elapsed * (7.8 - strain * 1.8) + index * 0.45);
  return {
    load,
    strain,
    lean: load > 0 ? (0.018 + strain * 0.052) * (walking ? 1 : 0.65) : 0,
    sway: walking && load > 0 ? wave * (0.007 + strain * 0.017) : 0,
    bob: walking && load > 0 ? wave * (0.008 + strain * 0.018) : 0,
    crouch: load > 0 ? strain * 0.072 : 0,
    carryHeight: 0.46 - strain * 0.045,
  };
}
export function movingGripSettle(age: number) {
  const t = clamp(age / 0.32);
  return t * t * (3 - 2 * t);
}

import * as THREE from 'three';
import type { RenderKit } from '../world/render-kit';
import type { CharacterRig } from '../world/rig';
import type { GameState } from '@/lib/game/screen/engine';
import { levelCheck, LEVEL_SHELF } from '../../../lib/game/screen/level-check.ts';

const gripOffset = new THREE.Vector3(-0.18, 0, 0);
/** Both the hand animation and attached prop use this one grip. Right is on the
 * left of the world while Yarik faces the wall; never cross his arms. */
export function placeLevelHands(
  s: GameState,
  rig: CharacterRig,
  target: THREE.Vector3,
) {
  const c = levelCheck(s);
  if (c.mode === 'fetch' || c.mode === 'celebrate') return;
  rig.root.updateWorldMatrix(true, true);
  const home = rig.root.localToWorld(new THREE.Vector3(0.28, 1.04, 0.23));
  if (c.mode === 'pickup') {
    const shelfGrip = new THREE.Vector3().copy(LEVEL_SHELF).add(gripOffset);
    home.lerp(shelfGrip, Math.sin(Math.PI * c.progress));
  } else if (c.mode === 'place')
    home.lerp(target.clone().add(gripOffset), c.progress);
  else if (c.mode === 'settle') home.copy(target).add(gripOffset);
  rig.reach('right', home);
  if (c.mode === 'settle') rig.reach('left', target.clone().sub(gripOffset));
}

/** A held prop, then an actual bubble level resting on the top rail. */
export function createSpiritLevel(kit: RenderKit) {
  const root = new THREE.Group();
  kit.scene.add(root);
  kit.box(0.7, 0.065, 0.09, '#e1b93a', 0, 0, 0, root, 0.012);
  for (const x of [-0.32, 0.32])
    kit.box(0.06, 0.075, 0.1, '#282e30', x, 0, 0, root, 0.01);
  kit.box(0.22, 0.014, 0.072, '#345f45', 0, 0.04, 0, root, 0.005);
  const bubble = kit.sphere(
    0.025,
    0.009,
    0.027,
    '#e3ffc5',
    0,
    0.052,
    0,
    root,
    12,
  );
  for (const x of [-0.042, 0.042])
    kit.box(0.004, 0.003, 0.072, '#1e302c', x, 0.052, 0, root);
  const hand = new THREE.Vector3();
  return {
    root,
    update(
      s: GameState,
      rig: CharacterRig,
      target: THREE.Vector3,
      angle: number,
    ) {
      const c = levelCheck(s);
      const placed =
        (['settle', 'celebrate'].includes(c.mode) && s.phase === 'level') ||
        (s.phase === 'result' && c.mode === 'celebrate');
      const shelf =
        !placed &&
        (s.phase !== 'level' ||
          c.mode === 'fetch' ||
          (c.mode === 'pickup' && c.progress < 0.5));
      root.rotation.set(0, 0, placed ? angle : 0);
      if (shelf) root.position.copy(LEVEL_SHELF);
      else if (placed) root.position.copy(target);
      else {
        rig.rightHand.getWorldPosition(hand);
        root.position.copy(hand).sub(gripOffset);
        root.rotation.z = c.mode === 'place' ? angle * c.progress : 0;
      }
      bubble.position.x = placed
        ? THREE.MathUtils.clamp(s.bubble * 2, -0.078, 0.078)
        : 0;
    },
  };
}

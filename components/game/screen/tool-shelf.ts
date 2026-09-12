import * as THREE from 'three';
import type { RenderKit } from '../world/render-kit';
import { makeLabel } from '../world/labels.ts';

/** A real rack: the tools rest on the top deck, with boxes and a battery charger
 * below. The gameplay station supplies its placement in apartment metres. */
export function createToolShelf(
  kit: RenderKit,
  position: { x: number; y: number; z: number; width: number; depth: number },
) {
  const root = new THREE.Group();
  root.position.set(position.x, 0, position.z);
  root.scale.set(position.width / 1.12, 1, position.depth / 0.55);
  kit.scene.add(root);
  for (const x of [-0.52, 0.52])
    for (const z of [-0.23, 0.23]) {
      kit.box(0.038, 1.22, 0.038, '#3d4544', x, 0.61, z, root, 0.005);
      kit.box(0.07, 0.03, 0.07, '#242b29', x, 0.015, z, root, 0.007);
    }
  for (const y of [0.14, 0.53, position.y + 0.02]) {
    kit.box(1.12, 0.045, 0.55, '#926b43', 0, y, 0, root, 0.012);
    kit.box(1.13, 0.025, 0.015, '#baa078', 0, y + 0.006, 0.282, root, 0.004);
  }
  kit.rod(
    new THREE.Vector3(-0.5, 0.17, -0.245),
    new THREE.Vector3(0.5, 1.18, -0.245),
    0.014,
    '#4d5753',
    root,
  );
  kit.rod(
    new THREE.Vector3(0.5, 0.17, -0.245),
    new THREE.Vector3(-0.5, 1.18, -0.245),
    0.014,
    '#4d5753',
    root,
  );
  kit.box(0.56, 0.31, 0.38, '#ab936a', -0.2, 0.315, 0, root, 0.016);
  kit.box(0.055, 0.313, 0.382, '#d0b789', -0.2, 0.315, 0, root, 0.002);
  kit.box(0.32, 0.1, 0.29, '#354844', 0.26, 0.61, 0, root, 0.025);
  kit.box(0.15, 0.14, 0.11, '#263c35', 0.26, 0.71, 0.025, root, 0.018);
  kit.sphere(0.014, 0.01, 0.01, '#8bb66b', 0.37, 0.63, 0.15, root, 8);
  for (let i = 0; i < 4; i++)
    kit.box(
      0.22,
      0.045,
      0.23,
      ['#6f7976', '#b9b0a0'][i % 2],
      -0.3,
      0.58 + i * 0.046,
      -0.005,
      root,
      0.008,
    );
  const label = makeLabel(kit, 'ДРЕЛЬ · ПЫЛЕСОС', '#e1cf9c', 1.2);
  root.add(label);
  label.position.set(0, 1.43, 0);
  return { root, label };
}

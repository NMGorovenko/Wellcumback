import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY_YENISEY_SIGN } from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';

type Stroke = [number, number, number, number];
const strokes: Record<string, Stroke[]> = {
  Е: [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [0, 0.5, 0.8, 0.5],
    [0, 0, 1, 0],
  ],
  Н: [
    [0, 0, 0, 1],
    [1, 0, 1, 1],
    [0, 0.5, 1, 0.5],
  ],
  И: [
    [0, 0, 0, 1],
    [1, 0, 1, 1],
    [0, 0, 1, 1],
  ],
  С: [
    [1, 0.95, 0.2, 1],
    [0.2, 1, 0, 0.8],
    [0, 0.8, 0, 0.2],
    [0, 0.2, 0.2, 0],
    [0.2, 0, 1, 0.05],
  ],
  Й: [
    [0, 0, 0, 0.87],
    [1, 0, 1, 0.87],
    [0, 0, 1, 0.87],
    [0.25, 1.03, 0.5, 0.95],
    [0.5, 0.95, 0.75, 1.03],
  ],
  К: [
    [0, 0, 0, 1],
    [0, 0.5, 1, 1],
    [0, 0.5, 1, 0],
  ],
  А: [
    [0, 0, 0.5, 1],
    [0.5, 1, 1, 0],
    [0.22, 0.42, 0.78, 0.42],
  ],
  Я: [
    [1, 0, 1, 1],
    [1, 1, 0.15, 1],
    [0.15, 1, 0, 0.85],
    [0, 0.85, 0, 0.6],
    [0, 0.6, 0.15, 0.5],
    [0.15, 0.5, 1, 0.5],
    [0.65, 0.5, 0, 0],
  ],
  Б: [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [0, 0.52, 0.8, 0.52],
    [0.8, 0.52, 1, 0.4],
    [1, 0.4, 1, 0.12],
    [1, 0.12, 0.8, 0],
    [0.8, 0, 0, 0],
  ],
  Р: [
    [0, 0, 0, 1],
    [0, 1, 0.8, 1],
    [0.8, 1, 1, 0.85],
    [1, 0.85, 1, 0.65],
    [1, 0.65, 0.8, 0.5],
    [0.8, 0.5, 0, 0.5],
  ],
  Ь: [
    [0, 0, 0, 1],
    [0, 0.52, 0.8, 0.52],
    [0.8, 0.52, 1, 0.4],
    [1, 0.4, 1, 0.12],
    [1, 0.12, 0.8, 0],
    [0.8, 0, 0, 0],
  ],
};

/** Physical letters on the hillside, facing the river rather than the camera. */
export function createYeniseySign(kit: RenderKit, root: THREE.Group) {
  const p = CITY_YENISEY_SIGN,
    g = new THREE.Group();
  g.name = 'yenisey-siberia-sign';
  g.position.set(p.x, 0, p.z);
  g.rotation.y = p.angle;
  root.add(g);
  const text = 'ЕНИСЕЙСКАЯ СИБИРЬ';
  const extent =
    text.split('').reduce((sum, c) => sum + (c === ' ' ? 0.7 : 1.2), 0) - 0.2;
  const sx = p.width / extent,
    h = p.height;
  const white = new THREE.MeshStandardMaterial({
    color: '#e7f1ec',
    emissive: '#648eae',
    emissiveIntensity: 0.22,
    roughness: 0.55,
  });
  kit.materials.add(white);
  let cursor = -p.width / 2;
  for (const c of text) {
    if (c === ' ') {
      cursor += sx * 0.7;
      continue;
    }
    const parts = strokes[c].map(([x1, y1, x2, y2], i) => {
      const dx = (x2 - x1) * sx,
        dy = (y2 - y1) * h;
      const geometry = new THREE.BoxGeometry(
        Math.hypot(dx, dy) + h * 0.07,
        h * 0.075,
        0.32,
      );
      geometry.rotateZ(Math.atan2(dy, dx));
      geometry.translate(
        ((x1 + x2) / 2 - 0.5) * sx,
        1 + ((y1 + y2) * h) / 2,
        i * 0.002,
      );
      return geometry;
    });
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    const letter = kit.mesh(geometry, white, g);
    letter.name = `yenisey:letter:${c}`;
    letter.position.x = cursor + sx / 2;
    // Each letter is a single mesh so terrain placement preserves its shape.
    kit.box(0.14, 1.08, 0.14, '#68746d', cursor + sx / 2, 0.54, -0.14, g, 0);
    cursor += sx * 1.2;
  }
  return g;
}

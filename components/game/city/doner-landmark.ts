import * as THREE from 'three';
import type { CityBuilding } from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { facadeText } from './facade-text.ts';

export function createDonerLandmark(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
) {
  if (b.kind !== 'doner') return false;
  const g = new THREE.Group();
  g.name = 'landmark:doner';
  g.position.set(b.x, 0, b.z);
  root.add(g);
  const box = (
    w: number,
    h: number,
    d: number,
    color: string,
    x: number,
    y: number,
    z: number,
  ) => kit.box(w, h, d, color, x, y, z, g, 0);
  const front = b.d * 0.36;
  box(
    b.w * 0.94,
    b.h * 0.95,
    b.d * 0.84,
    '#29383b',
    0,
    b.h * 0.475,
    -b.d * 0.06,
  );
  box(b.w * 0.96, 0.14, b.d * 0.88, '#56616a', 0, b.h * 0.95, -b.d * 0.06);
  for (let x = -b.w * 0.45; x <= b.w * 0.45; x += 0.26)
    box(0.105, b.h * 0.92, 0.12, '#c3b192', x, b.h * 0.46, front + 0.07);
  // Dachnaya 28/1: long dark sign, central door and broad windows in a slightly
  // projecting black surround; the right-hand wall keeps its timber battens.
  const faceX = -b.w * 0.095,
    faceW = b.w * 0.7;
  box(faceW, b.h * 0.66, 0.18, '#8baca6', faceX, b.h * 0.345, front + 0.2);
  for (let i = -2; i <= 2; i++)
    box(
      0.11,
      b.h * 0.69,
      0.16,
      '#29383b',
      faceX + (i * faceW) / 4,
      b.h * 0.345,
      front + 0.32,
    );
  box(faceW, 0.12, 0.18, '#29383b', faceX, b.h * 0.52, front + 0.33);
  box(b.w * 0.125, b.h * 0.48, 0.1, '#6e949e', faceX, b.h * 0.25, front + 0.34);
  box(
    0.04,
    0.5,
    0.05,
    '#b6c1c0',
    faceX + b.w * 0.042,
    b.h * 0.25,
    front + 0.42,
  );
  box(faceW + 0.2, b.h * 0.2, 0.35, '#29383b', faceX, b.h * 0.805, front + 0.2);
  facadeText(
    kit,
    g,
    'ШАУРМА  DONER HOUSE',
    '#ecede6',
    faceW * 0.96,
    faceX,
    b.h * 0.81,
    front + 0.39,
  );
  box(b.w * 0.98, 0.12, b.d * 0.98, '#c8bdad', 0, 0.06, 0);
  return true;
}

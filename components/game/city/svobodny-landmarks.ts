import * as THREE from 'three';
import type { CityBuilding } from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { facadeText } from './facade-text.ts';

/** Recognisable masses from exterior photos; retail lettering is deliberately sparse. */
export function createSvobodnyLandmark(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
) {
  if (!['na-svobodnom', 'mixmax', 'ttx'].includes(b.kind ?? '')) return false;
  const g = new THREE.Group();
  g.name = `landmark:${b.kind}`;
  g.position.set(b.x, 0, b.z);
  root.add(g);
  const turned = b.kind !== 'na-svobodnom';
  if (turned) g.rotation.y = b.kind === 'mixmax' ? -Math.PI / 2 : Math.PI / 2;
  const w = turned ? b.d : b.w,
    d = turned ? b.w : b.d,
    h = b.h,
    front = d / 2;
  const box = (
    w: number,
    h: number,
    d: number,
    c: string,
    x: number,
    y: number,
    z: number,
  ) => kit.box(w, h, d, c, x, y, z, g, 0);
  const text = (
    s: string,
    c: string,
    w: number,
    x: number,
    y: number,
    z: number,
  ) => facadeText(kit, g, s, c, w, x, y, z);
  const glass = '#66818e',
    frame = '#d4d9d6',
    roof = '#747b7b';
  function glazing(
    width: number,
    height: number,
    x: number,
    y: number,
    z: number,
  ) {
    box(width, height, 0.14, glass, x, y, z);
    for (
      let dx = -width / 2;
      dx <= width / 2 + 0.01;
      dx += width / Math.ceil(width / 3)
    )
      box(0.11, height, 0.18, frame, x + dx, y, z + 0.08);
    for (
      let dy = -height / 2;
      dy <= height / 2 + 0.01;
      dy += height / Math.ceil(height / 3)
    )
      box(width, 0.1, 0.18, frame, x, y + dy, z + 0.08);
  }
  if (b.kind === 'na-svobodnom') {
    // Long low wings, taller striped entrance block and large blue glass bay.
    box(w - 1, h * 0.7, d - 1, '#c4b79f', 0, h * 0.35, 0);
    box(w * 0.55, h, d * 0.5, '#d7c8ad', -w * 0.09, h / 2, d * 0.23);
    for (let y = 1; y < h; y += 2.2)
      box(w * 0.56, 0.5, 0.22, '#b5a890', -w * 0.09, y, front - 0.35);
    glazing(w * 0.27, h - 3, -w * 0.09, h / 2 + 0.7, front - 0.16);
    glazing(w * 0.27, 2.5, -w * 0.09, 1.35, front - 0.1);
    box(w * 0.3, 0.4, 3, '#647175', -w * 0.09, 3, front - 1.2);
    for (const x of [-w * 0.4, w * 0.32])
      glazing(w * 0.15, 2.6, x, 1.5, front - 0.36);
    box(w * 0.27, 1.6, 0.2, '#dfceb1', -w * 0.09, h + 0.4, front - 1);
    text('НА СВОБОДНОМ', '#8b4431', w * 0.24, -w * 0.09, h + 0.4, front - 0.82);
    text(
      'ТОРГОВЫЙ КВАРТАЛ',
      '#314b61',
      w * 0.24,
      -w * 0.09,
      h - 2,
      front + 0.02,
    );
    box(w * 0.2, 1.5, 0.16, '#843d37', w * 0.31, h * 0.7 - 1.6, front - 0.3);
    text('КИНО', '#f1dfc1', w * 0.12, w * 0.31, h * 0.7 - 1.6, front - 0.19);
  } else if (b.kind === 'mixmax') {
    // Converted industrial slab with narrow ribbon windows and projecting
    // mirror-glass entrance tower, not a generic shopping box.
    box(w - 1, h - 5, d - 2, '#a0a6a6', 0, (h - 5) / 2, -0.5);
    for (let y = 3; y < h - 4; y += 3.5) {
      glazing(w - 2, 1.25, 0, y, front - 1.4);
      box(w - 1, 0.18, d - 1, '#c2c6c4', 0, y + 1.2, -0.5);
    }
    box(11, h, d * 0.28, '#889eaa', w * 0.12, h / 2, front - d * 0.15);
    glazing(10, h - 1, w * 0.12, h / 2, front - 0.1);
    box(16, 0.45, 5, '#66757a', w * 0.12, 4, front - 2);
    box(14, 1.8, 0.2, '#b44843', w * 0.12, 3, front + 0.05);
    text('MixMax', '#fff5df', 11, w * 0.12, 3, front + 0.2);
    text('MixMax', '#ba423d', 17, -w * 0.23, h - 3, front - 1.2);
    for (let x = -w * 0.42; x < -w * 0.12; x += 4) {
      box(0.12, 7, 0.12, '#bcc4c5', x, 3.5, front - 0.05);
      box(1.4, 4, 0.12, '#b74643', x + 0.7, 5, front - 0.05);
    }
  } else {
    // Four levels, pale stone base, recessed glazing and copper upper corners.
    box(w - 1, h - 4.5, d - 1, '#dddacf', 0, (h - 4.5) / 2, 0);
    box(w - 4, 4.5, d - 4, '#9b7057', 0, h - 2.25, -0.5);
    glazing(w - 10, 4, 0, h - 2.4, front - 2.2);
    glazing(w * 0.48, 3.8, 0, 2.2, front - 0.35);
    for (const x of [-w * 0.4, w * 0.4])
      for (const y of [2, 6, 10]) glazing(2.2, 1.5, x, y, front - 0.34);
    box(w - 3, 0.2, d - 3, roof, 0, h, -0.5);
    for (const x of [-w * 0.3, -w * 0.1, w * 0.1, w * 0.3]) {
      const skylight = box(4, 0.6, 5, '#d3dbdc', x, h + 0.45, 0);
      skylight.rotation.x = 0.14;
    }
    text('TTX', '#b34529', 14, 0, h - 1.4, front - 2.03);
    box(w * 0.35, 0.3, 3, '#8b8176', 0, 4.2, front - 1.5);
  }
  // Simple roof plant and service doors retain readable rear/side silhouettes.
  for (const x of [-w * 0.27, w * 0.29])
    box(
      4,
      0.9,
      3,
      '#89908e',
      x,
      (b.kind === 'na-svobodnom' ? h * 0.7 : b.kind === 'mixmax' ? h - 5 : h) +
        0.45,
      -d * 0.2,
    );
  box(3, 3, 0.14, '#707a79', -w * 0.3, 1.5, -d / 2 + 0.4);
  return true;
}

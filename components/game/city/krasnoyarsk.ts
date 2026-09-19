import * as THREE from 'three';
import {
  CITY_BOUNDS,
  type CityBuilding,
} from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';

const C = {
  stone: '#d4d2b7',
  trim: '#e4dfc0',
  roof: '#536c69',
  dark: '#40545a',
  brick: '#ad806b',
  tree: '#708858',
  bark: '#6c6650',
  rock: '#8f8c82',
};
function clockFace(
  kit: RenderKit,
  parent: THREE.Object3D,
  radius: number,
  y: number,
  z: number,
) {
  const dial = kit.cylinder(radius, radius, 0.08, C.trim, 0, y, z, parent);
  dial.rotation.x = Math.PI / 2;
  kit.torus(radius, 0.045, C.dark, 0, y, z + 0.06, parent);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const tick = kit.box(
      0.045,
      0.11,
      0.03,
      C.dark,
      Math.sin(a) * radius * 0.79,
      y + Math.cos(a) * radius * 0.79,
      z + 0.07,
      parent,
      0,
    );
    tick.rotation.z = -a;
  }
  kit.rod(
    new THREE.Vector3(0, y, z + 0.1),
    new THREE.Vector3(-radius * 0.5, y + radius * 0.3, z + 0.1),
    0.035,
    C.dark,
    parent,
  );
  kit.rod(
    new THREE.Vector3(0, y, z + 0.1),
    new THREE.Vector3(radius * 0.18, y + radius * 0.64, z + 0.1),
    0.025,
    C.dark,
    parent,
  );
}
/** Real landmark silhouettes compressed into existing building colliders. */
export function createCivicBuilding(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
  lit: THREE.Material,
) {
  if (b.kind !== 'theatre' && b.kind !== 'city-clock') return false;
  const g = new THREE.Group();
  g.position.set(b.x, 0, b.z);
  root.add(g);
  kit.box(b.w, 0.38, b.d, C.stone, 0, 0.2, 0, g, 0);
  if (b.kind === 'city-clock') {
    kit.box(5.8, 0.35, 5.8, C.trim, 0, 0.55, 0, g, 0);
    kit.box(3.8, 8, 3.8, '#cbb98d', 0, 4.7, 0, g, 0);
    for (const side of [-1, 1])
      for (const offset of [-1.73, 1.73]) {
        kit.box(0.15, 8, 0.17, C.trim, offset, 4.7, side * 1.92, g, 0);
        kit.box(0.17, 8, 0.15, C.trim, side * 1.92, 4.7, offset, g, 0);
      }
    kit.box(4.4, 0.4, 4.4, C.trim, 0, 8.8, 0, g, 0);
    kit.box(3.9, 2.45, 3.9, '#cbb98d', 0, 10.15, 0, g, 0);
    for (let i = 0; i < 4; i++) {
      const face = new THREE.Group();
      face.rotation.y = (i * Math.PI) / 2;
      g.add(face);
      clockFace(kit, face, 0.95, 10.1, 1.98);
    }
    const cap = kit.mesh(
      new THREE.ConeGeometry(3.05, 1.8, 4),
      kit.material(C.roof),
      g,
    );
    cap.position.y = 12.35;
    cap.rotation.y = Math.PI / 4;
    kit.cylinder(0.035, 0.1, 1.1, C.dark, 0, 13.7, 0, g);
  } else {
    kit.box(b.w - 0.3, 3.8, b.d - 0.2, C.stone, 0, 2.15, 0, g, 0);
    kit.box(b.w - 1.2, 2.65, 0.08, C.dark, 0, 1.95, b.d / 2, g, 0);
    for (let x = -b.w / 2 + 0.8; x < b.w / 2; x += 1.4) {
      kit.box(0.28, 3.25, 0.35, C.trim, x, 2.05, b.d / 2 + 0.16, g, 0);
      const pane = kit.box(
        0.08,
        2.5,
        0.09,
        '#f3d5a3',
        x + 0.54,
        1.95,
        b.d / 2 + 0.08,
        g,
        0,
      );
      pane.material = lit;
    }
    kit.box(b.w + 0.4, 0.5, b.d + 0.4, C.trim, 0, 4.35, 0, g, 0);
    kit.box(b.w - 1, 0.08, b.d - 1, C.roof, 0, 4.65, 0, g, 0);
    for (let x = -b.w / 2 + 0.3; x < b.w / 2; x += 0.65)
      kit.box(0.08, 0.36, 0.08, C.stone, x, 4.37, b.d / 2 + 0.26, g, 0);
    for (let j = 0; j < 3; j++)
      kit.box(
        b.w - 0.6,
        0.09,
        0.7 - j * 0.16,
        C.trim,
        0,
        0.3 + j * 0.1,
        b.d / 2 + 0.12 - j * 0.13,
        g,
        0,
      );
  }
  return true;
}

export function createStationRoof(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
) {
  const { x, z, w, d, h } = b;
  for (const side of [-1, 1]) {
    kit.box(3.6, 1.1, d, C.stone, x + side * (w / 2 - 2), h + 0.45, z, root, 0);
    kit.box(
      3.85,
      0.22,
      d + 0.25,
      C.roof,
      x + side * (w / 2 - 2),
      h + 1.1,
      z,
      root,
      0,
    );
    const face = new THREE.Group();
    face.position.set(x + side * (w / 2 - 2), 0, z + d / 2 + 0.2);
    root.add(face);
    clockFace(kit, face, 0.48, h + 0.45, 0);
  }
  kit.cylinder(1.8, 1.8, 0.5, C.trim, x, h + 2.1, z, root);
  const dome = kit.mesh(
    new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    kit.material(C.roof),
    root,
  );
  dome.position.set(x, h + 2.32, z);
  dome.scale.set(1.9, 1.35, 1.9);
  kit.cylinder(0.025, 0.16, 1.7, C.trim, x, h + 4.2, z, root);
}

/** Balconies, cornices and roof equipment stay within the known blocked parcel. */
export function createApartmentDetails(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
  index: number,
) {
  if (b.kind) return;
  const { x, z, w, d, h } = b;
  kit.box(w + 0.1, 0.35, d + 0.1, '#6e7e82', x, 0.19, z, root, 0);
  kit.box(w + 0.12, 0.16, d + 0.12, C.trim, x, h - 0.38, z, root, 0);
  const oldTown = b.style === 'heritage' || b.style === 'cottage';
  if (oldTown) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(0, 1.25);
    shape.lineTo(w / 2, 0);
    shape.closePath();
    const roof = kit.mesh(
      new THREE.ExtrudeGeometry(shape, {
        depth: d + 0.18,
        bevelEnabled: false,
      }),
      kit.material(index % 2 ? C.roof : '#805e51'),
      root,
    );
    roof.position.set(x, h + 0.16, z - d / 2 - 0.09);
    for (const side of [-1, 1])
      for (let column = 0; column < Math.floor(w / 2); column++) {
        const wx = x - w / 2 + 1.1 + column * 2;
        for (let floor = 0; floor < Math.max(2, Math.floor(h / 1.7)); floor++) {
          const y = 1 + (floor * (h - 1)) / Math.max(2, Math.floor(h / 1.7));
          kit.box(
            0.98,
            0.09,
            0.12,
            C.trim,
            wx,
            y + 0.48,
            z + side * (d / 2 + 0.07),
            root,
            0,
          );
          kit.box(
            0.98,
            0.08,
            0.15,
            C.trim,
            wx,
            y - 0.47,
            z + side * (d / 2 + 0.08),
            root,
            0,
          );
        }
      }
  } else {
    for (const side of [-1, 1])
      for (let floor = 1; floor < Math.floor(h / 1.7); floor++) {
        const y = 0.8 + floor * 1.65;
        const bx = x + (index % 2 ? 1 : -1) * (w * 0.23),
          bz = z + side * (d / 2 + 0.24);
        kit.box(1.5, 0.1, 0.65, C.trim, bx, y, bz, root, 0);
        kit.box(
          1.5,
          0.5,
          0.08,
          index % 2 ? '#8baca6' : C.brick,
          bx,
          y + 0.28,
          bz + side * 0.28,
          root,
          0,
        );
        for (const dx of [-0.69, 0.69])
          kit.box(0.06, 0.5, 0.5, C.dark, bx + dx, y + 0.27, bz, root, 0);
      }
    kit.box(w * 0.36, 0.42, d * 0.28, C.roof, x + 0.4, h + 0.36, z, root, 0);
    kit.cylinder(
      0.13,
      0.18,
      0.9,
      C.dark,
      x - w * 0.28,
      h + 0.5,
      z - d * 0.23,
      root,
    );
    for (let level = 1.75; level < h - 0.5; level += 1.75)
      kit.box(w + 0.05, 0.055, d + 0.05, '#aebec1', x, level, z, root, 0);
  }
  kit.box(1.8, 0.12, 1, C.roof, x, 1.95, z + d / 2 + 0.35, root, 0);
  for (const side of [-1, 1])
    kit.box(
      0.09,
      1.85,
      0.09,
      C.dark,
      x + side * 0.8,
      0.96,
      z + d / 2 + 0.7,
      root,
      0,
    );
}

function fir(
  kit: RenderKit,
  root: THREE.Object3D,
  x: number,
  z: number,
  size: number,
  y = 0,
) {
  kit.cylinder(
    0.08 * size,
    0.13 * size,
    size,
    C.bark,
    x,
    y + size * 0.5,
    z,
    root,
  );
  for (let layer = 0; layer < 3; layer++) {
    const crown = kit.mesh(
      new THREE.ConeGeometry(size * (0.55 - layer * 0.1), size * 1.1, 7),
      kit.material(layer % 2 ? '#5f8268' : C.tree),
      root,
    );
    crown.position.set(x, y + size * (1 + layer * 0.45), z);
  }
}
export function createNorthernChapel(kit: RenderKit, root: THREE.Group) {
  const x = -12,
    z = CITY_BOUNDS.minZ - 14;
  kit.sphere(14, 0.8, 16, '#a5b397', x, -0.8, z + 2, root, 18);
  kit.sphere(13, 5.5, 10, '#7d9470', x, 0.25, z, root, 18);
  kit.cylinder(2.8, 3.4, 0.4, C.stone, x, 5.5, z, root);
  const chapel = new THREE.Group();
  chapel.position.set(x, 5.7, z);
  root.add(chapel);
  kit.mesh(
    new THREE.CylinderGeometry(1.4, 1.5, 3.2, 8),
    kit.material(C.trim),
    chapel,
  ).position.y = 1.6;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    kit.box(
      0.15,
      3.1,
      0.15,
      C.stone,
      Math.sin(a) * 1.36,
      1.6,
      Math.cos(a) * 1.36,
      chapel,
      0,
    );
    if (i % 2 === 0) {
      const shape = new THREE.Shape();
      shape.moveTo(-0.29, 0);
      shape.lineTo(0.29, 0);
      shape.lineTo(0.29, 0.87);
      shape.absarc(0, 0.87, 0.29, 0, Math.PI, false);
      shape.lineTo(-0.29, 0);
      const window = kit.mesh(
        new THREE.ShapeGeometry(shape, 8),
        kit.material(C.dark),
        chapel,
      );
      window.position.set(Math.sin(a) * 1.45, 0.8, Math.cos(a) * 1.45);
      window.rotation.y = a;
    }
  }
  kit.mesh(
    new THREE.ConeGeometry(1.7, 2.1, 8),
    kit.material('#408e7c'),
    chapel,
  ).position.y = 4.2;
  kit.sphere(0.28, 0.42, 0.28, '#d6b46d', 0, 5.5, 0, chapel, 10);
  kit.box(0.075, 0.85, 0.075, '#d6b46d', 0, 6.1, 0, chapel, 0);
  kit.box(0.48, 0.07, 0.07, '#d6b46d', 0, 6.18, 0, chapel, 0);
  for (let j = 0; j < 7; j++)
    kit.box(
      2,
      0.12,
      0.65,
      C.stone,
      x,
      0.2 + j * 0.42,
      z + 10 - j * 0.85,
      root,
      0,
    );
  for (const dx of [-9, 8]) fir(kit, root, x + dx, z + 2, 1.5, 2);
}
export function createSiberianRidges(kit: RenderKit, root: THREE.Group) {
  const z = CITY_BOUNDS.maxZ + 15;
  for (
    let i = 0;
    i < Math.ceil((CITY_BOUNDS.maxX - CITY_BOUNDS.minX) / 150);
    i++
  ) {
    const x = CITY_BOUNDS.minX + i * 150;
    kit.sphere(
      100,
      40 + (i % 3) * 10,
      70,
      '#60816f',
      x,
      1,
      z + (i % 3) * 12,
      root,
      10,
    );
    for (let t = 0; t < 5; t++)
      fir(
        kit,
        root,
        x - 7 + t * 3.4,
        z - 4 + (t % 2) * 5,
        2.1 + (t % 3) * 0.3,
        4.8 + (i % 3) * 0.8,
      );
  }
  // Southwestern right-bank rocks interrupt the soft wooded ridge instead of repeating peaks.
  for (let j = 0; j < 9; j++) {
    const rock = kit.mesh(
      new THREE.DodecahedronGeometry(1, 0),
      kit.material(j % 2 ? C.rock : '#a69c89'),
      root,
    );
    rock.scale.set(2.6 + (j % 2), 5 + (j % 3), 2.2);
    rock.position.set(
      -83 + j * 3.2,
      7 + (j % 3) * 1.5,
      z - 1 + Math.sin(j) * 2,
    );
    rock.rotation.z = (j - 4) * 0.07;
  }
}

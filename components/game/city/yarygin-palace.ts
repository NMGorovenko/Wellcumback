import * as THREE from 'three';
import type { CityBuilding } from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { facadeText } from './facade-text.ts';

type PointAt = (angle: number, fraction: number) => THREE.Vector3;

/** A continuous strip, with normals derived from its actual curved faces. */
function strip(
  kit: RenderKit,
  group: THREE.Group,
  name: string,
  color: string,
  point: PointAt,
  from = 0,
  to = Math.PI * 2,
  around = 80,
  across = 6,
) {
  const positions: number[] = [],
    indices: number[] = [];
  for (let j = 0; j <= across; j++)
    for (let i = 0; i <= around; i++)
      positions.push(
        ...point(from + ((to - from) * i) / around, j / across).toArray(),
      );
  for (let j = 0; j < across; j++)
    for (let i = 0; i < around; i++) {
      const a = j * (around + 1) + i,
        b = a + around + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // Cache the two-sided palette separately: changing a shared city material
  // would also change unrelated buildings that happen to use the same color.
  const materialKey = `${color}/yarygin-double-sided`;
  let material = kit.cache.get(materialKey);
  if (!material) {
    material = kit.material(color).clone();
    material.side = THREE.DoubleSide;
    kit.cache.set(materialKey, material);
  }
  const mesh = kit.mesh(geometry, material, group);
  mesh.name = name;
  return mesh;
}

function createMonument(kit: RenderKit, parent: THREE.Group, b: CityBuilding) {
  const monument = new THREE.Group();
  monument.name = 'yarygin:monument';
  monument.position.set(0, 0, b.d * 0.437);
  parent.add(monument);
  const bronze = '#5b6556';
  kit.box(3.4, 0.25, 2.5, '#a5a59a', 0, 0.125, 0, monument, 0);
  kit.box(2.6, 0.25, 2, '#c2c0b2', 0, 0.375, 0, monument, 0);
  kit.box(1.65, 2.8, 1.25, '#aaa992', 0, 1.9, 0, monument, 0);
  kit.box(1.9, 0.25, 1.5, '#d1ccbb', 0, 3.425, 0, monument, 0);
  // A small original low-poly athlete silhouette, not a scan of the sculpture.
  const torso = kit.cylinder(0.43, 0.29, 0.9, bronze, 0, 4.85, 0, monument);
  torso.scale.z = 0.55;
  kit.sphere(0.2, 0.25, 0.2, bronze, 0, 5.6, 0.02, monument, 10);
  kit.cylinder(0.1, 0.12, 0.25, bronze, 0, 5.34, 0, monument);
  const limb = (a: number[], c: number[], radius: number) =>
    kit.rod(
      new THREE.Vector3(...a),
      new THREE.Vector3(...c),
      radius,
      bronze,
      monument,
    );
  for (const side of [-1, 1]) {
    limb([side * 0.19, 4.45, 0], [side * 0.34, 3.68, 0.05], 0.12);
    limb([side * 0.4, 5.13, 0], [side * 0.57, 4.68, 0.08], 0.105);
    limb([side * 0.57, 4.68, 0.08], [side * 0.39, 4.43, 0.18], 0.085);
    kit.box(0.23, 0.12, 0.4, bronze, side * 0.34, 3.61, 0.13, monument, 0);
  }
}

/** Ivan Yarygin Palace on Otdykha Island, from the operator's exterior photos.
 * The boat-like shell and entrance composition are interpreted at game scale;
 * see docs/yarygin-palace-reference.md for sources and limits. */
export function createYaryginPalace(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
) {
  if (b.kind !== 'arena') return false;
  const g = new THREE.Group();
  g.name = 'landmark:arena';
  g.userData.landmarkName = 'Дворец спорта имени Ивана Ярыгина';
  g.position.set(b.x, 0, b.z);
  root.add(g);
  const rx = b.w * 0.478,
    rz = b.d * 0.355,
    cz = -b.d * 0.074;
  const bottom = b.h * 0.265;
  const rimHeight = (a: number) =>
    b.h * (0.59 + 0.385 * Math.abs(Math.cos(a)) ** 5);
  const hull = (a: number, v: number, extra = 0) => {
    const spread = 0.945 + 0.055 * Math.sin((v * Math.PI) / 2);
    return new THREE.Vector3(
      (rx * spread + extra) * Math.sin(a),
      bottom + (rimHeight(a) - bottom) * v,
      cz + (rz * spread + extra) * Math.cos(a),
    );
  };
  strip(kit, g, 'yarygin:curved-hull', '#d0d6d4', (a, v) => hull(a, v));
  // A shallow continuous saddle roof follows the changing perimeter height.
  // It has raised front/back tips, rather than an oval cylinder with a box lid.
  strip(
    kit,
    g,
    'yarygin:curved-roof',
    '#bec9c8',
    (a, r) =>
      new THREE.Vector3(
        rx * r * Math.sin(a),
        b.h * 0.745 + (rimHeight(a) - b.h * 0.745) * r * r,
        cz + rz * r * Math.cos(a),
      ),
    0,
    Math.PI * 2,
    80,
    10,
  );
  strip(
    kit,
    g,
    'yarygin:roof-edge',
    '#f0efdf',
    (a, v) => {
      const p = hull(a, 1, 0.06);
      p.y -= v * 0.22;
      return p;
    },
    0,
    Math.PI * 2,
    80,
    1,
  );

  // Thin panel joints run up the flared wall, following its true curved shape.
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    strip(
      kit,
      g,
      'yarygin:panel-joint',
      '#acbab9',
      (angle, v) => hull(angle, v, 0.012),
      a - 0.0007,
      a + 0.0007,
      1,
      6,
    );
  }
  // The tall narrow glazed seam meets the highest front tip.
  strip(
    kit,
    g,
    'yarygin:glazed-seam',
    '#4d7783',
    (a, v) => hull(a, v, 0.025),
    -0.032,
    0.032,
    4,
    8,
  );
  for (let i = 1; i < 7; i++)
    strip(
      kit,
      g,
      'yarygin:seam-mullion',
      '#bcc9c8',
      (a, v) => hull(a, i / 7 + v * 0.005, 0.035),
      -0.032,
      0.032,
      4,
      1,
    );

  const windowCount = 42;
  const framesGeometry = new THREE.CircleGeometry(0.42, 16);
  const windowsGeometry = new THREE.CircleGeometry(0.32, 16);
  kit.geometries.add(framesGeometry);
  kit.geometries.add(windowsGeometry);
  const frames = new THREE.InstancedMesh(
    framesGeometry,
    kit.material('#9faead'),
    windowCount,
  );
  const windows = new THREE.InstancedMesh(
    windowsGeometry,
    kit.material('#466778'),
    windowCount,
  );
  frames.name = 'yarygin:porthole-frames';
  windows.name = 'yarygin:portholes';
  g.add(frames, windows);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < windowCount; i++) {
    const a = ((i + 0.5) / windowCount) * Math.PI * 2;
    const v = (b.h * 0.442 - bottom) / (rimHeight(a) - bottom);
    dummy.rotation.y = Math.atan2(Math.sin(a) / rx, Math.cos(a) / rz);
    dummy.position.copy(hull(a, v, 0.028));
    dummy.updateMatrix();
    frames.setMatrixAt(i, dummy.matrix);
    dummy.position.copy(hull(a, v, 0.039));
    dummy.updateMatrix();
    windows.setMatrixAt(i, dummy.matrix);
  }
  frames.computeBoundingSphere();
  windows.computeBoundingSphere();

  const galleryRx = b.w * 0.47,
    galleryRz = b.d * 0.368;
  strip(
    kit,
    g,
    'yarygin:entrance-gallery',
    '#3d6471',
    (a, v) =>
      new THREE.Vector3(
        galleryRx * Math.sin(a),
        0.3 + v * (bottom - 0.3),
        cz + galleryRz * Math.cos(a),
      ),
  );
  // The low overhang projects towards the forecourt above the glass doors.
  const canopyRz = galleryRz + 2.1;
  strip(
    kit,
    g,
    'yarygin:entrance-canopy',
    '#e6e7df',
    (a, r) =>
      new THREE.Vector3(
        b.w * 0.481 * Math.sin(a),
        bottom + 0.12 + 0.09 * r,
        cz + (galleryRz - 1.2 + r * 3.3) * Math.cos(a),
      ),
    -Math.PI / 2,
    Math.PI / 2,
    48,
    1,
  );
  strip(
    kit,
    g,
    'yarygin:canopy-fascia',
    '#d5d9cf',
    (a, v) =>
      new THREE.Vector3(
        b.w * 0.481 * Math.sin(a),
        bottom - 0.15 + v * 0.36,
        cz + canopyRz * Math.cos(a),
      ),
    -Math.PI / 2,
    Math.PI / 2,
    48,
    1,
  );
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    kit.box(
      0.08,
      bottom - 0.3,
      0.1,
      '#c1ccc8',
      galleryRx * Math.sin(a),
      (bottom + 0.3) / 2,
      cz + galleryRz * Math.cos(a) + 0.06,
      g,
      0,
    ).rotation.y = a;
  }
  for (let i = 0; i < 3; i++)
    kit.box(
      b.w * (0.37 - i * 0.015),
      0.08,
      0.5,
      '#c4c5b9',
      0,
      0.04 + i * 0.08,
      cz + galleryRz + 0.95 - i * 0.5,
      g,
      0,
    );
  const inscription = facadeText(
    kit,
    g,
    'ДВОРЕЦ СПОРТА ИМЕНИ ИВАНА ЯРЫГИНА',
    '#455e66',
    b.w * 0.54,
    0,
    bottom + 0.31,
    cz + canopyRz + 0.025,
  );
  // Long facade lettering stays a shallow architectural band at this scale.
  if (inscription) inscription.scale.y = 0.23;
  createMonument(kit, g, b);
  return true;
}

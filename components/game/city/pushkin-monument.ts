import * as THREE from 'three';
import type { CityBuilding } from '../../../lib/game/city/layout.ts';
import {
  PUSHKIN_MONUMENT,
  PUSHKIN_MONUMENT_NAME,
} from '../../../lib/game/city/pushkin-landmark.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { facadeText } from './facade-text.ts';

/** Three-winged pale rotunda, twelve columns and the two bronze figures.
 * The silhouette follows the Mira / Kirova monument, not the drama theatre. */
export function createPushkinMonument(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
) {
  if (b.kind !== PUSHKIN_MONUMENT.kind) return false;
  const g = new THREE.Group();
  g.name = 'landmark:pushkin-monument';
  g.userData.landmarkName = PUSHKIN_MONUMENT_NAME;
  g.position.set(b.x, 0, b.z);
  root.add(g);
  // Reuse the neighbouring theatre / Apollo palette so city batching adds
  // only the inscription's draw call, not a new material for every shade.
  const stone = '#e4dfd3',
    trim = '#c8bdad',
    bronze = '#5e6658';

  // At this scale eight-sided shafts and low-poly heads retain the silhouette.
  // Register every geometry through the kit so normal city batching disposes it.
  function cylinder(
    top: number,
    bottom: number,
    height: number,
    color: string,
    x: number,
    y: number,
    z: number,
    parent: THREE.Group,
  ) {
    const mesh = kit.mesh(
      new THREE.CylinderGeometry(top, bottom, height, 8),
      kit.material(color),
      parent,
    );
    mesh.position.set(x, y, z);
    return mesh;
  }
  function sphere(
    xRadius: number,
    yRadius: number,
    zRadius: number,
    color: string,
    x: number,
    y: number,
    z: number,
    parent: THREE.Group,
    segments = 8,
  ) {
    const mesh = kit.mesh(
      new THREE.SphereGeometry(1, segments, 6),
      kit.material(color),
      parent,
    );
    mesh.scale.set(xRadius, yRadius, zRadius);
    mesh.position.set(x, y, z);
    return mesh;
  }
  function rod(
    from: THREE.Vector3,
    to: THREE.Vector3,
    radius: number,
    color: string,
    parent: THREE.Group,
  ) {
    const delta = to.clone().sub(from);
    const mesh = cylinder(
      radius,
      radius,
      delta.length(),
      color,
      0,
      0,
      0,
      parent,
    );
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return mesh;
  }

  // The roof is a flat, three-lobed canopy with open views between its wings.
  // The same plan makes the three shallow steps and their curved front edges.
  function slab(scale: number, height: number, y: number, color: string) {
    const outline = new THREE.Shape();
    for (let i = 0; i <= 48; i++) {
      const a = (i * Math.PI * 2) / 48,
        r = (3.5 + 0.65 * Math.cos(a * 3)) * scale,
        x = Math.sin(a) * r,
        z = Math.cos(a) * r;
      if (i === 0) outline.moveTo(x, -z);
      else outline.lineTo(x, -z);
    }
    outline.closePath();
    const geometry = new THREE.ExtrudeGeometry(outline, {
      depth: height,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    const mesh = kit.mesh(geometry, kit.material(color), g);
    mesh.position.y = y;
    return mesh;
  }
  slab(1.22, 0.16, 0, trim).name = 'pushkin:bottom-step';
  slab(1.14, 0.16, 0.16, stone);
  slab(1.06, 0.17, 0.32, stone);

  const columns = new THREE.Group();
  columns.name = 'pushkin:columns';
  g.add(columns);
  for (let wing = 0; wing < 3; wing++) {
    const a = (wing * Math.PI * 2) / 3;
    for (const radial of [2.88, 3.55])
      for (const tangent of [-0.5, 0.5]) {
        const x = Math.sin(a) * radial + Math.cos(a) * tangent,
          z = Math.cos(a) * radial - Math.sin(a) * tangent;
        const column = new THREE.Group();
        column.name = 'pushkin:column';
        columns.add(column);
        kit.box(0.66, 0.16, 0.66, stone, x, 0.57, z, column, 0);
        cylinder(0.3, 0.33, 0.16, stone, x, 0.73, z, column);
        cylinder(0.22, 0.27, 3.35, stone, x, 2.465, z, column);
        cylinder(0.32, 0.24, 0.14, stone, x, 4.21, z, column);
        kit.box(0.7, 0.14, 0.7, stone, x, 4.34, z, column, 0);
      }
  }
  slab(1, 0.36, 4.41, stone).name = 'pushkin:three-wing-canopy';
  slab(1.025, 0.08, 4.77, trim);
  slab(1.04, 0.1, 4.85, stone);

  // Low balustrades join each wing's outer pair while leaving three entrances.
  for (let wing = 0; wing < 3; wing++) {
    const rail = new THREE.Group();
    rail.rotation.y = (wing * Math.PI * 2) / 3;
    g.add(rail);
    kit.box(0.95, 0.1, 0.2, stone, 0, 1.43, 3.55, rail, 0);
    for (const x of [-0.3, 0, 0.3]) {
      cylinder(0.06, 0.08, 0.8, stone, x, 0.96, 3.55, rail);
      sphere(0.1, 0.13, 0.1, stone, x, 0.97, 3.55, rail, 8);
    }
  }

  const sculpture = new THREE.Group();
  sculpture.name = 'pushkin:sculptures';
  // Face the two figures toward Mira, across the open front of the pavilion.
  sculpture.rotation.y = Math.PI;
  g.add(sculpture);
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    parent = sculpture,
  ) => kit.box(w, h, d, bronze, x, y, z, parent, 0);
  const limb = (
    from: [number, number, number],
    to: [number, number, number],
    radius: number,
    parent: THREE.Group,
  ) =>
    rod(
      new THREE.Vector3(...from),
      new THREE.Vector3(...to),
      radius,
      bronze,
      parent,
    );
  function bench(x: number, z: number) {
    box(1.32, 0.1, 0.47, x, 1, z);
    box(1.32, 0.53, 0.09, x, 1.29, z - 0.21);
    for (const side of [-1, 1]) box(0.1, 0.46, 0.38, x + side * 0.5, 0.72, z);
  }
  bench(-1.65, -0.65);
  bench(1.45, -0.3);

  const pushkin = new THREE.Group();
  pushkin.name = 'pushkin:standing-poet';
  pushkin.position.set(-1.48, 0.49, 0.1);
  sculpture.add(pushkin);
  box(0.42, 0.61, 0.28, 0, 1.09, 0, pushkin);
  const coat = cylinder(0.22, 0.3, 0.45, bronze, 0, 0.75, -0.02, pushkin);
  coat.scale.z = 0.65;
  for (const side of [-1, 1]) {
    limb(
      [side * 0.12, 0.05, side * 0.04],
      [side * 0.12, 0.61, 0],
      0.08,
      pushkin,
    );
    box(0.17, 0.09, 0.29, side * 0.12, 0.045, 0.07, pushkin);
  }
  sphere(0.16, 0.2, 0.17, bronze, 0, 1.6, 0.015, pushkin, 10);
  sphere(0.185, 0.16, 0.17, bronze, 0, 1.69, -0.035, pushkin, 8);
  // A raised reciting arm and long coat give the poet his distinct outline.
  limb([-0.22, 1.33, 0], [-0.48, 1.27, 0.16], 0.075, pushkin);
  limb([-0.48, 1.27, 0.16], [-0.76, 1.47, 0.23], 0.063, pushkin);
  limb([0.22, 1.31, 0], [0.31, 0.83, 0.06], 0.071, pushkin);

  const natalia = new THREE.Group();
  natalia.name = 'pushkin:seated-natalia';
  natalia.position.set(1.45, 0.49, -0.27);
  sculpture.add(natalia);
  const skirt = cylinder(0.2, 0.47, 0.64, bronze, 0, 0.34, 0.2, natalia);
  skirt.scale.z = 1.1;
  box(0.37, 0.42, 0.25, 0, 0.82, 0, natalia);
  sphere(0.14, 0.18, 0.15, bronze, 0, 1.18, 0.01, natalia, 10);
  sphere(0.15, 0.14, 0.14, bronze, 0, 1.25, -0.05, natalia, 8);
  for (const side of [-1, 1]) {
    limb([side * 0.19, 0.95, 0], [side * 0.26, 0.72, 0.14], 0.065, natalia);
    limb([side * 0.26, 0.72, 0.14], [side * 0.08, 0.64, 0.28], 0.055, natalia);
  }
  for (const x of [-0.3, -0.15, 0, 0.15, 0.3])
    rod(
      new THREE.Vector3(x * 0.55, 0.61, 0.41),
      new THREE.Vector3(x, 0.035, 0.62),
      0.016,
      bronze,
      natalia,
    );

  const fountain = new THREE.Group();
  fountain.name = 'pushkin:inkwell-fountain';
  fountain.position.set(0, 0.49, 0.55);
  sculpture.add(fountain);
  cylinder(0.34, 0.48, 0.15, trim, 0, 0.075, 0, fountain);
  cylinder(0.19, 0.26, 0.4, stone, 0, 0.34, 0, fountain);
  cylinder(0.65, 0.3, 0.24, stone, 0, 0.64, 0, fountain);
  cylinder(0.55, 0.55, 0.025, '#79a9b3', 0, 0.77, 0, fountain);
  cylinder(0.055, 0.075, 0.13, bronze, 0, 0.82, 0, fountain);
  const manuscript = box(0.42, 0.04, 0.44, 0.15, 0.78, 0.47, fountain);
  manuscript.rotation.x = 0.3;

  // Small inscription belongs to the step facing the avenue, never floats.
  kit.box(2.3, 0.24, 0.1, trim, 0, 0.28, -3.35, g, 0);
  const plaque = new THREE.Group();
  plaque.position.set(0, 0.28, -3.405);
  plaque.rotation.y = Math.PI;
  g.add(plaque);
  facadeText(kit, plaque, 'ПУШКИН И ГОНЧАРОВА', '#676e62', 2.15, 0, 0, 0);
  return true;
}

import { cityGroundHeight } from '../../../lib/game/city/surface.ts';
import { drapedSurface, smoothDrapedNormals } from './relief.ts';
import * as THREE from 'three';
import {
  cityBuildings,
  type CityBuilding,
} from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { facadeText } from './facade-text.ts';

/** Compact silhouettes from the diocesan photographs; positions belong to the
 * playable hill and riverside terrace, not the decorative map boundary. */
export function createHillLandmark(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
) {
  if (
    ![
      'karaulnaya-chapel',
      'chapel-cannon',
      'monastery',
      'monastery-wing',
    ].includes(b.kind ?? '')
  )
    return false;
  const g = new THREE.Group();
  g.name = `landmark:${b.kind}`;
  g.position.set(b.x, 0, b.z);
  g.userData.cityLodKeep = true;
  root.add(g);
  const white = '#e4dfd3',
    trim = '#c9c4b8',
    roof = '#554943',
    glass = '#40525a',
    gold = '#b99d57';
  const box = (
    w: number,
    h: number,
    d: number,
    c: string,
    x: number,
    y: number,
    z: number,
  ) => kit.box(w, h, d, c, x, y, z, g, 0);
  const cylinder = (
    r: number,
    h: number,
    c: string,
    x: number,
    y: number,
    z: number,
    sides = 12,
  ) => {
    const m = kit.mesh(
      new THREE.CylinderGeometry(r, r, h, sides),
      kit.material(c),
      g,
    );
    m.position.set(x, y, z);
    return m;
  };
  const cross = (x: number, y: number, z: number, size: number) => {
    box(0.075, size, 0.075, gold, x, y, z);
    box(size * 0.58, 0.07, 0.075, gold, x, y + size * 0.12, z);
    box(size * 0.32, 0.055, 0.075, gold, x, y + size * 0.34, z);
    box(size * 0.36, 0.055, 0.075, gold, x, y - size * 0.22, z).rotation.z =
      -0.2;
  };
  const dome = (x: number, y: number, z: number, radius: number) => {
    const points = [
      [0.25, 0],
      [0.68, 0.12],
      [1, 0.5],
      [0.9, 0.9],
      [0.4, 1.34],
      [0.04, 1.65],
    ].map(([r, h]) => new THREE.Vector2(r * radius, h * radius));
    const m = kit.mesh(
      new THREE.LatheGeometry(points, 12),
      kit.material(gold),
      g,
    );
    m.position.set(x, y, z);
    cross(x, y + radius * 1.95, z, radius * 0.8);
  };
  const arch = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    angle = 0,
  ) => {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(w / 2, h - w / 2);
    shape.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
    shape.lineTo(-w / 2, 0);
    const m = kit.mesh(
      new THREE.ShapeGeometry(shape, 8),
      kit.material(glass),
      g,
    );
    m.position.set(x, y, z);
    m.rotation.y = angle;
    return m;
  };
  // Close coarse terrain interpolation beneath the entire foundation, including
  // its downhill edge. These are foundations, not floating decorative slabs.
  box(b.w - 0.15, 7, b.d - 0.15, '#a6a49b', 0, -3.45, 0).name =
    'landmark:foundation';
  if (b.kind === 'karaulnaya-chapel') {
    cylinder(4.3, 0.3, trim, 0, 0.15, 0, 8);
    cylinder(3.45, 6.6, white, 0, 3.55, 0, 8);
    cylinder(3.65, 0.3, trim, 0, 6.8, 0, 8);
    cylinder(3.52, 0.35, white, 0, 7.12, 0, 8);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      const r = 3.21;
      arch(Math.sin(a) * r, 1.05, Math.cos(a) * r, 1.1, 3.1, a);
      box(
        0.17,
        6.1,
        0.17,
        trim,
        Math.sin((i * Math.PI) / 4) * 3.37,
        3.5,
        Math.cos((i * Math.PI) / 4) * 3.37,
      );
      const arc = new THREE.Shape();
      arc.moveTo(-1.3, 0);
      arc.quadraticCurveTo(-1.15, 1.25, 0, 1.65);
      arc.quadraticCurveTo(1.15, 1.25, 1.3, 0);
      arc.closePath();
      const panel = kit.mesh(
        new THREE.ShapeGeometry(arc, 8),
        kit.material(white),
        g,
      );
      panel.position.set(Math.sin(a) * 3.36, 6.85, Math.cos(a) * 3.36);
      panel.rotation.y = a;
    }
    const tent = kit.mesh(
      new THREE.CylinderGeometry(0.24, 3.4, 6.1, 8),
      kit.material('#367560'),
      g,
    );
    tent.position.y = 10.35;
    cylinder(1.9, 0.14, '#285c4d', 0, 10.64, 0, 8);
    cylinder(0.3, 0.58, white, 0, 13.57, 0, 8);
    dome(0, 13.88, 0, 0.38);
    return true;
  }
  if (b.kind === 'chapel-cannon') {
    cylinder(3.05, 0.24, trim, 0, 0.15, 0, 24);
    const gun = new THREE.Group();
    gun.rotation.y = -0.35;
    gun.position.y = 0.3;
    g.add(gun);
    const piece = (
      w: number,
      h: number,
      d: number,
      c: string,
      x: number,
      y: number,
      z: number,
    ) => kit.box(w, h, d, c, x, y, z, gun, 0);
    const green = '#4f6050';
    for (const side of [-1, 1]) {
      const wheel = kit.mesh(
        new THREE.CylinderGeometry(0.7, 0.7, 0.28, 14),
        kit.material('#303735'),
        gun,
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 0.85, 0.74, 0.15);
      const hub = kit.mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 0.31, 10),
        kit.material(green),
        gun,
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(wheel.position);
      const trail = piece(0.18, 0.2, 2.7, green, side * 0.65, 0.28, 1.3);
      trail.rotation.y = side * 0.38;
    }
    piece(1.45, 1.2, 0.15, green, 0, 1.25, -0.3);
    piece(1.05, 0.32, 1.5, green, 0, 0.8, 0.1);
    kit.rod(
      new THREE.Vector3(0, 1.1, 0.4),
      new THREE.Vector3(0, 1.7, -2.5),
      0.16,
      green,
      gun,
    );
    kit.rod(
      new THREE.Vector3(0, 0.92, 0.05),
      new THREE.Vector3(0, 1.24, -1.45),
      0.12,
      '#3c4e45',
      gun,
    );
    return true;
  }
  if (b.kind === 'monastery-wing') {
    box(b.w - 0.5, 4.3, b.d - 0.5, white, 0, 2.2, 0);
    const r = kit.mesh(
      new THREE.CylinderGeometry(0, 1, 1, 4),
      kit.material('#9c7566'),
      g,
    );
    r.geometry.rotateY(Math.PI / 4);
    r.scale.set((b.w - 0.15) / Math.SQRT2, 1.6, (b.d - 0.15) / Math.SQRT2);
    r.position.y = 5.15;
    for (const face of [-1, 1])
      for (let i = 0; i < 7; i++) {
        box(
          1.05,
          1.55,
          0.08,
          glass,
          -b.w / 2 + 1.55 + (i * (b.w - 3.1)) / 6,
          2.2,
          face * (b.d / 2 - 0.21),
        );
      }
    return true;
  }
  // Cross-shaped church of the All-Tsaritsa icon: white walls, dark tent,
  // four small gilded heads and a tall western gable with a three-arch belfry.
  box(9, 10.2, 18, white, 0, 5.15, 0);
  box(18, 9.3, 9.5, white, 0, 4.7, 0);
  const gable = (
    x: number,
    z: number,
    angle: number,
    width: number,
    height: number,
    depth: number,
    base = 9.2,
  ) => {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.quadraticCurveTo(width * 0.27, height * 0.78, 0, height);
    shape.quadraticCurveTo(-width * 0.27, height * 0.78, -width / 2, 0);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 8,
    });
    geometry.translate(0, 0, -depth / 2);
    const group = new THREE.Group();
    group.position.set(x, base, z);
    group.rotation.y = angle;
    g.add(group);
    kit.mesh(geometry, kit.material(white), group);
    const shell: number[] = [];
    for (const side of [-1, 1]) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-width / 2, 0.06, 0),
        new THREE.Vector3(-width * 0.27, height * 0.78 + 0.06, 0),
        new THREE.Vector3(0, height + 0.06, 0),
      );
      const points = curve.getPoints(12);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i];
        const p = [a.x * side, a.y, -depth / 2],
          q = [a.x * side, a.y, depth / 2],
          r = [b.x * side, b.y, -depth / 2],
          t = [b.x * side, b.y, depth / 2];
        if (side === 1) shell.push(...p, ...q, ...r, ...r, ...q, ...t);
        else shell.push(...p, ...r, ...q, ...r, ...t, ...q);
      }
    }
    const skin = new THREE.BufferGeometry();
    skin.setAttribute('position', new THREE.Float32BufferAttribute(shell, 3));
    skin.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(
        new Float32Array((shell.length / 3) * 2),
        2,
      ),
    );
    skin.computeVertexNormals();
    kit.mesh(
      skin,
      new THREE.MeshStandardMaterial({
        color: roof,
        roughness: 0.85,
        side: THREE.DoubleSide,
      }),
      group,
    );

    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-width / 2, 0, depth / 2 + 0.05),
      new THREE.Vector3(-width * 0.27, height * 0.78, depth / 2 + 0.05),
      new THREE.Vector3(0, height, depth / 2 + 0.05),
    );
    for (const side of [-1, 1]) {
      const points = curve
        .getPoints(12)
        .map((p) => new THREE.Vector3(p.x * side, p.y, p.z));
      for (let i = 1; i < points.length; i++)
        kit.rod(points[i - 1], points[i], 0.17, roof, group);
    }
  };
  gable(0, 0, 0, 9, 5.8, 18.15);
  gable(0, 0, Math.PI / 2, 9.5, 4.4, 18.15);
  const drum = cylinder(3.5, 5.2, white, 0, 14.5, 0, 8);
  drum.rotation.y = Math.PI / 8;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    arch(Math.sin(a) * 3.26, 12.6, Math.cos(a) * 3.26, 1.15, 3.1, a);
  }
  cylinder(3.7, 0.28, trim, 0, 17.15, 0, 8);
  const tent = kit.mesh(
    new THREE.CylinderGeometry(0.35, 3.6, 6.4, 8),
    kit.material(roof),
    g,
  );
  tent.position.y = 20.5;
  tent.rotation.y = Math.PI / 8;
  cylinder(0.55, 0.65, white, 0, 23.9, 0, 12);
  dome(0, 24.25, 0, 0.95);
  for (const x of [-3.25, 3.25])
    for (const z of [-4, 4]) {
      cylinder(0.63, 1.35, white, x, 12.25, z, 12);
      dome(x, 12.95, z, 0.72);
    }
  for (const x of [-2.1, 0, 2.1])
    arch(x, 9.9, 9.08, 1.05, x === 0 ? 3.2 : 2.15);
  box(5, 4.6, 2.1, white, 0, 2.35, 9);
  gable(0, 9, 0, 5, 2.5, 2.2, 4.6);
  arch(0, 0.22, 10.1, 2.2, 3.5);
  for (const side of [-1, 1])
    for (const z of [-6, -2, 2, 6])
      arch(side * 4.53, 2, z, 1.1, 3.1, (side * Math.PI) / 2);
  facadeText(kit, g, 'УСПЕНСКИЙ МОНАСТЫРЬ', '#6c675d', 13, 0, 0.7, 10.7);
  return true;
}

export const HILL_FOUNDATION_FOOTPRINTS = cityBuildings
  .filter((b) =>
    [
      'karaulnaya-chapel',
      'chapel-cannon',
      'monastery',
      'monastery-wing',
    ].includes(b.kind ?? ''),
  )
  .map((b) => [
    { x: b.x - (b.w - 0.15) / 2, z: b.z - (b.d - 0.15) / 2 },
    { x: b.x + (b.w - 0.15) / 2, z: b.z - (b.d - 0.15) / 2 },
    { x: b.x + (b.w - 0.15) / 2, z: b.z + (b.d - 0.15) / 2 },
    { x: b.x - (b.w - 0.15) / 2, z: b.z + (b.d - 0.15) / 2 },
  ]);

export const HILL_PLAZA_FOOTPRINTS = [
  [
    { x: 33, z: -457 },
    { x: 67, z: -457 },
    { x: 67, z: -429 },
    { x: 33, z: -429 },
  ],
  [
    { x: -1635.1, z: 606.5 },
    { x: -1587.6, z: 606.5 },
    { x: -1587.6, z: 637 },
    { x: -1635.1, z: 637 },
  ],
];
// The physical parcel edge can have a step where road grading resumes.
// Keep its narrow foundation collar separate from the outside paving so
// interpolation cannot drag a level strip down toward the lower road bed.
const hillGroundParcels = HILL_FOUNDATION_FOOTPRINTS.map((foundation) => {
  const minX = foundation[0].x - 0.075,
    maxX = foundation[1].x + 0.075,
    minZ = foundation[0].z - 0.075,
    maxZ = foundation[2].z + 0.075;
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    height: cityGroundHeight((minX + maxX) / 2, (minZ + maxZ) / 2),
    outline: [
      { x: minX, z: minZ },
      { x: maxX, z: minZ },
      { x: maxX, z: maxZ },
      { x: minX, z: maxZ },
    ],
  };
});
function hillOutsidePavingHeight(x: number, z: number) {
  for (const parcel of hillGroundParcels) {
    if (
      x < parcel.minX - 0.00001 ||
      x > parcel.maxX + 0.00001 ||
      z < parcel.minZ - 0.00001 ||
      z > parcel.maxZ + 0.00001
    )
      continue;
    // Sample the outer side of a clipped edge. The collar supplies the upper
    // side, and the shared edge stitcher closes their vertical difference.
    if (Math.abs(x - parcel.minX) < 0.00001) x = parcel.minX - 0.002;
    else if (Math.abs(x - parcel.maxX) < 0.00001) x = parcel.maxX + 0.002;
    if (Math.abs(z - parcel.minZ) < 0.00001) z = parcel.minZ - 0.002;
    else if (Math.abs(z - parcel.maxZ) < 0.00001) z = parcel.maxZ + 0.002;
  }
  return cityGroundHeight(x, z);
}
export function createHillGrounds(kit: RenderKit, root: THREE.Group) {
  const surfaces: ReturnType<typeof drapedSurface>[] = [];
  const add = (
    outline: { x: number; z: number }[],
    height: (x: number, z: number) => number,
    holes: { x: number; z: number }[][],
  ) => {
    const paving = drapedSurface(
      kit,
      root,
      [outline],
      '#b0aea2',
      height,
      0.04,
      2,
      holes,
      0.02,
    );
    smoothDrapedNormals(paving.geometry, height);
    paving.name = 'hill-landmark:plaza';
    paving.userData.reliefPlaced = true;
    surfaces.push(paving);
  };
  for (const outline of HILL_PLAZA_FOOTPRINTS) {
    add(
      outline,
      hillOutsidePavingHeight,
      hillGroundParcels.map((p) => p.outline),
    );
    const minX = Math.min(...outline.map((p) => p.x)),
      maxX = Math.max(...outline.map((p) => p.x)),
      minZ = Math.min(...outline.map((p) => p.z)),
      maxZ = Math.max(...outline.map((p) => p.z));
    for (const parcel of hillGroundParcels)
      if (
        parcel.minX >= minX &&
        parcel.maxX <= maxX &&
        parcel.minZ >= minZ &&
        parcel.maxZ <= maxZ
      )
        add(parcel.outline, () => parcel.height, HILL_FOUNDATION_FOOTPRINTS);
  }
  return surfaces;
}

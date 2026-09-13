import * as THREE from 'three';
import type { Course } from '../../../lib/game/race/course.ts';
import type { RenderKit } from '../world/render-kit';

/** Shared mesh ribbons keep the full circuit cheap enough for two viewports. */
function ribbon(
  kit: RenderKit,
  course: Course,
  inner: number,
  outer: number,
  color: string,
  height = 0,
) {
  const positions: number[] = [],
    indices: number[] = [];
  course.points.forEach((p, i) => {
    const before =
        course.points[
          (i + course.points.length - 2) % (course.points.length - 1)
        ],
      after = course.points[(i + 1) % (course.points.length - 1)];
    const dx = after.x - before.x,
      dz = after.z - before.z,
      l = Math.hypot(dx, dz) || 1;
    for (const side of [inner, outer])
      positions.push(
        p.x - (dz / l) * side,
        p.y + height,
        p.z + (dx / l) * side,
      );
    if (i > 0) {
      const a = i * 2;
      indices.push(a - 2, a - 1, a, a - 1, a + 1, a);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = kit.material(color);
  material.side = THREE.DoubleSide;
  const mesh = kit.mesh(geometry, material);
  mesh.castShadow = false;
  return mesh;
}
export function createNordschleife(kit: RenderKit, course: Course) {
  ribbon(kit, course, -90, 90, '#66735a', -0.2);
  ribbon(kit, course, -5.1, 5.1, '#414b4e', 0.01);
  for (const side of [-1, 1]) {
    ribbon(kit, course, side * 4.72, side * 4.83, '#e5e3cb', 0.027);
    ribbon(kit, course, side * 5.1, side * 5.8, '#aab184', -0.015);
    // Continuous guardrail ribbons rather than thousands of separate boxes.
    ribbon(kit, course, side * 5.75, side * 5.88, '#9baaaa', 0.6);
    ribbon(kit, course, side * 5.75, side * 5.88, '#bdc6c0', 0.91);
  }
  // The two concrete carousel lanes stand out among the forest bends.
  const concrete = new THREE.Group();
  kit.scene.add(concrete);
  for (let d = 0; d < course.length; d += 1.5) {
    const p = course.sample(d);
    if (!p.name?.toLowerCase().includes('karussell')) continue;
    const slab = kit.box(
      4.4,
      0.05,
      1.43,
      '#bebcac',
      p.x - p.dz * -2.35,
      p.y + 0.03,
      p.z + p.dx * -2.35,
      concrete,
      0,
    );
    slab.rotation.y = Math.atan2(p.dx, p.dz);
    slab.castShadow = false;
  }
  // Alternating kerbs follow the actual curve.
  const count = Math.ceil(course.length / 2.5),
    dummy = new THREE.Object3D();
  const curbGeo = new THREE.BoxGeometry(0.6, 0.07, 2.35),
    curbMat = kit.material('#dc5546');
  kit.geometries.add(curbGeo);
  const curbs = new THREE.InstancedMesh(curbGeo, curbMat, count * 2);
  curbs.castShadow = false;
  curbs.receiveShadow = true;
  kit.scene.add(curbs);
  for (let i = 0; i < count; i++)
    for (let side = 0; side < 2; side++) {
      const p = course.sample(i * 2.5),
        offset = side === 0 ? -4.95 : 4.95;
      dummy.position.set(p.x - p.dz * offset, p.y + 0.055, p.z + p.dx * offset);
      dummy.rotation.set(0, Math.atan2(p.dx, p.dz), 0);
      dummy.updateMatrix();
      curbs.setMatrixAt(i * 2 + side, dummy.matrix);
      curbs.setColorAt(
        i * 2 + side,
        new THREE.Color(i % 2 ? '#e9e8db' : '#c75243'),
      );
    }
  const treeCount = 2200,
    treeGeo = new THREE.ConeGeometry(1, 1, 7),
    treeMat = kit.material('#244a39');
  kit.geometries.add(treeGeo);
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, treeCount);
  trees.castShadow = false;
  kit.scene.add(trees);
  let seed = 8127;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < treeCount; i++) {
    const p = course.sample(random() * course.length),
      side = random() < 0.5 ? -1 : 1,
      offset = side * (9 + random() * 48);
    const x = p.x - p.dz * offset,
      z = p.z + p.dx * offset,
      nearest = course.closest(x, z),
      h = 3 + random() * 7;
    if (nearest.lateral < 7) {
      dummy.scale.setScalar(0);
      dummy.position.set(x, p.y, z);
    } else {
      dummy.scale.set(1.1 + random() * 1.4, h, 1.1 + random() * 1.4);
      dummy.position.set(x, nearest.y + h / 2 - 0.25, z);
    }
    dummy.rotation.set(0, random() * 6, 0);
    dummy.updateMatrix();
    trees.setMatrixAt(i, dummy.matrix);
    trees.setColorAt(
      i,
      new THREE.Color().setHSL(
        0.35 + random() * 0.04,
        0.22 + random() * 0.17,
        0.2 + random() * 0.08,
      ),
    );
  }
  // The compact paddock sits beside T13; stands face the start straight.
  const start = course.sample(12);
  const paddock = new THREE.Group();
  paddock.position.set(start.x, start.y, start.z);
  paddock.rotation.y = Math.atan2(start.dx, start.dz);
  kit.scene.add(paddock);
  kit.box(4, 2.3, 18, '#d6d7cb', -11, 1.15, 0, paddock, 0.02);
  kit.box(4.8, 0.15, 19, '#53646b', -11, 2.4, 0, paddock, 0.03);
  for (let i = 0; i < 6; i++)
    kit.box(
      0.035,
      1.1,
      1.9,
      '#6e949c',
      -8.98,
      1.4,
      -7 + i * 2.6,
      paddock,
      0.01,
    );
  for (let i = 0; i < 4; i++)
    kit.box(
      1,
      0.45,
      20,
      '#9caaaf',
      9 + i * 0.9,
      0.3 + i * 0.45,
      0,
      paddock,
      0.02,
    );
}

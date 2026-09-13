import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  raceBoundaryHalfWidth,
  type Course,
} from '../../../lib/game/race/course.ts';
import type { RenderKit } from '../world/render-kit';
import { createTrackTerrain } from '../../../lib/game/race/terrain.ts';

function pathNormal(course: Course, i: number) {
  const n = course.points.length - 1;
  const a = course.points[(i + n - 1) % n],
    b = course.points[(i + 1) % n];
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  return { x: -(b.z - a.z) / length, z: (b.x - a.x) / length };
}

function createEmbankment(
  kit: RenderKit,
  course: Course,
  side: number,
  offset: number,
  heightAt: (x: number, z: number) => number,
) {
  const positions: number[] = [],
    indices: number[] = [];
  course.points.forEach((p, i) => {
    const n = pathNormal(course, i);
    for (const edge of [0, 1]) {
      const d = side * (offset + edge * 1.1),
        x = p.x + n.x * d,
        z = p.z + n.z * d;
      positions.push(x, edge ? heightAt(x, z) - 0.08 : p.y, z);
    }
    if (i) {
      const a = i * 2;
      if (side > 0) indices.push(a - 2, a - 1, a, a - 1, a + 1, a);
      else indices.push(a - 2, a, a - 1, a - 1, a, a + 1);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = kit.mesh(geo, kit.material('#667747'));
  mesh.name = 'nord-embankment';
  mesh.castShadow = false;
}

function createGuardrail(kit: RenderKit, course: Course, offset: number) {
  const positions: number[] = [],
    indices: number[] = [];
  course.points.forEach((p, i) => {
    const n = pathNormal(course, i);
    for (const height of [0.42, 0.85])
      positions.push(p.x + n.x * offset, p.y + height, p.z + n.z * offset);
    if (i) {
      const a = i * 2;
      indices.push(a - 2, a - 1, a, a - 1, a + 1, a);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: '#9ea9a9',
    roughness: 0.46,
    metalness: 0.45,
    side: THREE.DoubleSide,
  });
  const rail = kit.mesh(geo, material);
  rail.name = 'nord-guardrail';
  rail.castShadow = false;
  const count = Math.ceil(course.length / 5);
  const poleGeometry = new THREE.BoxGeometry(0.11, 0.9, 0.14);
  kit.geometries.add(poleGeometry);
  const poles = new THREE.InstancedMesh(poleGeometry, material, count),
    dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const p = course.sample((i * course.length) / count);
    dummy.position.set(p.x - p.dz * offset, p.y + 0.43, p.z + p.dx * offset);
    dummy.rotation.y = Math.atan2(p.dx, p.dz);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
  }
  kit.scene.add(poles);
}

/** Shared mesh ribbons keep the full circuit cheap enough for two viewports. */
function ribbon(
  kit: RenderKit,
  course: Course,
  inner: number,
  outer: number,
  color: string,
  height = 0,
  include: (index: number) => boolean = () => true,
) {
  if (inner > outer) [inner, outer] = [outer, inner];
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
    if (i > 0 && include(i) && include(i - 1)) {
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
  const mesh = kit.mesh(geometry, material);
  mesh.castShadow = false;
  return mesh;
}
export function createNordschleife(kit: RenderKit, course: Course) {
  const terrain = createTrackTerrain(course);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(terrain.positions, 3),
  );
  geometry.setAttribute('color', new THREE.BufferAttribute(terrain.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(terrain.indices, 1));
  geometry.computeVertexNormals();
  const grass = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
  });
  const ground = kit.mesh(geometry, grass);
  ground.name = 'nord-terrain';
  ground.castShadow = false;
  const width = course.halfWidth;
  const asphalt = ribbon(kit, course, -width, width, '#41474a', 0.035);
  asphalt.name = 'nord-asphalt';
  for (const side of [-1, 1]) {
    ribbon(
      kit,
      course,
      side * (width - 0.5),
      side * (width - 0.36),
      '#e5e3cb',
      0.049,
    );
    ribbon(kit, course, side * width, side * (width + 1.6), '#77875d', 0.008);
    createEmbankment(kit, course, side, width + 1.6, terrain.heightAt);
    createGuardrail(kit, course, side * raceBoundaryHalfWidth(course));
  }
  // Follow the same triangles/grade as the road, with no floating slab edges.
  ribbon(kit, course, -width + 0.8, -width + 5.2, '#b9b6a7', 0.045, (i) =>
    Boolean(course.points[i].name?.toLowerCase().includes('karussell')),
  );
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
        offset = (side === 0 ? -1 : 1) * (width + 0.05);
      dummy.position.set(p.x - p.dz * offset, p.y + 0.055, p.z + p.dx * offset);
      dummy.rotation.order = 'YXZ';
      dummy.rotation.set(
        -Math.atan2(
          course.sample(i * 2.5 + 1).y - course.sample(i * 2.5 - 1).y,
          2,
        ),
        Math.atan2(p.dx, p.dz),
        0,
      );
      dummy.updateMatrix();
      curbs.setMatrixAt(i * 2 + side, dummy.matrix);
      curbs.setColorAt(
        i * 2 + side,
        new THREE.Color(i % 2 ? '#e9e8db' : '#c75243'),
      );
    }
  const lowerCrown = new THREE.ConeGeometry(1, 0.65, 9).translate(0, -0.06, 0);
  const upperCrown = new THREE.ConeGeometry(0.67, 0.58, 9).translate(
    0,
    0.21,
    0,
  );
  const treeCount = 2200,
    treeGeo = mergeGeometries([lowerCrown, upperCrown]),
    treeMat = kit.material('#ffffff');
  lowerCrown.dispose();
  upperCrown.dispose();
  kit.geometries.add(treeGeo);
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, treeCount);
  trees.castShadow = false;
  kit.scene.add(trees);
  const trunkGeo = new THREE.CylinderGeometry(0.09, 0.14, 1, 6);
  kit.geometries.add(trunkGeo);
  const trunks = new THREE.InstancedMesh(
    trunkGeo,
    kit.material('#5c4d3c'),
    treeCount,
  );
  kit.scene.add(trunks);
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
    if (nearest.lateral < width + 5) {
      dummy.scale.setScalar(0);
      dummy.position.set(x, p.y, z);
    } else {
      dummy.scale.set(1.1 + random() * 1.4, h, 1.1 + random() * 1.4);
      dummy.position.set(x, terrain.heightAt(x, z) + h / 2 - 0.1, z);
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
    if (nearest.lateral >= width + 5) {
      dummy.position.y = terrain.heightAt(x, z) + h * 0.16;
      dummy.scale.set(1, h * 0.32, 1);
      dummy.updateMatrix();
    }
    trunks.setMatrixAt(i, dummy.matrix);
  }
  // The compact paddock sits beside T13; stands face the start straight.
  const start = course.sample(12);
  const paddock = new THREE.Group();
  paddock.position.set(start.x, start.y, start.z);
  paddock.rotation.y = Math.atan2(start.dx, start.dz);
  kit.scene.add(paddock);
  kit.box(4, 2.3, 18, '#d6d7cb', -width - 7, 1.15, 0, paddock, 0.02);
  kit.box(4.8, 0.15, 19, '#53646b', -width - 7, 2.4, 0, paddock, 0.03);
  for (let i = 0; i < 6; i++)
    kit.box(
      0.035,
      1.1,
      1.9,
      '#6e949c',
      -width - 4.98,
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
      width + 6 + i * 0.9,
      0.3 + i * 0.45,
      0,
      paddock,
      0.02,
    );
  return { heightAt: terrain.heightAt };
}

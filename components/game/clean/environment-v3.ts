import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  bounds,
  furniture,
  obstacles,
  stations,
} from '../../../lib/game/clean/engine.ts';
import type { RenderKit } from '../world/render-kit';
import { makeLabel } from '../world/labels.ts';
import {
  createShower,
  createToilet,
  createWasher,
  floorWorld,
} from './props-v3.ts';

function tiledFloor(kit: RenderKit) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const c = canvas.getContext('2d')!;
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      const seed = (row * 23 + col * 17) % 7;
      c.fillStyle = [
        '#a2aea3',
        '#abb7aa',
        '#9fae9f',
        '#b3bcae',
        '#a8b3a5',
        '#acb7a7',
        '#a6b0a1',
      ][seed];
      c.fillRect(col * 128, row * 128, 128, 128);
      c.strokeStyle = '#6d8172';
      c.lineWidth = 3;
      c.strokeRect(col * 128 + 1, row * 128 + 1, 126, 126);
      c.strokeStyle = '#d6dbbd66';
      c.lineWidth = 2;
      c.strokeRect(col * 128 + 5, row * 128 + 5, 118, 118);
      for (let j = 0; j < 13; j++) {
        c.fillStyle = j % 3 ? '#61746409' : '#f3f4d612';
        c.fillRect(
          col * 128 + ((j * 47 + seed * 13) % 124),
          row * 128 + ((j * 29 + seed * 7) % 124),
          1 + (j % 4),
          1 + (j % 3),
        );
      }
    }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.35, 2.2);
  texture.anisotropy = 4;
  kit.textures.add(texture);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.63,
  });
  const width = (bounds.maxX - bounds.minX) / 70 + 0.5,
    depth = (bounds.maxY - bounds.minY) / 70 + 0.5;
  const mesh = kit.mesh(new THREE.BoxGeometry(width, 0.14, depth), material);
  mesh.position.set(0, -0.09, (bounds.minY + bounds.maxY - 800) / 140);
}

function bed(
  kit: RenderKit,
  x: number,
  y: number,
  w: number,
  h: number,
  index: number,
) {
  const root = new THREE.Group();
  root.position.copy(floorWorld(x + w / 2, y + h / 2));
  kit.scene.add(root);
  const width = w / 70,
    depth = h / 70;
  kit.box(width - 0.08, 0.14, depth - 0.05, '#989f8b', 0, 0.46, 0, root, 0.06);
  kit.box(
    width - 0.17,
    0.14,
    depth * 0.72,
    index % 2 ? '#677d68' : '#7a8b6b',
    0,
    0.58,
    depth * 0.11,
    root,
    0.07,
  );
  kit.box(
    width - 0.34,
    0.14,
    0.43,
    '#d8debf',
    0,
    0.595,
    -depth * 0.31,
    root,
    0.07,
  );
  kit.box(
    width - 0.17,
    0.04,
    0.13,
    '#445e4f',
    0,
    0.665,
    depth * 0.4,
    root,
    0.009,
  );
  for (const dx of [-width / 2 + 0.025, width / 2 - 0.025])
    for (const dz of [-depth / 2 + 0.03, depth / 2 - 0.03])
      kit.cylinder(0.027, 0.027, 0.8, '#62766a', dx, 0.4, dz, root);
  for (const z of [-depth / 2 + 0.03, depth / 2 - 0.03]) {
    kit.rod(
      new THREE.Vector3(-width / 2 + 0.025, 0.79, z),
      new THREE.Vector3(width / 2 - 0.025, 0.79, z),
      0.026,
      '#81917e',
      root,
    );
    for (let i = -2; i <= 2; i++)
      kit.cylinder(
        0.014,
        0.014,
        0.33,
        '#84937f',
        (i * width) / 6,
        0.625,
        z,
        root,
      );
  }
  kit.box(
    0.18,
    0.055,
    0.24,
    '#2d3b31',
    -width * 0.25,
    0.055,
    depth * 0.24,
    root,
  );
  kit.box(
    0.18,
    0.055,
    0.24,
    '#354337',
    -width * 0.02,
    0.055,
    depth * 0.24,
    root,
  );
}

function gearCupboard(
  kit: RenderKit,
  x: number,
  y: number,
  w: number,
  d: number,
) {
  const root = new THREE.Group();
  root.position.copy(floorWorld(x + w / 2, y + d / 2));
  kit.scene.add(root);
  const width = w / 70,
    depth = d / 70;
  kit.box(width, 2.0, 0.045, '#4c6956', 0, 1.04, -depth / 2, root);
  for (const dx of [-width / 2, width / 2])
    kit.box(0.045, 2.06, depth, '#63816a', dx, 1.05, 0, root);
  for (const yy of [0.04, 1.38, 2.07])
    kit.box(width, 0.045, depth, '#708c71', 0, yy, 0, root);
  const doors = [-1, 1].map((sign) => {
    const hinge = new THREE.Group();
    hinge.position.set((sign * width) / 2, 1.04, depth / 2);
    root.add(hinge);
    kit.box(
      width / 2 - 0.018,
      2.0,
      0.035,
      '#859475',
      (-sign * width) / 4,
      0,
      0,
      hinge,
    );
    kit.box(
      0.026,
      0.15,
      0.035,
      '#455e48',
      -sign * (width / 2 - 0.075),
      0.03,
      0.035,
      hinge,
    );
    for (let i = 0; i < 4; i++)
      kit.box(
        width * 0.29,
        0.014,
        0.006,
        '#48634b',
        (-sign * width) / 4,
        0.66 - i * 0.045,
        0.023,
        hinge,
        0.002,
      );
    return hinge;
  });
  for (let i = 0; i < 3; i++) {
    kit.sphere(
      0.145,
      0.2,
      0.12,
      '#b6bea0',
      ((i - 1) * width) / 3,
      1.1,
      0,
      root,
    );
    kit.sphere(
      0.085,
      0.074,
      0.024,
      '#34473f',
      ((i - 1) * width) / 3,
      1.12,
      0.12,
      root,
    );
    kit.box(
      width * 0.24,
      0.06,
      depth * 0.7,
      '#a9b398',
      ((i - 1) * width) / 3,
      0.19,
      0.015,
      root,
      0.024,
    );
  }
  return { root, doors };
}

/** Bake static fixtures by material; actors and interactive props keep their own transforms. */
function batchStaticFixtures(kit: RenderKit, dynamic: THREE.Object3D[]) {
  const excluded = new Set<THREE.Object3D>();
  dynamic.forEach((root) => root.traverse((child) => excluded.add(child)));
  const batches = new Map<THREE.Material, THREE.Mesh[]>();
  kit.scene.updateMatrixWorld(true);
  kit.scene.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      excluded.has(object) ||
      Array.isArray(object.material)
    )
      return;
    const existing = batches.get(object.material) ?? [];
    existing.push(object);
    batches.set(object.material, existing);
  });
  for (const [material, objects] of batches) {
    if (objects.length < 3) continue;
    const parts = objects.map((object) => {
      const geometry = object.geometry.index
        ? object.geometry.toNonIndexed()
        : object.geometry.clone();
      return geometry.applyMatrix4(object.matrixWorld);
    });
    const merged = mergeGeometries(parts, false);
    parts.forEach((geometry) => geometry.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = kit.mesh(merged, material);
    mesh.name = 'barracks-static-fixtures';
    objects.forEach((object) => object.removeFromParent());
  }
}

/** All blocking silhouettes are derived from the same rectangles as movement. */
export function createBarracks(kit: RenderKit) {
  tiledFloor(kit);
  const xmin = (bounds.minX - 600) / 70 - 0.25,
    xmax = (bounds.maxX - 600) / 70 + 0.25;
  const zmin = (bounds.minY - 400) / 70 - 0.25,
    zmax = (bounds.maxY - 400) / 70 + 0.25;
  kit.box(xmax - xmin + 0.15, 1.2, 0.16, '#758c79', 0, 0.6, zmin);
  kit.box(xmax - xmin + 0.15, 1.95, 0.16, '#cbd0b9', 0, 2.15, zmin);
  kit.box(xmax - xmin, 0.045, 0.2, '#a4b29b', 0, 1.22, zmin + 0.02);
  // Low outer cutaway walls keep both the follow camera and the cleanup view unobstructed.
  for (const x of [xmin, xmax])
    kit.box(0.16, 0.36, zmax - zmin, '#8b9c85', x, 0.18, (zmin + zmax) / 2);
  kit.box(xmax - xmin, 0.16, 0.15, '#6c8170', 0, 0.075, zmax);
  for (let i = 0; i < 4; i++) {
    const x = -5.8 + i * 3.85;
    kit.box(2.0, 1.38, 0.065, '#6f8476', x, 2.16, zmin + 0.105);
    kit.box(1.85, 1.23, 0.045, '#b5cbc1', x, 2.16, zmin + 0.15);
    kit.box(0.05, 1.25, 0.08, '#e2e4d1', x, 2.16, zmin + 0.19);
    kit.box(1.86, 0.045, 0.08, '#e2e4d1', x, 2.12, zmin + 0.19);
    kit.box(2.05, 0.07, 0.26, '#bbc8b3', x, 1.46, zmin + 0.21);
    for (let bar = 0; bar < 10; bar++)
      kit.box(
        0.075,
        0.63,
        0.14,
        '#a6b6a2',
        x - 0.58 + bar * 0.13,
        0.64,
        zmin + 0.17,
      );
    const light = new THREE.PointLight('#c4ded7', 9, 8);
    light.position.set(x, 2.5, zmin + 0.65);
    kit.scene.add(light);
  }
  const sign = makeLabel(kit, 'ПОРЯДОК НАЧИНАЕТСЯ С ТЕБЯ', '#ebead1', 3.4);
  sign.position.set(0, 2.9, zmin + 0.2);
  kit.scene.add(sign);
  let bedIndex = 0;
  for (const solid of obstacles) {
    const center = floorWorld(solid.x + solid.w / 2, solid.y + solid.h / 2);
    if (solid.kind === 'bed')
      bed(kit, solid.x, solid.y, solid.w, solid.h, bedIndex++);
    else if (solid.kind === 'wall') {
      const height = solid.h < 30 ? 1.05 : 1.14;
      kit.box(
        solid.w / 70,
        height,
        solid.h / 70,
        '#829b8a',
        center.x,
        height / 2,
        center.z,
      );
      kit.box(
        solid.w / 70 + 0.035,
        0.06,
        solid.h / 70 + 0.035,
        '#c2cbb3',
        center.x,
        height,
        center.z,
      );
      const tiles = Math.floor(solid.h / 28);
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < tiles; col++)
          kit.box(
            solid.w / 70 + 0.007,
            0.006,
            0.36,
            '#b9c5b0',
            center.x,
            0.27 + row * 0.27,
            center.z - solid.h / 140 + 0.19 + col * 0.4,
            kit.scene,
            0.001,
          );
    } else if (solid.kind === 'bench') {
      const w = solid.w / 70,
        d = solid.h / 70;
      for (let i = 0; i < 5; i++)
        kit.box(
          w,
          0.065,
          d / 5 - 0.018,
          i % 2 ? '#8b7958' : '#a28d65',
          center.x,
          0.57,
          center.z - d / 2 + ((i + 0.5) * d) / 5,
        );
      for (const dx of [-w * 0.4, w * 0.4])
        for (const dz of [-d * 0.35, d * 0.35])
          kit.box(
            0.055,
            0.55,
            0.055,
            '#41574b',
            center.x + dx,
            0.28,
            center.z + dz,
          );
    }
  }
  const deskRect = furniture.find((solid) => solid.kind === 'desk')!;
  const desk = floorWorld(
    deskRect.x + deskRect.w / 2,
    deskRect.y + deskRect.h / 2,
  );
  kit.box(
    deskRect.w / 70,
    0.1,
    deskRect.h / 70,
    '#a38e65',
    desk.x,
    1.03,
    desk.z,
  );
  kit.box(
    deskRect.w / 70 - 0.09,
    0.95,
    deskRect.h / 70 - 0.1,
    '#768061',
    desk.x,
    0.48,
    desk.z,
  );
  kit.box(
    0.47,
    0.023,
    0.3,
    '#e0dac0',
    desk.x - 0.2,
    1.1,
    desk.z,
    kit.scene,
    0.004,
  );
  for (let i = 0; i < 5; i++)
    kit.box(
      0.28,
      0.002,
      0.002,
      '#8c967e',
      desk.x - 0.2,
      1.114,
      desk.z - 0.08 + i * 0.038,
      kit.scene,
      0,
    );
  kit.box(0.32, 0.02, 0.25, '#6a3428', desk.x + 0.34, 1.1, desk.z + 0.03);
  kit.cylinder(
    0.035,
    0.035,
    0.1,
    '#4a5b49',
    desk.x + 0.37,
    1.16,
    desk.z - 0.17,
  );
  const washerRect = furniture.find((solid) => solid.kind === 'washer')!;
  const washer = createWasher(
    kit,
    floorWorld(
      washerRect.x + washerRect.w / 2,
      washerRect.y + washerRect.h / 2,
    ),
  );
  washer.root.rotation.y = 0;
  washer.root.scale.set(washerRect.w / 70 / 1.1, 1, washerRect.h / 70 / 0.8);
  washer.root.updateWorldMatrix(true, true);
  washer.root.localToWorld(washer.laundryTarget.set(0, 0.555, 0.49));
  const shower = createShower(kit, floorWorld(stations[2].x, stations[2].y));
  const toilet = createToilet(kit, floorWorld(stations[1].x, 721));
  const gearRect = furniture.find((solid) => solid.kind === 'gear')!;
  const gear = gearCupboard(
    kit,
    gearRect.x,
    gearRect.y,
    gearRect.w,
    gearRect.h,
  );
  const valvePosition = floorWorld(stations[4].x, stations[4].y);
  kit.cylinder(
    0.027,
    0.027,
    1.0,
    '#8c9f8d',
    valvePosition.x,
    0.5,
    valvePosition.z,
  );
  const valve = kit.torus(
    0.13,
    0.023,
    '#9b6448',
    valvePosition.x,
    0.82,
    valvePosition.z + 0.03,
  );
  for (let i = 0; i < 3; i++) {
    const spoke = kit.box(0.23, 0.017, 0.023, '#9b6448', 0, 0, 0, valve);
    spoke.rotation.z = (i * Math.PI) / 3;
  }
  kit.rod(
    new THREE.Vector3(valvePosition.x, 0.09, valvePosition.z),
    new THREE.Vector3(
      washer.root.position.x - 0.5,
      0.09,
      washer.root.position.z,
    ),
    0.028,
    '#718772',
  );
  const bucketPosition = floorWorld(stations[5].x, stations[5].y);
  kit.cylinder(
    0.24,
    0.185,
    0.4,
    '#7d9c8b',
    bucketPosition.x,
    0.21,
    bucketPosition.z,
  );
  const bucketWater = kit.cylinder(
    0.218,
    0.218,
    0.012,
    '#aac9ba',
    bucketPosition.x,
    0.398,
    bucketPosition.z,
  );
  const handle = kit.torus(
    0.215,
    0.012,
    '#b7c4af',
    bucketPosition.x,
    0.43,
    bucketPosition.z,
  );
  handle.scale.y = 1.15;
  const labels: THREE.Sprite[] = [],
    markers: THREE.Mesh[] = [];
  stations.forEach((station, i) => {
    const p = floorWorld(station.x, station.y);
    const label = makeLabel(
      kit,
      station.label,
      i === 6 ? '#dfd49a' : '#dde4cd',
      i === 0 || i === 6 ? 1.8 : 1.3,
    );
    label.position.set(p.x, i === 6 ? 2.37 : i === 0 ? 2.1 : 1.8, p.z);
    kit.scene.add(label);
    labels.push(label);
    const marker = kit.torus(0.48, 0.015, '#b7c477', p.x, 0.015, p.z);
    marker.rotation.x = Math.PI / 2;
    markers.push(marker);
  });
  const duty = floorWorld(stations[7].x, stations[7].y);
  for (let i = 0; i < 5; i++)
    kit.box(
      0.018,
      0.004,
      0.48,
      '#d1c58a',
      duty.x - 0.36 + i * 0.18,
      0.002,
      duty.z,
      kit.scene,
      0.002,
    );
  batchStaticFixtures(kit, [
    washer.root,
    shower.root,
    toilet.root,
    gear.root,
    valve,
    bucketWater,
    ...labels,
    ...markers,
  ]);
  return {
    washer,
    shower,
    toilet,
    gear,
    valve,
    bucketWater,
    bucketPosition,
    labels,
    markers,
  };
}

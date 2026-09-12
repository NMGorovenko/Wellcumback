import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  bounds,
  furniture,
  obstacles,
  stations,
  mapSize,
  rooms,
  doorways,
} from '../../../lib/game/clean/layout.ts';
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
        '#9a9d92',
        '#afb1a5',
        '#90968b',
        '#b9bbae',
        '#a2a899',
        '#b7b6a7',
        '#999f91',
      ][seed];
      c.fillRect(col * 128, row * 128, 128, 128);
      c.strokeStyle = '#696f66';
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
  texture.repeat.set(
    (bounds.maxX - bounds.minX) / 322,
    (bounds.maxY - bounds.minY) / 314,
  );
  texture.anisotropy = 4;
  kit.textures.add(texture);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.63,
  });
  const width = (bounds.maxX - bounds.minX) / 70 + 0.5,
    depth = (bounds.maxY - bounds.minY) / 70 + 0.5;
  const mesh = kit.mesh(new THREE.BoxGeometry(width, 0.14, depth), material);
  mesh.position.set(
    0,
    -0.09,
    (bounds.minY + bounds.maxY - mapSize.height) / 140,
  );
}

/** Different floor finishes make each real room readable in the cutaway. */
function roomFloor(
  kit: RenderKit,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  wood = false,
) {
  const center = floorWorld(x + w / 2, y + h / 2);
  kit.box(
    w / 70,
    0.012,
    h / 70,
    color,
    center.x,
    -0.012,
    center.z,
    kit.scene,
    0,
  );
  const step = wood ? 24 : 42;
  for (let line = step; line < w; line += step) {
    const p = floorWorld(x + line, y + h / 2);
    kit.box(
      0.008,
      0.002,
      h / 70,
      wood ? '#726b4e' : '#95988b',
      p.x,
      -0.004,
      p.z,
      kit.scene,
      0,
    );
  }
  if (!wood)
    for (let line = step; line < h; line += step) {
      const p = floorWorld(x + w / 2, y + line);
      kit.box(w / 70, 0.002, 0.008, '#95988b', p.x, -0.004, p.z, kit.scene, 0);
    }
}

function doorway(
  kit: RenderKit,
  left: number,
  right: number,
  y: number,
  text: string,
) {
  const center = floorWorld((left + right) / 2, y);
  const width = (right - left) / 70;
  // Jambs sit in the bordering collider; the opening stays free for two people.
  for (const edge of [left - 3, right + 3]) {
    const p = floorWorld(edge, y);
    kit.box(0.075, 1.95, 0.19, '#987344', p.x, 0.975, p.z);
  }
  kit.box(width + 0.15, 0.13, 0.19, '#a17d4c', center.x, 1.99, center.z);
  kit.box(
    width + 0.08,
    0.012,
    0.21,
    '#a28d65',
    center.x,
    0.003,
    center.z,
    kit.scene,
    0,
  );
  // The open leaf rests within its adjoining wall's footprint, outside the gap.
  const wall = obstacles.find(
    (solid) =>
      solid.kind === 'wall' &&
      solid.h < 30 &&
      solid.x + solid.w === left &&
      Math.abs(solid.y - y) < 12,
  )!;
  const leafWidth = Math.min(0.88, wall.w / 70 - 0.04);
  const leaf = floorWorld(left - leafWidth * 35 - 1.4, y + 6);
  kit.box(leafWidth, 1.62, 0.035, '#b89351', leaf.x, 0.81, leaf.z);
  kit.box(
    leafWidth * 0.75,
    1.28,
    0.016,
    '#c5a366',
    leaf.x,
    0.82,
    leaf.z + 0.027,
  );
  kit.sphere(
    0.027,
    0.027,
    0.024,
    '#555748',
    leaf.x - leafWidth * 0.33,
    0.89,
    leaf.z + 0.05,
    kit.scene,
    8,
  );
  const sign = makeLabel(kit, text, '#fff0c6', Math.max(1.45, width));
  sign.position.set(center.x, 2.22, center.z);
  kit.scene.add(sign);
  return sign;
}

function noticeBoard(
  kit: RenderKit,
  title: string,
  x: number,
  y: number,
  width: number,
  height: number,
  lift = 1.85,
) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 640;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#976226';
  c.fillRect(0, 0, 1024, 640);
  c.fillStyle = '#773328';
  c.fillRect(24, 20, 976, 90);
  c.fillStyle = '#f2d991';
  c.font = 'bold 43px Arial';
  c.textAlign = 'center';
  c.fillText(title, 512, 80, 940);
  const titles = [
    'ОБЯЗАННОСТИ',
    'РАСПОРЯДОК ДНЯ',
    'НАРЯД ПО РОТЕ',
    'ИНСТРУКЦИЯ',
    'ПОЖАРНЫЙ РАСЧЁТ',
    'ТЕЛЕФОНЫ',
  ];
  for (let i = 0; i < 6; i++) {
    const col = i % 3,
      row = Math.floor(i / 3),
      px = 34 + col * 330,
      py = 137 + row * 245;
    c.fillStyle = '#ede8d3';
    c.fillRect(px, py, 295, 216);
    c.fillStyle = '#842d25';
    c.font = 'bold 18px Arial';
    c.fillText(titles[i], px + 147, py + 28, 276);
    for (let line = 0; line < 10; line++) {
      c.fillStyle = line % 3 ? '#69716a' : '#3f4e46';
      c.fillRect(px + 20, py + 45 + line * 14, 205 + (line % 4) * 16, 3);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  kit.textures.add(texture);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.86,
  });
  const p = floorWorld(x, y);
  kit.box(width + 0.09, height + 0.09, 0.07, '#764b23', p.x, lift, p.z);
  const face = kit.mesh(new THREE.PlaneGeometry(width, height), material);
  face.position.set(p.x, lift, p.z + 0.043);
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
    for (let i = 0; i < 6; i++)
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
  rooms.forEach((room) =>
    roomFloor(kit, room.x, room.y, room.w, room.h, room.color, room.wood),
  );
  // Light tile stripe follows the corridor, as on the duty-post reference.
  const corridor = floorWorld(mapSize.width / 2, 620);
  kit.box(
    (bounds.maxX - bounds.minX) / 70,
    0.007,
    0.6,
    '#d6d4bd',
    corridor.x,
    -0.015,
    corridor.z,
    kit.scene,
    0,
  );
  const xmin = (bounds.minX - mapSize.width / 2) / 70 - 0.25,
    xmax = (bounds.maxX - mapSize.width / 2) / 70 + 0.25;
  const zmin = (bounds.minY - mapSize.height / 2) / 70 - 0.25,
    zmax = (bounds.maxY - mapSize.height / 2) / 70 + 0.25;
  kit.box(xmax - xmin + 0.15, 1.2, 0.16, '#c1b472', 0, 0.6, zmin);
  kit.box(xmax - xmin + 0.15, 1.95, 0.16, '#e7dfbd', 0, 2.15, zmin);
  kit.box(xmax - xmin, 0.045, 0.2, '#e2cc8c', 0, 1.22, zmin + 0.02);
  // Low outer cutaway walls keep both the follow camera and the cleanup view unobstructed.
  for (const x of [xmin, xmax])
    kit.box(0.16, 0.36, zmax - zmin, '#cab776', x, 0.18, (zmin + zmax) / 2);
  kit.box(xmax - xmin, 0.16, 0.15, '#b7a56e', 0, 0.075, zmax);
  for (let i = 0; i < 6; i++) {
    const x = xmin + 1.45 + (i * (xmax - xmin - 2.9)) / 5;
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
      const height = solid.y < 500 ? 0.88 : solid.h < 30 ? 1.05 : 1.14;
      kit.box(
        solid.w / 70,
        height,
        solid.h / 70,
        '#d5c78c',
        center.x,
        height / 2,
        center.z,
      );
      kit.box(
        solid.w / 70 + 0.035,
        0.06,
        solid.h / 70 + 0.035,
        '#f0e5bd',
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
  const roomSigns = doorways.map((door) =>
    doorway(kit, door.left, door.right, door.y, door.label),
  );
  const sleeping = makeLabel(kit, 'СПАЛЬНОЕ ПОМЕЩЕНИЕ', '#f3e8c3', 3.4);
  sleeping.position.copy(floorWorld(740, 420));
  sleeping.position.y = 1.5;
  kit.scene.add(sleeping);
  roomSigns.push(sleeping);
  const boardWall = floorWorld(1290, 458);
  kit.box(2.4, 2.65, 0.16, '#e7dfbd', boardWall.x, 1.325, boardWall.z);
  noticeBoard(kit, 'ВНУТРЕННИЙ РАСПОРЯДОК', 1290, 462, 2.2, 1.25, 1.88);
  const deskRect = furniture.find((solid) => solid.kind === 'desk')!;
  const desk = floorWorld(
    deskRect.x + deskRect.w / 2,
    deskRect.y + deskRect.h / 2,
  );
  kit.box(
    deskRect.w / 70,
    0.1,
    deskRect.h / 70,
    '#ba8642',
    desk.x,
    1.03,
    desk.z,
  );
  kit.box(
    deskRect.w / 70 - 0.09,
    0.95,
    deskRect.h / 70 - 0.1,
    '#98672f',
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
  // Red desk pad, varnished wooden slats and a field telephone at the duty podium.
  kit.box(1.05, 0.018, 0.48, '#a33127', desk.x, 1.087, desk.z);
  for (let slat = 0; slat < 6; slat++) {
    kit.box(
      0.026,
      0.85,
      0.026,
      '#c09351',
      desk.x - 0.5 + slat * 0.2,
      0.49,
      desk.z + 0.274,
    );
  }
  kit.box(1.14, 0.065, 0.055, '#d2a35c', desk.x, 0.91, desk.z + 0.28);
  kit.box(0.38, 0.075, 0.22, '#ded4ac', desk.x + 0.31, 1.15, desk.z - 0.085);
  kit.box(0.4, 0.045, 0.075, '#313c31', desk.x + 0.31, 1.22, desk.z - 0.1);
  for (const end of [-1, 1])
    kit.box(
      0.09,
      0.07,
      0.095,
      '#313c31',
      desk.x + 0.31 + end * 0.15,
      1.2,
      desk.z - 0.1,
    );
  for (let key = 0; key < 9; key++)
    kit.box(
      0.024,
      0.008,
      0.018,
      '#626954',
      desk.x + 0.26 + (key % 3) * 0.037,
      1.193,
      desk.z - 0.045 + Math.floor(key / 3) * 0.025,
      kit.scene,
      0,
    );
  const cord = kit.torus(
    0.066,
    0.007,
    '#2a332c',
    desk.x + 0.54,
    1.08,
    desk.z - 0.065,
  );
  cord.scale.y = 2.2;
  // A board rises directly from the wooden post; paper instructions are baked into one texture.
  noticeBoard(
    kit,
    'ДЕЖУРНЫЙ ПО РОТЕ',
    stations[0].x,
    deskRect.y + 2,
    1.62,
    1.15,
    1.9,
  );
  const dutyTitle = makeLabel(kit, 'СЛУЖУ РОССИИ', '#f1d18b', 1.15);
  dutyTitle.position.set(desk.x, 0.64, desk.z + 0.31);
  kit.scene.add(dutyTitle);
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
  const toiletRect = furniture.find((solid) => solid.kind === 'toilet')!;
  const toilet = createToilet(
    kit,
    floorWorld(
      toiletRect.x + toiletRect.w / 2,
      toiletRect.y + toiletRect.h / 2,
    ),
  );
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
    roomSigns,
    markers,
  };
}

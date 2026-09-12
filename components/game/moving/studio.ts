import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  entry,
  mapSize,
  MAP_UNITS_PER_METRE,
  movingStations,
  obstacles,
} from '@/lib/game/moving/layout';
import type { RenderKit } from '../world/render-kit';
import { makeLabel } from '../world/labels';

export const movingWorld = (x: number, y: number, height = 0) =>
  new THREE.Vector3(
    (x - mapSize.width / 2) / MAP_UNITS_PER_METRE,
    height,
    (y - mapSize.height / 2) / MAP_UNITS_PER_METRE,
  );

function textSurface(
  kit: RenderKit,
  text: string,
  width: number,
  height: number,
  color = '#e3ead9',
  background = '#243630',
) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const paint = (value: string) => {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = color;
    ctx.font = '600 40px system-ui';
    ctx.textAlign = 'center';
    value
      .split('\n')
      .forEach((line, i) => ctx.fillText(line, 256, 102 + i * 56, 480));
  };
  paint(text);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  kit.textures.add(texture);
  const material = new THREE.MeshBasicMaterial({ map: texture });
  kit.materials.add(material);
  const mesh = kit.mesh(
    new THREE.PlaneGeometry(width, height),
    material,
    new THREE.Group(),
  );
  mesh.castShadow = false;
  let previous = text;
  return Object.assign(mesh, {
    setText(value: string) {
      if (value === previous) return;
      previous = value;
      paint(value);
      texture.needsUpdate = true;
    },
  });
}

function plant(
  kit: RenderKit,
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  scale = 1,
) {
  const pot = new THREE.Group();
  parent.add(pot);
  pot.position.set(x, y, z);
  pot.scale.setScalar(scale);
  kit.cylinder(0.15, 0.105, 0.25, '#aa7456', 0, 0.125, 0, pot);
  kit.cylinder(0.139, 0.139, 0.017, '#4b4230', 0, 0.255, 0, pot);
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4,
      h = 0.35 + (i % 3) * 0.1;
    kit.rod(
      new THREE.Vector3(0, 0.25, 0),
      new THREE.Vector3(Math.cos(a) * 0.12, h, Math.sin(a) * 0.12),
      0.008,
      '#65734e',
      pot,
    );
    const leaf = kit.sphere(
      0.055,
      0.16,
      0.024,
      i % 2 ? '#7d895a' : '#546845',
      Math.cos(a) * 0.12,
      h,
      Math.sin(a) * 0.12,
      pot,
      10,
    );
    leaf.rotation.set(Math.cos(a) * 0.5, a, Math.sin(a) * 0.7);
  }
}

function book(
  kit: RenderKit,
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  color: string,
  h = 0.28,
) {
  kit.box(0.065, h, 0.2, color, x, y + h / 2, z, parent, 0.004);
  kit.box(
    0.052,
    h - 0.025,
    0.185,
    '#dfd7bf',
    x,
    y + h / 2,
    z + 0.009,
    parent,
    0,
  );
  kit.box(0.065, 0.012, 0.21, color, x, y + h, z, parent, 0);
}

function staticBatch(kit: RenderKit, root: THREE.Group) {
  root.updateWorldMatrix(true, true);
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material))
      return;
    const transformed = object.geometry.index
      ? object.geometry.toNonIndexed()
      : object.geometry.clone();
    transformed.applyMatrix4(object.matrixWorld);
    const list = byMaterial.get(object.material) ?? [];
    list.push(transformed);
    byMaterial.set(object.material, list);
  });
  root.removeFromParent();
  for (const [material, geometries] of byMaterial) {
    const geometry = mergeGeometries(geometries, false);
    if (geometry) kit.mesh(geometry, material);
    geometries.forEach((g) => g.dispose());
  }
}

/** Furniture follows the collision footprints. Thin rugs/cables do not add invisible obstacles. */
export function createMovingStudio(kit: RenderKit) {
  const decor = new THREE.Group();
  kit.scene.add(decor);
  const width = mapSize.width / MAP_UNITS_PER_METRE - 0.65;
  const depth = mapSize.height / MAP_UNITS_PER_METRE - 0.7;
  kit.box(width, 0.15, depth, '#cac2ad', 0, -0.09, 0, decor, 0);
  for (let x = -width / 2 + 0.08, col = 0; x < width / 2; x += 0.34, col++) {
    kit.box(0.01, 0.008, depth - 0.12, '#a99d87', x, -0.008, 0, decor, 0);
    for (let z = -depth / 2 + (col % 3) * 0.7; z < depth / 2; z += 2.2)
      kit.box(0.32, 0.008, 0.008, '#b4a992', x + 0.17, -0.005, z, decor, 0);
  }
  for (const side of [-1, 1]) {
    kit.box(0.12, 0.58, depth, '#ded8ca', (side * width) / 2, 0.24, 0, decor);
    kit.box(
      0.08,
      0.095,
      depth,
      '#f2ecde',
      side * (width / 2 - 0.08),
      0.052,
      0,
      decor,
    );
  }
  kit.box(width, 2.65, 0.14, '#dcd7c8', 0, 1.27, -depth / 2, decor);
  // Balcony door, double glazing, sill, radiator and the neighbouring apartment silhouettes.
  kit.box(3.52, 2.23, 0.15, '#f6f3e9', 0, 1.34, -depth / 2 + 0.09, decor);
  kit.box(3.32, 2.03, 0.035, '#aec7c7', 0, 1.34, -depth / 2 + 0.19, decor);
  for (let i = 0; i < 6; i++) {
    const z = -depth / 2 + 0.21;
    kit.box(
      0.26,
      0.45 + (i % 2) * 0.24,
      0.008,
      '#cbd4ca',
      -1.45 + i * 0.53,
      1.56,
      z,
      decor,
      0,
    );
    for (let j = 0; j < 3; j++)
      kit.box(
        0.045,
        0.06,
        0.01,
        '#96aeae',
        -1.49 + i * 0.53,
        1.47 + j * 0.1,
        z + 0.01,
        decor,
        0,
      );
  }
  for (const x of [-1.7, -0.72, 0.6, 1.7])
    kit.box(0.07, 2.19, 0.09, '#f6f3e9', x, 1.34, -depth / 2 + 0.23, decor);
  kit.box(3.45, 0.065, 0.1, '#f6f3e9', 0, 1.12, -depth / 2 + 0.23, decor);
  kit.box(1.3, 0.08, 0.5, '#eee6d5', 0, 0.48, -depth / 2 + 0.27, decor);
  kit.box(0.035, 0.21, 0.05, '#8c948f', 0.5, 1.24, -depth / 2 + 0.3, decor);
  for (let i = 0; i < 8; i++)
    kit.box(
      0.095,
      0.48,
      0.18,
      '#e7e5d8',
      -0.51 + i * 0.14,
      0.3,
      -depth / 2 + 0.26,
      decor,
    );
  plant(kit, decor, 1.28, 0.33, -depth / 2 + 0.42, 1.2);
  const rug = kit.mesh(
    new THREE.CircleGeometry(1.08, 36),
    kit.material('#9b9c8e'),
    decor,
  );
  rug.rotation.x = -Math.PI / 2;
  rug.scale.y = 1.5;
  rug.position.copy(movingWorld(290, 228, 0.009));
  for (let i = -3; i <= 3; i++) {
    const line = kit.box(
      0.012,
      0.007,
      1.85,
      '#d5d2bf',
      rug.position.x + i * 0.22,
      0.018,
      rug.position.z,
      decor,
      0,
    );
    line.rotation.y = 0.4;
  }

  const laptopPosition = movingWorld(485, movingStations.laptop.y, 0.87);
  for (const obstacle of obstacles) {
    const p = movingWorld(
      obstacle.x + obstacle.w / 2,
      obstacle.y + obstacle.h / 2,
    );
    const w = obstacle.w / MAP_UNITS_PER_METRE,
      d = obstacle.h / MAP_UNITS_PER_METRE;
    const group = new THREE.Group();
    decor.add(group);
    group.position.copy(p);
    if (obstacle.kind === 'sofa') {
      kit.box(w - 0.04, 0.39, d, '#656968', 0, 0.24, 0, group, 0.065);
      kit.box(0.19, 0.79, d, '#858780', -w / 2 + 0.05, 0.48, 0, group, 0.075);
      for (const sign of [-1, 1])
        kit.box(
          w,
          0.65,
          0.18,
          '#7c7f79',
          0,
          0.39,
          sign * (d / 2 - 0.09),
          group,
          0.055,
        );
      for (let i = 0; i < 3; i++) {
        kit.box(
          w - 0.21,
          0.18,
          d / 3 - 0.12,
          '#9b9d92',
          0.07,
          0.48,
          -d / 3 + (i * d) / 3,
          group,
          0.055,
        );
        kit.box(
          0.012,
          0.014,
          d / 3 - 0.18,
          '#787e76',
          w / 2 - 0.04,
          0.49,
          -d / 3 + (i * d) / 3,
          group,
          0,
        );
      }
      for (let i = 0; i < 3; i++) {
        const pillow = kit.box(
          0.38,
          0.22,
          0.43,
          ['#c4d0ca', '#dee0d2', '#81999e'][i],
          -0.23,
          0.72,
          -d / 2 + 0.35 + i * 0.42,
          group,
          0.09,
        );
        pillow.rotation.z = -0.3;
        pillow.rotation.x = i * 0.17;
      }
      kit.box(
        0.67,
        0.06,
        0.68,
        '#b2c2bc',
        0.09,
        0.6,
        d / 2 - 0.52,
        group,
        0.035,
      );
      for (let j = 0; j < 7; j++)
        kit.box(
          0.012,
          0.008,
          0.64,
          '#d8e0d2',
          -0.19 + j * 0.085,
          0.635,
          d / 2 - 0.52,
          group,
          0,
        );
      const phone = kit.box(
        0.13,
        0.024,
        0.25,
        '#252d31',
        0.18,
        0.612,
        0.22,
        group,
      );
      phone.rotation.y = -0.28;
      kit.box(0.1, 0.003, 0.19, '#6e93a2', 0.18, 0.627, 0.22, group, 0);
      // Empty wall-mounted screen bracket and dangling leads from the reference room.
      kit.box(0.09, 0.28, 0.18, '#262c2b', -w / 2 - 0.03, 1.63, 0.15, group);
      kit.box(0.35, 0.035, 0.055, '#313837', -w / 2 + 0.15, 1.65, 0.15, group);
      for (let j = 0; j < 2; j++)
        kit.rod(
          new THREE.Vector3(-w / 2 + 0.2, 1.62, 0.1 + j * 0.07),
          new THREE.Vector3(-w / 2 + 0.1, 0.66, 0.21 + j * 0.09),
          0.008,
          '#323c38',
          group,
        );
    } else if (obstacle.kind === 'desk') {
      kit.box(w, 0.09, d, '#72523c', 0, 0.8, 0, group);
      for (const x of [-w / 2 + 0.065, w / 2 - 0.065])
        for (const z of [-d / 2 + 0.1, d / 2 - 0.1])
          kit.box(0.065, 0.76, 0.065, '#3d3935', x, 0.38, z, group);
      kit.box(0.42, 0.58, 0.5, '#323638', 0.15, 0.3, d / 2 - 0.43, group);
      for (let j = 0; j < 5; j++)
        kit.box(
          0.22,
          0.011,
          0.012,
          '#768080',
          0.13,
          0.24 + j * 0.038,
          d / 2 - 0.17,
          group,
          0,
        );
      const device = new THREE.Group();
      decor.add(device);
      device.position.copy(laptopPosition);
      device.rotation.y = -Math.PI / 2;
      kit.box(0.81, 0.04, 0.5, '#464c4f', 0, 0, 0.05, device);
      kit.box(0.65, 0.008, 0.26, '#242b2f', 0, 0.023, 0, device, 0.006);
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 10; col++)
          kit.box(
            0.048,
            0.003,
            0.041,
            '#707a79',
            -0.28 + col * 0.062,
            0.03,
            -0.085 + row * 0.052,
            device,
            0,
          );
      kit.box(0.2, 0.005, 0.1, '#8b9290', 0, 0.023, 0.2, device);
      kit.box(0.82, 0.49, 0.027, '#303637', 0, 0.24, -0.2, device);
      kit.box(0.45, 0.01, 0.5, '#393d3b', -0.22, 0.86, 0.7, group);
      kit.sphere(0.055, 0.031, 0.088, '#9ca6a2', -0.21, 0.9, 0.7, group, 12);
      for (let j = 0; j < 4; j++)
        kit.rod(
          new THREE.Vector3(0, 0.8, -0.5 + j * 0.1),
          new THREE.Vector3(0.3, 0.06, -0.3 + j * 0.13),
          0.009,
          '#373a35',
          group,
        );
      kit.cylinder(
        0.085,
        0.068,
        0.15,
        '#e1d2b5',
        -0.25,
        0.92,
        -d / 2 + 0.28,
        group,
      );
      const mugHandle = kit.torus(
        0.055,
        0.013,
        '#c9b68e',
        -0.15,
        0.94,
        -d / 2 + 0.28,
        group,
      );
      mugHandle.rotation.y = Math.PI / 2;
      for (let j = 0; j < 6; j++)
        book(
          kit,
          group,
          0.27,
          0.855,
          d / 2 - 0.75 + j * 0.085,
          ['#556b70', '#a37c5b', '#879778'][j % 3],
        );
      plant(kit, group, 0.2, 0.86, -d / 2 + 0.2, 0.85);
      // The interaction station is the chair seat; the engine routes typing to this point.
      const chair = new THREE.Group();
      decor.add(chair);
      chair.position.copy(
        movingWorld(movingStations.laptop.x, movingStations.laptop.y),
      );
      kit.box(0.43, 0.08, 0.48, '#414745', 0, 0.44, 0, chair, 0.045);
      kit.box(0.07, 0.4, 0.07, '#535b58', 0, 0.2, 0, chair);
      kit.box(0.065, 0.38, 0.43, '#515b57', -0.23, 0.7, 0, chair, 0.025);
      for (let j = 0; j < 4; j++) {
        const a = (j * Math.PI) / 2;
        kit.rod(
          new THREE.Vector3(0, 0.065, 0),
          new THREE.Vector3(Math.cos(a) * 0.25, 0.055, Math.sin(a) * 0.25),
          0.023,
          '#343c39',
          chair,
        );
      }
    } else if (obstacle.kind === 'kitchen') {
      const counterDepth = Math.min(0.73, d * 0.55),
        z = d / 2 - counterDepth / 2;
      kit.box(w, 0.86, counterDepth, '#544236', 0, 0.43, z, group);
      kit.box(
        w + 0.025,
        0.06,
        counterDepth + 0.035,
        '#342e28',
        0,
        0.89,
        z,
        group,
      );
      for (let j = 0; j < 4; j++) {
        const x = -w / 2 + ((j + 0.5) * w) / 4;
        kit.box(
          w / 4 - 0.028,
          0.65,
          0.025,
          '#5d4738',
          x,
          0.47,
          z - counterDepth / 2 - 0.012,
          group,
        );
        kit.box(
          0.17,
          0.022,
          0.035,
          '#b8b6a5',
          x,
          0.71,
          z - counterDepth / 2 - 0.034,
          group,
        );
      }
      kit.box(0.59, 0.035, 0.45, '#a1aba3', -0.12, 0.94, z, group, 0.05);
      kit.box(0.47, 0.04, 0.32, '#59645e', -0.12, 0.948, z, group, 0.055);
      kit.cylinder(0.023, 0.023, 0.31, '#b9c0b5', -0.06, 1.1, z + 0.27, group);
      kit.rod(
        new THREE.Vector3(-0.06, 1.24, z + 0.27),
        new THREE.Vector3(-0.06, 1.24, z + 0.05),
        0.022,
        '#bbc0b6',
        group,
      );
      kit.box(
        0.64,
        1.78,
        0.64,
        '#e1e1d5',
        -w / 2 + 0.33,
        0.9,
        -d / 2 + 0.34,
        group,
        0.035,
      );
      kit.box(
        0.55,
        0.02,
        0.035,
        '#90968b',
        -w / 2 + 0.33,
        0.77,
        -d / 2 + 0.005,
        group,
      );
      for (const h of [0.55, 1.26])
        kit.box(
          0.035,
          0.23,
          0.038,
          '#697268',
          -w / 2 + 0.57,
          h,
          -d / 2 - 0.005,
          group,
        );
      for (let j = 0; j < 3; j++)
        kit.box(
          0.65,
          0.63,
          0.3,
          '#593e2e',
          -w / 2 + 0.43 + j * 0.71,
          1.93,
          z + 0.12,
          group,
        );
      kit.box(0.49, 0.32, 0.34, '#d7d2c1', w / 2 - 0.4, 1.09, z, group);
      kit.box(
        0.35,
        0.23,
        0.025,
        '#343c3a',
        w / 2 - 0.45,
        1.1,
        z - 0.185,
        group,
      );
      for (let j = 0; j < 2; j++) {
        const knob = kit.cylinder(
          0.031,
          0.031,
          0.02,
          '#acaea1',
          w / 2 - 0.2,
          1.04 + j * 0.1,
          z - 0.19,
          group,
        );
        knob.rotation.x = Math.PI / 2;
      }
      kit.cylinder(0.105, 0.13, 0.22, '#c6d5d2', w / 2 - 0.4, 1.36, z, group);
      kit.cylinder(0.115, 0.115, 0.025, '#252e2d', w / 2 - 0.4, 1.49, z, group);
      const handle = kit.torus(
        0.085,
        0.023,
        '#29312e',
        w / 2 - 0.27,
        1.37,
        z,
        group,
      );
      handle.scale.y = 1.2;
      kit.box(0.27, 0.009, 0.19, '#97b1a8', 0.41, 0.932, z, group, 0.01);
    } else if (obstacle.kind === 'wardrobe') {
      kit.box(w, 2.3, d, '#795336', 0, 1.15, 0, group);
      for (let j = 0; j < 2; j++) {
        const z = -d / 4 + (j * d) / 2;
        kit.box(
          0.027,
          2.23,
          d / 2 - 0.045,
          j ? '#8f6745' : '#bbad91',
          -w / 2 - 0.02,
          1.16,
          z,
          group,
        );
        kit.box(
          0.035,
          0.48,
          0.037,
          '#483c2e',
          -w / 2 - 0.055,
          1.15,
          z + (j ? -0.22 : 0.22),
          group,
        );
      }
      for (let shelf = 0; shelf < 3; shelf++) {
        kit.box(
          w - 0.12,
          0.035,
          0.4,
          '#a87c4e',
          0,
          0.37 + shelf * 0.6,
          -d / 2 + 0.13,
          group,
        );
        for (let j = 0; j < 4; j++)
          book(
            kit,
            group,
            -0.35 + j * 0.09,
            0.4 + shelf * 0.6,
            -d / 2 + 0.13,
            ['#877057', '#444f4c', '#93856a', '#77776d'][j],
            0.24 + (j % 2) * 0.05,
          );
      }
      plant(kit, group, 0, 2.31, d / 2 - 0.3, 0.8);
    } else if (obstacle.kind === 'boxes') {
      for (let j = 0; j < 3; j++) {
        kit.box(
          w * 0.84,
          0.38,
          d * 0.74,
          '#b99a68',
          j % 2 ? 0.035 : -0.025,
          0.2 + j * 0.4,
          0,
          group,
          0.008,
        );
        kit.box(
          w * 0.84,
          0.023,
          0.12,
          '#d9c298',
          0,
          0.4 + j * 0.4,
          0,
          group,
          0,
        );
        kit.box(
          0.17,
          0.12,
          0.006,
          '#e7dfc7',
          0.12,
          0.27 + j * 0.4,
          -d * 0.373,
          group,
          0,
        );
      }
    }
  }
  // Small enclosed WC: fixture stays hidden by a closed door during use.
  const wc = movingWorld(92.5, 87.5);
  kit.box(1.02, 0.035, 1.04, '#bec8bb', wc.x, 0.025, wc.z, decor);
  kit.box(0.075, 2.05, 1.08, '#d8d6c6', wc.x - 0.51, 1.02, wc.z, decor);
  kit.box(1.03, 2.05, 0.075, '#d8d6c6', wc.x, 1.02, wc.z - 0.53, decor);
  kit.cylinder(0.18, 0.24, 0.4, '#eeeede', wc.x, 0.23, wc.z, decor);
  kit.sphere(0.22, 0.055, 0.29, '#eeeeDF', wc.x, 0.47, wc.z, decor);
  kit.box(0.43, 0.43, 0.16, '#e1e7db', wc.x, 0.56, wc.z - 0.33, decor);
  kit.box(0.07, 2.05, 1.07, '#baac91', wc.x + 0.54, 1.03, wc.z, decor);
  kit.box(0.05, 0.035, 0.15, '#6a7065', wc.x + 0.59, 1.0, wc.z + 0.29, decor);
  const doorSign = textSurface(
    kit,
    'МИНУТОЧКУ',
    0.66,
    0.27,
    '#dedaca',
    '#554f42',
  );
  doorSign.position.set(wc.x + 0.585, 1.5, wc.z);
  doorSign.rotation.y = Math.PI / 2;
  kit.scene.add(doorSign);
  const occupied = kit.box(
    0.04,
    0.08,
    0.08,
    '#a35941',
    wc.x + 0.6,
    1.26,
    wc.z,
    kit.scene,
  );
  const toiletSound = makeLabel(kit, '…', '#d9ddcf', 0.43);
  toiletSound.position.set(wc.x, 2.18, wc.z);
  kit.scene.add(toiletSound);

  const door = movingWorld(entry.x, entry.y);
  kit.box(1.38, 0.018, 0.8, '#758169', door.x, 0.016, door.z, decor);
  for (let i = 0; i < 6; i++)
    kit.box(
      1.25,
      0.008,
      0.022,
      '#a6ad8b',
      door.x,
      0.03,
      door.z - 0.3 + i * 0.12,
      decor,
      0,
    );
  const sign = makeLabel(kit, 'К ДВЕРИ ↓', '#e7e8c4', 1.4);
  sign.position.copy(door).y = 0.38;
  kit.scene.add(sign);
  // Two high fixtures stay off the central view; warm pools complement balcony daylight.
  for (const z of [-3.6, 3.5]) {
    kit.rod(
      new THREE.Vector3(-3.55, 2.32, z),
      new THREE.Vector3(-3.14, 2.32, z),
      0.026,
      '#5a5850',
      decor,
    );
    kit.sphere(0.15, 0.12, 0.15, '#ece2c8', -3.13, 2.31, z, decor);
    const light = new THREE.PointLight('#ffddb0', 2.2, 5.5, 2);
    light.position.set(-3.12, 2.1, z);
    kit.scene.add(light);
  }
  staticBatch(kit, decor);
  const laptopScreen = textSurface(
    kit,
    'ПРОЕКТ\nвсё почти готово',
    0.73,
    0.39,
    '#cededc',
    '#29434b',
  );
  laptopScreen.rotation.y = -Math.PI / 2;
  laptopScreen.position
    .copy(laptopPosition)
    .add(new THREE.Vector3(0.182, 0.24, 0));
  kit.scene.add(laptopScreen);
  const alert = makeLabel(kit, 'НОУТБУК · РАБОТА', '#ffd783', 1.65);
  alert.position.copy(laptopPosition).y = 1.75;
  kit.scene.add(alert);
  const progress = kit.box(
    0.015,
    0.023,
    0.68,
    '#f5c657',
    laptopScreen.position.x - 0.008,
    laptopPosition.y + 0.08,
    laptopPosition.z,
    kit.scene,
    0,
  );
  return {
    typingHands: [
      movingWorld(482, movingStations.laptop.y - 9, 0.91),
      movingWorld(482, movingStations.laptop.y + 9, 0.91),
    ],
    update(
      time: number,
      alertActive: boolean,
      alertProgress: number,
      toiletActive: boolean,
      laptopStatus?: {
        title: string;
        operation: number;
        awaitingRelease: boolean;
      },
    ) {
      laptopScreen.setText(
        alertActive && laptopStatus
          ? `${laptopStatus.title}\n${laptopStatus.awaitingRelease ? 'ОТПУСТИ КНОПКИ' : laptopStatus.operation === 0 ? '1 · ПРОВЕРКА' : '2 · ИСПРАВЛЕНИЕ'}`
          : 'ПРОЕКТ\nвсё почти готово',
      );
      alert.visible = alertActive;
      alert.position.y = 1.75 + (alertActive ? Math.sin(time * 4) * 0.03 : 0);
      progress.visible = alertActive;
      progress.scale.z = Math.max(0.02, alertProgress);
      occupied.visible = toiletActive;
      toiletSound.visible = toiletActive;
      toiletSound.position.y = 2.18 + Math.sin(time * 2) * 0.035;
    },
  };
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BRIDGES,
  CITY_BOUNDS,
  RIVER_HALF_WIDTH,
  cityBuildings,
  cityStops,
} from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { makeLabel } from '../world/labels.ts';

/** Static city meshes share a handful of draws; signs and stop rings stay live. */
function batchCity(kit: RenderKit, root: THREE.Group) {
  root.updateMatrixWorld(true);
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material))
      return;
    const meshes = groups.get(object.material) ?? [];
    meshes.push(object);
    groups.set(object.material, meshes);
  });
  for (const [material, meshes] of groups) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map((mesh) => {
      const geometry = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      return geometry.applyMatrix4(mesh.matrixWorld);
    });
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((geometry) => geometry.dispose());
    if (!merged) continue;
    meshes.forEach((mesh) => mesh.removeFromParent());
    kit.mesh(merged, material, root);
  }
}

export function createCityEnvironment(kit: RenderKit) {
  const root = new THREE.Group();
  root.name = 'krasnoyarsk-city';
  kit.scene.add(root);
  const { minX, maxX, minZ, maxZ } = CITY_BOUNDS;
  const width = maxX - minX,
    depth = maxZ - minZ;
  kit.box(width + 1.1, 0.65, depth + 1.1, '#667b83', 0, -0.65, 0, root, 0.35);
  for (const side of [-1, 1]) {
    const bankWidth = width / 2 - RIVER_HALF_WIDTH;
    kit.box(
      bankWidth,
      0.42,
      depth,
      '#98ae91',
      side * (RIVER_HALF_WIDTH + bankWidth / 2),
      -0.23,
      0,
      root,
      0.02,
    );
    // A painted riverbank edge sits exactly against the engine's water boundary.
    for (let z = minZ + 0.4; z < maxZ; z += 0.9) {
      if (BRIDGES.some((bridge) => Math.abs(z - bridge) < 2.85)) continue;
      kit.box(
        0.22,
        0.1,
        0.65,
        '#d4d7b7',
        side * (RIVER_HALF_WIDTH + 0.12),
        0.025,
        z,
        root,
        0.015,
      );
    }
    kit.box(5.2, 0.055, depth, '#4d6474', side * 12, 0.012, 0, root, 0);
    for (let z = minZ + 1; z < maxZ; z += 2.2) {
      if (BRIDGES.some((bridge) => Math.abs(z - bridge) < 3.2)) continue;
      kit.box(0.075, 0.01, 1.05, '#eadca6', side * 12, 0.045, z, root, 0);
    }
  }
  const water = kit.mesh(
    new THREE.PlaneGeometry(RIVER_HALF_WIDTH * 2, depth),
    new THREE.MeshStandardMaterial({
      color: '#327da0',
      emissive: '#16476c',
      emissiveIntensity: 0.42,
      metalness: 0.35,
      roughness: 0.26,
    }),
    root,
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.12;
  water.castShadow = false;
  for (const [bridgeIndex, z] of BRIDGES.entries()) {
    kit.box(width, 0.055, 5.2, '#4d6474', 0, 0.012, z, root, 0);
    kit.box(
      RIVER_HALF_WIDTH * 2 + 1.1,
      0.22,
      5.2,
      '#788c96',
      0,
      -0.075,
      z,
      root,
      0.025,
    );
    kit.box(
      RIVER_HALF_WIDTH * 2 + 0.8,
      0.02,
      5.05,
      '#526a79',
      0,
      0.05,
      z,
      root,
      0,
    );
    for (let x = minX + 1; x < maxX; x += 2.2) {
      if (Math.abs(Math.abs(x) - 12) < 3.1) continue;
      kit.box(1.05, 0.01, 0.075, '#eadca6', x, 0.065, z, root, 0);
    }
    const bridgeColor = bridgeIndex ? '#d5af70' : '#cf775e';
    for (const side of [-1, 1]) {
      const railZ = z + side * 2.72;
      kit.box(9.0, 0.12, 0.1, bridgeColor, 0, 0.85, railZ, root, 0.01);
      for (let x = -4.4; x <= 4.4; x += 1.1) {
        kit.box(0.07, 0.86, 0.07, '#d8c2a6', x, 0.43, railZ, root, 0);
      }
      if (!bridgeIndex) {
        for (let n = 0; n < 16; n++) {
          const a = -4.5 + (n * 9) / 16,
            b = -4.5 + ((n + 1) * 9) / 16;
          const arch = (x: number) => 0.65 + 2.3 * (1 - (x / 4.5) ** 2);
          kit.rod(
            new THREE.Vector3(a, arch(a), railZ),
            new THREE.Vector3(b, arch(b), railZ),
            0.1,
            bridgeColor,
            root,
          );
          if (n % 2 === 0)
            kit.rod(
              new THREE.Vector3(a, 0.85, railZ),
              new THREE.Vector3(a, arch(a), railZ),
              0.035,
              '#e1c2a6',
              root,
            );
        }
      }
    }
    // Crosswalk paint is drivable and adds no unmodelled collision geometry.
    for (const x of [-12, 12])
      for (const side of [-1, 1])
        for (let n = -2; n <= 2; n++) {
          kit.box(
            0.35,
            0.009,
            1.15,
            '#d5ddce',
            x + n * 0.65,
            0.052,
            z + side * 3.7,
            root,
            0,
          );
        }
  }

  const windowMaterial = new THREE.MeshStandardMaterial({
    color: '#ffd59b',
    emissive: '#ffba60',
    emissiveIntensity: 0.9,
    roughness: 0.55,
  });
  const dimWindow = kit.material('#466879', 0.4, 0.15);
  for (const [index, building] of cityBuildings.entries()) {
    const { x, z, w, d, h, color } = building;
    kit.box(w, h, d, color, x, h / 2, z, root, 0.025);
    kit.box(w + 0.12, 0.16, d + 0.12, '#637681', x, h + 0.04, z, root, 0.015);
    kit.box(w * 0.58, 0.26, d * 0.48, '#acb6ac', x, h + 0.21, z, root, 0.03);
    const floors = Math.max(3, Math.floor(h / 0.66));
    for (let floor = 0; floor < floors; floor++) {
      const y = 0.45 + (floor * (h - 0.6)) / floors;
      for (const side of [-1, 1]) {
        for (
          let column = 0;
          column < Math.max(2, Math.floor(w / 0.95));
          column++
        ) {
          const count = Math.max(2, Math.floor(w / 0.95));
          const pane = kit.box(
            0.37,
            0.35,
            0.023,
            '#ffd59b',
            x - w / 2 + ((column + 0.5) * w) / count,
            y,
            z + side * (d / 2 + 0.014),
            root,
            0,
          );
          pane.material =
            (floor * 7 + column * 3 + index) % 4 ? windowMaterial : dimWindow;
        }
        for (let column = 0; column < Math.floor(d / 1.1); column++) {
          const pane = kit.box(
            0.023,
            0.35,
            0.42,
            '#ffd59b',
            x + side * (w / 2 + 0.014),
            y,
            z - d / 2 + ((column + 0.5) * d) / Math.floor(d / 1.1),
            root,
            0,
          );
          pane.material =
            (floor + column * 5 + index) % 3 ? windowMaterial : dimWindow;
        }
      }
    }
    // Panel seams and stairwell strips make these read as Russian apartment blocks.
    for (let column = 1; column < Math.ceil(w / 1.9); column++) {
      kit.box(
        0.025,
        h - 0.12,
        0.034,
        '#7b9295',
        x - w / 2 + (column * w) / Math.ceil(w / 1.9),
        h / 2,
        z + d / 2 + 0.025,
        root,
        0,
      );
    }
    const entranceZ = z + d / 2;
    kit.box(
      0.8,
      0.75,
      0.06,
      '#3c5a67',
      x,
      0.375,
      entranceZ + 0.035,
      root,
      0.01,
    );
    kit.box(1.0, 0.08, 0.43, '#d7bf93', x, 0.81, entranceZ - 0.12, root, 0.01);
    const plaque = makeLabel(
      kit,
      ['ДОМ С ИСТОРИЕЙ', 'НАШ ДВОР', 'ПАНЕЛЬНЫЙ РАЙ', 'ТИХИЙ ДВОР'][index % 4],
      '#ecdfb9',
      Math.min(w * 0.82, 3.1),
    );
    plaque.position.set(x, h + 0.75, z);
    kit.scene.add(plaque);
  }
  kit.materials.add(windowMaterial);

  // Hills and the small chapel are outside driving bounds, so scenery cannot
  // become an obstacle that the shared layout does not know about.
  for (let i = 0; i < 11; i++) {
    const hill = kit.mesh(
      new THREE.ConeGeometry(4.8 + (i % 3), 4 + (i % 4), 5),
      kit.material(i % 2 ? '#628482' : '#71928b'),
      root,
    );
    hill.position.set(minX - 4 + i * 6.5, 0.5 + (i % 2), minZ - 8 - (i % 3));
    hill.rotation.y = i;
  }
  const chapel = new THREE.Group();
  chapel.position.set(-18, 1.2, minZ - 6);
  root.add(chapel);
  kit.cylinder(1, 1.15, 2.1, '#eee0b8', 0, 1.05, 0, chapel);
  kit.mesh(
    new THREE.ConeGeometry(1.25, 1.3, 8),
    kit.material('#486972'),
    chapel,
  ).position.y = 2.72;
  kit.sphere(0.22, 0.3, 0.22, '#e8c76f', 0, 3.6, 0, chapel, 12);
  kit.box(0.055, 0.68, 0.055, '#f5d589', 0, 4.0, 0, chapel, 0);
  kit.box(0.35, 0.055, 0.055, '#f5d589', 0, 4.12, 0, chapel, 0);
  batchCity(kit, root);

  const riverName = makeLabel(kit, 'Е Н И С Е Й', '#b4e5ed', 4.8);
  riverName.position.set(0, 0.1, 0);
  kit.scene.add(riverName);
  const cityName = makeLabel(
    kit,
    'КРАСНОЯРСК · ВЕЧЕР НА РАЙОНЕ',
    '#fff2c5',
    12,
  );
  cityName.position.set(0, 1.1, minZ - 3.2);
  kit.scene.add(cityName);
  const stops = cityStops.map((stop) => {
    const ring = kit.mesh(
      new THREE.RingGeometry(1.55, 1.7, 48),
      new THREE.MeshBasicMaterial({
        color: stop.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(stop.x, 0.08, stop.z);
    ring.castShadow = false;
    const label = makeLabel(kit, stop.title, stop.color, 3.4);
    label.position.set(stop.x, 2.4, stop.z);
    kit.scene.add(label);
    return { ring, label };
  });
  const ripples = kit.mesh(
    new THREE.PlaneGeometry(0.8, 0.04),
    new THREE.MeshBasicMaterial({
      color: '#9ecfd9',
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  ripples.removeFromParent();
  const flow = new THREE.InstancedMesh(ripples.geometry, ripples.material, 40);
  flow.castShadow = false;
  flow.frustumCulled = false;
  kit.scene.add(flow);
  const dummy = new THREE.Object3D();
  dummy.rotation.x = -Math.PI / 2;
  return {
    root,
    stops,
    update(time: number, targetStop = -1, nearStop = -1) {
      stops.forEach(({ ring, label }, index) => {
        const selected = index === targetStop || index === nearStop;
        ring.scale.setScalar(selected ? 1.04 + Math.sin(time * 3) * 0.07 : 1);
        (ring.material as THREE.MeshBasicMaterial).opacity = selected
          ? 0.95
          : 0.42;
        label.scale.set(
          selected ? 3.9 : 3.4,
          ((selected ? 3.9 : 3.4) * 96) / 512,
          1,
        );
      });
      for (let i = 0; i < 40; i++) {
        dummy.position.set(
          Math.sin(i * 13.3) * 3.6,
          -0.1,
          minZ + ((i * 5.73 + time * 0.32) % depth),
        );
        dummy.scale.set(0.65 + (i % 4) * 0.24, 1, 1);
        dummy.updateMatrix();
        flow.setMatrixAt(i, dummy.matrix);
      }
      flow.instanceMatrix.needsUpdate = true;
    },
  };
}

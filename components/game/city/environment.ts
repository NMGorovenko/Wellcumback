import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BRIDGES,
  CITY_BOUNDS,
  RIVER_HALF_WIDTH,
  RIVER_SLOPE,
  ROUNDABOUT,
  cityBuildings,
  cityRoads,
  cityStops,
  riverZ,
  type CityPoint,
} from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { makeLabel } from '../world/labels.ts';
import { createCityLandmarks } from './landmarks.ts';
import { createStreetDetails } from './streets.ts';
import {
  createCivicBuilding,
  createApartmentDetails,
  createStationRoof,
  createNorthernChapel,
  createSiberianRidges,
} from './krasnoyarsk.ts';

/** Bake static boxes/windows into material groups once, including nested props.
 * Source geometries are released after merging, rather than retained per window. */
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
    meshes.forEach((mesh) => {
      mesh.removeFromParent();
      kit.geometries.delete(mesh.geometry);
      mesh.geometry.dispose();
    });
    kit.mesh(merged, material, root);
  }
}
function ribbon(
  kit: RenderKit,
  parent: THREE.Object3D,
  from: CityPoint,
  to: CityPoint,
  width: number,
  y: number,
  color: string,
) {
  const dx = to.x - from.x,
    dz = to.z - from.z,
    length = Math.hypot(dx, dz);
  const nx = ((-dz / length) * width) / 2,
    nz = ((dx / length) * width) / 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        from.x + nx,
        y,
        from.z + nz,
        to.x + nx,
        y,
        to.z + nz,
        to.x - nx,
        y,
        to.z - nz,
        from.x - nx,
        y,
        from.z - nz,
      ],
      3,
    ),
  );
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  const mesh = kit.mesh(geometry, kit.material(color), parent);
  mesh.castShadow = false;
  return mesh;
}

export function createCityEnvironment(kit: RenderKit) {
  const root = new THREE.Group();
  root.name = 'krasnoyarsk-city';
  kit.scene.add(root);
  const { minX, maxX, minZ, maxZ } = CITY_BOUNDS;
  const width = maxX - minX,
    depth = maxZ - minZ;
  kit.box(width, 0.6, depth, '#708776', 0, -0.36, 0, root, 0);
  kit.box(width, 0.06, depth, '#a5b397', 0, -0.045, 0, root, 0);
  // Diagonal Yenisei: west/southwest upstream, east/northeast downstream.
  const riverWidthZ = RIVER_HALF_WIDTH * Math.hypot(1, RIVER_SLOPE);
  const waterGeometry = new THREE.BufferGeometry();
  waterGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        minX,
        0.008,
        riverZ(minX) - riverWidthZ,
        maxX,
        0.008,
        riverZ(maxX) - riverWidthZ,
        maxX,
        0.008,
        riverZ(maxX) + riverWidthZ,
        minX,
        0.008,
        riverZ(minX) + riverWidthZ,
      ],
      3,
    ),
  );
  waterGeometry.setIndex([0, 3, 2, 0, 2, 1]);
  waterGeometry.computeVertexNormals();
  const water = kit.mesh(
    waterGeometry,
    new THREE.MeshStandardMaterial({
      color: '#367f9e',
      emissive: '#173d50',
      emissiveIntensity: 0.28,
      roughness: 0.32,
      metalness: 0.2,
    }),
    root,
  );
  water.castShadow = false;
  for (const side of [-1, 1]) {
    ribbon(
      kit,
      root,
      { x: minX, z: riverZ(minX) + side * 14 },
      { x: maxX, z: riverZ(maxX) + side * 14 },
      3.5,
      0.035,
      '#d4d2b7',
    );
    // Rail segments stop at bridge mouths. Water collision uses this same river line.
    for (let x = minX + 2; x < maxX - 2; x += 4) {
      if (BRIDGES.some((bridge) => Math.abs(x - bridge.x) < bridge.w / 2 + 3))
        continue;
      const a = {
        x: x - 1.6,
        z: riverZ(x - 1.6) + side * (riverWidthZ + 0.25),
      };
      const b = {
        x: x + 1.6,
        z: riverZ(x + 1.6) + side * (riverWidthZ + 0.25),
      };
      kit.rod(
        new THREE.Vector3(a.x, 0.34, a.z),
        new THREE.Vector3(b.x, 0.34, b.z),
        0.07,
        '#d8d5bb',
        root,
      );
    }
  }
  for (const road of cityRoads) {
    ribbon(kit, root, road.from, road.to, road.width + 1.2, 0.045, '#d0cdbc');
    ribbon(kit, root, road.from, road.to, road.width, 0.058, '#536671');
    const dx = road.to.x - road.from.x,
      dz = road.to.z - road.from.z,
      length = Math.hypot(dx, dz);
    for (let distance = 2; distance < length - 2; distance += 5) {
      const x = road.from.x + (dx * distance) / length,
        z = road.from.z + (dz * distance) / length;
      if (
        Math.hypot(x - ROUNDABOUT.x, z - ROUNDABOUT.z) <
        ROUNDABOUT.outerRadius + 1
      )
        continue;
      ribbon(
        kit,
        root,
        { x, z },
        { x: x + (dx * 2.3) / length, z: z + (dz * 2.3) / length },
        0.11,
        0.071,
        '#e8dca7',
      );
    }
  }
  for (const [index, bridge] of BRIDGES.entries()) {
    kit.box(
      bridge.w + 0.7,
      0.4,
      bridge.d,
      '#869596',
      bridge.x,
      -0.12,
      bridge.z,
      root,
      0,
    );
    kit.box(
      bridge.w,
      0.06,
      bridge.d,
      '#536671',
      bridge.x,
      0.056,
      bridge.z,
      root,
      0,
    );
    for (const side of [-1, 1]) {
      const x = bridge.x + side * (bridge.w / 2 + 0.16),
        color = index ? '#c7b48c' : '#b76b55';
      for (let j = -3; j <= 3; j++)
        kit.box(0.2, 1.05, 0.2, color, x, 0.55, bridge.z + j * 4.5, root, 0);
      kit.rod(
        new THREE.Vector3(x, 1.05, bridge.z - 14.5),
        new THREE.Vector3(x, 1.05, bridge.z + 14.5),
        0.1,
        color,
        root,
      );
      if (index) {
        for (let span = 0; span < 3; span++)
          for (let j = 0; j < 10; j++) {
            const centre = -9.4 + span * 9.4;
            const z1 = -4.7 + j * 0.94,
              z2 = z1 + 0.94;
            const arch = (z: number) => 1.05 + 2.5 * (1 - (z / 4.7) ** 2);
            kit.rod(
              new THREE.Vector3(x, arch(z1), bridge.z + centre + z1),
              new THREE.Vector3(x, arch(z2), bridge.z + centre + z2),
              0.2,
              '#d4d2b7',
              root,
            );
          }
      } else {
        kit.box(0.25, 0.6, bridge.d - 1, '#b76b55', x, 0.3, bridge.z, root, 0);
      }
      for (let j = -2; j <= 2; j++) {
        kit.cylinder(
          0.07,
          0.09,
          3.5,
          '#40545a',
          x,
          1.8,
          bridge.z + j * 6,
          root,
        );
        kit.box(
          0.55,
          0.1,
          0.35,
          '#f3d5a3',
          x - side * 0.2,
          3.56,
          bridge.z + j * 6,
          root,
          0,
        );
      }
    }
  }
  // The round island is a real circular collider; its surrounding 16 m lane is drivable.
  const roundRoad = kit.mesh(
    new THREE.CircleGeometry(ROUNDABOUT.outerRadius + 0.65, 80),
    kit.material('#d2ccaf'),
    root,
  );
  roundRoad.rotation.x = -Math.PI / 2;
  roundRoad.position.set(ROUNDABOUT.x, 0.078, ROUNDABOUT.z);
  const lane = kit.mesh(
    new THREE.RingGeometry(ROUNDABOUT.innerRadius, ROUNDABOUT.outerRadius, 80),
    kit.material('#536671'),
    root,
  );
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(ROUNDABOUT.x, 0.087, ROUNDABOUT.z);
  kit.cylinder(
    ROUNDABOUT.innerRadius,
    ROUNDABOUT.innerRadius,
    0.38,
    '#c9c9ad',
    ROUNDABOUT.x,
    0.19,
    ROUNDABOUT.z,
    root,
  );
  kit.cylinder(
    ROUNDABOUT.innerRadius - 0.4,
    ROUNDABOUT.innerRadius - 0.4,
    0.07,
    '#829966',
    ROUNDABOUT.x,
    0.4,
    ROUNDABOUT.z,
    root,
  );
  for (let j = 0; j < 32; j++) {
    const dash = kit.mesh(
      new THREE.RingGeometry(17.9, 18.05, 4, 1, (j * Math.PI) / 16, 0.1),
      kit.material('#e8dca7'),
      root,
    );
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(ROUNDABOUT.x, 0.099, ROUNDABOUT.z);
  }
  for (let j = 0; j < 8; j++) {
    const angle = (j * Math.PI) / 4,
      x = ROUNDABOUT.x + Math.cos(angle) * 5.7,
      z = ROUNDABOUT.z + Math.sin(angle) * 5.7;
    kit.cylinder(0.14, 0.2, 1.6, '#6c6650', x, 1.15, z, root);
    kit.sphere(1.05, 1.65, 1.05, '#708858', x, 2.7, z, root, 12);
  }
  const lit = new THREE.MeshStandardMaterial({
    color: '#f3d5a3',
    emissive: '#e5b368',
    emissiveIntensity: 0.65,
  });
  kit.materials.add(lit);
  for (const [index, building] of cityBuildings.entries()) {
    const { x, z, w, d, h, color } = building;
    if (createCivicBuilding(kit, root, building, lit)) continue;
    createApartmentDetails(kit, root, building, index);
    kit.box(w, h, d, color, x, h / 2, z, root, 0);
    kit.box(w + 0.16, 0.16, d + 0.16, '#6e7e82', x, h + 0.08, z, root, 0);
    const floors = Math.max(2, Math.floor(h / 1.7));
    for (let floor = 0; floor < floors; floor++)
      for (const side of [-1, 1]) {
        const y = 1 + (floor * (h - 1)) / floors;
        for (let column = 0; column < Math.floor(w / 2); column++) {
          const pane = kit.box(
            0.72,
            0.88,
            0.035,
            '#536671',
            x - w / 2 + 1.1 + column * 2,
            y,
            z + side * (d / 2 + 0.025),
            root,
            0,
          );
          if ((column + floor + index) % 4 === 0) pane.material = lit;
        }
        for (let column = 0; column < Math.floor(d / 2); column++) {
          const pane = kit.box(
            0.035,
            0.88,
            0.72,
            '#536671',
            x + side * (w / 2 + 0.025),
            y,
            z - d / 2 + 1.1 + column * 2,
            root,
            0,
          );
          if ((column + floor + index) % 3 === 0) pane.material = lit;
        }
      }
    kit.box(1.1, 1.65, 0.12, '#3c5159', x, 0.825, z + d / 2 + 0.065, root, 0);
    if (building.kind === 'station') {
      createStationRoof(kit, root, building);
      // Pale symmetrical facade, central clock and roof sign distinguish the main station.
      kit.box(4.6, 2.2, d + 0.4, '#dfe0c6', x, h + 0.8, z, root, 0);
      const clock = kit.cylinder(
        0.72,
        0.72,
        0.12,
        '#f1eed8',
        x,
        h + 0.9,
        z + d / 2 + 0.28,
        root,
      );
      clock.rotation.x = Math.PI / 2;
      kit.box(
        0.08,
        0.48,
        0.04,
        '#40545a',
        x,
        h + 1.05,
        z + d / 2 + 0.36,
        root,
        0,
      );
      kit.box(
        0.35,
        0.08,
        0.04,
        '#40545a',
        x + 0.13,
        h + 0.9,
        z + d / 2 + 0.37,
        root,
        0,
      );
    }
  }
  createSiberianRidges(kit, root);
  createNorthernChapel(kit, root);
  const scenery = createCityLandmarks(kit, root, lit);
  const streetFurniture = createStreetDetails(kit, root, lit, scenery);
  batchCity(kit, root);
  const labels: THREE.Sprite[] = [];
  const label = (text: string, x: number, z: number, width: number, y = 3) => {
    const sprite = makeLabel(kit, text, '#ede4bd', width);
    sprite.position.set(x, y, z);
    kit.scene.add(sprite);
    labels.push(sprite);
    return sprite;
  };
  label('КАРАУЛЬНАЯ ГОРА', -12, minZ - 14, 15, 14);
  label('ТЕАТРАЛЬНАЯ ПЛОЩАДЬ', 14, -40, 17, 7);
  label('ТАКМАК · СТОЛБЫ', -72, maxZ + 15, 17, 16);
  label('КРАСНОЯРСК · ЛЕВЫЙ БЕРЕГ', -18, -77, 21);
  label('ПРАВЫЙ БЕРЕГ · АПРЕЛЬСКАЯ', 80, 73, 16);
  label('СТУДГОРОДОК', -101, -18, 11, 6.7);
  label('КРАСНОЯРСК-ПАССАЖИРСКИЙ', -70, -69, 20, 8.2);
  label('Е Н И С Е Й', -8, riverZ(-8), 14, 0.3);
  label('КОЛЬЦО · ДРИФТ', ROUNDABOUT.x, ROUNDABOUT.z, 10, 4.8);
  BRIDGES.forEach((bridge) =>
    label(bridge.title, bridge.x - 10, bridge.z, 12, 3.7),
  );
  const overviewNames = ['НИКИТА', 'ЯРИК', 'БАЙКИ РОМЫ', 'НОВЫЙ ДОМ'];
  const stops = cityStops.map((stop, index) => {
    const ring = kit.mesh(
      new THREE.RingGeometry(2.5, 2.75, 48),
      new THREE.MeshBasicMaterial({
        color: stop.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(stop.x, 0.1, stop.z);
    ring.castShadow = false;
    const sign = makeLabel(kit, stop.title, stop.color, 5.6);
    sign.position.set(stop.x, 3, stop.z);
    kit.scene.add(sign);
    const overviewSign = makeLabel(kit, overviewNames[index], stop.color, 24);
    const canvas = overviewSign.material.map!.image as HTMLCanvasElement;
    const context = canvas.getContext('2d')!;
    context.clearRect(0, 0, 512, 96);
    context.fillStyle = '#171d20ee';
    context.beginPath();
    context.roundRect(2, 4, 508, 88, 20);
    context.fill();
    context.fillStyle = stop.color;
    context.font = '600 72px system-ui';
    context.fillText(overviewNames[index], 256, 48, 472);
    overviewSign.material.map!.needsUpdate = true;
    overviewSign.material.depthTest = false;
    overviewSign.renderOrder = 20;
    overviewSign.position.copy(sign.position);
    overviewSign.visible = false;
    kit.scene.add(overviewSign);
    return { ring, label: sign, overviewLabel: overviewSign };
  });
  const rippleGeometry = new THREE.PlaneGeometry(2.2, 0.08);
  const rippleMaterial = new THREE.MeshBasicMaterial({
    color: '#b4d9df',
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  kit.geometries.add(rippleGeometry);
  kit.materials.add(rippleMaterial);
  const flow = new THREE.InstancedMesh(rippleGeometry, rippleMaterial, 64);
  flow.castShadow = false;
  flow.frustumCulled = false;
  kit.scene.add(flow);
  const dummy = new THREE.Object3D();
  dummy.rotation.set(-Math.PI / 2, 0, -Math.atan(RIVER_SLOPE));
  return {
    root,
    scenery,
    streetFurniture,
    stops,
    labels,
    update(
      time: number,
      targetStop = -1,
      nearStop = -1,
      overview = false,
      overviewLabelWidth = 32,
    ) {
      labels.forEach((sprite) => {
        sprite.visible = overview;
      });
      stops.forEach(({ ring, label: sign, overviewLabel }, index) => {
        const selected = index === targetStop || index === nearStop;
        ring.scale.setScalar(selected ? 1.04 + Math.sin(time * 3) * 0.045 : 1);
        (ring.material as THREE.MeshBasicMaterial).opacity = selected
          ? 0.92
          : 0.42;
        sign.visible = !overview && selected;
        overviewLabel.visible = overview;
        const width = selected ? 6.4 : 5.6;
        sign.scale.set(width, (width * 96) / 512, 1);
        const mapWidth = THREE.MathUtils.clamp(overviewLabelWidth, 18, 64);
        overviewLabel.scale.set(mapWidth, (mapWidth * 96) / 512, 1);
      });
      for (let i = 0; i < 64; i++) {
        const x = minX + ((i * 7.73 + time * 0.65) % width);
        dummy.position.set(
          x,
          0.016,
          riverZ(x) + Math.sin(i * 13.3) * (riverWidthZ - 1.1),
        );
        dummy.scale.set(0.7 + (i % 4) * 0.24, 1, 1);
        dummy.updateMatrix();
        flow.setMatrixAt(i, dummy.matrix);
      }
      flow.instanceMatrix.needsUpdate = true;
    },
  };
}

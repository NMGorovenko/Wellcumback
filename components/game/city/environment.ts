import {
  createNeighbourhoodBuilding,
  createNeighbourhoodGreenery,
} from './neighbourhoods.ts';
import { createCentreLandmark, createCityParking } from './centre-landmarks.ts';
import { createDistrictLandmark } from './district-landmarks.ts';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BRIDGES,
  CITY_BOUNDS,
  CITY_DISTRICTS,
  CITY_ISLANDS,
  RIVER_SECTIONS,
  riverBankZ,
  cityBarriers,
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
import { roadDashClear } from '../../../lib/game/city/crossings.ts';
import { createEuropeMonument, createChapelCannon } from './monuments.ts';
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
    if (
      !(object instanceof THREE.Mesh) ||
      object instanceof THREE.InstancedMesh ||
      Array.isArray(object.material)
    )
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
  const width = maxX - minX;
  function polygon(points: CityPoint[], y: number, color: string) {
    const shape = new THREE.Shape();
    points.forEach((p, i) =>
      i ? shape.lineTo(p.x, -p.z) : shape.moveTo(p.x, -p.z),
    );
    shape.closePath();
    const mesh = kit.mesh(
      new THREE.ShapeGeometry(shape),
      kit.material(color),
      root,
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.castShadow = false;
    return mesh;
  }
  const north = RIVER_SECTIONS.map((p) => ({ x: p.x, z: p.z - p.half }));
  const south = RIVER_SECTIONS.map((p) => ({ x: p.x, z: p.z + p.half }));
  polygon(
    [{ x: minX, z: minZ }, { x: maxX, z: minZ }, ...north.slice().reverse()],
    0,
    '#82966d',
  );
  polygon([...south, { x: maxX, z: maxZ }, { x: minX, z: maxZ }], 0, '#82966d');
  polygon([...north, ...south.slice().reverse()], -3, '#367f9e');
  for (const side of [-1, 1])
    for (let i = 0; i < RIVER_SECTIONS.length - 1; i++) {
      const a = RIVER_SECTIONS[i],
        b = RIVER_SECTIONS[i + 1];
      const from = { x: a.x, z: a.z + side * (a.half + 3) },
        to = { x: b.x, z: b.z + side * (b.half + 3) };
      ribbon(kit, root, from, to, 5, 0.025, '#d4d2b7');
      const edge = new THREE.BufferGeometry();
      edge.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [
            from.x,
            0,
            from.z,
            to.x,
            0,
            to.z,
            to.x,
            -3,
            to.z,
            from.x,
            -3,
            from.z,
          ],
          3,
        ),
      );
      edge.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
      );
      edge.setIndex(side < 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
      edge.computeVertexNormals();
      kit.mesh(edge, kit.material('#8f8c82'), root);
    }
  for (const island of CITY_ISLANDS) polygon(island.points, 0.027, '#708858');
  for (const road of cityRoads) {
    ribbon(kit, root, road.from, road.to, road.width + 1.2, 0.045, '#d0cdbc');
    ribbon(kit, root, road.from, road.to, road.width, 0.058, '#535b5e');
    const dx = road.to.x - road.from.x,
      dz = road.to.z - road.from.z,
      length = Math.hypot(dx, dz);
    for (let distance = 2; distance < length - 2; distance += 5) {
      const x = road.from.x + (dx * distance) / length,
        z = road.from.z + (dz * distance) / length;
      if (
        !roadDashClear(
          road.id,
          x + (dx * 1.15) / length,
          z + (dz * 1.15) / length,
        ) ||
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
  for (const r of cityRoads.filter((r) => r.bridge)) {
    const dx = r.to.x - r.from.x,
      dz = r.to.z - r.from.z,
      length = Math.hypot(dx, dz);
    ribbon(kit, root, r.from, r.to, r.width + 0.6, -0.14, '#869596');
    for (let t = 20; t < length - 10; t += 40)
      for (const side of [-1, 1]) {
        const x =
            r.from.x +
            (dx * t) / length -
            ((side * dz) / length) * (r.width / 2 + 0.2),
          z =
            r.from.z +
            (dz * t) / length +
            ((side * dx) / length) * (r.width / 2 + 0.2);
        kit.box(1.5, 3, 2, '#8f8c82', x, -1.6, z, root, 0);
        kit.cylinder(0.09, 0.14, 4.5, '#40545a', x, 2.25, z, root);
        if (r.bridge === 'kommunalny')
          for (let j = 0; j < 12; j++) {
            const f = (q: number) => -2.7 + 2.3 * (1 - ((q - 6) / 6) ** 2);
            kit.rod(
              new THREE.Vector3(
                x + (dx / length) * (j - 6) * 2,
                f(j),
                z + (dz / length) * (j - 6) * 2,
              ),
              new THREE.Vector3(
                x + (dx / length) * (j - 5) * 2,
                f(j + 1),
                z + (dz / length) * (j - 5) * 2,
              ),
              0.32,
              '#d4d2b7',
              root,
            );
          }
      }
  }
  for (const b of cityBarriers) {
    const rail = kit.box(b.w, 1.1, b.d, '#b4b8a5', b.x, 0.5, b.z, root, 0);
    rail.rotation.y = b.angle ?? 0;
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
      new THREE.RingGeometry(36.9, 37.05, 4, 1, (j * Math.PI) / 16, 0.1),
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
    if (createCentreLandmark(kit, root, building)) continue;
    if (createDistrictLandmark(kit, root, building)) continue;
    if (createCivicBuilding(kit, root, building, lit)) continue;
    if (createNeighbourhoodBuilding(kit, root, building, index)) continue;
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
  createCityParking(kit, root);
  createNeighbourhoodGreenery(kit, root);
  createSiberianRidges(kit, root);
  createNorthernChapel(kit, root);
  createEuropeMonument(kit, root);
  createChapelCannon(kit, root);
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
  label('КАРАУЛЬНАЯ ГОРА', -12, minZ - 14, 160, 14);
  CITY_DISTRICTS.forEach((d) => label(d.name, d.x, d.z, 220, 1));
  CITY_ISLANDS.forEach((d) => label(d.name, d.x, d.z, 170, 1));
  BRIDGES.forEach((b) => label(b.title, b.x, b.z, 150, 3));
  const overviewNames = cityStops.map((s) => s.title.split(' · ')[0]);
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
  dummy.rotation.set(-Math.PI / 2, 0, 0);
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
        ring.scale.setScalar(
          overview
            ? selected
              ? 24
              : 16
            : selected
              ? 1.04 + Math.sin(time * 3) * 0.045
              : 1,
        );
        (ring.material as THREE.MeshBasicMaterial).opacity = selected
          ? 0.92
          : 0.42;
        sign.visible = !overview && index === targetStop && index !== nearStop;
        // Only the selected destination gets a large label; neighbouring story
        // entrances would overlap at the scale of the whole city.
        overviewLabel.visible = overview && selected;
        const width = selected ? 6.4 : 5.6;
        sign.scale.set(width, (width * 96) / 512, 1);
        const mapWidth = THREE.MathUtils.clamp(overviewLabelWidth, 180, 1800);
        overviewLabel.scale.set(mapWidth, (mapWidth * 96) / 512, 1);
        overviewLabel.position.y = overview ? mapWidth * 0.14 : 3;
      });
      for (let i = 0; i < 64; i++) {
        const x = minX + ((i * 7.73 + time * 0.65) % width);
        dummy.position.set(
          x,
          -2.78,
          riverZ(x) + Math.sin(i * 13.3) * (riverBankZ(x, 1) - riverZ(x) - 2),
        );
        dummy.scale.set(0.7 + (i % 4) * 0.24, 1, 1);
        dummy.updateMatrix();
        flow.setMatrixAt(i, dummy.matrix);
      }
      flow.instanceMatrix.needsUpdate = true;
    },
  };
}

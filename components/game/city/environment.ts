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
  ROUNDABOUT,
  CITY_ROUNDABOUTS,
  cityBuildings,
  cityRoads,
  cityStops,
  riverZ,
  type CityPoint,
  type CityRoad,
  distanceToRoad,
} from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { makeLabel } from '../world/labels.ts';
import {
  CITY_DECK_THICKNESS,
  cityGroundHeight,
  cityRoadHeight,
  cityRoadLayer,
  citySurfacePose,
} from '../../../lib/game/city/surface.ts';
import { convexPieces, drapedSurface, liftScenery } from './relief.ts';
import { createCityLandmarks } from './landmarks.ts';
import { createStreetDetails, createStreetSignalLight } from './streets.ts';
import { collectCityFoliage } from './foliage-occlusion.ts';
import { createBridgeRails } from './bridge-rails.ts';
import { createYeniseySign } from './yenisey-sign.ts';
import { roadDashClear } from '../../../lib/game/city/crossings.ts';
import {
  buildRoadSurfaces,
  roadSurfaceOutlines,
} from '../../../lib/game/city/road-surfaces.ts';
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
  const groundRoadHoles = roadSurfaceOutlines(
    cityRoads.filter(
      (r) =>
        cityRoadLayer(r) !== 'raised' ||
        (!!r.bridge && r.bridge !== 'nikolaevsky'),
    ),
    ROUNDABOUT,
    0.65,
  );
  function polygon(
    points: CityPoint[],
    y: number,
    color: string,
    ground = true,
  ) {
    const mesh = drapedSurface(
      kit,
      root,
      convexPieces(points),
      color,
      ground ? cityGroundHeight : () => 0,
      y,
      ground ? 8 : 80,
      ground ? groundRoadHoles : [],
    );
    mesh.name = ground ? 'city-relief-ground' : 'city-water';
    return mesh;
  }
  const roadSample = (roads: readonly CityRoad[]) => (x: number, z: number) => {
    let nearest = roads[0],
      best = Infinity;
    for (const road of roads) {
      const gap = distanceToRoad(x, z, road);
      if (gap < best) {
        best = gap;
        nearest = road;
      }
    }
    return cityRoadHeight(nearest, x, z);
  };
  const surfaceHeight = (x: number, z: number) =>
    citySurfacePose(x, z, 0).elevation;
  const north = RIVER_SECTIONS.map((p) => ({ x: p.x, z: p.z - p.half }));
  const south = RIVER_SECTIONS.map((p) => ({ x: p.x, z: p.z + p.half }));
  polygon(
    [{ x: minX, z: minZ }, { x: maxX, z: minZ }, ...north.slice().reverse()],
    0,
    '#82966d',
  );
  polygon([...south, { x: maxX, z: maxZ }, { x: minX, z: maxZ }], 0, '#82966d');
  polygon([...north, ...south.slice().reverse()], -3, '#367f9e', false);
  for (const side of [-1, 1])
    for (let i = 0; i < RIVER_SECTIONS.length - 1; i++) {
      const a = RIVER_SECTIONS[i],
        b = RIVER_SECTIONS[i + 1];
      const from = { x: a.x, z: a.z + side * (a.half + 3) },
        to = { x: b.x, z: b.z + side * (b.half + 3) };
      const bankDx = to.x - from.x,
        bankDz = to.z - from.z,
        bankLength = Math.hypot(bankDx, bankDz);
      const nx = (-bankDz / bankLength) * 2.5,
        nz = (bankDx / bankLength) * 2.5;
      drapedSurface(
        kit,
        root,
        [
          [
            { x: from.x + nx, z: from.z + nz },
            { x: to.x + nx, z: to.z + nz },
            { x: to.x - nx, z: to.z - nz },
            { x: from.x - nx, z: from.z - nz },
          ],
        ],
        '#d4d2b7',
        cityGroundHeight,
        0.025,
        4,
      );
      const bankPositions: number[] = [],
        bankUVs: number[] = [];
      const segments = Math.ceil(bankLength / 8);
      const shore = (t: number, bottom = false) => {
        const x = a.x + (b.x - a.x) * t;
        const z =
          a.z +
          side * a.half +
          (b.z + side * b.half - (a.z + side * a.half)) * t;
        return [x, bottom ? -3 : cityGroundHeight(x, z + side * 0.02), z];
      };
      for (let j = 0; j < segments; j++) {
        const p = shore(j / segments),
          q = shore((j + 1) / segments),
          r = shore((j + 1) / segments, true),
          t = shore(j / segments, true);
        bankPositions.push(...p, ...q, ...r, ...p, ...r, ...t);
        bankUVs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      }
      const edge = new THREE.BufferGeometry();
      edge.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(bankPositions, 3),
      );
      edge.setAttribute('uv', new THREE.Float32BufferAttribute(bankUVs, 2));
      edge.computeVertexNormals();
      const bankMaterial = kit.material('#8f8c82');
      bankMaterial.side = THREE.DoubleSide;
      kit.mesh(edge, bankMaterial, root);
    }
  for (const island of CITY_ISLANDS) polygon(island.points, 0.027, '#708858');
  for (const layer of new Set(cityRoads.map(cityRoadLayer))) {
    const roads = cityRoads.filter((road) => cityRoadLayer(road) === layer);
    const surfaces = buildRoadSurfaces(
      roads,
      layer === 'ground' ? ROUNDABOUT : undefined,
    );
    const sample = layer === 'raised' ? roadSample(roads) : cityGroundHeight;
    const asphalt = drapedSurface(
      kit,
      root,
      surfaces.asphalt,
      '#535b5e',
      sample,
      0.065,
      layer === 'raised' ? 1 : 3,
    );
    asphalt.name = `city-asphalt:${layer}`;
    const curbs = drapedSurface(
      kit,
      root,
      surfaces.curbs,
      '#b9b9af',
      sample,
      0.14,
      layer === 'raised' ? 1 : 3,
    );
    curbs.name = `city-curbs:${layer}`;
  }
  for (const road of cityRoads) {
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
      const paint = new THREE.Group();
      root.add(paint);
      ribbon(
        kit,
        paint,
        { x, z },
        { x: x + (dx * 2.3) / length, z: z + (dz * 2.3) / length },
        0.11,
        0.1,
        '#e7e6dc',
      );
      liftScenery(kit, paint, (px, pz) => cityRoadHeight(road, px, pz));
    }
  }
  for (const r of cityRoads.filter(
    (r) => r.bridge || cityRoadLayer(r) === 'raised',
  )) {
    const dx = r.to.x - r.from.x,
      dz = r.to.z - r.from.z,
      length = Math.hypot(dx, dz);
    const nx = -dz / length,
      nz = dx / length;
    const corners = [
      { x: r.from.x + (nx * r.width) / 2, z: r.from.z + (nz * r.width) / 2 },
      { x: r.to.x + (nx * r.width) / 2, z: r.to.z + (nz * r.width) / 2 },
      { x: r.to.x - (nx * r.width) / 2, z: r.to.z - (nz * r.width) / 2 },
      { x: r.from.x - (nx * r.width) / 2, z: r.from.z - (nz * r.width) / 2 },
    ];
    const underside = drapedSurface(
      kit,
      root,
      [corners],
      '#718083',
      (x, z) => cityRoadHeight(r, x, z),
      -CITY_DECK_THICKNESS,
      4,
    );
    underside.material = kit.material('#718083');
    underside.material.side = THREE.DoubleSide;
    underside.castShadow = true;
    for (let along = 0; along < length; along += 8) {
      const next = Math.min(length, along + 8);
      for (const side of [-1, 1]) {
        const point = (t: number, y: number) => {
          const x =
            r.from.x + (dx * t) / length + side * nx * (r.width / 2 + 0.2);
          const z =
            r.from.z + (dz * t) / length + side * nz * (r.width / 2 + 0.2);
          return new THREE.Vector3(x, cityRoadHeight(r, x, z) + y, z);
        };
        const a = point(along, 0),
          b = point(next, 0),
          c = point(next, -CITY_DECK_THICKNESS),
          d = point(along, -CITY_DECK_THICKNESS);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(
            [
              ...a.toArray(),
              ...b.toArray(),
              ...c.toArray(),
              ...a.toArray(),
              ...c.toArray(),
              ...d.toArray(),
            ],
            3,
          ),
        );
        geometry.setAttribute(
          'uv',
          new THREE.Float32BufferAttribute(
            [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1],
            2,
          ),
        );
        geometry.computeVertexNormals();
        kit.mesh(geometry, underside.material, root);
      }
    }
    if (r.bridge === 'kommunalny') {
      for (let start = 2; start + 24 < length - 2; start += 32) {
        for (const side of [-1, 1]) {
          const arch = (u: number) => {
            const t = start + u * 24;
            const x = r.from.x + (dx * t) / length + side * nx * r.width * 0.4;
            const z = r.from.z + (dz * t) / length + side * nz * r.width * 0.4;
            const y =
              cityRoadHeight(r, x, z) -
              CITY_DECK_THICKNESS -
              0.65 -
              4.2 * (2 * u - 1) ** 2;
            return new THREE.Vector3(x, y, z);
          };
          for (let step = 0; step < 16; step++)
            kit.rod(
              arch(step / 16),
              arch((step + 1) / 16),
              0.34,
              '#d4d2b7',
              root,
            );
          for (const u of [0, 0.25, 0.75, 1]) {
            const bottom = arch(u),
              top = bottom.clone();
            top.y = cityRoadHeight(r, top.x, top.z) - CITY_DECK_THICKNESS;
            kit.rod(bottom, top, 0.16, '#d4d2b7', root);
          }
        }
      }
    }
    for (let along = 18; along < length - 8; along += 32) {
      const x = r.from.x + (dx * along) / length,
        z = r.from.z + (dz * along) / length;
      const lowerRoad = cityRoads.some(
        (road) =>
          cityRoadLayer(road) === 'lower' &&
          distanceToRoad(x, z, road) < road.width / 2 + 4,
      );
      if (lowerRoad) continue;
      const top = cityRoadHeight(r, x, z) - CITY_DECK_THICKNESS,
        bottom = cityGroundHeight(x, z) - 0.5;
      if (top - bottom < 0.75) continue;
      for (const side of [-1, 1])
        kit.box(
          1.1,
          top - bottom,
          1.6,
          '#a3aaa1',
          x + side * nx * r.width * 0.36,
          (top + bottom) / 2,
          z + side * nz * r.width * 0.36,
          root,
          0,
        );
    }
  }
  createBridgeRails(kit, root);
  for (const roundabout of CITY_ROUNDABOUTS) {
    const ringRoot = new THREE.Group();
    root.add(ringRoot);
    // The round island is a real circular collider; its surrounding 16 m lane is drivable.
    // The same asphalt union includes the ring, with open entrances. The old
    // independent cream disk left a curb drawn straight across every approach.
    const islandCurb = kit.cylinder(
      roundabout.innerRadius,
      roundabout.innerRadius,
      0.38,
      '#c9c9ad',
      roundabout.x,
      0.19,
      roundabout.z,
      ringRoot,
    );
    islandCurb.userData.reliefDrape = true;
    kit.cylinder(
      roundabout.innerRadius - 0.4,
      roundabout.innerRadius - 0.4,
      0.07,
      '#829966',
      roundabout.x,
      0.4,
      roundabout.z,
      ringRoot,
    );
    for (let j = 0; j < 32; j++) {
      const dash = kit.mesh(
        new THREE.RingGeometry(
          (roundabout.innerRadius + roundabout.outerRadius) / 2 - 0.075,
          (roundabout.innerRadius + roundabout.outerRadius) / 2 + 0.075,
          4,
          1,
          (j * Math.PI) / 16,
          0.1,
        ),
        kit.material('#e7e6dc'),
        ringRoot,
      );
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(roundabout.x, 0.1, roundabout.z);
    }
    for (let j = 0; j < 8; j++) {
      const angle = (j * Math.PI) / 4,
        x = roundabout.x + Math.cos(angle) * 5.7,
        z = roundabout.z + Math.sin(angle) * 5.7;
      kit.cylinder(0.14, 0.2, 1.6, '#6c6650', x, 1.15, z, ringRoot);
      kit.sphere(1.05, 1.65, 1.05, '#708858', x, 2.7, z, ringRoot, 12);
    }
    liftScenery(kit, ringRoot, cityGroundHeight);
  }
  const lit = new THREE.MeshStandardMaterial({
    color: '#f3d5a3',
    emissive: '#e5b368',
    emissiveIntensity: 0.65,
  });
  kit.materials.add(lit);
  const cityRoot = root;
  for (const [index, building] of cityBuildings.entries()) {
    const root = new THREE.Group();
    root.position.y = cityGroundHeight(building.x, building.z);
    cityRoot.add(root);
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
  const props = new THREE.Group();
  root.add(props);
  createCityParking(kit, props);
  createYeniseySign(kit, props);
  createNeighbourhoodGreenery(kit, props);
  createNorthernChapel(kit, props);
  createEuropeMonument(kit, props);
  createChapelCannon(kit, props);
  const scenery = createCityLandmarks(kit, props, lit);
  const streetSignals = createStreetSignalLight(kit);
  const streetFurniture = createStreetDetails(
    kit,
    props,
    lit,
    scenery,
    streetSignals.material,
  );
  liftScenery(kit, props, cityGroundHeight);
  createSiberianRidges(kit, root);
  const cameraOccluders = collectCityFoliage(root);
  batchCity(kit, root);
  const labels: THREE.Sprite[] = [];
  const label = (text: string, x: number, z: number, width: number, y = 3) => {
    const sprite = makeLabel(kit, text, '#ede4bd', width);
    sprite.position.set(x, cityGroundHeight(x, z) + y, z);
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
    ring.position.set(stop.x, surfaceHeight(stop.x, stop.z) + 0.1, stop.z);
    ring.castShadow = false;
    const sign = makeLabel(kit, stop.title, stop.color, 5.6);
    sign.position.set(stop.x, surfaceHeight(stop.x, stop.z) + 3, stop.z);
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
    cameraOccluders,
    stops,
    labels,
    update(
      time: number,
      targetStop = -1,
      nearStop = -1,
      overview = false,
      overviewLabelWidth = 32,
      carPosition?: CityPoint,
    ) {
      streetSignals.update(time);
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
        const stop = cityStops[index];
        const clearOfCar =
          !carPosition ||
          Math.hypot(stop.x - carPosition.x, stop.z - carPosition.z) > 80;
        // Close destinations are already in the HUD/minimap. Keeping their
        // billboard out of the camera's neighbourhood prevents it crossing the
        // car immediately after nearStop clears on departure.
        sign.visible =
          !overview && index === targetStop && index !== nearStop && clearOfCar;
        // Only the selected destination gets a large label; neighbouring story
        // entrances would overlap at the scale of the whole city.
        overviewLabel.visible = overview && selected;
        const width = selected ? 6.4 : 5.6;
        sign.scale.set(width, (width * 96) / 512, 1);
        const mapWidth = THREE.MathUtils.clamp(overviewLabelWidth, 180, 1800);
        overviewLabel.scale.set(mapWidth, (mapWidth * 96) / 512, 1);
        overviewLabel.position.y =
          surfaceHeight(stop.x, stop.z) + (overview ? mapWidth * 0.14 : 3);
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

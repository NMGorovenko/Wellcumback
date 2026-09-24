import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY_BOBROVY_LOG } from '../../../lib/game/city/layout.ts';
import { cityGroundHeight } from '../../../lib/game/city/surface.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { drapedSurface } from './relief.ts';
import { facadeText } from './facade-text.ts';

/** Compressed summer silhouette from the official fanpark map: two lift lines,
 * branched pistes in woodland, a glazed base and a separate upper station. */
export function createBobrovyLog(kit: RenderKit, root: THREE.Group) {
  const area = new THREE.Group();
  area.name = 'bobrovy-log';
  root.add(area);
  const base = CITY_BOBROVY_LOG.base;
  const routes = [
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(base.x - 24, 0, base.z + 35),
      new THREE.Vector3(-915, 0, 1360),
      new THREE.Vector3(-1030, 0, 1480),
      new THREE.Vector3(-925, 0, 1590),
    ]),
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(base.x + 18, 0, base.z + 35),
      new THREE.Vector3(-770, 0, 1320),
      new THREE.Vector3(-825, 0, 1440),
      new THREE.Vector3(-805, 0, 1550),
    ]),
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-866, 0, 1260),
      new THREE.Vector3(-875, 0, 1380),
      new THREE.Vector3(-900, 0, 1480),
      new THREE.Vector3(-925, 0, 1590),
    ]),
  ];
  const pisteSamples = routes.flatMap((route) => route.getPoints(48));
  for (const route of routes) {
    const points = route.getPoints(48);
    const polygons = points.slice(1).map((p, i) => {
      const a = points[i],
        n = p.clone().sub(a).normalize();
      const nx = -n.z * 10,
        nz = n.x * 10;
      return [
        { x: a.x + nx, z: a.z + nz },
        { x: p.x + nx, z: p.z + nz },
        { x: p.x - nx, z: p.z - nz },
        { x: a.x - nx, z: a.z - nz },
      ];
    });
    const piste = drapedSurface(
      kit,
      area,
      polygons,
      '#9ea67b',
      cityGroundHeight,
      0.12,
      4,
    );
    piste.name = 'bobrovy-log:piste';
  }
  const lodge = new THREE.Group();
  lodge.position.set(
    base.x + 32,
    cityGroundHeight(base.x + 32, base.z + 41),
    base.z + 41,
  );
  area.add(lodge);
  kit.box(29, 10, 18, '#d7d5c5', 0, 5, 0, lodge, 0);
  kit.box(20, 7, 0.25, '#426976', 0, 4.7, -9.2, lodge, 0);
  for (let x = -10; x <= 10; x += 2.5)
    kit.box(0.15, 7, 0.35, '#b6bcc0', x, 4.7, -9.4, lodge, 0);
  kit.box(31, 0.8, 20, '#889a9e', 0, 10.3, 0, lodge, 0);
  kit.box(18, 0.5, 7, '#9daeb0', 0, 4, -12, lodge, 0);
  const lettering = new THREE.Group();
  lettering.rotation.y = Math.PI;
  lodge.add(lettering);
  facadeText(kit, lettering, 'БОБРОВЫЙ ЛОГ', '#e4f1ef', 20, 0, 8.9, 9.45);

  const lifts = [
    {
      from: new THREE.Vector3(-866, 0, 1260),
      to: new THREE.Vector3(-925, 0, 1590),
    },
    {
      from: new THREE.Vector3(-810, 0, 1260),
      to: new THREE.Vector3(-805, 0, 1550),
    },
  ];
  const chairParts = [
    new THREE.BoxGeometry(2.5, 0.22, 0.8).translate(0, 0, 0),
    new THREE.BoxGeometry(2.5, 0.9, 0.18).translate(0, 0.5, 0.4),
    new THREE.BoxGeometry(0.12, 2, 0.12).translate(-1.18, 1, 0.25),
    new THREE.BoxGeometry(0.12, 2, 0.12).translate(1.18, 1, 0.25),
    new THREE.BoxGeometry(2.5, 0.12, 0.12).translate(0, 2, 0.25),
    new THREE.BoxGeometry(0.12, 0.7, 0.12).translate(0, 2.4, 0.25),
  ];
  const chairGeometry = mergeGeometries(chairParts)!;
  chairParts.forEach((p) => p.dispose());
  kit.geometries.add(chairGeometry);
  const chairs = new THREE.InstancedMesh(
    chairGeometry,
    kit.material('#64878b'),
    32,
  );
  chairs.name = 'bobrovy-log:chairs';
  // Chairs travel along both complete cables; a fixed conservative bound
  // avoids recomputing per-instance bounds on every animation frame.
  chairs.frustumCulled = false;
  area.add(chairs);
  const liftPosition = (
    line: (typeof lifts)[number],
    t: number,
    side: number,
  ) => {
    const p = line.from.clone().lerp(line.to, t);
    p.x += side * 2.1;
    p.y = cityGroundHeight(p.x, p.z) + 9;
    return p;
  };
  for (const line of lifts) {
    for (let i = 0; i <= 8; i++) {
      const p = liftPosition(line, i / 8, 0);
      kit.box(0.6, 9, 0.6, '#728381', p.x, p.y - 4.5, p.z, area, 0);
      kit.box(5.3, 0.4, 0.6, '#566e72', p.x, p.y, p.z, area, 0);
    }
    for (const side of [-1, 1])
      for (let i = 0; i < 32; i++)
        kit.rod(
          liftPosition(line, i / 32, side),
          liftPosition(line, (i + 1) / 32, side),
          0.045,
          '#3b4d50',
          area,
        );
    for (const t of [0, 1]) {
      const p = liftPosition(line, t, 0);
      kit.box(8, 3, 10, '#d4ddd1', p.x, p.y - 1.3, p.z, area, 0.1);
      kit.box(10, 0.5, 12, '#536f77', p.x, p.y + 0.5, p.z, area, 0.05);
    }
  }
  const treeGeometry = new THREE.ConeGeometry(1, 1, 7);
  kit.geometries.add(treeGeometry);
  const forest = new THREE.InstancedMesh(
    treeGeometry,
    kit.material('#3f634e'),
    520,
  );
  forest.name = 'bobrovy-log:forest';
  const dummy = new THREE.Object3D();
  let count = 0;
  for (let i = 0; i < 950 && count < 520; i++) {
    const x = -1110 + ((i * 137.63) % 510),
      z = 1290 + ((i * 83.39) % 330);
    if (pisteSamples.some((p) => Math.hypot(p.x - x, p.z - z) < 16)) continue;
    if (
      lifts.some((l) => {
        const t = Math.max(
          0,
          Math.min(1, (z - l.from.z) / (l.to.z - l.from.z)),
        );
        return Math.abs(x - (l.from.x + (l.to.x - l.from.x) * t)) < 6;
      })
    )
      continue;
    const h = 6 + (i % 7);
    dummy.position.set(x, cityGroundHeight(x, z) + h / 2, z);
    dummy.scale.set(2.2 + (i % 3), h, 2.2 + (i % 3));
    dummy.updateMatrix();
    forest.setMatrixAt(count++, dummy.matrix);
  }
  forest.count = count;
  forest.computeBoundingSphere();
  area.add(forest);
  function update(time: number) {
    for (let j = 0; j < lifts.length; j++)
      for (let i = 0; i < 16; i++) {
        const phase = (i / 16 + time / 160) % 1;
        const side = phase < 0.5 ? 1 : -1,
          t = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
        const p = liftPosition(lifts[j], t, side);
        dummy.position.copy(p);
        dummy.position.y -= 2.75;
        dummy.scale.setScalar(1);
        dummy.rotation.y = side > 0 ? 0 : Math.PI;
        dummy.updateMatrix();
        chairs.setMatrixAt(j * 16 + i, dummy.matrix);
      }
    chairs.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { root: area, update };
}

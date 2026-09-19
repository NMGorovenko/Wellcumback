import * as THREE from 'three';
import type { RaceState } from '../../../lib/game/race/types';
import type { RenderKit } from '../world/render-kit';
import { citySurfacePose } from '../../../lib/game/city/surface.ts';

/** Fixed pools: no scene objects or materials allocated while drifting. */
export function createRaceEffects(kit: RenderKit) {
  const dummy = new THREE.Object3D();
  const skidGeometry = new THREE.PlaneGeometry(0.21, 0.72);
  skidGeometry.rotateX(-Math.PI / 2);
  const skidMaterial = new THREE.MeshBasicMaterial({
    color: '#1a2022',
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const smokeGeometry = new THREE.IcosahedronGeometry(0.6, 0);
  const smokeMaterial = new THREE.MeshBasicMaterial({
    color: '#c3c7c3',
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
  });
  kit.geometries.add(skidGeometry);
  kit.geometries.add(smokeGeometry);
  kit.materials.add(skidMaterial);
  kit.materials.add(smokeMaterial);
  const marks = new THREE.InstancedMesh(skidGeometry, skidMaterial, 1600);
  const smoke = new THREE.InstancedMesh(smokeGeometry, smokeMaterial, 160);
  marks.frustumCulled = smoke.frustumCulled = false;
  marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  kit.scene.add(marks, smoke);
  dummy.scale.setScalar(0);
  dummy.updateMatrix();
  for (let i = 0; i < 1600; i++) marks.setMatrixAt(i, dummy.matrix);
  for (let i = 0; i < 160; i++) smoke.setMatrixAt(i, dummy.matrix);
  const particles = Array.from({ length: 160 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    age: 10,
  }));
  const previous = new Map<string, { x: number; z: number }>();
  let markIndex = 0,
    smokeIndex = 0;
  return (s: RaceState, dt: number) => {
    if (s.phase !== 'racing') {
      particles.forEach((p) => {
        p.age = 10;
      });
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      for (let i = 0; i < 160; i++) smoke.setMatrixAt(i, dummy.matrix);
      smoke.instanceMatrix.needsUpdate = true;
      previous.clear();
      return;
    }
    if (s.paused) return;
    for (const r of s.racers) {
      const c = r.car,
        last = previous.get(r.id);
      if (
        !c.drifting ||
        c.speed < 4 ||
        (last && Math.hypot(c.x - last.x, c.z - last.z) < 0.55)
      )
        continue;
      previous.set(r.id, { x: c.x, z: c.z });
      for (const side of [-0.82, 0.82]) {
        const x = c.x - Math.sin(c.heading) * 1.25 + Math.cos(c.heading) * side;
        const z = c.z + Math.cos(c.heading) * 1.25 + Math.sin(c.heading) * side;
        const contact =
          s.trackId === 'krasnoyarsk'
            ? citySurfacePose(x, z, c.heading, r.elevation, c.surfaceId)
            : {
                elevation: r.elevation - Math.tan(r.pitch) * 1.25,
                pitch: r.pitch,
              };
        dummy.position.set(
          x,
          contact.elevation + (s.trackId === 'krasnoyarsk' ? 0.105 : 0.05),
          z,
        );
        dummy.rotation.order = 'YXZ';
        dummy.rotation.set(contact.pitch, -c.heading, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        marks.setMatrixAt(markIndex++ % 1600, dummy.matrix);
        Object.assign(particles[smokeIndex++ % 160], {
          x,
          z,
          y: contact.elevation + 0.28,
          age: 0,
        });
      }
    }
    particles.forEach((p, i) => {
      p.age += dt;
      dummy.position.set(p.x + p.age * 0.25, p.y + p.age * 0.65, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(
        p.age < 1.2 ? (0.4 + p.age) * Math.min(1, (1.2 - p.age) * 5) : 0,
      );
      dummy.updateMatrix();
      smoke.setMatrixAt(i, dummy.matrix);
    });
    marks.instanceMatrix.needsUpdate = smoke.instanceMatrix.needsUpdate = true;
  };
}

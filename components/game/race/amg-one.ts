import * as THREE from 'three';
import type { CityState } from '../../../lib/game/city/engine.ts';
import { people } from '../../../lib/game/presets.ts';
import type { RenderKit } from '../world/render-kit';
import { createRig } from '../world/rig';

/** A separate mid-engine silhouette: low nose, enclosed bubble, roof scoop,
 * dorsal fin, rear wing, wide diffuser. Dimensions follow the production ONE. */
export function createAmgOne(kit: RenderKit, color: string, driverId: string) {
  const root = new THREE.Group(),
    body = new THREE.Group();
  root.add(body);
  kit.scene.add(root);
  root.name = 'amg-one';
  const paint = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.55,
    roughness: 0.25,
    clearcoat: 1,
  });
  const black = kit.material('#15232a', 0.5, 0.25),
    silver = kit.material('#a9c5cb', 0.24, 0.8);
  const sections = [
    [-2.38, 0.78, 0.19, 0.49],
    [-1.82, 0.96, 0.18, 0.72],
    [-1.1, 0.94, 0.18, 0.74],
    [-0.4, 0.88, 0.19, 0.73],
    [0.5, 0.94, 0.19, 0.83],
    [1.35, 1, 0.22, 0.87],
    [2.2, 0.94, 0.28, 0.73],
    [2.38, 0.83, 0.28, 0.6],
  ];
  const positions: number[] = [],
    indices: number[] = [];
  sections.forEach(([z, w, b, t]) => {
    for (const [x, y] of [
      [-w * 0.7, b],
      [-w, b + 0.12],
      [-w, t - 0.1],
      [-w * 0.64, t],
      [w * 0.64, t],
      [w, t - 0.1],
      [w, b + 0.12],
      [w * 0.7, b],
    ])
      positions.push(x, y, z);
  });
  for (let n = 0; n < sections.length - 1; n++)
    for (let i = 0; i < 8; i++) {
      const a = n * 8 + i,
        b = n * 8 + ((i + 1) % 8);
      indices.push(a, b + 8, b, a, a + 8, b + 8);
    }
  // Close nose and tail with the opposite winding of the longitudinal strips.
  for (let i = 1; i < 7; i++) {
    indices.push(0, i, i + 1);
    const tail = (sections.length - 1) * 8;
    indices.push(tail, tail + i + 1, tail + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  kit.mesh(geometry, paint, body);
  const painted = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
  ) => {
    const mesh = kit.box(w, h, d, color, x, y, z, body, 0.025);
    mesh.material = paint;
    return mesh;
  };
  kit.box(1.94, 0.055, 4.5, '#172329', 0, 0.21, 0, body, 0.04);
  kit.box(1.75, 0.07, 0.45, '#142127', 0, 0.22, -2.17, body, 0.03);
  const cockpit = kit.mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshPhysicalMaterial({
      color: '#87a8b7',
      transparent: true,
      opacity: 0.32,
      roughness: 0.16,
      metalness: 0.25,
      depthWrite: false,
    }),
    body,
  );
  cockpit.scale.set(0.61, 0.5, 1.04);
  cockpit.position.set(0, 0.77, -0.1);
  for (const side of [-1, 1]) {
    painted(0.15, 0.11, 1.64, side * 0.53, 0.83, -0.13);
    const arch = kit.box(
      0.045,
      0.048,
      1.7,
      color,
      side * 0.4,
      1.18,
      -0.02,
      body,
      0.02,
    );
    arch.material = paint;
    arch.rotation.x = -0.06;
    kit.box(
      0.055,
      0.43,
      0.025,
      '#111e26',
      side * 0.88,
      0.48,
      0.3,
      body,
      0.015,
    ).rotation.z = side * -0.25;
    kit.box(0.1, 0.18, 0.72, '#1c2930', side * 0.94, 0.65, 0.69, body, 0.025);
    painted(0.2, 0.09, 0.3, side * 1.01, 0.89, -0.57);
    const lamp = kit.box(
      0.42,
      0.045,
      0.12,
      '#ebfbff',
      side * 0.54,
      0.54,
      -2.16,
      body,
      0.02,
    );
    (lamp.material as THREE.MeshStandardMaterial).emissive.set('#79b4c3');
    kit.box(
      0.64,
      0.037,
      0.045,
      '#ee4547',
      side * 0.47,
      0.67,
      2.32,
      body,
      0.015,
    );
    for (let j = 0; j < 5; j++)
      kit.box(
        0.35,
        0.024,
        0.045,
        '#202c30',
        side * 0.66,
        0.76,
        -1.37 + j * 0.07,
        body,
        0.005,
      );
    kit.rod(
      new THREE.Vector3(side * 0.7, 0.75, 1.87),
      new THREE.Vector3(side * 0.7, 1.22, 1.94),
      0.035,
      '#17272f',
      body,
    );
  }
  const wing = kit.box(2.1, 0.06, 0.42, color, 0, 1.2, 1.94, body, 0.025);
  wing.material = paint;
  kit.box(0.12, 0.37, 1.2, '#1a272e', 0, 1.06, 1.16, body, 0.02);
  const scoop = kit.sphere(0.19, 0.17, 0.32, color, 0, 1.26, 0.3, body, 16);
  scoop.material = paint;
  kit.box(0.22, 0.12, 0.065, '#14232c', 0, 1.28, 0.02, body, 0.025);
  for (const x of [-0.7, -0.35, 0, 0.35, 0.7])
    kit.box(0.025, 0.15, 0.7, '#142127', x, 0.27, 2.08, body, 0.015);
  for (const [x, y, r] of [
    [0, 0.52, 0.13],
    [-0.22, 0.5, 0.065],
    [0.22, 0.5, 0.065],
  ]) {
    const pipe = kit.mesh(
      new THREE.CylinderGeometry(r, r, 0.1, 16),
      silver,
      body,
    );
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, y, 2.34);
    const hole = kit.mesh(new THREE.CircleGeometry(r * 0.82, 16), black, body);
    hole.position.set(x, y, 2.4);
  }
  const wheels: { root: THREE.Group; roll: THREE.Group; front: boolean }[] = [];
  for (const z of [-1.35, 1.37])
    for (const side of [-1, 1]) {
      const w = new THREE.Group(),
        roll = new THREE.Group();
      w.position.set(side * 0.93, 0.37, z);
      root.add(w);
      w.add(roll);
      const tire = kit.mesh(
        new THREE.CylinderGeometry(0.37, 0.37, 0.28, 24),
        kit.material('#131c21', 0.9),
        roll,
      );
      tire.rotation.z = Math.PI / 2;
      const rim = kit.mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 0.29, 24),
        black,
        roll,
      );
      rim.rotation.z = Math.PI / 2;
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5;
        const spoke = kit.box(
          0.025,
          0.025,
          0.26,
          '#859398',
          side * 0.15,
          Math.sin(angle) * 0.12,
          Math.cos(angle) * 0.12,
          roll,
          0.004,
        );
        spoke.rotation.x = -angle;
      }
      wheels.push({ root: w, roll, front: z < 0 });
    }
  const rig = createRig(
    kit,
    people.find((p) => p.id === driverId) ?? people[0],
    body,
  );
  body.attach(rig.head);
  rig.root.removeFromParent();
  rig.head.position.set(-0.27, 0.98, -0.13);
  rig.head.scale.setScalar(0.95);
  rig.head.rotation.y = Math.PI;
  kit.sphere(0.18, 0.16, 0.16, '#24343d', -0.27, 0.76, -0.1, body);
  const steering = kit.torus(0.13, 0.02, '#19282f', -0.27, 0.8, -0.51, body);
  steering.rotation.x = 0.4;
  let roll = 0;
  return {
    root,
    body,
    passengers: [rig.head],
    update(s: CityState, dt: number) {
      root.position.set(s.x, 0.025, s.z);
      root.rotation.y = -s.heading;
      const forward = s.vx * Math.sin(s.heading) - s.vz * Math.cos(s.heading);
      roll -= (forward * dt) / 0.37;
      wheels.forEach((w) => {
        w.root.rotation.y = w.front ? -s.steering * 0.38 : 0;
        w.roll.rotation.x = roll;
      });
      body.rotation.z = THREE.MathUtils.lerp(
        body.rotation.z,
        -s.steering * Math.min(0.03, s.speed * 0.001),
        1 - Math.exp(-dt * 10),
      );
      wing.rotation.x = THREE.MathUtils.lerp(
        wing.rotation.x,
        s.throttle! < 0 ? -0.28 : Math.min(0.12, s.speed * 0.004),
        1 - Math.exp(-dt * 5),
      );
    },
  };
}

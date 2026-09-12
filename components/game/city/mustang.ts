import * as THREE from 'three';
import type { CityState } from '../../../lib/game/city/engine.ts';
import { people } from '../../../lib/game/presets.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { createRig } from '../world/rig.ts';

/** Sculpted cross-sections, rather than a scaled box: long hood, pinched nose,
 * strong rear shoulders, short fastback tail. Front is local -Z. */
function bodyGeometry() {
  const sections = [
    [-2.13, 0.72, 0.33, 0.68],
    [-1.85, 0.87, 0.28, 0.87],
    [-1.15, 0.89, 0.26, 1.01],
    [-0.5, 0.83, 0.25, 1.02],
    [0.6, 0.85, 0.26, 1.01],
    [1.35, 0.92, 0.28, 1.0],
    [2.05, 0.83, 0.35, 0.88],
  ];
  const positions: number[] = [],
    indices: number[] = [];
  for (const [z, w, bottom, top] of sections) {
    for (const [x, y] of [
      [-w * 0.79, bottom],
      [-w, bottom + 0.13],
      [-w, top - 0.12],
      [-w * 0.75, top],
      [w * 0.75, top],
      [w, top - 0.12],
      [w, bottom + 0.13],
      [w * 0.79, bottom],
    ])
      positions.push(x, y, z);
  }
  for (let n = 0; n < sections.length - 1; n++)
    for (let side = 0; side < 8; side++) {
      const a = n * 8 + side,
        b = n * 8 + ((side + 1) % 8);
      indices.push(a, b, b + 8, a, b + 8, a + 8);
    }
  for (let n = 1; n < 7; n++) {
    indices.push(0, n + 1, n);
    const end = (sections.length - 1) * 8;
    indices.push(end, end + n, end + n + 1);
  }
  for (let i = 0; i < indices.length; i += 3)
    [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
function panel(
  kit: RenderKit,
  points: number[],
  material: THREE.Material,
  parent: THREE.Object3D,
) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return kit.mesh(geometry, material, parent);
}

export function createMustang(kit: RenderKit) {
  const root = new THREE.Group();
  root.name = 'red-mustang';
  kit.scene.add(root);
  const body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshPhysicalMaterial({
    color: '#c52236',
    metalness: 0.46,
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.16,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#aacdd8',
    metalness: 0.08,
    roughness: 0.11,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const chrome = kit.material('#acbbc0', 0.23, 0.85),
    black = kit.material('#18252c', 0.5, 0.15);
  const redLamp = new THREE.MeshStandardMaterial({
    color: '#ff473b',
    emissive: '#ff2519',
    emissiveIntensity: 1.7,
    roughness: 0.3,
  });
  const headlamp = new THREE.MeshStandardMaterial({
    color: '#ecfcff',
    emissive: '#d2efff',
    emissiveIntensity: 2.0,
    roughness: 0.2,
  });
  kit.mesh(bodyGeometry(), paint, body);
  const painted = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    radius = 0.025,
  ) => {
    const mesh = kit.box(w, h, d, '#c52236', x, y, z, body, radius);
    mesh.material = paint;
    return mesh;
  };
  kit.box(1.66, 0.075, 3.95, '#18252c', 0, 0.28, 0, body, 0.02);
  // Hood relief and two dark heat extractors, as on the supplied front photo.
  painted(1.22, 0.075, 1.35, 0, 0.985, -1.12, 0.04);
  for (const side of [-1, 1]) {
    const vent = kit.box(
      0.19,
      0.025,
      0.28,
      '#223039',
      side * 0.38,
      1.035,
      -0.94,
      body,
      0.025,
    );
    vent.rotation.y = side * 0.11;
    kit.rod(
      new THREE.Vector3(side * 0.55, 1.018, -0.48),
      new THREE.Vector3(side * 0.23, 0.865, -1.92),
      0.012,
      '#e5535a',
      body,
    );
    // One uninterrupted coupe door per side, with a single handle and mirror.
    kit.box(0.013, 0.023, 1.36, '#862232', side * 0.851, 0.47, -0.08, body, 0);
    kit.box(0.023, 0.5, 0.018, '#862232', side * 0.852, 0.71, 0.61, body, 0);
    kit.box(
      0.035,
      0.045,
      0.18,
      '#e28485',
      side * 0.867,
      0.91,
      0.27,
      body,
      0.015,
    );
    const mirror = painted(0.21, 0.12, 0.25, side * 0.94, 1.02, -0.5, 0.04);
    mirror.rotation.y = side * -0.14;
    kit.box(
      0.16,
      0.075,
      0.017,
      '#8caab4',
      side * 0.94,
      1.03,
      -0.37,
      body,
      0.01,
    );
    painted(0.17, 0.13, 3.2, side * 0.8, 0.4, 0.08, 0.035);
  }
  // Black grille with a small running-horse silhouette.
  panel(
    kit,
    [
      -0.67, 0.72, -2.135, 0.67, 0.72, -2.135, 0.5, 0.43, -2.14, -0.5, 0.43,
      -2.14,
    ],
    black,
    body,
  );
  for (let i = -3; i <= 3; i++)
    kit.box(0.02, 0.24, 0.02, '#34464d', i * 0.15, 0.585, -2.15, body, 0.002);
  const pony = new THREE.Shape();
  [
    [-0.16, 0.01],
    [-0.11, 0.05],
    [-0.02, 0.06],
    [0.06, 0.1],
    [0.08, 0.17],
    [0.14, 0.15],
    [0.18, 0.1],
    [0.1, 0.08],
    [0.08, 0.01],
    [0.15, -0.05],
    [0.11, -0.06],
    [0.04, -0.01],
    [-0.03, -0.02],
    [-0.1, -0.1],
    [-0.12, -0.07],
    [-0.09, 0],
    [-0.14, -0.015],
    [-0.2, 0.02],
  ].forEach(([x, y], i) => (i ? pony.lineTo(x, y) : pony.moveTo(x, y)));
  pony.closePath();
  const emblemMaterial = new THREE.MeshStandardMaterial({
    color: '#dae4e5',
    metalness: 0.75,
    roughness: 0.24,
    side: THREE.DoubleSide,
  });
  const emblem = kit.mesh(new THREE.ShapeGeometry(pony), emblemMaterial, body);
  emblem.position.set(0, 0.57, -2.17);
  emblem.scale.setScalar(0.66);
  kit.box(1.58, 0.075, 0.14, '#26353a', 0, 0.34, -2.08, body, 0.025);
  for (const side of [-1, 1]) {
    kit.box(
      0.37,
      0.13,
      0.065,
      '#202e36',
      side * 0.64,
      0.755,
      -1.99,
      body,
      0.025,
    );
    for (let bar = 0; bar < 3; bar++) {
      const light = kit.box(
        0.075,
        0.025,
        0.022,
        '#ecfcff',
        side * (0.51 + bar * 0.087),
        0.79 - bar * 0.018,
        -2.035,
        body,
        0.005,
      );
      light.material = headlamp;
      light.rotation.z = side * -0.2;
    }
    kit.box(
      0.21,
      0.04,
      0.035,
      '#ffb752',
      side * 0.7,
      0.55,
      -1.995,
      body,
      0.006,
    );
  }
  // Sloping windshield and fastback glass surround an intentionally translucent
  // miniature roof: all three photo faces remain part of the actual car model.
  panel(
    kit,
    [
      -0.72, 1.01, -0.66, 0.72, 1.01, -0.66, 0.57, 1.48, -0.16, -0.57, 1.48,
      -0.16,
    ],
    glass,
    body,
  );
  panel(
    kit,
    [-0.57, 1.48, 0.48, 0.57, 1.48, 0.48, 0.73, 1.0, 1.2, -0.73, 1.0, 1.2],
    glass,
    body,
  );
  for (const side of [-1, 1]) {
    panel(
      kit,
      [
        side * 0.73,
        1.02,
        -0.62,
        side * 0.57,
        1.48,
        -0.16,
        side * 0.57,
        1.48,
        0.48,
        side * 0.76,
        1.01,
        0.91,
      ],
      glass,
      body,
    );
    for (const [a, b] of [
      [
        [side * 0.74, 1.0, -0.67],
        [side * 0.58, 1.5, -0.15],
      ],
      [
        [side * 0.58, 1.5, 0.5],
        [side * 0.77, 1.0, 1.22],
      ],
      [
        [side * 0.58, 1.5, -0.15],
        [side * 0.58, 1.5, 0.5],
      ],
    ])
      kit.rod(
        new THREE.Vector3(...a),
        new THREE.Vector3(...b),
        0.036,
        '#cd394a',
        body,
      );
  }
  const roofMaterial = new THREE.MeshPhysicalMaterial({
    color: '#ba293b',
    roughness: 0.25,
    metalness: 0.3,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  panel(
    kit,
    [-0.58, 1.5, -0.15, 0.58, 1.5, -0.15, 0.58, 1.5, 0.5, -0.58, 1.5, 0.5],
    roofMaterial,
    body,
  );
  painted(1.22, 0.045, 0.1, 0, 1.49, -0.14);
  painted(1.64, 0.05, 0.15, 0, 1.055, 1.82, 0.018);
  kit.box(1.59, 0.24, 0.075, '#17232c', 0, 0.75, 2.02, body, 0.035);
  for (const side of [-1, 1])
    for (let bar = 0; bar < 3; bar++) {
      const lamp = kit.box(
        0.09,
        0.2,
        0.034,
        '#ff473b',
        side * (0.37 + bar * 0.16),
        0.765,
        2.071,
        body,
        0.017,
      );
      lamp.material = redLamp;
      lamp.rotation.z = side * -0.1;
    }
  kit.box(0.37, 0.12, 0.025, '#e2e7d6', 0, 0.45, 2.071, body, 0.006);
  for (const side of [-1, 1]) {
    const exhaust = kit.cylinder(
      0.055,
      0.055,
      0.18,
      '#bcc4be',
      side * 0.65,
      0.28,
      1.98,
      body,
    );
    exhaust.rotation.x = Math.PI / 2;
  }
  const wheels: { steering: THREE.Group; roll: THREE.Group; front: boolean }[] =
    [];
  for (const z of [-1.27, 1.3])
    for (const side of [-1, 1]) {
      const steering = new THREE.Group();
      steering.position.set(side * 0.875, 0.405, z);
      root.add(steering);
      const roll = new THREE.Group();
      steering.add(roll);
      const tire = kit.mesh(
        new THREE.CylinderGeometry(0.405, 0.405, 0.245, 24),
        kit.material('#142027', 0.93),
        roll,
      );
      tire.rotation.z = Math.PI / 2;
      const rim = kit.mesh(
        new THREE.CylinderGeometry(0.278, 0.278, 0.255, 20),
        black,
        roll,
      );
      rim.rotation.z = Math.PI / 2;
      for (let spoke = 0; spoke < 5; spoke++)
        for (const fork of [-1, 1]) {
          const angle = (spoke * Math.PI * 2) / 5 + fork * 0.095;
          const ray = kit.box(
            0.02,
            0.028,
            0.25,
            '#4c5b61',
            side * 0.132,
            Math.sin(angle) * 0.13,
            Math.cos(angle) * 0.13,
            roll,
            0.004,
          );
          ray.rotation.x = -angle;
        }
      const hub = kit.mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.275, 12),
        chrome,
        roll,
      );
      hub.rotation.z = Math.PI / 2;
      wheels.push({ steering, roll, front: z < 0 });
    }
  const passengers = ['nikita', 'yaroslav', 'roma'].map((id, index) => {
    const person = people.find((p) => p.id === id)!;
    const rig = createRig(kit, person, body);
    // Keep only the genuine curved photograph head; seated torso geometry is
    // small and never leaves floating standing legs outside the two-door coupe.
    body.attach(rig.head);
    rig.root.removeFromParent();
    const position = [
      [-0.36, 1.19, -0.08],
      [0.36, 1.19, -0.08],
      [0.12, 1.19, 0.64],
    ][index];
    rig.head.position.set(...(position as [number, number, number]));
    rig.head.rotation.y = Math.PI;
    rig.head.scale.setScalar(1.18);
    rig.head.name = `passenger-${id}`;
    kit.sphere(
      0.21,
      0.19,
      0.16,
      person.color,
      position[0],
      0.97,
      position[2],
      body,
      12,
    );
    kit.box(
      0.4,
      0.34,
      0.13,
      '#24333b',
      position[0],
      1.02,
      position[2] + 0.19,
      body,
      0.045,
    );
    return rig.head;
  });
  const wheel = kit.torus(0.17, 0.025, '#13252b', -0.36, 1.0, -0.46, body);
  wheel.rotation.x = 0.37;
  kit.materials.add(paint);
  kit.materials.add(glass);
  kit.materials.add(redLamp);
  kit.materials.add(headlamp);
  kit.materials.add(roofMaterial);
  let lastSpeed = 0,
    rollAngle = 0;
  return {
    root,
    body,
    wheels,
    passengers,
    update(s: CityState, dt: number) {
      root.position.set(s.x, 0.025, s.z);
      root.rotation.y = -s.heading;
      const forward = s.vx * Math.sin(s.heading) - s.vz * Math.cos(s.heading);
      rollAngle -= (forward * dt) / 0.405;
      wheels.forEach((w) => {
        w.steering.rotation.y = w.front ? -s.steering * 0.45 : 0;
        w.roll.rotation.x = rollAngle;
      });
      const lateral = s.vx * Math.cos(s.heading) + s.vz * Math.sin(s.heading);
      const smooth = 1 - Math.exp(-dt * 8);
      body.rotation.z = THREE.MathUtils.lerp(
        body.rotation.z,
        THREE.MathUtils.clamp(-lateral * 0.018, -0.1, 0.1),
        smooth,
      );
      body.rotation.x = THREE.MathUtils.lerp(
        body.rotation.x,
        THREE.MathUtils.clamp((forward - lastSpeed) * 0.024, -0.035, 0.035),
        smooth,
      );
      body.position.y =
        s.speed > 0.2
          ? Math.sin(s.elapsed * 16) * Math.min(0.013, s.speed * 0.002)
          : 0;
      passengers.forEach((head, i) => {
        head.rotation.z =
          Math.sin(s.elapsed * 2 + i) * 0.035 +
          (s.drifting ? lateral * 0.014 : 0);
      });
      lastSpeed = forward;
    },
  };
}

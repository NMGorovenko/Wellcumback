import * as THREE from 'three';
import type { RenderKit } from '../world/render-kit';

export const floorWorld = (x: number, y: number, out = new THREE.Vector3()) =>
  out.set((x - 600) / 70, 0, (y - 400) / 70);
const UP = new THREE.Vector3(0, 1, 0);

/** Stained trousers remain a recognisable garment both in the hands and in the drum. */
export function createPants(kit: RenderKit, parent: THREE.Object3D) {
  const root = new THREE.Group();
  parent.add(root);
  kit.box(0.36, 0.13, 0.105, '#5d6855', 0, 0.19, 0, root, 0.028);
  kit.box(0.34, 0.025, 0.115, '#424b3a', 0, 0.26, 0, root, 0.006);
  for (const sign of [-1, 1]) {
    const leg = kit.box(
      0.145,
      0.38,
      0.095,
      sign < 0 ? '#64715a' : '#58654f',
      sign * 0.096,
      -0.047,
      0.018,
      root,
      0.035,
    );
    leg.rotation.z = sign * 0.09;
    kit.box(
      0.1,
      0.022,
      0.1,
      '#3d4936',
      sign * 0.117,
      -0.235,
      0.018,
      root,
      0.008,
    );
    kit.box(
      0.002,
      0.3,
      0.006,
      '#778069',
      sign * 0.14,
      -0.055,
      0.069,
      root,
      0.001,
    );
  }
  kit.box(0.1, 0.075, 0.014, '#758069', -0.085, 0.176, 0.061, root, 0.012);
  const stainMaterial = new THREE.MeshStandardMaterial({
    color: '#66341b',
    roughness: 0.68,
    transparent: true,
  });
  const patches: THREE.Mesh[] = [];
  for (let i = 0; i < 11; i++) {
    const patch = kit.mesh(
      new THREE.SphereGeometry(1, 10, 7),
      stainMaterial,
      root,
    );
    patch.position.set(
      Math.sin(i * 2.4) * 0.1,
      0.15 - (i % 5) * 0.073,
      0.07 + (i % 2) * 0.003,
    );
    patch.scale.set(0.034 + (i % 3) * 0.012, 0.037 + (i % 2) * 0.019, 0.008);
    patches.push(patch);
  }
  return {
    root,
    setClean(amount: number) {
      stainMaterial.opacity = Math.max(0, 1 - amount);
    },
  };
}

export function createWasher(kit: RenderKit, position: THREE.Vector3) {
  const root = new THREE.Group();
  root.position.copy(position);
  root.rotation.y = Math.PI;
  kit.scene.add(root);
  // Open housing: the front is an actual opening, not a solid cube in front of the drum.
  kit.box(0.13, 1.06, 0.8, '#c5cbc1', -0.48, 0.57, 0, root, 0.04);
  kit.box(0.13, 1.06, 0.8, '#dde0d5', 0.48, 0.57, 0, root, 0.04);
  kit.box(0.98, 0.16, 0.8, '#e6e7db', 0, 1.025, 0, root, 0.035);
  kit.box(0.98, 0.14, 0.8, '#bdc5bb', 0, 0.1, 0, root, 0.025);
  kit.box(0.96, 0.84, 0.06, '#838e85', 0, 0.55, -0.38, root);
  kit.box(0.94, 0.22, 0.07, '#d5dbce', 0, 0.93, 0.414, root);
  kit.box(0.86, 0.08, 0.065, '#b8c1b5', 0, 0.205, 0.415, root);
  kit.box(0.26, 0.09, 0.02, '#213e36', 0.2, 0.95, 0.459, root, 0.009);
  for (let i = 0; i < 3; i++)
    kit.box(
      0.026,
      0.031,
      0.004,
      '#b6e5a6',
      0.15 + i * 0.052,
      0.95,
      0.474,
      root,
      0.003,
    );
  const dial = kit.cylinder(
    0.065,
    0.065,
    0.034,
    '#727f74',
    -0.25,
    0.95,
    0.464,
    root,
  );
  dial.rotation.x = Math.PI / 2;
  kit.box(0.012, 0.045, 0.01, '#edeedb', -0.25, 0.955, 0.485, root, 0.002);
  for (const x of [-0.39, 0.39])
    for (const z of [-0.27, 0.27])
      kit.cylinder(0.035, 0.035, 0.08, '#343c36', x, 0.04, z, root);
  const drum = new THREE.Group();
  drum.position.set(0, 0.555, 0.205);
  root.add(drum);
  const interior = kit.cylinder(
    0.325,
    0.325,
    0.28,
    '#3c4b45',
    0,
    0,
    -0.005,
    drum,
  );
  interior.rotation.x = Math.PI / 2;
  const plate = kit.cylinder(0.297, 0.297, 0.014, '#7c8b82', 0, 0, 0.144, drum);
  plate.rotation.x = Math.PI / 2;
  for (let i = 0; i < 30; i++) {
    const a = (i * Math.PI * 2) / 15,
      r = i < 15 ? 0.257 : 0.204;
    kit.sphere(
      0.009,
      0.009,
      0.003,
      '#34433b',
      Math.cos(a) * r,
      Math.sin(a) * r,
      0.156,
      drum,
      8,
    );
  }
  const pants = createPants(kit, drum);
  pants.root.scale.setScalar(0.82);
  pants.root.position.set(0.012, -0.015, 0.185);
  pants.root.rotation.z = -0.4;
  const hinge = new THREE.Group();
  hinge.position.set(-0.382, 0.555, 0.447);
  root.add(hinge);
  kit.torus(0.35, 0.034, '#7b9188', 0.382, 0, 0, hinge);
  kit.torus(0.307, 0.011, '#bccbc0', 0.382, 0, 0.012, hinge);
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: '#c0ded1',
    transparent: true,
    opacity: 0.14,
    roughness: 0.09,
    metalness: 0.06,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const glass = kit.mesh(
    new THREE.SphereGeometry(0.306, 24, 16),
    glassMaterial,
    hinge,
  );
  glass.scale.z = 0.16;
  glass.position.set(0.382, 0, 0.015);
  glass.castShadow = false;
  kit.box(0.037, 0.13, 0.044, '#597568', 0.67, 0, 0.045, hinge, 0.012);
  const machineStains = new THREE.Group();
  root.add(machineStains);
  for (let i = 0; i < 11; i++) {
    const smear = kit.sphere(
      0.037 + (i % 3) * 0.015,
      0.023 + (i % 2) * 0.02,
      0.005,
      '#735031',
      Math.sin(i * 2.2) * 0.39,
      0.23 + (i % 4) * 0.2,
      0.457,
      machineStains,
      10,
    );
    smear.rotation.z = i;
  }
  const laundryTarget = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  root.localToWorld(laundryTarget.set(0, 0.555, 0.45));
  return { root, drum, hinge, pants, machineStains, laundryTarget };
}

export function createShower(kit: RenderKit, position: THREE.Vector3) {
  const root = new THREE.Group();
  root.position.copy(position);
  kit.scene.add(root);
  kit.box(1.32, 0.06, 1.3, '#b8c5b7', 0, 0.005, 0, root, 0.045);
  for (const x of [-0.63, 0.63])
    kit.box(0.045, 0.095, 1.27, '#e0e6da', x, 0.04, 0, root);
  kit.box(1.29, 0.095, 0.045, '#e0e6da', 0, 0.04, 0.63, root);
  kit.cylinder(0.1, 0.1, 0.01, '#74877c', 0, 0.044, 0.12, root);
  for (let i = -2; i <= 2; i++)
    kit.box(0.007, 0.005, 0.15, '#354c40', i * 0.025, 0.051, 0.12, root, 0.001);
  kit.cylinder(0.023, 0.023, 2.05, '#8ea196', 0, 1.02, 0.55, root);
  kit.rod(
    new THREE.Vector3(0, 2.04, 0.55),
    new THREE.Vector3(0, 2.04, -0.02),
    0.023,
    '#9bafa4',
    root,
  );
  kit.cylinder(0.15, 0.12, 0.04, '#aabbb0', 0, 2.02, -0.02, root);
  kit.torus(0.063, 0.013, '#abac91', 0, 1.02, 0.51, root);
  const water = new THREE.Group();
  root.add(water);
  const waterMat = new THREE.MeshStandardMaterial({
    color: '#c6e9e4',
    transparent: true,
    opacity: 0.55,
    roughness: 0.2,
  });
  for (let i = 0; i < 25; i++) {
    const bead = kit.mesh(
      new THREE.CylinderGeometry(0.007, 0.012, 0.17, 5),
      waterMat,
      water,
    );
    bead.position.set(
      Math.cos(i * 2.399) * 0.16,
      0.2 + (i % 9) * 0.18,
      Math.sin(i * 2.399) * 0.16,
    );
  }
  return {
    root,
    water,
    update(time: number, active: boolean) {
      water.visible = active;
      if (active)
        water.children.forEach((drop, i) => {
          drop.position.y =
            0.13 + ((((i * 0.213 - time * 2.4) % 1.82) + 1.82) % 1.82);
        });
    },
  };
}

export function createToilet(kit: RenderKit, position: THREE.Vector3) {
  const root = new THREE.Group();
  root.position.copy(position);
  root.rotation.y = Math.PI;
  kit.scene.add(root);
  kit.box(0.46, 0.65, 0.22, '#e6e5d8', 0, 0.61, -0.22, root, 0.045);
  kit.sphere(0.23, 0.19, 0.31, '#dedfd4', 0, 0.38, 0.045, root);
  kit.sphere(0.13, 0.22, 0.19, '#c9cec1', 0, 0.2, -0.06, root);
  const rim = kit.torus(0.203, 0.04, '#eeeee1', 0, 0.49, 0.074, root);
  rim.rotation.x = Math.PI / 2;
  rim.scale.y = 1.24;
  const bowl = kit.sphere(0.164, 0.01, 0.223, '#566b60', 0, 0.486, 0.074, root);
  bowl.castShadow = false;
  kit.sphere(0.12, 0.005, 0.14, '#a3c7bb', 0, 0.493, 0.04, root);
  const lid = kit.box(0.41, 0.043, 0.48, '#d4dbc8', 0, 0.71, -0.15, root, 0.04);
  lid.rotation.x = -1.25;
  kit.sphere(0.019, 0.011, 0.02, '#939c88', 0.12, 0.952, -0.21, root, 10);
  const privacy = new THREE.Group();
  root.add(privacy);
  // Opaque waist-height cubicle panels cover the seated uniformed character below the chest.
  for (const x of [-0.67, 0.67])
    kit.box(0.045, 1.15, 1.15, '#93a498', x, 0.575, 0, privacy);
  const door = kit.box(1.3, 1.12, 0.045, '#a9b3a3', 0, 0.56, 0.64, privacy);
  kit.box(0.07, 0.025, 0.035, '#526659', -0.45, 0.8, 0.678, privacy, 0.008);
  const roll = kit.cylinder(
    0.075,
    0.075,
    0.15,
    '#ebe6cc',
    -0.61,
    0.8,
    0.16,
    root,
  );
  roll.rotation.z = Math.PI / 2;
  return { root, privacy, door };
}

export type VisualTrace = {
  x: number;
  y: number;
  size: number;
  progress: number;
  kind?: string;
  foam?: boolean;
  rotation?: number;
};
/** Reused instance buffer. It only grows when new traces exceed capacity, never for animation. */
export function createTraceField(kit: RenderKit, capacity = 768) {
  const geometry = new THREE.SphereGeometry(1, 10, 6);
  kit.geometries.add(geometry);
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.66,
  });
  kit.materials.add(material);
  const makeMesh = () => {
    const next = new THREE.InstancedMesh(geometry, material, capacity * 4);
    next.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    next.receiveShadow = true;
    next.castShadow = false;
    next.frustumCulled = false;
    kit.scene.add(next);
    return next;
  };
  let mesh = makeMesh();
  const dummy = new THREE.Object3D(),
    color = new THREE.Color(),
    brown = new THREE.Color('#623b22'),
    foam = new THREE.Color('#cee2d2');
  return {
    get mesh() {
      return mesh;
    },
    update(spots: VisualTrace[], time: number) {
      let needed = 0;
      for (const spot of spots)
        if (spot.progress < 1) needed += spot.kind === 'footprint' ? 2 : 4;
      if (needed > capacity * 4) {
        while (needed > capacity * 4) capacity *= 2;
        mesh.removeFromParent();
        mesh.dispose();
        mesh = makeMesh();
      }
      let count = 0;
      for (const spot of spots) {
        if (spot.progress >= 1) continue;
        const foot = spot.kind === 'footprint',
          isFoam = spot.foam || spot.kind === 'foam';
        const radius =
            Math.max(0.035, spot.size / 70) * (1 - spot.progress * 0.83),
          rotation = Math.PI / 2 - (spot.rotation ?? 0);
        color.copy(isFoam ? foam : brown);
        for (let i = 0; i < (foot ? 2 : 4); i++) {
          const theta = rotation + i * 2.399,
            spread = foot ? 0 : radius * 0.43;
          dummy.position.set(
            (spot.x - 600) / 70 + Math.sin(theta) * spread,
            0.014 + i * 0.001,
            (spot.y - 400) / 70 + Math.cos(theta) * spread,
          );
          if (foot) {
            const step = i === 0 ? 0.035 : -0.04;
            dummy.position.x += Math.sin(rotation) * step;
            dummy.position.z += Math.cos(rotation) * step;
          }
          dummy.rotation.set(0, rotation, i * 0.01);
          dummy.scale.set(
            foot ? radius * 0.43 : radius * (0.61 + i * 0.05),
            isFoam ? 0.022 + Math.sin(time * 1.1 + i) * 0.004 : 0.012,
            foot ? radius * (i ? 0.4 : 0.7) : radius * (0.48 + (i % 2) * 0.19),
          );
          dummy.updateMatrix();
          mesh.setMatrixAt(count, dummy.matrix);
          mesh.setColorAt(count, color);
          count++;
        }
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}

/** Brown beads leave a trouser cuff. No exposed anatomy is used. */
export function createTrouserLeak(kit: RenderKit, parent: THREE.Object3D) {
  const root = new THREE.Group();
  parent.add(root);
  const brown = kit.material('#714522', 0.58);
  const drops: THREE.Mesh[] = [];
  for (let i = 0; i < 10; i++) {
    const drop = kit.mesh(new THREE.SphereGeometry(1, 9, 6), brown, root);
    drop.scale.set(0.019, 0.045, 0.019);
    drops.push(drop);
  }
  const cuff = kit.sphere(
    0.061,
    0.075,
    0.06,
    '#694224',
    0.105,
    0.25,
    0.02,
    root,
    12,
  );
  return {
    root,
    update(time: number, active: boolean, soiled: boolean) {
      root.visible = active || soiled;
      cuff.visible = soiled;
      drops.forEach((drop, i) => {
        drop.visible = active;
        drop.position.set(
          0.105 + Math.sin(i * 3 + time * 3) * 0.032,
          0.025 + ((((i * 0.047 - time * 0.6) % 0.3) + 0.3) % 0.3),
          0.015 + Math.cos(i * 2.3) * 0.06,
        );
      });
    },
  };
}

export function positionRod(
  mesh: THREE.Object3D,
  from: THREE.Vector3,
  to: THREE.Vector3,
  midpoint: THREE.Vector3,
  delta: THREE.Vector3,
) {
  delta.copy(to).sub(from);
  mesh.position.copy(midpoint.copy(from).add(to).multiplyScalar(0.5));
  mesh.scale.y = Math.max(0.001, delta.length());
  mesh.quaternion.setFromUnitVectors(UP, delta.normalize());
}

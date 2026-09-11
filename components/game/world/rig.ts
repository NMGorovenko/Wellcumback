import * as THREE from 'three';
import type { PersonPreset } from '@/lib/game/presets';
import type { RenderKit } from './render-kit';

export type Pose =
  | 'idle'
  | 'walk'
  | 'work'
  | 'pull'
  | 'throw'
  | 'catch'
  | 'drill'
  | 'carry'
  | 'fall'
  | 'celebrate'
  | 'mop';
export type CharacterRig = {
  root: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftHand: THREE.Object3D;
  rightHand: THREE.Object3D;
  setCrouch: (depth: number) => void;
  reach: (side: 'left' | 'right', worldTarget: THREE.Vector3) => number;
  update: (time: number, pose: Pose, effort?: number) => void;
};
const crops: Record<
  PersonPreset['id'],
  { url: string; rect: [number, number, number, number] }
> = {
  yaroslav: {
    url: '/characters/faces/yaroslav.jpg',
    rect: [0.334, 0.227, 0.406, 0.547],
  },
  nikita: {
    url: '/characters/faces/nikita.jpg',
    rect: [0.411, 0.298, 0.511, 0.345],
  },
  roma: {
    url: '/characters/faces/roma.png',
    rect: [0.303, 0.203, 0.292, 0.548],
  },
};

/** Articulated mid-poly body with a curved, photo-textured facial surface.
 * UV coordinates sample the supplied photograph; the original bitmap is unchanged.
 */
export function createRig(
  kit: RenderKit,
  p: PersonPreset,
  parent: THREE.Object3D = kit.scene,
  options: { anonymous?: boolean } = {},
): CharacterRig {
  const anonymous = options.anonymous === true;
  if (anonymous)
    p = {
      ...p,
      skin: '#bea184',
      hair: '#514a3b',
      color: '#697363',
      hairstyle: 'buzz',
      uniform: true,
      beard: false,
    };
  const root = new THREE.Group();
  parent.add(root);
  const upperBody = new THREE.Group();
  root.add(upperBody);
  const torso = new THREE.Group();
  torso.position.y = 0.98;
  upperBody.add(torso);
  const jacket = !anonymous && p.id === 'nikita',
    body = anonymous ? '#697363' : p.uniform ? '#626c85' : p.color;
  kit.sphere(0.245, 0.36, 0.145, body, 0, 0.27, 0, torso);
  kit.cylinder(0.2, 0.16, 0.38, body, 0, 0.18, 0, torso);
  kit.sphere(0.205, 0.135, 0.13, body, 0, -0.02, 0, torso);
  if (jacket) {
    kit.rod(
      new THREE.Vector3(-0.16, 0.46, 0.09),
      new THREE.Vector3(-0.09, 0.3, 0.16),
      0.045,
      '#bdb09c',
      torso,
    );
    kit.rod(
      new THREE.Vector3(0.16, 0.46, 0.09),
      new THREE.Vector3(0.09, 0.3, 0.16),
      0.045,
      '#bdb09c',
      torso,
    );
    kit.box(0.012, 0.37, 0.016, '#bcb3a6', 0, 0.17, 0.145, torso, 0.003);
  }
  if (p.uniform && !anonymous) {
    for (let i = 0; i < 17; i++)
      kit.box(
        0.05 + (i % 3) * 0.018,
        0.034,
        0.008,
        i % 2 ? '#929baa' : '#3f495d',
        (((i * 5) % 7) - 3) * 0.047,
        (i % 5) * 0.1 + 0.06,
        0.146,
        torso,
        0.003,
      );
    kit.box(0.07, 0.045, 0.01, '#353e4c', 0.105, 0.39, 0.142, torso, 0.003);
  }
  kit.cylinder(0.064, 0.077, 0.15, p.skin, 0, 1.57, 0, upperBody);
  const head = new THREE.Group();
  head.position.set(0, 1.74, 0.015);
  upperBody.add(head);
  kit.sphere(0.143, 0.195, 0.136, p.skin, 0, 0, -0.012, head);
  for (const sign of [-1, 1])
    kit.sphere(
      0.026,
      0.046,
      0.021,
      p.skin,
      sign * 0.144,
      -0.015,
      -0.002,
      head,
      12,
    );
  // Facial grid: cheek/jaw taper, rounded temples and protruding nose, with smooth normals.
  const columns = 28,
    rows = 34,
    positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const {
    url,
    rect: [cx, cy, cw, ch],
  } = crops[p.id];
  for (let y = 0; y <= rows; y++) {
    const v = y / rows,
      yn = (v - 0.5) * 2;
    const taper =
      yn < -0.25
        ? 1 - (Math.abs(yn) - 0.25) * 0.25
        : 1 - Math.max(0, yn - 0.65) * 0.18;
    for (let x = 0; x <= columns; x++) {
      const u = x / columns,
        xn = (u - 0.5) * 2;
      const px = xn * 0.14 * taper,
        py = yn * 0.187;
      const nose =
        0.041 *
        Math.exp(-((xn * xn) / 0.035 + ((yn + 0.04) * (yn + 0.04)) / 0.085));
      const cheeks =
        0.014 *
        Math.exp(-((Math.abs(xn) - 0.5) ** 2 / 0.12 + (yn + 0.13) ** 2 / 0.2));
      const z =
        0.087 + 0.045 * Math.sqrt(Math.max(0, 1 - xn * xn)) + nose + cheeks;
      positions.push(px, py, z);
      uv.push(cx + u * cw, 1 - (cy + (1 - v) * ch));
      if (x < columns && y < rows) {
        const a = y * (columns + 1) + x,
          b = a + columns + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const faceGeo = new THREE.BufferGeometry();
  faceGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  faceGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  faceGeo.setIndex(indices);
  faceGeo.computeVertexNormals();
  const faceMat = anonymous
    ? kit.material(p.skin, 0.94)
    : new THREE.MeshStandardMaterial({
        map: kit.texture(url),
        roughness: 0.94,
        color: '#fff6ed',
        side: THREE.DoubleSide,
      });
  kit.mesh(faceGeo, faceMat, head);
  if (anonymous) {
    // A fictional recruit: no face photograph or likeness of a member of the brigade.
    for (const sign of [-1, 1]) {
      kit.sphere(
        0.023,
        0.012,
        0.008,
        '#d8d8c6',
        sign * 0.053,
        0.041,
        0.143,
        head,
        12,
      );
      kit.sphere(
        0.008,
        0.009,
        0.005,
        '#353a2e',
        sign * 0.053,
        0.041,
        0.153,
        head,
        10,
      );
      const brow = kit.box(
        0.051,
        0.009,
        0.008,
        '#554d3d',
        sign * 0.053,
        0.067,
        0.147,
        head,
        0.004,
      );
      brow.rotation.z = -sign * 0.08;
    }
    kit.sphere(0.02, 0.03, 0.02, p.skin, 0, -0.005, 0.156, head, 12);
    kit.box(0.057, 0.009, 0.008, '#795747', 0, -0.072, 0.143, head, 0.004);
    kit.box(0.075, 0.11, 0.018, '#586352', -0.1, 0.28, 0.149, torso, 0.006);
    for (const y of [0.14, 0.23, 0.32])
      kit.sphere(0.007, 0.007, 0.006, '#414d3f', 0.012, y, 0.158, torso, 8);
  }

  if (p.hairstyle === 'curls')
    for (let i = 0; i < 22; i++) {
      const angle = i * 2.399,
        r = Math.sqrt(i / 22) * 0.132;
      kit.sphere(
        0.035,
        0.035,
        0.033,
        p.hair,
        Math.cos(angle) * r,
        0.17 + Math.sqrt(Math.max(0, 1 - (r / 0.15) ** 2)) * 0.055,
        Math.sin(angle) * r - 0.018,
        head,
        10,
      );
    }
  else if (p.hairstyle === 'parted') {
    for (const sign of [-1, 1]) {
      const lock = kit.sphere(
        0.1,
        0.07,
        0.12,
        p.hair,
        sign * 0.064,
        0.168,
        -0.012,
        head,
      );
      lock.rotation.z = sign * 0.27;
      kit.sphere(0.035, 0.105, 0.095, p.hair, sign * 0.13, 0.062, -0.043, head);
    }
    kit.sphere(0.125, 0.13, 0.06, p.hair, 0, 0.07, -0.12, head);
  } else kit.sphere(0.143, 0.05, 0.126, p.hair, 0, 0.177, -0.01, head);
  if (anonymous) {
    kit.cylinder(0.16, 0.16, 0.07, '#59664e', 0, 0.209, -0.005, head);
    kit.box(0.23, 0.025, 0.13, '#46523e', 0, 0.185, 0.125, head, 0.018);
  } else if (p.uniform) {
    kit.sphere(0.195, 0.105, 0.17, '#242936', 0, 0.232, -0.014, head);
    kit.box(0.34, 0.1, 0.1, '#1d2230', 0, 0.194, 0.134, head, 0.035);
    for (const sign of [-1, 1])
      kit.sphere(0.05, 0.1, 0.13, '#252a36', sign * 0.174, 0.18, -0.017, head);
    kit.sphere(0.014, 0.022, 0.006, '#c1b28d', 0, 0.239, 0.179, head, 10);
  }
  const down = new THREE.Vector3(0, -1, 0);
  const solve = (
    joint: THREE.Group,
    elbow: THREE.Group,
    target: THREE.Vector3,
    l1: number,
    l2: number,
    bend: THREE.Vector3,
  ) => {
    const raw = target.length(),
      d = THREE.MathUtils.clamp(raw, 0.025, l1 + l2 - 0.00001),
      direction = raw > 1e-8 ? target.clone().divideScalar(raw) : down.clone();
    const perpendicular = bend
      .clone()
      .addScaledVector(direction, -bend.dot(direction));
    if (perpendicular.lengthSq() < 1e-6)
      perpendicular.set(1, 0, 0).addScaledVector(direction, -direction.x);
    perpendicular.normalize();
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d),
      height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    const knee = direction
      .clone()
      .multiplyScalar(along)
      .addScaledVector(perpendicular, height);
    joint.quaternion.setFromUnitVectors(down, knee.clone().normalize());
    const lower = direction
      .multiplyScalar(d)
      .sub(knee)
      .applyQuaternion(joint.quaternion.clone().invert())
      .normalize();
    elbow.quaternion.setFromUnitVectors(down, lower);
  };
  const makeArm = (sign: number) => {
    const joint = new THREE.Group();
    joint.position.set(sign * 0.235, 1.39, 0);
    upperBody.add(joint);
    kit.sphere(0.087, 0.09, 0.087, body, 0, 0, 0, joint);
    kit.cylinder(0.076, 0.057, 0.31, body, 0, -0.155, 0, joint);
    const elbow = new THREE.Group();
    elbow.position.y = -0.31;
    joint.add(elbow);
    kit.sphere(0.057, 0.061, 0.059, body, 0, 0, 0, elbow);
    kit.cylinder(0.053, 0.04, 0.27, body, 0, -0.135, 0, elbow);
    kit.sphere(0.045, 0.063, 0.029, p.skin, 0, -0.31, 0, elbow);
    const hand = new THREE.Object3D();
    hand.position.y = -0.32;
    elbow.add(hand);
    return { joint, elbow, hand, sign };
  };
  const makeLeg = (sign: number) => {
    const joint = new THREE.Group();
    joint.position.set(sign * 0.105, 0.93, 0);
    root.add(joint);
    kit.cylinder(0.072, 0.06, 0.4, '#333637', 0, -0.2, 0, joint);
    const knee = new THREE.Group();
    knee.position.y = -0.4;
    joint.add(knee);
    kit.sphere(0.069, 0.065, 0.065, '#343536', 0, 0, 0, knee);
    kit.cylinder(0.055, 0.053, 0.4, '#303434', 0, -0.2, 0, knee);
    const foot = kit.sphere(
      0.065,
      0.061,
      0.123,
      '#242625',
      sign * 0.105,
      0.07,
      0.049,
      root,
    );
    return { joint, knee, foot, sign };
  };
  const arms = [makeArm(-1), makeArm(1)],
    legs = [makeLeg(-1), makeLeg(1)];
  const leftArm = arms[0].joint,
    rightArm = arms[1].joint,
    leftLeg = legs[0].joint,
    rightLeg = legs[1].joint,
    leftHand = arms[0].hand,
    rightHand = arms[1].hand;
  let gaitTime = 0,
    gaitPose: Pose = 'idle';
  const setCrouch = (amount: number) => {
    const depth = THREE.MathUtils.clamp(amount, 0, 0.72);
    upperBody.position.set(0, -depth, depth * 0.26);
    for (const leg of legs) {
      const stride =
        gaitPose === 'walk' && depth < 0.1
          ? Math.sin(gaitTime * 8 + (leg.sign * Math.PI) / 2) * 0.16
          : 0;
      const footY =
        0.07 +
        (gaitPose === 'walk' && depth < 0.1
          ? Math.max(0, Math.cos(gaitTime * 8 + (leg.sign * Math.PI) / 2)) *
            0.035
          : 0);
      leg.foot.position.set(leg.sign * 0.105, footY, 0.049 + stride);
      leg.joint.position.set(leg.sign * 0.105, 0.93 - depth, 0);
      solve(
        leg.joint,
        leg.knee,
        new THREE.Vector3(0, footY + 0.085 - leg.joint.position.y, stride),
        0.4,
        0.4,
        new THREE.Vector3(leg.sign * 0.12, 0, 1),
      );
    }
  };
  const reach = (side: 'left' | 'right', worldTarget: THREE.Vector3) => {
    const arm = arms[side === 'left' ? 0 : 1];
    root.updateWorldMatrix(true, true);
    const target = upperBody
      .worldToLocal(worldTarget.clone())
      .sub(arm.joint.position);
    solve(
      arm.joint,
      arm.elbow,
      target,
      0.31,
      0.32,
      new THREE.Vector3(arm.sign * 0.85, 0, 0.3),
    );
    root.updateWorldMatrix(true, true);
    const actual = new THREE.Vector3();
    arm.hand.getWorldPosition(actual);
    return actual.distanceTo(worldTarget);
  };
  const update = (time: number, pose: Pose, effort = 0) => {
    gaitTime = time;
    gaitPose = pose;
    arms.forEach((arm) => arm.elbow.quaternion.identity());
    setCrouch(0);
    const sway = Math.sin(time * 2.1) * 0.012,
      walk = pose === 'walk' ? Math.sin(time * 8) : 0;
    torso.rotation.z = sway;
    head.rotation.set(Math.sin(time * 1.3) * 0.02, sway * 1.6, 0);
    leftArm.rotation.set(-walk * 0.28, 0, -0.08);
    rightArm.rotation.set(walk * 0.28, 0, 0.08);
    torso.rotation.x = 0;
    if (pose === 'work' || pose === 'pull' || pose === 'mop') {
      torso.rotation.x = 0.16;
      head.rotation.x = 0.2;
      leftArm.rotation.x = -0.8;
      rightArm.rotation.x = -1.05 + Math.sin(time * 6) * 0.11;
      rightArm.rotation.z = -0.2;
      if (pose === 'pull') rightArm.rotation.x = -0.4 - effort * 0.8;
      if (pose === 'mop')
        rightArm.rotation.x = -0.7 + Math.sin(time * 5) * 0.25;
    }
    if (pose === 'drill') {
      rightArm.rotation.x = -1.45 + Math.sin(time * 60) * 0.008;
      leftArm.rotation.x = -1.12;
      head.rotation.x = -0.1;
    }
    if (pose === 'carry' || pose === 'catch') {
      leftArm.rotation.x = -1.15;
      rightArm.rotation.x = -1.15;
      leftArm.rotation.z = -0.22;
      rightArm.rotation.z = 0.22;
    }
    if (pose === 'throw') rightArm.rotation.x = -2.3 + effort * 2.2;
    if (pose === 'fall') {
      leftArm.rotation.x = -2.5;
      rightArm.rotation.x = -2.5;
      leftLeg.rotation.x = -0.4;
      rightLeg.rotation.x = 0.6;
    }
    if (pose === 'celebrate') {
      leftArm.rotation.x = -2.5;
      rightArm.rotation.x = -2.5;
      head.rotation.z = Math.sin(time * 3) * 0.08;
    }
    root.scale.y = 1;
  };
  return {
    root,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    leftHand,
    rightHand,
    setCrouch,
    reach,
    update,
  };
}

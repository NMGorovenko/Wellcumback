import * as THREE from 'three';
import type { RenderKit } from '../world/render-kit';
import type { GameState } from '@/lib/game/screen/engine';

export const SCREEN_WIDTH = 4.8;
export const SCREEN_HEIGHT = 2.7;
export const FLOOR_SCALE = 0.49;
export const FLOOR_Z = -0.56;
/** Physical hook height is distinct from the legacy simulation coordinate. */
export const HEIGHT_SCALE = 0.13;
export const hookHeight = (logical: number) =>
  2.7 + (logical - 2.6) * HEIGHT_SCALE;
export const SCREEN_Z = -2.66;
export const RING_Y = 1.235;
export const MOUNT_Z = SCREEN_Z + 0.068;
/** Pure mounting transform: the top attachment centres exactly retain target X/Y. */
export function mountTransform(
  left: number,
  right: number,
  logicalX = 0,
  levelAngle?: number,
) {
  const angle =
    levelAngle === undefined
      ? Math.atan2(hookHeight(right) - hookHeight(left), 4.32)
      : Math.atan((Math.tan(levelAngle) * 8.8 * HEIGHT_SCALE) / 4.32);
  return {
    angle,
    scaleX: 1 / Math.cos(angle),
    x: logicalX * FLOOR_SCALE + RING_Y * Math.sin(angle),
    y: (hookHeight(left) + hookHeight(right)) / 2 - RING_Y * Math.cos(angle),
    z: SCREEN_Z,
  };
}
export const hookX = (side: number) => (side === 0 ? -1 : 1) * 2.16;

function springGeometry() {
  const points = [];
  for (let i = 0; i <= 70; i++) {
    const t = i / 70,
      a = t * Math.PI * 14;
    points.push(
      new THREE.Vector3(Math.cos(a) * 0.018, t * 0.12, Math.sin(a) * 0.018),
    );
  }
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points),
    70,
    0.004,
    5,
    false,
  );
}

/** The cloth, rods, profiles and springs are separate, animated physical parts. */
export function createScreenModel(kit: RenderKit) {
  const root = new THREE.Group();
  kit.scene.add(root);
  const frameRoot = new THREE.Group();
  root.add(frameRoot);
  const rails: THREE.Group[] = [];
  const lengths = [SCREEN_WIDTH, SCREEN_HEIGHT, SCREEN_WIDTH, SCREEN_HEIGHT];
  for (let side = 0; side < 4; side++) {
    const rail = new THREE.Group();
    frameRoot.add(rail);
    rails.push(rail);
    kit.box(lengths[side], 0.11, 0.075, '#24252a', 0, 0, 0, rail, 0.014);
    kit.box(
      lengths[side] - 0.08,
      0.024,
      0.014,
      '#53545a',
      0,
      -0.025,
      -0.042,
      rail,
      0.003,
    );
    if (side % 2 === 1) rail.rotation.z = Math.PI / 2;
  }
  const corners = [
    [-2.34, 1.295],
    [2.34, 1.295],
    [2.34, -1.295],
    [-2.34, -1.295],
  ].map(([x, y]) => {
    const mesh = kit.box(
      0.15,
      0.15,
      0.025,
      '#747b7a',
      x,
      y,
      0.042,
      frameRoot,
      0.018,
    );
    for (const dx of [-0.036, 0.036])
      kit.sphere(0.009, 0.009, 0.004, '#2c302f', x + dx, y, 0.06, frameRoot, 8);
    return mesh;
  });
  const clothGeometry = new THREE.PlaneGeometry(4.54, 2.44, 46, 28);
  const clothMaterial = new THREE.MeshStandardMaterial({
    color: '#f0eadb',
    roughness: 0.98,
    side: THREE.DoubleSide,
  });
  const cloth = kit.mesh(clothGeometry, clothMaterial, root);
  cloth.castShadow = false;
  cloth.position.z = -0.012;
  const original = Float32Array.from(clothGeometry.attributes.position.array);
  const projection = document.createElement('canvas');
  projection.width = 1024;
  projection.height = 576;
  const projectionContext = projection.getContext('2d')!;
  const projectionTexture = new THREE.CanvasTexture(projection);
  projectionTexture.colorSpace = THREE.SRGBColorSpace;
  kit.textures.add(projectionTexture);
  let projectionFrame = -1,
    projectionTime = 0;
  function projectGreeting(time: number) {
    const frame = Math.floor(time * 12);
    if (frame === projectionFrame) return;
    projectionFrame = frame;
    const c = projectionContext,
      g = c.createRadialGradient(510, 280, 60, 510, 280, 610);
    g.addColorStop(0, '#344f55');
    g.addColorStop(1, '#101b27');
    c.fillStyle = g;
    c.fillRect(0, 0, 1024, 576);
    c.textAlign = 'center';
    c.fillStyle = '#c7d3ac';
    c.font = '500 19px Arial';
    c.fillText('НУ, ТЕПЕРЬ МОЖНО ПОСМОТРЕТЬ КИНО', 512, 142);
    c.fillStyle = '#faf1dc';
    c.font = 'bold 66px Arial';
    c.fillText('С возвращением,', 512, 259);
    c.fillText('Рома!', 512, 337);
    c.fillStyle = '#b5c2b1';
    c.font = '22px Arial';
    c.fillText('Ярослав  /  Никита  /  Рома', 512, 419);
    for (let i = 0; i < 45; i++) {
      const x = (i * 197 + time * (i % 2 ? 11 : -7) + 10240) % 1024,
        y = (i * 73 + time * (8 + (i % 7))) % 576;
      c.globalAlpha = 0.15 + (i % 5) * 0.08;
      c.fillStyle = i % 2 ? '#e2c27c' : '#d8e6b4';
      c.fillRect(x, y, 3, 5);
    }
    c.globalAlpha = 1;
    projectionTexture.needsUpdate = true;
  }

  const poles: THREE.Mesh[] = [];
  const sleeves: THREE.Mesh[] = [];
  for (let side = 0; side < 4; side++) {
    const len = side % 2 === 0 ? 4.43 : 2.35;
    const pole = kit.cylinder(0.008, 0.008, len, '#8d9294', 0, 0, 0.026, root);
    pole.rotation.z = side % 2 === 0 ? Math.PI / 2 : 0;
    poles.push(pole);
    const sleeve = kit.box(
      side % 2 === 0 ? 4.44 : 0.042,
      side % 2 === 0 ? 0.042 : 2.34,
      0.02,
      '#d3cdbf',
      0,
      0,
      0.01,
      root,
      0.006,
    );
    sleeves.push(sleeve);
  }
  const coilGeo = springGeometry(),
    coils: THREE.Group[][] = [];
  for (let side = 0; side < 4; side++) {
    const row: THREE.Group[] = [];
    for (let n = 0; n < 4; n++) {
      const spring = new THREE.Group();
      root.add(spring);
      row.push(spring);
      const horizontal = side % 2 === 0,
        t = (n + 0.5) / 4 - 0.5;
      spring.position.set(
        horizontal ? t * 4.3 : side === 1 ? 2.265 : -2.265,
        horizontal ? (side === 0 ? 1.215 : -1.215) : t * 2.26,
        0.026,
      );
      spring.rotation.z =
        side === 0
          ? 0
          : side === 1
            ? -Math.PI / 2
            : side === 2
              ? Math.PI
              : Math.PI / 2;
      kit.mesh(coilGeo, kit.material('#b9b9aa', 0.25, 0.8), spring);
      const hook = kit.torus(0.02, 0.004, '#b7b9af', 0, 0.128, 0, spring);
      hook.scale.x = 0.65;
    }
    coils.push(row);
  }
  const rings = [-1, 1].map((sign) =>
    kit.torus(0.052, 0.009, '#c4c4b8', sign * 2.16, 1.235, 0.068, root),
  );
  const update = (s: GameState, dt: number, preview = false) => {
    const cinema = s.phase === 'result' && !preview;
    if (cinema) {
      projectionTime += dt;
      projectGreeting(projectionTime);
    }
    if ((clothMaterial.map !== null) !== cinema) {
      clothMaterial.map = cinema ? projectionTexture : null;
      clothMaterial.emissiveMap = cinema ? projectionTexture : null;
      clothMaterial.emissive.set(cinema ? '#d7e5ff' : '#000000');
      clothMaterial.emissiveIntensity = cinema ? 0.7 : 0;
      clothMaterial.color.set(cinema ? '#ffffff' : '#f0eadb');
      clothMaterial.needsUpdate = true;
    }
    // Impacts are tied to authoritative simulation time, so pause/reconnect
    // never invents a fresh snap or a new spring flight.
    const impulse = (kind: 'snap' | 'pop', side: number, duration: number) => {
      const event = [...s.events]
        .reverse()
        .find((e) => e.kind === kind && e.side === side);
      const age = event ? s.elapsed - event.at : duration;
      return age >= 0 && age < duration ? 1 - age / duration : 0;
    };
    const assembled = s.phase !== 'frame';
    const bare = s.phase === 'rods';
    const xs = [0, 2.345, 0, -2.345],
      ys = [1.295, 0, -1.295, 0];
    rails.forEach((rail, i) => {
      const active = s.phase === 'frame' && i === s.corners;
      const offset = active
        ? s.frameFit * 0.6
        : !assembled && i > s.corners
          ? 0.24
          : 0;
      rail.position.set(
        xs[i] + (i % 2 ? offset : 0),
        ys[i] + (i % 2 ? 0 : offset),
        s.phase === 'frame'
          ? Math.sin(impulse('snap', i, 0.38) * Math.PI) * 0.025
          : 0,
      );
      rail.rotation.z =
        (i % 2 ? Math.PI / 2 : 0) + (active ? s.frameTwist * 0.28 : 0);
    });
    corners.forEach((m, i) => {
      const active = s.phase === 'frame' && i === s.corners;
      m.visible = assembled || i < s.corners || active;
      m.material = kit.material(
        active
          ? Math.abs(s.frameFit) < 0.1 && Math.abs(s.frameTwist) < 0.1
            ? '#cde3a1'
            : '#e4b16b'
          : '#747b7a',
      );
    });
    cloth.visible = s.phase !== 'frame';
    // During the sleeve task the frame is visibly separate behind the loose cloth.
    frameRoot.position.lerp(
      new THREE.Vector3(0, bare ? 2.58 : 0, bare ? 1.42 : 0),
      1 - Math.exp(-dt * 6),
    );
    frameRoot.rotation.x = THREE.MathUtils.lerp(
      frameRoot.rotation.x,
      bare ? Math.PI / 2 : 0,
      1 - Math.exp(-dt * 6),
    );
    const average = s.tension.reduce((a, b) => a + b, 0) / 4;
    const sag =
      s.phase === 'rods'
        ? 0.045
        : s.phase === 'tension'
          ? 0.11 * (1 - average)
          : 0.003;
    const pos = clothGeometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = original[i * 3],
        y = original[i * 3 + 1];
      const envelope =
        Math.sin((x / 4.54 + 0.5) * Math.PI) *
        Math.sin((y / 2.44 + 0.5) * Math.PI);
      const wave =
        Math.sin(x * 9 + s.elapsed * 1.2) * Math.cos(y * 13) * sag * 0.28;
      const pressure =
        s.phase === 'rods'
          ? s.rodPressure[0] * Math.max(0, y) +
            s.rodPressure[2] * Math.max(0, -y) +
            (s.rodPressure[1] * Math.max(0, x)) / 2 +
            (s.rodPressure[3] * Math.max(0, -x)) / 2
          : 0;
      pos.setZ(
        i,
        -envelope * sag +
          wave +
          Math.sin(x * 17 + y * 14) * pressure * 0.028 * envelope,
      );
    }
    pos.needsUpdate = true;
    clothGeometry.computeVertexNormals();
    poles.forEach((pole, side) => {
      const horizontal = side % 2 === 0,
        progress = assembled && s.phase !== 'rods' ? 1 : s.rods[side];
      const len = horizontal ? 4.43 : 2.35;
      const exposed = len * (1 - progress);
      const x = horizontal ? -2.215 - exposed / 2 : side === 1 ? 2.23 : -2.23,
        y = horizontal ? (side === 0 ? 1.195 : -1.195) : -1.175 - exposed / 2;
      pole.scale.y = Math.max(0.001, 1 - progress);
      pole.position.set(x, y, 0.014);
      pole.rotation.z =
        (horizontal ? Math.PI / 2 : 0) +
        s.rodAlignment[side] * 0.085 +
        Math.sin(s.elapsed * 26) * s.rodPressure[side] * 0.018;
      pole.visible = s.phase === 'rods' && progress < 0.999;
      sleeves[side].position.set(
        horizontal ? 0 : side === 1 ? 2.23 : -2.23,
        horizontal ? (side === 0 ? 1.195 : -1.195) : 0,
        0.008,
      );
      sleeves[side].visible = cloth.visible;
      coils[side].forEach((coil, n) => {
        const pulling =
          s.spring.active && s.spring.side === side && n === s.clips[side];
        // Replicated flights render the detached coil. Only old snapshots need
        // the on-frame recoil fallback; a replacement being pulled stays visible.
        const recoil =
          !s.springFlights && n === s.clips[side]
            ? impulse('pop', side, 0.48)
            : 0;
        coil.visible =
          ['tension', 'drill', 'lift', 'level', 'result'].includes(s.phase) &&
          (n < s.clips[side] || pulling || recoil > 0);
        coil.scale.y = pulling
          ? Math.max(0.25, s.spring.power)
          : recoil
            ? 0.25 + Math.abs(Math.cos((1 - recoil) * 18)) * recoil * 0.75
            : 1;
        coil.rotation.x = recoil * Math.sin((1 - recoil) * 24) * 0.8;
      });
    });
    rings.forEach((ring, i) => {
      ring.visible =
        ['drill', 'lift', 'level', 'result'].includes(s.phase) || preview;
      ring.material = kit.material(
        s.latched[i] ? '#d4e8a2' : '#b9bdaf',
        0.3,
        0.6,
      );
    });
    // Keep the assembled screen out of the wall crew's view until the lift.
    const floor =
      ['frame', 'rods', 'tension', 'drill'].includes(s.phase) && !preview;
    const target = new THREE.Vector3(0, 0.12, FLOOR_Z),
      targetRot = new THREE.Euler(-Math.PI / 2, 0, 0);
    if (!floor) {
      const mounted = ['level', 'result'].includes(s.phase) || preview;
      const left = mounted
        ? (s.holes[0] ?? 5.9)
        : s.phase === 'lift'
          ? s.liftLeft
          : 2.6;
      const right = mounted
        ? (s.holes[1] ?? 5.9)
        : s.phase === 'lift'
          ? s.liftRight
          : 2.6;
      const transform = mountTransform(
        left,
        right,
        s.phase === 'lift' ? s.liftX : 0,
        mounted ? s.angle : undefined,
      );
      target.set(transform.x, transform.y, transform.z);
      targetRot.set(0, 0, transform.angle);
      root.scale.x = transform.scaleX;
    }
    if (floor) root.scale.x = 1;
    root.position.lerp(target, 1 - Math.exp(-dt * 6));
    root.quaternion.slerp(
      new THREE.Quaternion().setFromEuler(targetRot),
      1 - Math.exp(-dt * 6),
    );
    if (s.phase === 'lift' && !preview) {
      // Lerp + slerp alone would sweep the lower edge through the floor.
      // Include the corner plates and ring depth in the rotated half-height.
      const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
        root.quaternion.clone().invert(),
      );
      const halfHeight =
        2.415 * root.scale.x * Math.abs(localUp.x) +
        1.37 * Math.abs(localUp.y) +
        0.077 * Math.abs(localUp.z);
      root.position.y = Math.max(root.position.y, halfHeight + 0.04);
    }
  };
  const ringWorld = (side: number, out = new THREE.Vector3()) => {
    root.updateWorldMatrix(true, true);
    return rings[side].getWorldPosition(out);
  };
  const gripWorld = (side: number, out = new THREE.Vector3()) => {
    root.updateWorldMatrix(true, true);
    return root.localToWorld(
      out.set((side === 0 ? -1 : 1) * 2.04, -1.295, 0.06),
    );
  };
  const workWorld = (
    side: number,
    kind: 'rod' | 'spring' | 'hold',
    index = 0,
    out = new THREE.Vector3(),
  ) => {
    const horizontal = side % 2 === 0;
    if (kind === 'rod')
      out.set(
        horizontal ? -2.215 : side === 1 ? 2.23 : -2.23,
        horizontal ? (side === 0 ? 1.195 : -1.195) : -1.175,
        0.024,
      );
    else
      out.set(
        horizontal
          ? ((Math.min(3, index) + 0.5) / 4 - 0.5) * 4.3
          : side === 1
            ? 2.265
            : -2.265,
        horizontal
          ? side === 0
            ? 1.215
            : -1.215
          : ((Math.min(3, index) + 0.5) / 4 - 0.5) * 2.26,
        0.028,
      );
    root.updateWorldMatrix(true, true);
    return root.localToWorld(out);
  };
  return { root, rings, ringWorld, gripWorld, workWorld, update };
}

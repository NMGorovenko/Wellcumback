import * as THREE from 'three';
import { people } from '../../../lib/game/presets.ts';
import {
  SIGHT_HALF_ANGLE,
  TOILET_EXIT,
  toiletSightDistance,
} from '../../../lib/game/roma2/layout.ts';
import {
  visitorPresent,
  type Roma2State,
} from '../../../lib/game/roma2/engine.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { createRig } from '../world/rig.ts';
import { makeLabel } from '../world/labels.ts';

/** Geometry is allocated once. The cone uses the engine's exact occlusion rays. */
export function createToiletVisitor(kit: RenderKit) {
  const rig = createRig(kit, people[0], kit.scene, { anonymous: true });
  rig.root.name = 'toilet-visitor';
  const cap = kit.cylinder(0.16, 0.15, 0.08, '#4b5b45', 0, 0.18, 0, rig.head);
  cap.rotation.z = -0.1;
  const label = makeLabel(kit, 'ДНЕВАЛЬНЫЙ', '#f4dca1', 1.6);
  label.position.set(0, 2.25, 0);
  rig.root.add(label);
  const alert = makeLabel(kit, 'КТО ЗДЕСЬ?!', '#ffd2b9', 1.7);
  alert.position.set(0, 2.6, 0);
  rig.root.add(alert);
  const segments = 42;
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.Float32BufferAttribute(
    new Float32Array(segments * 9),
    3,
  );
  geometry.setAttribute('position', positions);
  const material = new THREE.MeshBasicMaterial({
    color: '#ead277',
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const cone = kit.mesh(geometry, material);
  cone.name = 'visitor-vision';
  cone.castShadow = cone.receiveShadow = false;
  cone.frustumCulled = false;
  const footsteps = kit.mesh(
    new THREE.RingGeometry(0.7, 0.82, 32),
    new THREE.MeshBasicMaterial({
      color: '#f4ce76',
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  footsteps.rotation.x = -Math.PI / 2;
  footsteps.position.set(TOILET_EXIT.x, 0.06, TOILET_EXIT.z);
  footsteps.castShadow = false;
  return {
    rig,
    cone,
    footsteps,
    update(s: Roma2State) {
      const v = s.visitor,
        present = visitorPresent(v);
      rig.root.visible = cone.visible = present;
      footsteps.visible = v.stage === 'warning';
      footsteps.scale.setScalar(1 + Math.sin(v.time * 9) * 0.17);
      if (!present) return;
      rig.root.position.set(v.x, 0, v.z);
      rig.root.rotation.y = v.heading;
      rig.update(
        s.elapsed,
        v.moving ? 'walk' : v.stage === 'wash' ? 'work' : 'idle',
        0.5,
      );
      rig.head.rotation.y = Math.atan2(
        Math.sin(v.gaze - v.heading),
        Math.cos(v.gaze - v.heading),
      );
      alert.visible = v.alert > 0;
      const detecting = s.actors.some((a) => a.exposure > 0.03);
      material.color.set(detecting || v.alert > 0 ? '#e57c54' : '#ead277');
      material.opacity = detecting ? 0.32 : 0.18;
      for (let i = 0; i < segments; i++) {
        positions.setXYZ(i * 3, v.x, 0.045, v.z);
        for (let edge = 0; edge < 2; edge++) {
          const angle =
            v.gaze -
            SIGHT_HALF_ANGLE +
            ((i + edge) / segments) * SIGHT_HALF_ANGLE * 2;
          const range = toiletSightDistance(v, angle);
          positions.setXYZ(
            i * 3 + edge + 1,
            v.x + Math.sin(angle) * range,
            0.045,
            v.z + Math.cos(angle) * range,
          );
        }
      }
      positions.needsUpdate = true;
    },
  };
}

export function createToiletFloor(kit: RenderKit) {
  const geometry = new THREE.BoxGeometry(0.478, 0.012, 0.478);
  kit.geometries.add(geometry);
  const tiles = ['#9ca595', '#b7bcaa'].map(
    (color) => new THREE.InstancedMesh(geometry, kit.material(color), 560),
  );
  const counts = [0, 0],
    matrix = new THREE.Matrix4();
  for (let x = -4.75; x < 5; x += 0.5)
    for (let z = -3.5; z < 10.5; z += 0.5) {
      const color = Math.round(x * 2 + z * 2) % 3 ? 0 : 1;
      matrix.makeTranslation(x, 0, z);
      tiles[color].setMatrixAt(counts[color]++, matrix);
    }
  tiles.forEach((tile, i) => {
    tile.count = counts[i];
    tile.receiveShadow = true;
    kit.scene.add(tile);
  });
  return tiles;
}

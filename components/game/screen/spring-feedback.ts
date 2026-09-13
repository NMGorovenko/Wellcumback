import * as THREE from 'three';
import type { GameState } from '@/lib/game/screen/engine';
import {
  MAX_SPRING_FLIGHTS,
  springFlightPose,
  springReaction,
  type SpringFlightPose,
} from '../../../lib/game/screen/spring-feedback.ts';
import type { CharacterRig } from '../world/rig';
import type { RenderKit } from '../world/render-kit';

/** A shared mesh pool follows the replicated spring flights, never local timers. */
export function createSpringFeedback(kit: RenderKit) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 96; i++) {
    const t = i / 96;
    points.push(
      new THREE.Vector3(
        Math.cos(t * Math.PI * 12) * 0.029,
        (t - 0.5) * 0.17,
        Math.sin(t * Math.PI * 12) * 0.029,
      ),
    );
  }
  // The wire is exaggerated slightly so its loops stay legible in the room view.
  const coil = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points),
    96,
    0.009,
    6,
    false,
  );
  const hook = new THREE.TorusGeometry(0.031, 0.008, 6, 20, Math.PI * 1.65);
  const shadowGeometry = new THREE.CircleGeometry(0.12, 20);
  const pool = Array.from({ length: MAX_SPRING_FLIGHTS }, () => {
    const root = new THREE.Group();
    kit.scene.add(root);
    const metal = new THREE.MeshStandardMaterial({
      color: '#879aa8',
      metalness: 0.76,
      roughness: 0.24,
      emissive: '#243640',
      emissiveIntensity: 0.17,
      transparent: true,
    });
    kit.mesh(coil, metal, root);
    for (let end = 0; end < 2; end++) {
      const eye = kit.mesh(hook, metal, root);
      eye.position.set(0, end === 0 ? -0.111 : 0.111, 0);
      eye.rotation.z = end === 0 ? Math.PI : 0;
    }
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: '#222520',
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    const shadow = kit.mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.castShadow = false;
    shadow.receiveShadow = false;
    root.visible = shadow.visible = false;
    return { root, metal, shadow, shadowMaterial };
  });
  const pose: SpringFlightPose = {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    visible: false,
    opacity: 0,
  };
  const attachedRotations = [0, -Math.PI / 2, Math.PI, Math.PI / 2].map(
    (angle) =>
      new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            angle,
          ),
        ),
  );
  const tumbleEuler = new THREE.Euler(),
    tumbleRotation = new THREE.Quaternion();
  const reactions = [0, 0, 0];
  const faceTarget = new THREE.Vector3(),
    handPosition = new THREE.Vector3(),
    coilAxis = new THREE.Vector3();
  const update = (state: GameState) => {
    const flights = state.springFlights;
    for (let actor = 0; actor < reactions.length; actor++)
      reactions[actor] = springReaction(flights, actor, state.elapsed);
    for (let i = 0; i < pool.length; i++) {
      const model = pool[i],
        flight = flights?.[i];
      if (!flight || state.phase !== 'tension') {
        model.root.visible = model.shadow.visible = false;
        continue;
      }
      springFlightPose(flight, state.elapsed, pose);
      model.root.visible = model.shadow.visible = pose.visible;
      if (!pose.visible) continue;
      model.root.position.copy(pose.position);
      const recoilAge = Math.max(0, state.elapsed - flight.at);
      tumbleEuler.set(pose.rotation.x, pose.rotation.y, pose.rotation.z);
      tumbleRotation.setFromEuler(tumbleEuler);
      model.root.quaternion.slerpQuaternions(
        attachedRotations[flight.side],
        tumbleRotation,
        Math.min(1, recoilAge / 0.08),
      );
      model.root.scale.y =
        1 + Math.sin(recoilAge * 55) * Math.exp(-recoilAge * 20) * 0.45;
      coilAxis.set(0, 1, 0).applyQuaternion(model.root.quaternion);
      const groundClearance =
        Math.abs(coilAxis.y) * 0.15 * model.root.scale.y +
        Math.sqrt(Math.max(0, 1 - coilAxis.y * coilAxis.y)) * 0.04;
      model.root.position.y = Math.max(
        pose.position.y,
        groundClearance + 0.012,
      );
      model.metal.opacity = pose.opacity;
      model.shadow.position.set(pose.position.x, 0.019, pose.position.z);
      const height = Math.max(0, pose.position.y);
      model.shadow.scale.setScalar(1 + height * 0.28);
      model.shadowMaterial.opacity = (pose.opacity * 0.18) / (1 + height);
    }
  };
  const react = (rig: CharacterRig, actor: number) => {
    const amount = reactions[actor];
    if (amount <= 0) return;
    // Reset from the same base pose each render, including a paused snapshot.
    // The head jerks back, then a hand stays over the eye until the flinch fades.
    const sign = actor % 2 === 0 ? -1 : 1;
    rig.head.rotation.x = THREE.MathUtils.lerp(
      rig.head.rotation.x,
      -0.34,
      amount,
    );
    rig.head.rotation.z = THREE.MathUtils.lerp(
      rig.head.rotation.z,
      sign * 0.19,
      amount,
    );
    rig.root.updateWorldMatrix(true, true);
    faceTarget.set(sign * 0.08, 0.015, 0.225);
    rig.head.localToWorld(faceTarget);
    const hand = sign < 0 ? rig.leftHand : rig.rightHand;
    hand.getWorldPosition(handPosition);
    handPosition.lerp(faceTarget, amount);
    rig.reach(sign < 0 ? 'left' : 'right', handPosition);
  };
  return { update, react };
}

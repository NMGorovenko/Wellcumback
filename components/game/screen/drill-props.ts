import * as THREE from 'three';
import {
  TOOL_ANCHORS,
  type HeldTool,
} from '../../../lib/game/screen/tool-staging.ts';
import type { GameState } from '@/lib/game/screen/engine';
import type { CharacterRig } from '../world/rig';
import type { RenderKit } from '../world/render-kit';
import { FLOOR_SCALE, hookHeight, hookX } from './screen-model.ts';

/** Portable tools, brick dust and persistent marks use the simulation's actual
 * motor/capture state. A warm, stopped drill cannot keep emitting particles. */
export function createDrillProps(kit: RenderKit) {
  const drill = new THREE.Group();
  kit.scene.add(drill);
  kit.box(0.22, 0.13, 0.12, '#457b70', 0, 0, 0, drill, 0.03);
  kit.box(0.08, 0.19, 0.1, '#283c36', -0.04, -0.1, 0, drill, 0.02);
  kit.box(0.13, 0.05, 0.13, '#202c2b', -0.04, -0.21, 0, drill, 0.018);
  const bit = kit.cylinder(0.007, 0.007, 0.32, '#b8b9ae', 0.27, 0, 0, drill);
  bit.rotation.z = Math.PI / 2;
  const vacuum = new THREE.Group();
  kit.scene.add(vacuum);
  kit.sphere(0.1, 0.11, 0.095, '#64628b', -0.025, 0.055, 0, vacuum);
  kit.cylinder(0.065, 0.065, 0.15, '#adbbc0', 0.065, -0.04, 0, vacuum);
  kit.box(0.045, 0.14, 0.05, '#252b37', -0.065, -0.07, 0, vacuum, 0.012);
  kit.box(0.1, 0.04, 0.1, '#3e4966', -0.055, -0.16, 0, vacuum, 0.014);
  kit.rod(
    new THREE.Vector3(0.07, 0.04, 0),
    new THREE.Vector3(0.3, 0.04, 0),
    0.027,
    '#c1c6c1',
    vacuum,
  );
  kit.box(0.065, 0.05, 0.1, '#242d32', 0.31, 0.04, 0, vacuum, 0.007);
  const particles = Array.from({ length: 32 }, () =>
    kit.sphere(0.012, 0.008, 0.01, '#b86d36'),
  );
  const stains = [0, 1].map((side) =>
    Array.from({ length: 22 }, (_, i) => {
      const stain = kit.sphere(
        0.04 + (i % 3) * 0.016,
        0.022 + (i % 5) * 0.016,
        0.002,
        '#ae6536',
      );
      stain.position.set(hookX(side) + Math.sin(i * 12.7) * 0.15, 0, -3.257);
      return stain;
    }),
  );
  const hand = new THREE.Vector3(),
    other = new THREE.Vector3(),
    target = new THREE.Vector3();
  const axis = new THREE.Vector3(),
    palm = new THREE.Vector3();
  function anchor(prop: THREE.Group, kind: HeldTool, tip?: THREE.Vector3) {
    const local = TOOL_ANCHORS[kind];
    palm.copy(local.grip);
    if (tip) {
      axis.copy(local.tip).sub(palm).normalize();
      prop.quaternion.setFromUnitVectors(
        axis,
        other.copy(tip).sub(prop.position).normalize(),
      );
    }
    prop.position.sub(palm.applyQuaternion(prop.quaternion));
  }
  const place = (
    prop: THREE.Group,
    rig: CharacterRig,
    side: 'left' | 'right',
  ) => {
    (side === 'left' ? rig.leftHand : rig.rightHand).getWorldPosition(hand);
    prop.position.copy(hand);
  };
  function update(s: GameState, rigs: CharacterRig[], time: number) {
    const active = s.phase === 'drill';
    drill.visible = vacuum.visible = active;
    if (active) {
      const receivingDrill =
        s.drillMode === 'handoff' && s.drillGear === 'none';
      const receivingVacuum =
        s.drillMode === 'handoff' && s.drillGear === 'drill';
      place(
        drill,
        rigs[s.drillGear === 'none' ? 0 : 1],
        s.drillGear === 'none' ? 'left' : 'right',
      );
      if (receivingDrill) {
        rigs[1].rightHand.getWorldPosition(other);
        drill.position.lerp(other, s.handoffProgress);
      }
      if (s.drillGear === 'ready') place(vacuum, rigs[1], 'left');
      else if (receivingVacuum) {
        place(vacuum, rigs[0], 'left');
        rigs[1].leftHand.getWorldPosition(other);
        vacuum.position.lerp(other, s.handoffProgress);
      } else vacuum.position.set(s.chairX * FLOOR_SCALE - 0.75, 0.18, -2.1);
      drill.rotation.set(0, 0, -0.35);
      vacuum.rotation.set(0, 0, -0.15);
      if (s.drillMode === 'drill') {
        target.set(s.chairX * FLOOR_SCALE, hookHeight(s.aim), -3.255);
        anchor(drill, 'drill', target);
        target.y -= 0.05;
        anchor(vacuum, 'vacuum', target);
      } else {
        anchor(drill, 'drill');
        anchor(vacuum, 'vacuum');
      }
      if (s.drillMode === 'descend') {
        // Tools are stowed on the belt so the climber can grip the chair with a free hand.
        for (const [i, prop] of [drill, vacuum].entries()) {
          prop.position.set(i ? -0.24 : 0.24, 0.91, 0.06);
          (rigs[1].rightArm.parent ?? rigs[1].root).localToWorld(prop.position);
          prop.rotation.set(0, 0, -Math.PI / 2);
        }
      }
      if (s.drillMode === 'fallen') {
        for (const [i, prop] of [drill, vacuum].entries()) {
          prop.position.set(
            s.chairX * FLOOR_SCALE + (i ? -0.8 : 0.9),
            0.09 + Math.sin(Math.min(1, s.fallProgress * 3) * Math.PI) * 0.3,
            -2.08,
          );
          prop.rotation.set(0.7, i, 1.3);
        }
      }
    }
    particles.forEach((particle, i) => {
      particle.visible = active && s.drillRunning && s.drillHeat < 0.86;
      if (!particle.visible) return;
      const t = (time * 2 + i / particles.length) % 1;
      const spread = s.vacuumRunning ? 0.025 : 0.26;
      particle.position.set(
        s.chairX * FLOOR_SCALE + Math.sin(i * 7) * t * spread,
        hookHeight(s.aim) - t * (s.vacuumRunning ? 0.05 : 0.62),
        -3.2 + t * (s.vacuumRunning ? 0.055 : 0.23),
      );
      const size = s.vacuumRunning ? 1 - t : 1;
      particle.scale.set(0.012 * size, 0.008 * size, 0.01 * size);
    });
    stains.forEach((patches, side) =>
      patches.forEach((stain, i) => {
        const amount = s.wallDust[side];
        stain.visible =
          amount > 0.025 &&
          ['drill', 'lift', 'level', 'result'].includes(s.phase);
        stain.position.y =
          hookHeight(s.holes[side] ?? s.drillMark ?? s.aim) -
          0.025 -
          (i / patches.length) * 0.65;
        const size = Math.min(1, amount * 2.3) * (0.6 + (i % 3) * 0.2);
        stain.scale.set(
          (0.04 + (i % 3) * 0.016) * size,
          (0.022 + (i % 5) * 0.016) * size,
          0.002,
        );
      }),
    );
  }
  return { update };
}

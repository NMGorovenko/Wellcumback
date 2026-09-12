import * as THREE from 'three';
import {
  TOOL_ANCHORS,
  type HeldTool,
} from '../../../lib/game/screen/tool-staging.ts';
import type { GameState } from '@/lib/game/screen/engine';
import type { CharacterRig } from '../world/rig';
import type { RenderKit } from '../world/render-kit';
import { createToolShelf } from './tool-shelf.ts';
import { DRILL_SHELF } from '../../../lib/game/screen/drill-space.ts';
import { makeLabel } from '../world/labels.ts';
import { getControlSettings } from '../../../lib/game/input/settings-store.ts';
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
  const shelf = createToolShelf(kit, DRILL_SHELF);
  const toolMeshes = { drill, vacuum };
  const previousLocations = new Map<HeldTool, string>();
  const previousGrips = new Map<HeldTool, THREE.Vector3>();
  const fallOffsets = new Map<HeldTool, THREE.Vector3>();
  const kinds = ['drill', 'vacuum'] as const;
  const labels = kinds.map((kind) => {
    const label = makeLabel(
      kit,
      kind === 'drill' ? 'ДРЕЛЬ НА ПОЛУ' : 'ПЫЛЕСОС НА ПОЛУ',
      '#e1cf9c',
      1.1,
    );
    kit.scene.add(label);
    return label;
  });
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
    const prompts =
      getControlSettings().showWorldPrompts && active && !s.paused;
    const nearestGround = kinds
      .filter((kind) => s.drillTools[kind].location === 'ground')
      .sort(
        (a, b) =>
          Math.hypot(
            s.drillTools[a].position.x - s.drillAssistant.x,
            s.drillTools[a].position.z - s.drillAssistant.z,
          ) -
          Math.hypot(
            s.drillTools[b].position.x - s.drillAssistant.x,
            s.drillTools[b].position.z - s.drillAssistant.z,
          ),
      )[0];
    shelf.label.visible =
      prompts && kinds.some((kind) => s.drillTools[kind].location === 'shelf');
    for (const [index, kind] of kinds.entries()) {
      const prop = toolMeshes[kind],
        tool = s.drillTools[kind];
      const assistantSide = kind === 'drill' ? 'left' : 'right';
      const climberSide = kind === 'drill' ? 'right' : 'left';
      prop.visible =
        active || tool.location === 'shelf' || tool.location === 'ground';
      labels[index].visible =
        prompts &&
        tool.location === 'ground' &&
        kind === (s.drillAssistant.pickupTool ?? nearestGround) &&
        Math.hypot(
          tool.position.x - s.drillAssistant.x,
          tool.position.z - s.drillAssistant.z,
        ) < 1.3;
      labels[index].position.set(tool.position.x, 0.48, tool.position.z);
      if (!prop.visible) continue;
      if (
        tool.location === 'falling' &&
        previousLocations.get(kind) === 'climber' &&
        tool.fallFrom
      ) {
        const previous = previousGrips.get(kind);
        if (previous)
          fallOffsets.set(
            kind,
            previous.clone().sub(new THREE.Vector3().copy(tool.fallFrom)),
          );
      }
      if (tool.location !== 'falling') fallOffsets.delete(kind);
      prop.rotation.set(
        0,
        tool.location === 'shelf' && kind === 'drill' ? Math.PI : 0,
        0,
      );
      if (tool.location === 'assistant') {
        place(prop, rigs[0], assistantSide);
        prop.rotation.z = kind === 'drill' ? -0.3 : 0.15;
        if (s.handoffTool === kind && s.handoffProgress > 0) {
          (climberSide === 'left'
            ? rigs[1].leftHand
            : rigs[1].rightHand
          ).getWorldPosition(other);
          prop.position.lerp(other, s.handoffProgress);
        }
        anchor(prop, kind);
      } else if (tool.location === 'climber') {
        if (s.drillMode === 'drill') {
          place(prop, rigs[1], climberSide);
          target.set(
            s.chairX * FLOOR_SCALE,
            hookHeight(s.aim) - (kind === 'vacuum' ? 0.05 : 0),
            -3.255,
          );
          anchor(prop, kind, target);
        } else if (['descend', 'position', 'climb'].includes(s.drillMode)) {
          // Keep both tools clipped to Yarik's belt between the holes, leaving
          // his hands available for the chair. No trip back to the shelf occurs.
          prop.position.set(kind === 'drill' ? 0.24 : -0.24, 0.91, 0.06);
          (rigs[1].rightArm.parent ?? rigs[1].root).localToWorld(prop.position);
          prop.rotation.set(0, rigs[1].root.rotation.y, -Math.PI / 2);
        } else {
          place(prop, rigs[1], climberSide);
          anchor(prop, kind);
        }
      } else {
        prop.position.copy(tool.position);
        if (tool.location === 'falling') {
          const t = tool.fallProgress;
          const offset = fallOffsets.get(kind);
          if (offset) prop.position.addScaledVector(offset, 1 - t);
          prop.rotation.set(
            (Math.PI / 2) * t,
            (index ? -1 : 1) * t * 2.8,
            Math.sin(t * Math.PI) * 2.1,
          );
        } else if (tool.location === 'ground')
          prop.rotation.set(Math.PI / 2, index ? -2.8 : 2.8, 0);
        anchor(prop, kind);
      }
      prop.updateWorldMatrix(true, false);
      const grip = new THREE.Vector3().copy(TOOL_ANCHORS[kind].grip);
      prop.localToWorld(grip);
      previousGrips.set(kind, grip);
      previousLocations.set(kind, tool.location);
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
  return {
    update,
    bounds: () =>
      kinds
        .filter((kind) => toolMeshes[kind].visible)
        .map((kind) => toolMeshes[kind].position),
  };
}

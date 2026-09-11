/* oxlint-disable jsx-a11y/prefer-tag-over-role -- A live WebGL surface has no static image URL. */
'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { people } from '@/lib/game/presets';
import {
  freshGame,
  PHYSICAL_LAYOUT,
  type GameState,
  type WorkerAction,
} from '@/lib/game/screen/engine';
import { RenderKit } from '../world/render-kit';
import { createRig, type Pose } from '../world/rig';
import { createApartment } from '../world/apartment';
import { makeLabel } from '../world/labels';
import {
  createScreenModel,
  FLOOR_SCALE,
  FLOOR_Z,
  hookHeight,
  hookX,
  MOUNT_Z,
} from './screen-model';

export type CameraMode = 'auto' | 'wide' | 'faces';
type Props = {
  stateRef?: RefObject<GameState>;
  preview?: boolean;
  cameraMode?: CameraMode;
};
const poses: Record<WorkerAction, Pose> = {
  idle: 'idle',
  walk: 'walk',
  hold: 'work',
  feed: 'work',
  pull: 'pull',
  throw: 'throw',
  catch: 'catch',
  drill: 'drill',
  fall: 'fall',
  lift: 'carry',
};

export default function Scene({
  stateRef,
  preview = !stateRef,
  cameraMode = 'auto',
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    options = useRef({ stateRef, preview, cameraMode });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    options.current = { stateRef, preview, cameraMode };
  }, [stateRef, preview, cameraMode]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      // External WebGL initialization may fail on unsupported devices.
      // oxlint-disable-next-line react/react-compiler
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.setClearColor('#181e25');
    element.appendChild(renderer.domElement);
    const world = new THREE.Scene(),
      kit = new RenderKit(world);
    world.fog = new THREE.Fog('#21262a', 20, 42);
    const camera = new THREE.PerspectiveCamera(49, 1, 0.05, 65);
    camera.position.set(7.5, 7.7, 11.5);
    world.add(new THREE.HemisphereLight('#e4e9f0', '#6d5037', 1.15));
    const key = new THREE.DirectionalLight('#ffdfb1', 3.1);
    key.position.set(-3.5, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.normalBias = 0.025;
    key.shadow.bias = -0.00012;
    Object.assign(key.shadow.camera, {
      left: -9,
      right: 9,
      top: 8,
      bottom: -8,
      near: 0.1,
      far: 25,
    });
    world.add(key);
    const fill = new THREE.DirectionalLight('#b8cff1', 1.4);
    fill.position.set(6, 3, -1);
    world.add(fill);
    const warm = new THREE.PointLight('#ffc88a', 15, 8, 2);
    warm.position.set(-4, 2.8, 0);
    world.add(warm);
    const apartment = createApartment(kit);
    apartment.sofa.position.z = PHYSICAL_LAYOUT.sofaZ;
    const screen = createScreenModel(kit);
    const rigs = people.map((p) => createRig(kit, p));
    const nameplates = rigs.map((rig, i) => {
      const label = makeLabel(
        kit,
        people[i].name,
        i === 0 ? '#eadca9' : i === 1 ? '#b4ced7' : '#c6d3b1',
        0.83,
      );
      rig.root.add(label);
      label.position.y = 2.24;
      return label;
    });
    const previewState = freshGame(3);
    previewState.phase = 'result';
    previewState.holes = [5.9, 6.04];
    previewState.clips = [4, 4, 4, 4];
    previewState.tension = [1, 1, 1, 1];
    previewState.latched = [true, true];
    const wallHooks = [0, 1].map((i) => {
      const group = new THREE.Group();
      world.add(group);
      group.position.set(hookX(i), 3.05, -3.22);
      kit.box(0.068, 0.22, 0.025, '#5b5f5f', 0, -0.025, 0, group, 0.009);
      const adjustable = new THREE.Group();
      group.add(adjustable);
      const stem = kit.rod(
        new THREE.Vector3(0, -0.04, 0),
        new THREE.Vector3(0, -0.04, MOUNT_Z + 3.22),
        0.014,
        '#b8bbae',
        adjustable,
      );
      kit.rod(
        new THREE.Vector3(0, -0.04, MOUNT_Z + 3.22),
        new THREE.Vector3(0, 0.035, MOUNT_Z + 3.22),
        0.013,
        '#b8bbae',
        adjustable,
      );
      const screw = kit.cylinder(
        0.017,
        0.017,
        0.26,
        '#858e8c',
        0,
        0,
        0.04,
        group,
      );
      return { group, adjustable, stem, screw };
    });
    const marks = [0, 1].map((i) => {
      const label = makeLabel(
        kit,
        i === 0 ? '① ЛЕВЫЙ КРЮЧОК' : '② ПРАВЫЙ КРЮЧОК',
        '#dbd8ba',
        1.1,
      );
      world.add(label);
      return label;
    });
    const drill = new THREE.Group();
    world.add(drill);
    kit.box(0.22, 0.13, 0.12, '#457b70', 0, 0, 0, drill, 0.03);
    kit.box(0.08, 0.19, 0.1, '#283c36', -0.04, -0.1, 0, drill, 0.02);
    const bit = kit.cylinder(0.007, 0.007, 0.2, '#b8b9ae', 0.17, 0, 0, drill);
    bit.rotation.z = Math.PI / 2;
    const screwdriver = new THREE.Group();
    world.add(screwdriver);
    kit.cylinder(0.027, 0.021, 0.19, '#be803d', 0, 0, 0, screwdriver);
    kit.cylinder(0.005, 0.005, 0.24, '#b3b9b8', 0, 0.2, 0, screwdriver);
    const tip = kit.torus(0.025, 0.005, '#bdc2be', 0, 0.332, 0, screwdriver);
    tip.scale.x = 0.6;
    const toolHalo = kit.torus(0.16, 0.008, '#dfbd78', 0, 0.028, 0);
    toolHalo.rotation.x = -Math.PI / 2;
    const drillDust = Array.from({ length: 16 }, () =>
      kit.sphere(0.009, 0.009, 0.009, '#cfbda2'),
    );
    const popParts = Array.from({ length: 12 }, () =>
      kit.sphere(0.018, 0.018, 0.018, '#d0c4a2'),
    );
    const targetPosition = new THREE.Vector3(),
      lookAt = new THREE.Vector3(0, 1, -0.2),
      wantedLook = new THREE.Vector3();
    const hand = new THREE.Vector3(),
      temp = new THREE.Vector3(),
      grip = new THREE.Vector3(),
      workTarget = new THREE.Vector3(),
      drillTarget = new THREE.Vector3();
    let time = 0,
      last = performance.now(),
      raf = 0,
      lastToolStatus = 'held',
      sceneInitialized = false;
    const throwStart = new THREE.Vector3();
    const size = () => {
      const w = element.clientWidth,
        h = element.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const resize = new ResizeObserver(size);
    resize.observe(element);
    size();
    function render(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const opt = options.current,
        s = opt.stateRef?.current ?? previewState;
      if (!s.paused) time += dt;
      const isPreview = opt.preview;
      if (isPreview) previewState.elapsed = time;
      screen.update(s, sceneInitialized ? (s.paused ? 0 : dt) : 1, isPreview);
      sceneInitialized = true;
      const floor =
        ['frame', 'rods', 'tension'].includes(s.phase) && !isPreview;
      const drillPhase = s.phase === 'drill' && !isPreview;
      const count = isPreview ? 3 : Math.max(2, s.players);
      rigs.forEach((rig, i) => {
        rig.root.visible = i < count;
        if (i >= count) return;
        const worker = s.workers[i];
        let pose: Pose = poses[worker.animation];
        let x = worker.x * FLOOR_SCALE,
          z = worker.z * FLOOR_SCALE + FLOOR_Z,
          y = 0,
          rotation = Math.atan2(-x, -z);
        const floorWork =
          floor && ['hold', 'feed', 'pull'].includes(worker.animation);
        if (floor && worker.animation === 'walk' && worker.navigation.length) {
          const next = worker.navigation[0];
          rotation = Math.atan2(
            next.x * FLOOR_SCALE - x,
            next.z * FLOOR_SCALE + FLOOR_Z - z,
          );
        }
        if (floorWork) {
          // Feet remain at the navigation system's collision-tested work slots.
          // Only the working owner reaches the active spring/rod; other hands hold
          // the cloth at distinct points directly in front of their own bodies.
          if (worker.animation === 'feed' || worker.animation === 'pull')
            screen.workWorld(
              worker.side,
              worker.animation === 'feed' ? 'rod' : 'spring',
              s.clips[worker.side],
              workTarget,
            );
          else {
            const horizontal = worker.side % 2 === 0;
            workTarget.set(
              horizontal
                ? THREE.MathUtils.clamp(x, -2.17, 2.17)
                : worker.side === 1
                  ? 2.265
                  : -2.265,
              horizontal
                ? worker.side === 0
                  ? 1.215
                  : -1.215
                : THREE.MathUtils.clamp(-(z - FLOOR_Z), -1.12, 1.12),
              0.028,
            );
            screen.root.updateWorldMatrix(true, false);
            screen.root.localToWorld(workTarget);
          }
          rotation = Math.atan2(workTarget.x - x, workTarget.z - z);
        }
        if (isPreview) {
          x = [-1.1, 0.05, 1.25][i];
          z = 1.12 + Math.sin(i) * 0.2;
          rotation = [0.13, -0.1, -0.3][i];
          pose = 'idle';
        } else if (!floor && !drillPhase) {
          // Both carriers stand on the floor and lift with their arms. Ring height never raises a body.
          if (i < 2) {
            screen.gripWorld(i, grip);
            x = grip.x;
            z = grip.z + 0.34;
          } else {
            x = 0;
            z = -1.8;
          }
          rotation = Math.PI;
          pose = s.phase === 'result' ? 'celebrate' : i < 2 ? 'carry' : 'idle';
        } else if (drillPhase) {
          const activeDriller = s.players === 1 ? 0 : 1;
          x =
            s.chairX * FLOOR_SCALE +
            (i === activeDriller ? 0 : i === 0 ? -0.64 : 0.7);
          z = -2.68 + (i === activeDriller ? 0 : 0.55);
          rotation = Math.PI;
          if (i === activeDriller) {
            y =
              s.drillMode === 'position'
                ? 0
                : s.climb * (s.chairs === 2 ? 1.47 : 0.8);
            pose =
              s.drillMode === 'drill'
                ? 'drill'
                : s.drillMode === 'climb'
                  ? 'walk'
                  : 'idle';
          } else pose = s.drillMode === 'position' ? 'walk' : 'work';
          const fall = s.events.findLast((e) => e.kind === 'fall');
          if (fall && s.elapsed - fall.at < 0.65 && i === activeDriller) {
            const t = (s.elapsed - fall.at) / 0.65;
            y = Math.max(0, (1 - t) * 0.8);
            pose = 'fall';
            rig.root.rotation.z = Math.sin(t * Math.PI) * 0.5;
          } else
            rig.root.rotation.z =
              s.drillMode === 'drill' ? s.balance * 0.065 : 0;
        }
        if (opt.cameraMode === 'faces') rotation = 0;
        if (floor) rig.root.position.set(x, y, z);
        else rig.root.position.lerp(temp.set(x, y, z), 1 - Math.exp(-dt * 11));
        if (
          !drillPhase ||
          (s.drillMode === 'position' &&
            !s.events.some((e) => e.kind === 'fall' && s.elapsed - e.at < 0.65))
        )
          rig.root.position.y = 0;
        const difference =
          THREE.MathUtils.euclideanModulo(
            rotation - rig.root.rotation.y + Math.PI,
            Math.PI * 2,
          ) - Math.PI;
        rig.root.rotation.y += difference * (1 - Math.exp(-dt * 10));
        if (!s.paused)
          rig.update(
            time + i * 0.83,
            pose,
            s.spring.worker === i ? s.spring.power : s.tool.charge,
          );
        if (floorWork && opt.cameraMode !== 'faces') {
          rig.setCrouch(0.72);
          rig.reach('right', workTarget);
          rig.reach(
            'left',
            workTarget
              .clone()
              .add(
                new THREE.Vector3(
                  worker.side % 2 === 0 ? 0.13 : 0,
                  0,
                  worker.side % 2 === 1 ? 0.13 : 0,
                ),
              ),
          );
        } else if (
          !floor &&
          !drillPhase &&
          !isPreview &&
          i < 2 &&
          s.phase !== 'result' &&
          opt.cameraMode !== 'faces'
        ) {
          screen.gripWorld(i, grip);
          rig.setCrouch(THREE.MathUtils.clamp(1.39 - grip.y - 0.43, 0, 0.72));
          rig.reach('left', grip.clone().add(new THREE.Vector3(0.13, 0, 0)));
          rig.reach('right', grip.clone().add(new THREE.Vector3(-0.13, 0, 0)));
        } else if (
          drillPhase &&
          i === (s.players === 1 ? 0 : 1) &&
          s.drillMode === 'drill' &&
          opt.cameraMode !== 'faces'
        ) {
          const mark = new THREE.Vector3(
            s.chairX * FLOOR_SCALE,
            hookHeight(s.aim),
            -3.16,
          );
          const reachTarget = mark
            .clone()
            .add(
              new THREE.Vector3(-0.035, s.chairs === 1 ? -0.24 : -0.12, 0.23),
            );
          rig.reach('right', reachTarget);
          rig.reach(
            'left',
            reachTarget.clone().add(new THREE.Vector3(0.18, -0.05, 0.05)),
          );
        }
        nameplates[i].visible = !isPreview && opt.cameraMode !== 'faces';
      });
      apartment.stools.forEach((stool, i) => {
        if (drillPhase) {
          stool.position.set(
            s.chairX * FLOOR_SCALE,
            i === 1 && s.chairs === 2 ? 0.67 : 0,
            i === 1 && s.chairs === 1 ? -0.75 : -2.65,
          );
          stool.rotation.set(0, Math.PI, s.balance * 0.065);
        } else {
          const parked = PHYSICAL_LAYOUT.parkedStools[i];
          stool.position.set(parked.x, 0, parked.z);
          stool.rotation.set(0, -Math.PI / 2, 0);
        }
      });
      wallHooks.forEach(({ group, adjustable, screw }, i) => {
        group.visible = isPreview || s.holes.length > i;
        group.position.y = hookHeight(s.holes[i] ?? s.aim);
        if (
          isPreview ||
          ['level', 'result'].includes(s.phase) ||
          (s.phase === 'lift' && s.latched[i])
        ) {
          screen.ringWorld(i, grip);
          adjustable.position.set(
            grip.x - group.position.x,
            grip.y - group.position.y,
            0,
          );
          screw.scale.y = Math.max(1, Math.abs(adjustable.position.y) / 0.13);
          screw.position.y = adjustable.position.y * 0.5;
        } else {
          adjustable.position.set(0, 0, 0);
          screw.scale.y = 1;
          screw.position.y = 0;
        }
        marks[i].visible = !isPreview && ['drill', 'lift'].includes(s.phase);
        marks[i].position.set(
          hookX(i),
          hookHeight(s.holes[i] ?? s.aim) + 0.22,
          -3.04,
        );
      });
      drill.visible = drillPhase && s.drillMode !== 'position';
      if (drill.visible) {
        const user = rigs[s.players === 1 ? 0 : 1];
        user.rightHand.getWorldPosition(hand);
        drill.position.copy(hand);
        drillTarget.set(s.chairX * FLOOR_SCALE, hookHeight(s.aim), -3.16);
        const direction = drillTarget.clone().sub(hand);
        drill.quaternion.setFromUnitVectors(
          new THREE.Vector3(1, 0, 0),
          direction.clone().normalize(),
        );
        const length = Math.max(0.16, direction.length() - 0.12);
        bit.scale.y = length / 0.2;
        bit.position.x = 0.12 + length / 2;
      }
      const drilling = drill.visible && s.drillHeat > 0 && s.drillHeat < 0.85;
      drillDust.forEach((dust, i) => {
        dust.visible = drilling;
        const t = (time * 1.7 + i / 16) % 1;
        dust.position.set(
          s.chairX * FLOOR_SCALE + Math.sin(i * 7) * t * 0.13,
          hookHeight(s.aim) - t * 0.7,
          -3.12 + t * 0.13,
        );
      });
      screwdriver.visible = s.phase === 'tension';
      toolHalo.visible = s.phase === 'tension' && s.tool.status === 'ground';
      if (screwdriver.visible) {
        const t = s.tool;
        if (t.status === 'flight') {
          if (lastToolStatus !== 'flight')
            rigs[t.owner].rightHand.getWorldPosition(throwStart);
          rigs[t.target].rightHand.getWorldPosition(hand);
          const receiver = s.workers[t.target];
          hand.x += (t.toX - receiver.x) * FLOOR_SCALE;
          hand.z += (t.toZ - receiver.z) * FLOOR_SCALE;
          screwdriver.position.lerpVectors(throwStart, hand, t.flight);
          screwdriver.position.y += Math.sin(t.flight * Math.PI) * 2;
          screwdriver.rotation.set(time * 14, 0, time * 3);
        } else if (t.status === 'ground') {
          screwdriver.position.set(
            t.x * FLOOR_SCALE,
            0.07,
            t.z * FLOOR_SCALE + FLOOR_Z,
          );
          screwdriver.rotation.set(Math.PI / 2, 0, time * 0.1);
        } else {
          rigs[t.owner].rightHand.getWorldPosition(hand);
          screwdriver.position.copy(hand);
          screwdriver.rotation.set(-Math.PI / 3, 0, 0.2);
        }
        lastToolStatus = t.status;
        toolHalo.position.set(
          screwdriver.position.x,
          0.045,
          screwdriver.position.z,
        );
        toolHalo.scale.setScalar(1 + Math.sin(time * 4) * 0.15);
      }
      const event = s.events.findLast((e) =>
        ['snap', 'pop', 'spring', 'latch', 'miss'].includes(e.kind),
      );
      popParts.forEach((part, i) => {
        const age = event ? s.elapsed - event.at : 10;
        part.visible = age >= 0 && age < 0.65;
        if (!part.visible || !event) return;
        const worker = s.workers[event.worker] ?? s.workers[0],
          a = i * 2.4;
        part.position.set(
          worker.x * FLOOR_SCALE + Math.cos(a) * age * 0.8,
          0.3 + Math.sin((age * Math.PI) / 0.65) * 0.4,
          worker.z * FLOOR_SCALE + FLOOR_Z + Math.sin(a) * age * 0.8,
        );
      });
      if (opt.cameraMode === 'faces') {
        const index = isPreview
          ? 1
          : s.phase === 'tension'
            ? s.tool.owner
            : s.phase === 'drill' && s.players > 1
              ? 1
              : 0;
        const rig = rigs[index];
        rig.head.getWorldPosition(wantedLook);
        targetPosition.set(
          THREE.MathUtils.clamp(rig.root.position.x + 0.18, -5.7, 5.7),
          wantedLook.y + 0.09,
          Math.max(-2.15, rig.root.position.z + 2.1),
        );
      } else if (opt.cameraMode === 'wide') {
        targetPosition.set(8.9, 8.4, 12.4);
        wantedLook.set(0, 0.7, -0.1);
      } else if (isPreview) {
        targetPosition.set(6.9, 4.15, 9.3);
        wantedLook.set(-0.2, 1.3, -0.9);
      } else if (floor) {
        targetPosition.set(4.45, 5.25, 6.25);
        wantedLook.set(0, 0.55, -0.25);
      } else if (drillPhase) {
        targetPosition.set(s.chairX * FLOOR_SCALE * 0.25 + 3.5, 4.1, 6.3);
        wantedLook.set(s.chairX * FLOOR_SCALE * 0.5, 1.65, -2.35);
      } else {
        targetPosition.set(3.4, 3.35, 6.6);
        wantedLook.set(0, 1.5, -2.4);
      }
      // AUTO stays close, then expands only enough to retain every participant,
      // the whole working frame, and a pending screwdriver arc inside the frustum.
      if (floor && opt.cameraMode === 'auto') {
        const forward = targetPosition.clone().sub(wantedLook).normalize();
        const right = new THREE.Vector3()
          .crossVectors(new THREE.Vector3(0, 1, 0), forward)
          .normalize();
        const up = new THREE.Vector3().crossVectors(forward, right).normalize();
        const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)),
          tanX = tanY * camera.aspect;
        const bounds = [
          new THREE.Vector3(-2.55, 0.1, FLOOR_Z - 1.5),
          new THREE.Vector3(2.55, 0.1, FLOOR_Z - 1.5),
          new THREE.Vector3(-2.55, 0.1, FLOOR_Z + 1.5),
          new THREE.Vector3(2.55, 0.1, FLOOR_Z + 1.5),
        ];
        rigs.slice(0, count).forEach((rig) => {
          bounds.push(
            rig.root.position.clone(),
            rig.root.position.clone().add(new THREE.Vector3(0, 2.18, 0)),
          );
        });
        if (
          s.phase === 'tension' &&
          (s.tool.status === 'flight' || s.tool.status === 'charging')
        )
          bounds.push(new THREE.Vector3(0, 3.5, FLOOR_Z));
        let distance = targetPosition.distanceTo(wantedLook);
        for (const point of bounds) {
          point.sub(wantedLook);
          distance = Math.max(
            distance,
            point.dot(forward) +
              (Math.abs(point.dot(right)) / Math.max(0.2, tanX)) * 1.12,
            point.dot(forward) + (Math.abs(point.dot(up)) / tanY) * 1.12,
          );
        }
        targetPosition.copy(wantedLook).addScaledVector(forward, distance);
      }
      // Narrow viewports pull back, keeping the whole working area visible.
      if (
        camera.aspect < 1.3 &&
        opt.cameraMode !== 'faces' &&
        !(floor && opt.cameraMode === 'auto')
      )
        targetPosition
          .sub(wantedLook)
          .multiplyScalar(1.3 / Math.max(0.75, camera.aspect))
          .add(wantedLook);
      camera.position.lerp(targetPosition, 1 - Math.exp(-dt * 3));
      lookAt.lerp(wantedLook, 1 - Math.exp(-dt * 3));
      camera.lookAt(lookAt);
      renderer.render(world, camera);
      raf = requestAnimationFrame(render);
    }
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      kit.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div
      className="three-host"
      ref={host}
      role="img"
      aria-label="Трёхмерная кухня-гостиная по вашим фотографиям. Бригада собирает огромный экран."
    >
      {failed && (
        <div className="webgl-error">
          Не удалось включить 3D. Проверьте, включено ли аппаратное ускорение в
          браузере.
        </div>
      )}
    </div>
  );
}

'use client';
import { createGraphicsController } from '../world/graphics';
import { screenFaceActor } from '@/lib/game/screen/camera';
import { levelCheck, levelCheckStage } from '@/lib/game/screen/level-check';
import { createSpiritLevel, placeLevelHands } from './spirit-level';
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- A live WebGL surface has no static image URL. */
import { renderedFrameCounter } from '@/lib/game/performance';
import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { carrierStaging } from '@/lib/game/screen/carrier-staging';
import { toolGripTarget } from '@/lib/game/screen/tool-staging';
import { drillStaging } from '@/lib/game/screen/staging';
import { createDrillProps } from './drill-props';
import { createSpringFeedback } from './spring-feedback';
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
import { placeActionCues, type ActionCueRefs } from '../world/action-cues';
import { placeSpeechBubble } from '../world/speech-position';
import type { SpeechBubbleRef } from '../world/speech-bubble';
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
  cueRefs?: ActionCueRefs;
  speechRef?: SpeechBubbleRef;
  localActor?: number;
};
const poses: Record<WorkerAction, Pose> = {
  idle: 'idle',
  guide: 'talk',
  walk: 'walk',
  hold: 'work',
  feed: 'work',
  pull: 'pull',
  throw: 'throw',
  catch: 'catch',
  drill: 'drill',
  climb: 'walk',
  handoff: 'work',
  fall: 'fall',
  lift: 'carry',
};

export default function Scene({
  stateRef,
  preview = !stateRef,
  cameraMode = 'auto',
  cueRefs,
  speechRef,
  localActor,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    options = useRef({
      stateRef,
      preview,
      cameraMode,
      cueRefs,
      speechRef,
      localActor,
    });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    options.current = {
      stateRef,
      preview,
      cameraMode,
      cueRefs,
      speechRef,
      localActor,
    };
  }, [stateRef, preview, cameraMode, cueRefs, speechRef, localActor]);
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.setClearColor('#181e25');
    element.appendChild(renderer.domElement);
    const countRenderedFrame = renderedFrameCounter();
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
    const graphics = createGraphicsController(renderer, key, world);
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
    const spiritLevel = createSpiritLevel(kit);
    const levelTarget = new THREE.Vector3();
    const crew = [people[1], people[0], people[2]];
    const rigs = crew.map((p) => createRig(kit, p));
    const nameplates = rigs.map((rig, i) => {
      const label = makeLabel(
        kit,
        crew[i].name,
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
    const drillingProps = createDrillProps(kit);
    const screwdriver = new THREE.Group();
    world.add(screwdriver);
    kit.cylinder(0.027, 0.021, 0.19, '#be803d', 0, 0, 0, screwdriver);
    kit.cylinder(0.005, 0.005, 0.24, '#b3b9b8', 0, 0.2, 0, screwdriver);
    const tip = kit.torus(0.025, 0.005, '#bdc2be', 0, 0.332, 0, screwdriver);
    tip.scale.x = 0.6;
    const toolHalo = kit.torus(0.16, 0.008, '#dfbd78', 0, 0.028, 0);
    toolHalo.rotation.x = -Math.PI / 2;
    const springFeedback = createSpringFeedback(kit);
    const sparkParts = Array.from({ length: 12 }, () =>
      kit.sphere(0.018, 0.018, 0.018, '#d0c4a2'),
    );
    const targetPosition = new THREE.Vector3(),
      lookAt = new THREE.Vector3(0, 1, -0.2),
      wantedLook = new THREE.Vector3();
    const hand = new THREE.Vector3(),
      temp = new THREE.Vector3(),
      grip = new THREE.Vector3(),
      workTarget = new THREE.Vector3();
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
      if (!graphics.shouldRender(now)) {
        raf = requestAnimationFrame(render);
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const opt = options.current,
        s = opt.stateRef?.current ?? previewState;
      if (!s.paused) time += dt;
      const isPreview = opt.preview;
      if (isPreview) previewState.elapsed = time;
      screen.update(s, sceneInitialized ? (s.paused ? 0 : dt) : 1, isPreview);
      sceneInitialized = true;
      springFeedback.update(s);
      const floor =
        ['frame', 'rods', 'tension'].includes(s.phase) && !isPreview;
      const drillPhase = s.phase === 'drill' && !isPreview;
      const levelPhase = s.phase === 'level' && !isPreview;
      const checking = levelCheck(s);
      const stage = levelPhase ? levelCheckStage(s) : drillStaging(s);
      screen.levelWorld(levelTarget);
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
        } else if (levelPhase) {
          const staged = stage.workers[i];
          ({ x, y, z, rotation } = staged);
          pose =
            i === 1
              ? checking.mode === 'celebrate'
                ? 'talk'
                : poses[worker.animation]
              : 'idle';
          if (i === 1 && checking.mode === 'celebrate')
            rotation = Math.PI * Math.max(0, 1 - checking.progress * 1.5);
        } else if (!floor && !drillPhase) {
          // Both carriers stand on the floor and lift with their arms. Ring height never raises a body.
          if (i < 2) {
            screen.gripWorld(i, grip);
            const carrier = carrierStaging(grip);
            x = carrier.x;
            z = carrier.z;
          } else {
            x = 0;
            z = -1.8;
          }
          rotation = Math.PI;
          pose =
            s.phase === 'result'
              ? 'celebrate'
              : i < 2
                ? 'carry'
                : poses[worker.animation];
        } else if (drillPhase) {
          const staged = stage.workers[i];
          x = staged.x;
          y = staged.y;
          z = staged.z;
          rotation = staged.rotation;
          if (i === 1)
            pose =
              s.drillMode === 'fallen'
                ? 'fall'
                : s.drillMode === 'drill'
                  ? s.drillRunning
                    ? 'drill'
                    : 'idle'
                  : s.drillMode === 'position'
                    ? poses[worker.animation]
                    : 'idle';
          else pose = poses[worker.animation];
          rig.root.rotation.z = staged.lean;
        }
        if (opt.cameraMode === 'faces') rotation = 0;
        // Staged paths already interpolate safely; smoothing world positions cuts through the cloth.
        rig.root.position.set(x, y, z);
        if (!drillPhase && !levelPhase) {
          rig.root.position.y = 0;
          rig.root.rotation.z = 0;
        }
        const difference =
          THREE.MathUtils.euclideanModulo(
            rotation - rig.root.rotation.y + Math.PI,
            Math.PI * 2,
          ) - Math.PI;
        if (drillPhase || (!floor && !isPreview))
          rig.root.rotation.y = rotation;
        else rig.root.rotation.y += difference * (1 - Math.exp(-dt * 10));
        // `time` stays frozen on pause. Reapply the base pose before hit overlays
        // so snapshot updates cannot compound a head rotation or hand offset.
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
          !levelPhase &&
          !isPreview &&
          i < 2 &&
          s.phase !== 'result' &&
          opt.cameraMode !== 'faces'
        ) {
          screen.gripWorld(i, grip);
          rig.setCrouch(carrierStaging(grip).crouch);
          rig.reach('left', grip.clone().add(new THREE.Vector3(0.13, 0, 0)));
          rig.reach('right', grip.clone().add(new THREE.Vector3(-0.13, 0, 0)));
        } else if (drillPhase && opt.cameraMode !== 'faces') {
          rig.setCrouch(stage.workers[i].crouch);
          if (i === 0) {
            const assistant = s.drillAssistant;
            const picking =
              assistant.activity === 'pickup' && assistant.pickupTool;
            const pickedTool = picking ? s.drillTools[picking] : null;
            const crouch = pickedTool
              ? pickedTool.location === 'ground'
                ? 0.72
                : 0.27
              : 0;
            if (pickedTool) rig.setCrouch(crouch);
            for (const kind of ['drill', 'vacuum'] as const) {
              const side = kind === 'drill' ? 'left' : 'right';
              if (s.drillTools[kind].location === 'assistant') {
                temp.set(
                  kind === 'drill' ? -0.2 : 0.2,
                  1.04 - crouch * 0.65,
                  0.31,
                );
                rig.root.localToWorld(temp);
                rig.reach(side, temp);
              }
            }
            if (pickedTool && picking) {
              const side = picking === 'drill' ? 'left' : 'right';
              (side === 'left' ? rig.leftHand : rig.rightHand).getWorldPosition(
                hand,
              );
              temp.copy(pickedTool.position);
              hand.lerp(
                temp,
                THREE.MathUtils.smoothstep(
                  assistant.pickupProgress / 0.65,
                  0,
                  1,
                ),
              );
              rig.reach(side, hand);
            }
          }
          if (s.drillMode === 'handoff' && s.handoffProgress > 0) {
            temp.copy(stage.handoffTarget);
            if (i === 0) {
              rig.reach(s.handoffTool === 'drill' ? 'left' : 'right', temp);
              if (
                s.braceHeld &&
                s.drillTools[s.handoffTool === 'drill' ? 'vacuum' : 'drill']
                  .location !== 'assistant'
              )
                rig.reach(
                  s.handoffTool === 'drill' ? 'right' : 'left',
                  new THREE.Vector3(stage.stools[0].x - 0.27, 1.05, -2.38),
                );
            } else if (i === 1)
              rig.reach(s.handoffTool === 'drill' ? 'right' : 'left', temp);
          } else if (i === 1 && s.drillMode === 'drill') {
            temp.copy(stage.wallTarget);
            temp.z += 0.005;
            rig.rightArm.getWorldPosition(hand);
            rig.reach(
              'right',
              new THREE.Vector3().copy(toolGripTarget('drill', temp, hand)),
            );
            temp.y -= 0.05;
            rig.leftArm.getWorldPosition(hand);
            rig.reach(
              'left',
              new THREE.Vector3().copy(toolGripTarget('vacuum', temp, hand)),
            );
          } else if (
            i === 1 &&
            ['climb', 'descend'].includes(s.drillMode) &&
            s.climb >= 0.16 &&
            s.climb <= 0.7
          ) {
            const stool = stage.stools[s.chairs - 1];
            rig.reach(
              'right',
              new THREE.Vector3(
                stool.x + 0.3,
                stool.y + (1.05 + 0.21 * Math.cos(0.1)) * stool.scaleY,
                stool.z + 0.25 + 0.21 * Math.sin(0.1),
              ),
            );
          } else if (i === 0 && s.braceHeld) {
            rig.reach(
              'left',
              new THREE.Vector3(stage.stools[0].x - 0.23, 1.12, -2.39),
            );
            rig.reach(
              'right',
              new THREE.Vector3(stage.stools[0].x - 0.27, 0.99, -2.43),
            );
          }
        }
        if (levelPhase && opt.cameraMode !== 'faces') {
          rig.setCrouch(stage.workers[i].crouch);
          if (i === 1) {
            if (checking.mode === 'position')
              rig.reach(
                'left',
                new THREE.Vector3(
                  checking.chairX + 0.22,
                  1.06,
                  checking.chairZ + 0.2,
                ),
              );
            else if (
              checking.mode === 'climb' &&
              checking.progress > 0.16 &&
              checking.progress < 0.7
            )
              rig.reach(
                'left',
                new THREE.Vector3(
                  checking.chairX + 0.26,
                  1.52,
                  checking.chairZ + 0.15,
                ),
              );
            placeLevelHands(s, rig, levelTarget);
          }
        }
        springFeedback.react(rig, i);
        rig.speak(
          s.messageSpeaker === i && s.messageUntil > s.elapsed
            ? (Math.sin(time * 22) * 0.5 + 0.5) * 0.65
            : 0,
        );
        nameplates[i].visible =
          !opt.cueRefs && !isPreview && opt.cameraMode !== 'faces';
      });
      apartment.stools.forEach((stool, i) => {
        if (drillPhase || levelPhase) {
          const staged = stage.stools[i];
          stool.visible = staged.visible;
          stool.position.copy(staged);
          stool.rotation.set(0, staged.rotation, staged.lean);
          stool.scale.y = staged.scaleY;
        } else if (s.phase === 'lift' || s.phase === 'result') {
          const staged = levelCheckStage(s).stools[i];
          stool.visible = true;
          stool.position.copy(staged);
          stool.rotation.set(0, 0, 0);
          stool.scale.y = staged.scaleY;
        } else {
          const parked = PHYSICAL_LAYOUT.parkedStools[i];
          stool.visible = true;
          stool.scale.y = 1;
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
        marks[i].visible =
          !isPreview &&
          (s.phase === 'drill' || (s.phase === 'lift' && !s.latched[i]));
        marks[i].position.set(
          hookX(i),
          hookHeight(s.holes[i] ?? s.aim) + 0.22,
          -3.04,
        );
      });
      drillingProps.update(s, rigs, time);
      spiritLevel.update(
        s,
        rigs[1],
        levelTarget,
        Math.atan((Math.tan(s.angle) * 8.8 * 0.13) / 4.32),
      );
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
        ['snap', 'spring', 'latch', 'miss'].includes(e.kind),
      );
      sparkParts.forEach((part, i) => {
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
        const index = isPreview ? 1 : screenFaceActor(s, opt.localActor);
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
      } else if (drillPhase || levelPhase) {
        const xs = [
          s.chairX * FLOOR_SCALE,
          ...rigs.slice(0, count).map((rig) => rig.root.position.x),
          ...drillingProps.bounds().map((point) => point.x),
        ];
        const center = (Math.min(...xs) + Math.max(...xs)) * 0.5;
        targetPosition.set(center + 2.5, 3.75, 4.1);
        wantedLook.set(center, 1.5, -2.55);
      } else {
        targetPosition.set(3.4, 3.35, 6.6);
        wantedLook.set(0, 1.5, -2.4);
      }
      // AUTO stays close, then expands only enough to retain every participant,
      // the whole working frame, and a pending screwdriver arc inside the frustum.
      if ((floor || drillPhase || levelPhase) && opt.cameraMode === 'auto') {
        const forward = targetPosition.clone().sub(wantedLook).normalize();
        const right = new THREE.Vector3()
          .crossVectors(new THREE.Vector3(0, 1, 0), forward)
          .normalize();
        const up = new THREE.Vector3().crossVectors(forward, right).normalize();
        const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)),
          tanX = tanY * camera.aspect;
        const bounds = floor
          ? [
              new THREE.Vector3(-2.55, 0.1, FLOOR_Z - 1.5),
              new THREE.Vector3(2.55, 0.1, FLOOR_Z - 1.5),
              new THREE.Vector3(-2.55, 0.1, FLOOR_Z + 1.5),
              new THREE.Vector3(2.55, 0.1, FLOOR_Z + 1.5),
            ]
          : drillingProps.bounds().map((point) => point.clone());
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
        !((floor || drillPhase || levelPhase) && opt.cameraMode === 'auto')
      )
        targetPosition
          .sub(wantedLook)
          .multiplyScalar(1.3 / Math.max(0.75, camera.aspect))
          .add(wantedLook);
      camera.position.lerp(targetPosition, 1 - Math.exp(-dt * 3));
      lookAt.lerp(wantedLook, 1 - Math.exp(-dt * 3));
      camera.lookAt(lookAt);
      const speechRect = placeSpeechBubble(
        opt.speechRef,
        s.messageSpeaker === null
          ? null
          : (rigs[s.messageSpeaker]?.head ?? null),
        camera,
        renderer.domElement,
        !s.paused && !isPreview && s.messageUntil > s.elapsed,
        rigs.filter((rig) => rig.root.visible).map((rig) => rig.head),
      );
      placeActionCues(
        opt.cueRefs,
        rigs.map((rig) => rig.head),
        camera,
        renderer.domElement,
        !s.paused && !isPreview,
        speechRect ? [speechRect] : [],
      );
      renderer.render(world, camera);
      countRenderedFrame(performance.now());
      raf = requestAnimationFrame(render);
    }
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      graphics.dispose();
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
      aria-label="Кухня-гостиная. Бригада собирает экран."
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

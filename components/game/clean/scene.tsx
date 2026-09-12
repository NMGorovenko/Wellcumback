'use client';
import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { CleanState } from '@/lib/game/clean/engine';
import { barracksOverview } from '@/lib/game/clean/camera';
import { bounds } from '@/lib/game/clean/layout';
import { cleanSupportTask } from '@/lib/game/clean/support';
import { planRoute, stations } from '@/lib/game/clean/engine';
import { RenderKit } from '../world/render-kit';
import { placeActionCues, type ActionCueRefs } from '../world/action-cues';
import { createBarracks } from './environment-v3';
import {
  actorPose,
  createCleaner,
  createNpc,
  createSoldier,
  createSupporter,
} from './actors-v3';
import { createTraceField, floorWorld } from './props-v3';

export type CleanCameraMode = 'wide' | 'faces';
const TAU = Math.PI * 2;
const angleToward = (current: number, target: number, amount: number) =>
  current +
  Math.atan2(Math.sin(target - current), Math.cos(target - current)) * amount;
const isCleanup = (phase: CleanState['phase']) =>
  phase === 'clean' || phase === 'result';

/** One continuous 3D barracks, one simulation: story actors hand over to the cleanup crew. */
export default function CleanScene({
  game,
  cameraMode = 'wide',
  cueRefs,
}: {
  game: RefObject<CleanState>;
  cameraMode?: CleanCameraMode;
  cueRefs?: ActionCueRefs;
}) {
  const host = useRef<HTMLDivElement>(null),
    mode = useRef(cameraMode);
  const cues = useRef(cueRefs);
  useEffect(() => {
    mode.current = cameraMode;
    cues.current = cueRefs;
  }, [cameraMode, cueRefs]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#a5b1a0');
    // An indoor overview must remain crisp even across the enlarged floorplan.
    const kit = new RenderKit(scene);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      const fallback = element.querySelector<HTMLElement>('.webgl-fallback');
      if (fallback) fallback.hidden = false;
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute(
      'aria-label',
      'Объёмная казарма: кровати сверху, пост дневального справа, туалет слева внизу, затем душ, ведро и прачечная справа.',
    );
    element.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(43, 1, 0.08, 65);
    camera.position.set(0, 11.9, 13.5);
    const look = new THREE.Vector3(0, 0.6, 0),
      desiredCamera = new THREE.Vector3(),
      desiredLook = new THREE.Vector3();
    const key = new THREE.DirectionalLight('#fff0c8', 2.65);
    key.position.set(-4, 11, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    key.shadow.camera.left = -(bounds.maxX - bounds.minX) / 140 - 2;
    key.shadow.camera.right = (bounds.maxX - bounds.minX) / 140 + 2;
    key.shadow.camera.top = (bounds.maxY - bounds.minY) / 140 + 3;
    key.shadow.camera.bottom = -(bounds.maxY - bounds.minY) / 140 - 3;
    key.shadow.camera.far = 50;
    key.shadow.normalBias = 0.035;
    key.shadow.bias = -0.00008;
    scene.add(key, new THREE.HemisphereLight('#d4e6dc', '#6a7358', 2.0));
    const fill = new THREE.DirectionalLight('#d6e7df', 0.9);
    fill.position.set(4, 6, -5);
    scene.add(fill);
    const room = createBarracks(kit),
      traces = createTraceField(kit);
    const soldier = createSoldier(kit),
      npcs = [0, 1, 2].map((i) => createNpc(kit, i));
    const crew = [0, 1, 2].map((i) => createCleaner(kit, i));
    const supporters = [1, 2].map((i) => createSupporter(kit, i));
    supporters.forEach((actor, i) => {
      actor.previous.copy(
        floorWorld(game.current.x[i + 1], game.current.y[i + 1]),
      );
      actor.rig.root.position.copy(actor.previous);
    });
    const routeMaterial = new THREE.MeshStandardMaterial({
      color: '#d6c576',
      emissive: '#766a35',
      emissiveIntensity: 0.15,
      roughness: 0.7,
    });
    const routeGeometry = new THREE.ConeGeometry(0.07, 0.12, 3);
    kit.geometries.add(routeGeometry);
    kit.materials.add(routeMaterial);
    const route = new THREE.InstancedMesh(routeGeometry, routeMaterial, 24);
    route.castShadow = false;
    route.frustumCulled = false;
    scene.add(route);
    const routeDummy = new THREE.Object3D();
    routeDummy.rotation.x = Math.PI / 2;
    const target = new THREE.Vector3(),
      previousHero = floorWorld(game.current.x[0], game.current.y[0]);
    soldier.rig.root.position.copy(previousHero);
    const hand = new THREE.Vector3(),
      point = new THREE.Vector3(),
      offset = new THREE.Vector3(),
      surface = new THREE.Vector3();
    const washerHome = room.washer.root.position.clone(),
      washerHalf = new THREE.Vector3(0.57, 0.55, 0.43);
    let animation = 0,
      last = performance.now(),
      routeClock = 1,
      previousPhase = game.current.phase,
      previousElapsed = -1,
      cameraInitialized = false,
      drawTime = 0;
    let routePath: { x: number; y: number }[] = [],
      lastStation = -1;
    npcs.forEach((npc, i) => {
      npc.previous.copy(
        floorWorld(game.current.npcs[i].x, game.current.npcs[i].y),
      );
      npc.rig.root.position.copy(npc.previous);
    });
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      const h = Math.max(360, height);
      renderer.setSize(width, h, false);
      camera.aspect = width / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const localHand = (
      side: 'left' | 'right',
      x: number,
      y: number,
      z: number,
    ) => {
      hand.set(x, y, z);
      soldier.rig.root.localToWorld(hand);
      soldier.rig.reach(side, hand);
    };

    const draw = (now: number) => {
      animation = requestAnimationFrame(draw);
      const s = game.current,
        dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const movingTime = s.paused ? 0 : dt,
        time = s.elapsed,
        cleaning = isCleanup(s.phase),
        heroAction = s.activity[0];
      drawTime += movingTime;
      routeClock += movingTime;
      if (s.elapsed < previousElapsed) {
        soldier.rig.root.position.copy(floorWorld(s.x[0], s.y[0], target));
        previousHero.copy(target);
        routeClock = 1;
        lastStation = -1;
      }
      const phaseChanged = previousPhase !== s.phase;
      if (phaseChanged && cleaning)
        crew.forEach((actor, i) => {
          actor.rig.root.position.copy(floorWorld(s.x[i], s.y[i], target));
          actor.previous.copy(target);
        });
      previousPhase = s.phase;
      previousElapsed = s.elapsed;
      const easing = 1 - Math.exp(-movingTime * 16),
        rotationEase = 1 - Math.exp(-movingTime * 12);
      soldier.rig.root.visible = !cleaning;
      soldier.bag.visible = !cleaning && s.pants === 'bagged';
      soldier.strain.visible =
        !cleaning && (s.phase === 'find' || s.phase === 'accident');
      soldier.relief.visible = !cleaning && heroAction === 'relief';
      room.toilet.privacy.visible =
        !cleaning &&
        (heroAction === 'relief' || s.support.progress.privacy === 1);
      if (!cleaning) {
        floorWorld(s.x[0], s.y[0], target);
        const dx = target.x - previousHero.x,
          dz = target.z - previousHero.z;
        let heading = soldier.rig.root.rotation.y;
        if (heroAction === 'walk' && dx * dx + dz * dz > 0.000001)
          heading = Math.atan2(dx, dz);
        if (heroAction === 'relief') {
          target.copy(room.toilet.root.position);
          target.z += 0.05;
          heading = Math.PI;
        }
        if (heroAction === 'shower') {
          target.copy(room.shower.root.position);
          heading = Math.PI + Math.sin(time * 0.7) * 0.18;
        }
        if (heroAction === 'load') {
          target.set(washerHome.x, 0, washerHome.z + 0.74);
          heading = Math.PI;
        }
        if (heroAction === 'strain') heading = Math.sin(time * 0.7) * 0.1;
        soldier.rig.root.position.lerp(
          target,
          easing || (s.phase === 'brief' ? 1 : 0),
        );
        soldier.rig.root.rotation.y = angleToward(
          soldier.rig.root.rotation.y,
          heading,
          rotationEase,
        );
        previousHero.copy(floorWorld(s.x[0], s.y[0], point));
        soldier.rig.update(time, actorPose(heroAction), s.urge);
        if (
          s.phase === 'find' ||
          heroAction === 'strain' ||
          s.containment.suppressed
        ) {
          soldier.rig.setCrouch(
            heroAction === 'strain'
              ? 0.1 + Math.sin(time * 9) * 0.025
              : 0.035 * s.urge,
          );
          localHand(
            'left',
            -0.07,
            1.01 - (heroAction === 'strain' ? 0.08 : 0),
            0.2,
          );
          localHand(
            'right',
            0.07,
            1.02 - (heroAction === 'strain' ? 0.08 : 0),
            0.21,
          );
          soldier.rig.head.rotation.x = 0.1 + s.urge * 0.09;
          soldier.rig.head.rotation.z = Math.sin(time * 6) * s.urge * 0.018;
        }
        if (heroAction === 'relief') {
          soldier.rig.setCrouch(0.44 + Math.sin(time * 3) * 0.009);
          localHand('left', -0.17, 0.62, 0.27);
          localHand('right', 0.17, 0.62, 0.27);
          soldier.rig.head.rotation.x = 0.15 * (1 - s.relief) - s.relief * 0.16;
        }
        if (heroAction === 'shower') {
          localHand('left', -0.1, 1.88, 0.02);
          localHand('right', 0.08, 1.78, 0.12 + Math.sin(time * 9) * 0.03);
          soldier.rig.head.rotation.y = Math.sin(time * 5) * 0.09;
        }
        if (s.pants === 'bagged') {
          if (heroAction === 'load') {
            soldier.rig.setCrouch(
              0.36 * THREE.MathUtils.smoothstep(s.laundryProgress, 0, 0.4),
            );
            hand.copy(room.washer.laundryTarget);
            hand.z += 0.12;
            soldier.rig.reach('left', hand);
            hand.x += 0.1;
            soldier.rig.reach('right', hand);
          }
          soldier.updateBag(
            heroAction === 'load',
            s.laundryProgress,
            room.washer.laundryTarget,
          );
          if (heroAction === 'load' && s.laundryProgress > 0.7)
            soldier.bag.visible = false;
        }
        if (heroAction === 'brace') {
          surface.copy(soldier.rig.root.position);
          surface.x = THREE.MathUtils.clamp(
            surface.x,
            washerHome.x - 0.46,
            washerHome.x + 0.46,
          );
          surface.z = THREE.MathUtils.clamp(
            surface.z,
            washerHome.z - 0.4,
            washerHome.z + 0.43,
          );
          surface.y = 0.88;
          soldier.rig.reach('left', surface);
          surface.x += 0.17;
          soldier.rig.reach('right', surface);
        }
      }
      soldier.leak.update(
        time,
        s.spillActive && heroAction !== 'relief' && !cleaning,
        s.soiled && !cleaning,
      );
      room.shower.update(time, heroAction === 'shower' && !cleaning);
      // The uniform remains opaque throughout both bathroom sequences.
      room.washer.hinge.rotation.y = THREE.MathUtils.lerp(
        room.washer.hinge.rotation.y,
        s.phase === 'laundry' ? -1.75 : 0,
        1 - Math.exp(-movingTime * 6),
      );
      room.washer.pants.root.visible =
        s.pantsLoaded || (heroAction === 'load' && s.laundryProgress > 0.7);
      room.washer.pants.setClean(s.spin * 0.65 + s.machineClean * 0.35);
      room.washer.drum.rotation.z =
        s.machine * 13 + Math.sin(s.machine * 0.8) * 0.4;
      const rumbling = s.pantsLoaded && s.spin < 1;
      room.washer.root.position.x =
        washerHome.x + (rumbling ? Math.sin(time * 43) * 0.025 * s.balance : 0);
      room.washer.root.rotation.z = rumbling
        ? Math.sin(time * 39) * 0.008 * s.balance
        : 0;
      room.washer.machineStains.visible = s.pantsLoaded && s.machineClean < 1;
      room.washer.machineStains.children.forEach((patch, i) => {
        patch.visible =
          s.machineClean < (i + 1) / room.washer.machineStains.children.length;
      });
      room.valve.rotation.z = s.valve * TAU * 2;
      room.bucketWater.position.y =
        0.398 +
        (s.activity.includes('rinse') ? Math.sin(time * 11) * 0.013 : 0);
      const gearOpen = s.responseStage === 'gear' || cleaning;
      room.gear.doors.forEach((door, i) => {
        door.rotation.y = THREE.MathUtils.lerp(
          door.rotation.y,
          gearOpen ? (i ? 1 : -1) * 1.48 : 0,
          1 - Math.exp(-movingTime * 3),
        );
      });
      traces.update(s.spots, time);

      npcs.forEach((npc, i) => {
        const state = s.npcs[i];
        npc.rig.root.visible = !cleaning || i === 0;
        floorWorld(state.x, state.y, target);
        const dx = target.x - npc.previous.x,
          dz = target.z - npc.previous.z;
        let heading = npc.rig.root.rotation.y;
        if (state.action === 'walk' && dx * dx + dz * dz > 0.000001)
          heading = Math.atan2(dx, dz);
        else if (state.action === 'react') {
          point
            .copy(
              i === 0 ? soldier.rig.root.position : room.washer.root.position,
            )
            .sub(npc.rig.root.position);
          heading = Math.atan2(point.x, point.z);
        } else if (state.action === 'gear') heading = Math.PI;
        else if (i === 0 && !cleaning) heading = 0;
        npc.previous.copy(target);
        npc.rig.root.position.lerp(target, easing);
        npc.rig.root.rotation.y = angleToward(
          npc.rig.root.rotation.y,
          heading,
          rotationEase,
        );
        npc.rig.update(time + i * 0.29, actorPose(state.action));
        npc.suited.visible = state.suited;
        const speaking =
          i === 0
            ? s.phase === 'accident' ||
              (s.phase === 'toilet' && s.phaseTime < 8)
            : state.action === 'react';
        npc.say(speaking && mode.current === 'faces' ? state.line : '');
        npc.shock.visible = state.action === 'react' && !state.line;
        npc.name.visible = false;
        if (state.action === 'react') {
          npc.rig.head.rotation.z = Math.sin(time * 5 + i) * 0.14;
          hand.set(-0.1, 1.57, 0.22);
          npc.rig.root.localToWorld(hand);
          npc.rig.reach('left', hand);
          hand.set(
            i === 0 ? 0.35 : 0.16,
            i === 0 ? 1.35 : 1.62,
            i === 0 ? 0.65 : 0.1,
          );
          npc.rig.root.localToWorld(hand);
          npc.rig.reach('right', hand);
        }
        if (state.action === 'gear') {
          hand.set(0.2, 1.72, 0.13);
          npc.rig.root.localToWorld(hand);
          npc.rig.reach('right', hand);
        }
      });
      supporters.forEach((actor, slot) => {
        const i = slot + 1;
        actor.rig.root.visible = !cleaning && i < s.players;
        if (!actor.rig.root.visible) return;
        const activity = s.activity[i];
        floorWorld(s.x[i], s.y[i], target);
        const dx = target.x - actor.previous.x,
          dz = target.z - actor.previous.z;
        let heading = actor.rig.root.rotation.y;
        if (dx * dx + dz * dz > 0.000001) heading = Math.atan2(dx, dz);
        const task = cleanSupportTask(s, i);
        if (
          activity !== 'walk' &&
          task &&
          ['gear', 'brace', 'valve'].includes(activity)
        ) {
          floorWorld(task.target.x, task.target.y, point).sub(target);
          heading = Math.atan2(point.x, point.z);
        }
        actor.previous.copy(target);
        actor.rig.root.position.lerp(target, easing);
        actor.rig.root.rotation.y = angleToward(
          actor.rig.root.rotation.y,
          heading,
          rotationEase,
        );
        actor.rig.update(time + i * 0.29, actorPose(activity));
        actor.kitBag.visible =
          s.support.kitOwner === i &&
          s.support.progress.kitPickup >= 1 &&
          s.support.progress.kit < 1 &&
          !s.washed;
        if (actor.kitBag.visible) {
          hand.set(0.28, 0.96, 0.24);
          actor.rig.root.localToWorld(hand);
          actor.rig.reach('right', hand);
        }
        if (activity === 'brace') {
          floorWorld(stations[3].x, stations[3].y, hand);
          hand.y = 0.92;
          hand.z = washerHome.z + 0.48;
          actor.rig.reach('left', hand);
          hand.x += 0.16;
          actor.rig.reach('right', hand);
        } else if (activity === 'valve')
          actor.rig.reach('right', room.valve.position);
      });
      crew.forEach((actor, i) => {
        const visible = cleaning && i < s.actorCount;
        actor.rig.root.visible = visible;
        actor.tool.visible = visible;
        actor.suds.visible = false;
        if (!visible) return;
        const activity = s.activity[i];
        floorWorld(s.x[i], s.y[i], target);
        const dx = target.x - actor.previous.x,
          dz = target.z - actor.previous.z;
        let heading = actor.rig.root.rotation.y;
        if (activity === 'walk' && dx * dx + dz * dz > 0.000001)
          heading = Math.atan2(dx, dz);
        actor.previous.copy(target);
        actor.rig.root.position.lerp(target, easing);
        actor.rig.update(
          time + i * 0.29,
          s.phase === 'result' ? 'celebrate' : actorPose(activity),
        );
        const machineWork =
          (activity === 'brace' || activity === 'mop') &&
          Math.hypot(s.x[i] - stations[3].x, s.y[i] - stations[3].y) < 70 &&
          (s.spin < 1 || s.machineClean < 1);
        if (machineWork) {
          surface.copy(actor.rig.root.position);
          surface.x = THREE.MathUtils.clamp(
            surface.x,
            washerHome.x - washerHalf.x,
            washerHome.x + washerHalf.x,
          );
          surface.z = THREE.MathUtils.clamp(
            surface.z,
            washerHome.z - washerHalf.z,
            washerHome.z + washerHalf.z,
          );
          surface.y = 0.9;
          point.copy(surface).sub(actor.rig.root.position);
          heading = Math.atan2(point.x, point.z);
          actor.rig.root.rotation.y = angleToward(
            actor.rig.root.rotation.y,
            heading,
            rotationEase,
          );
          if (activity === 'mop') actor.scrubMachine(time, surface);
          else {
            actor.tool.visible = false;
            actor.sponge.visible = false;
            actor.rig.reach('left', surface);
            surface.x += 0.16;
            actor.rig.reach('right', surface);
          }
        } else {
          let nearest: CleanState['spots'][number] | undefined,
            nearestDistance = 58;
          if (activity === 'mop')
            for (const trace of s.spots) {
              const d = Math.hypot(trace.x - s.x[i], trace.y - s.y[i]);
              if (trace.progress < 1 && d < nearestDistance) {
                nearest = trace;
                nearestDistance = d;
              }
            }
          if (nearest) floorWorld(nearest.x, nearest.y, point);
          else {
            point.set(0.25, 0.015, 0.6);
            actor.rig.root.localToWorld(point);
          }
          if (activity === 'rinse') {
            point.copy(room.bucketPosition);
            point.y = 0.38;
          }
          if (activity === 'valve') {
            point.copy(room.valve.position);
          }
          if (['mop', 'rinse', 'valve'].includes(activity)) {
            offset.copy(point).sub(actor.rig.root.position);
            heading = Math.atan2(offset.x, offset.z);
          }
          actor.rig.root.rotation.y = angleToward(
            actor.rig.root.rotation.y,
            heading,
            rotationEase,
          );
          if (activity === 'valve') {
            actor.tool.visible = false;
            actor.sponge.visible = false;
            actor.rig.reach('right', point);
          } else if (s.phase !== 'result')
            actor.updateTool(time + i * 0.37, activity, point, s.dirt[i]);
          else {
            actor.tool.visible = false;
            actor.sponge.visible = false;
          }
        }
      });

      const routeVisible =
        !cleaning &&
        ['duty', 'find', 'toilet', 'shower', 'laundry'].includes(s.phase) &&
        !['relief', 'shower', 'load'].includes(heroAction);
      if (routeVisible && (routeClock > 0.85 || lastStation !== s.station)) {
        routeClock = 0;
        lastStation = s.station;
        routePath = planRoute(
          { x: s.x[0], y: s.y[0] },
          stations[s.station],
          42,
        );
      }
      route.count = 0;
      if (routeVisible) {
        const stride = Math.max(2, Math.ceil(routePath.length / 24));
        for (
          let i = stride;
          i < routePath.length && route.count < 24;
          i += stride
        ) {
          const p = routePath[i],
            before = routePath[Math.max(0, i - 1)];
          floorWorld(p.x, p.y, routeDummy.position);
          routeDummy.position.y = 0.023;
          routeDummy.rotation.set(
            Math.PI / 2,
            0,
            -Math.atan2(p.x - before.x, p.y - before.y),
          );
          routeDummy.scale.setScalar(
            0.82 + Math.sin(drawTime * 4 - i * 0.22) * 0.12,
          );
          routeDummy.updateMatrix();
          route.setMatrixAt(route.count++, routeDummy.matrix);
        }
      }
      route.instanceMatrix.needsUpdate = true;
      room.markers.forEach((marker, i) => {
        marker.visible = cleaning
          ? i === 5 ||
            (i === 4 && s.valve < 1) ||
            (i === 3 && s.machineClean < 1)
          : routeVisible && i === s.station;
        marker.scale.setScalar(1 + Math.sin(time * 2.8) * 0.05);
      });
      // The washer interaction ring sits in front of its collider, where a person can actually stand.
      room.markers[3].position.z = washerHome.z + 0.78;
      // Map labels help in overview; in close-ups they would cover faces.
      room.roomSigns.forEach((sign) => {
        sign.visible = mode.current === 'wide';
      });
      room.labels.forEach((label, i) => {
        label.visible =
          mode.current === 'wide' ||
          (cleaning
            ? i === 5 ||
              (i === 4 && s.valve < 1) ||
              (i === 3 && s.machineClean < 1)
            : routeVisible && i === s.station);
        label.material.opacity = i === s.station || cleaning ? 1 : 0.75;
      });

      const narrow = camera.aspect < 1.15;
      const focused = cleaning ? crew[0].rig : soldier.rig;
      if (mode.current === 'faces') {
        focused.head.getWorldPosition(desiredLook);
        desiredLook.y -= 0.1;
        desiredCamera
          .copy(desiredLook)
          .add(offset.set(narrow ? 0.65 : 0.85, 0.5, narrow ? 3.6 : 2.8));
        if (s.activity[0] !== 'walk')
          focused.root.rotation.y = angleToward(
            focused.root.rotation.y,
            Math.atan2(
              desiredCamera.x - focused.root.position.x,
              desiredCamera.z - focused.root.position.z,
            ),
            rotationEase,
          );
      } else {
        const overview = barracksOverview(camera.aspect, camera.fov);
        desiredLook.copy(overview.look);
        desiredCamera.copy(overview.position);
        if (camera.far !== overview.far) {
          camera.far = overview.far;
          camera.updateProjectionMatrix();
        }
      }
      const cameraEase = cameraInitialized ? 1 - Math.exp(-dt * 4.2) : 1;
      cameraInitialized = true;
      camera.position.lerp(desiredCamera, cameraEase);
      look.lerp(desiredLook, cameraEase);
      camera.lookAt(look);
      placeActionCues(
        cues.current,
        cleaning
          ? crew.map((actor) => actor.rig.head)
          : [soldier.rig.head, ...supporters.map((actor) => actor.rig.head)],
        camera,
        element,
        !s.paused && mode.current !== 'faces',
      );
      renderer.render(scene, camera);
    };
    animation = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      kit.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [game]);
  return (
    <div
      ref={host}
      className="clean-scene world-canvas"
      style={{ width: '100%', height: '100%', minHeight: 420 }}
    >
      <span hidden className="webgl-fallback">
        Для объёмной сцены нужен WebGL. Попробуй открыть игру в другом браузере.
      </span>
    </div>
  );
}

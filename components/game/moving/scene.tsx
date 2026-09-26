'use client';
import { disposeGameRenderer } from '../world/dispose-renderer';
import { createGraphicsController } from '../world/graphics';
import { renderedFrameCounter } from '@/lib/game/performance';
import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import {
  movingCrew,
  movingCarryPoint,
  type MovingState,
} from '@/lib/game/moving/engine';
import { movingOverview, movingStations } from '@/lib/game/moving/layout';
import { movingIncident } from '@/lib/game/moving/incidents';
import { movingLoadFeel, movingGripSettle } from '@/lib/game/moving/load-feel';
import { getPersonPreset } from '@/lib/game/presets';
import { getControlSettings } from '@/lib/game/input/settings-store';
import { RenderKit } from '../world/render-kit';
import { createRig, type Pose } from '../world/rig';
import { placeSpeechBubble } from '../world/speech-position';
import type { SpeechBubbleRef } from '../world/speech-bubble';
import { placeActionCues, type ActionCueRefs } from '../world/action-cues';
import { createMovingStudio, movingWorld as world } from './studio';
import { createMovingBag, createMovingItem, createMovingPhone } from './props';

const smooth = (value: number) => THREE.MathUtils.smoothstep(value, 0, 1);

export default function MovingScene({
  game,
  cueRefs,
  onCameraAspect,
  speechRef,
}: {
  game: RefObject<MovingState>;
  cueRefs?: ActionCueRefs;
  onCameraAspect?: (aspect: number) => void;
  speechRef?: SpeechBubbleRef;
}) {
  const host = useRef<HTMLDivElement>(null),
    cues = useRef(cueRefs);
  useEffect(() => {
    cues.current = cueRefs;
  }, [cueRefs]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const countRenderedFrame = renderedFrameCounter();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#b4baad');
    const kit = new RenderKit(scene);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      const fallback = element.querySelector<HTMLElement>('.webgl-fallback');
      if (fallback) fallback.hidden = false;
      return;
    }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute(
      'aria-label',
      'Обжитая студия Ярика: балкон, кухня с техникой, шкаф, диван с пледом, стол и ноутбук. Ярик и Настя собирают вещи в раскрытые жёлтые сумки.',
    );
    element.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(43, 1, 0.08, 70);
    const sun = new THREE.DirectionalLight('#fff0d0', 2.7);
    sun.position.set(-3, 11, -5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    const graphics = createGraphicsController(renderer, sun, scene);
    Object.assign(sun.shadow.camera, {
      left: -8,
      right: 8,
      top: 11,
      bottom: -11,
      near: 0.5,
      far: 30,
    });
    sun.shadow.normalBias = 0.028;
    const faceFill = new THREE.DirectionalLight('#e7edf1', 1.55);
    faceFill.position.set(1, 5, 9);
    scene.add(
      sun,
      faceFill,
      new THREE.HemisphereLight('#dfe9e5', '#85745b', 1.65),
    );
    const studio = createMovingStudio(kit);
    const rigs = movingCrew.map((person) =>
      createRig(kit, getPersonPreset(person.preset)),
    );
    const phones = movingCrew.map(() => createMovingPhone(kit));
    const itemProps = new Map<number, ReturnType<typeof createMovingItem>>();
    const bags = new Map<number, ReturnType<typeof createMovingBag>>();
    const bagLiftTransitions = new Map<
      number,
      { carried: boolean; since: number }
    >();
    const activityTransitions = new Map<
      number,
      {
        activity: string;
        loadKey: string;
        from: THREE.Vector3;
        since: number;
        leavingSeat: boolean;
      }
    >();
    const resize = () => {
      const width = Math.max(1, element.clientWidth),
        height = Math.max(1, element.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      onCameraAspect?.(camera.aspect);
      const overview = movingOverview(camera.aspect);
      camera.position.copy(overview.position);
      camera.far = overview.far;
      camera.lookAt(overview.look.x, overview.look.y, overview.look.z);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    let animation = 0;
    const hand = new THREE.Vector3(),
      target = new THREE.Vector3(),
      handOffset = new THREE.Vector3();
    const draw = (now: number) => {
      animation = requestAnimationFrame(draw);
      if (!graphics.shouldRender(now)) return;
      const s = game.current,
        time = s.elapsed;
      const prompts =
        getControlSettings().showWorldPrompts &&
        s.phase === 'moving' &&
        !s.paused;
      const nearest = <T extends { id: number; x: number; y: number }>(
        objects: T[],
        actor: MovingState['actors'][number],
      ) =>
        objects.reduce<T | undefined>(
          (best, object) =>
            !best ||
            Math.hypot(actor.x - object.x, actor.y - object.y) <
              Math.hypot(actor.x - best.x, actor.y - best.y)
              ? object
              : best,
          undefined,
        );
      const nearItems = new Set(
        s.actors.slice(0, s.players).map(
          (a) =>
            nearest(
              s.items.filter((item) => item.status === 'floor'),
              a,
            )?.id,
        ),
      );
      const nearBags = new Set(
        s.actors.slice(0, s.players).map(
          (a) =>
            a.bagId ??
            a.packingBag ??
            nearest(
              s.bags.filter((bag) => bag.status !== 'delivered'),
              a,
            )?.id,
        ),
      );
      rigs.forEach((rig, i) => {
        const actor = s.actors[i];
        rig.root.visible = !!actor;
        phones[i].visible = false;
        if (!actor) return;
        const activity = actor.activity;
        const loadKey = `${actor.bagId ?? '-'}:${actor.heldItem ?? '-'}`;
        let transition = activityTransitions.get(i);
        if (
          !transition ||
          transition.activity !== activity ||
          transition.loadKey !== loadKey
        ) {
          transition = {
            activity,
            loadKey,
            leavingSeat:
              transition?.activity === 'rest' ||
              transition?.activity === 'laptop',
            from: transition
              ? rig.root.position.clone()
              : world(actor.x, actor.y),
            since: time,
          };
          activityTransitions.set(i, transition);
        }
        const seated = activity === 'rest' || activity === 'laptop';
        const settle = smooth((time - transition.since) / 0.38);

        rig.root.position.copy(world(actor.x, actor.y));
        rig.root.rotation.y = actor.facing;
        const walking = Math.hypot(actor.vx, actor.vy) > 0.001;
        let pose: Pose =
          s.phase === 'result'
            ? 'celebrate'
            : actor.working
              ? 'pack'
              : actor.bagId !== null || actor.heldItem !== null
                ? 'carry'
                : walking
                  ? 'walk'
                  : 'idle';
        if (walking && (actor.bagId !== null || actor.heldItem !== null))
          pose = 'walk';
        const speaking =
          !!s.dialogueId &&
          s.speaker === movingCrew[i].name &&
          s.messageUntil > time;
        if (pose === 'idle' && speaking) pose = 'talk';
        if (activity === 'packing') pose = 'pack';
        if (activity === 'rest') {
          pose = 'phone';
          const seat = movingStations.sofa.reduce((a, b) =>
            Math.hypot(actor.x - a.x, actor.y - a.y) <
            Math.hypot(actor.x - b.x, actor.y - b.y)
              ? a
              : b,
          );
          rig.root.position.lerpVectors(
            transition.from,
            new THREE.Vector3().copy(seat.seatWorld),
            settle,
          );
          rig.root.rotation.y = Math.PI / 2;
        }
        if (activity === 'laptop') {
          pose = actor.working ? 'type' : 'sit';
          rig.root.position.lerpVectors(
            transition.from,
            new THREE.Vector3().copy(movingStations.laptop.world),
            settle,
          );
          rig.root.rotation.y = movingStations.laptop.facing;
        }
        if (activity === 'toilet') pose = 'toilet';
        if (!seated && transition.leavingSeat && settle < 1) {
          rig.root.position.lerpVectors(
            transition.from,
            world(actor.x, actor.y),
            settle,
          );
        }
        const feel = movingLoadFeel(s, i);
        rig.update(time, pose, 0.3 + (1 - actor.stamina / 100) * 0.65);
        // The head and arms share this existing upper-body group. Lean it while
        // leaving the legs and collision origin on their physical floor points.
        const upperBody = rig.head.parent;
        if (upperBody)
          upperBody.rotation.set(
            activity === 'free' || activity === 'packing' ? feel.lean : 0,
            0,
            activity === 'free' ? feel.sway : 0,
          );
        if (feel.load > 0 && activity === 'free') rig.setCrouch(feel.crouch);
        if (seated && settle < 1) rig.setCrouch(0.34 * settle);
        if (!seated && transition.leavingSeat && settle < 1)
          rig.setCrouch(0.34 * (1 - settle));
        if (actor.stamina < 25 && activity === 'free' && !walking) {
          rig.setCrouch(0.1);
          rig.head.rotation.x += 0.16;
        }
        rig.speak(speaking ? (Math.sin(time * 22) * 0.5 + 0.5) * 0.65 : 0);
        // The closed alcove keeps the gag discreet; only the occupied indicator is visible.
        if (activity === 'toilet') rig.root.visible = false;
        if (activity === 'laptop') {
          studio.typingHands.forEach((point, j) => {
            target.copy(point);
            target.y +=
              (actor.working
                ? Math.max(0, Math.sin(time * 14 + j * Math.PI))
                : 0) * 0.025;
            rig.reach(j ? 'right' : 'left', target);
          });
        }
        if (activity === 'rest') {
          const phone = phones[i];
          phone.visible = true;
          target.copy(rig.root.position).add(new THREE.Vector3(0.47, 0.81, 0));
          rig.reach('left', target);
          handOffset
            .copy(target)
            .add(
              new THREE.Vector3(
                0.03,
                0.022 + Math.sin(time * 4) * 0.008,
                0.065,
              ),
            );
          rig.reach('right', handOffset);
          phone.position.copy(target);
          phone.rotation.set(0, Math.PI / 2, -0.22);
          rig.head.rotation.x = 0.28;
        }
      });
      for (const prop of bags.values()) prop.root.visible = false;
      s.bags.forEach((bag) => {
        let prop = bags.get(bag.id);
        if (!prop) {
          prop = createMovingBag(kit);
          bags.set(bag.id, prop);
        }
        prop.root.visible = bag.status !== 'delivered';
        if (!prop.root.visible) return;
        const fullness = 0.58 + 0.42 * Math.min(1, bag.weight / bag.capacity);
        prop.body.scale.set(
          1 + (bag.weight / bag.capacity) * 0.06,
          fullness,
          1 + (bag.weight / bag.capacity) * 0.035,
        );
        const carried = bag.status === 'carried';
        let liftTransition = bagLiftTransitions.get(bag.id);
        if (!liftTransition || liftTransition.carried !== carried) {
          liftTransition = { carried, since: time };
          bagLiftTransitions.set(bag.id, liftTransition);
        }
        const point = carried
          ? movingCarryPoint(bag.carriers.map((id) => s.actors[id]))
          : bag;
        const feel =
          carried && bag.carriers.length
            ? movingLoadFeel(s, bag.carriers[0])
            : null;
        const liftSettle = carried
          ? movingGripSettle(time - liftTransition.since)
          : 1;
        prop.root.position.copy(
          world(
            point.x,
            point.y,
            carried && feel
              ? 0.015 + (feel.carryHeight + feel.bob - 0.015) * liftSettle
              : 0.015,
          ),
        );
        prop.root.rotation.z = feel ? feel.sway * 1.3 * liftSettle : 0;
        prop.flaps.forEach((flap, j) => {
          flap.rotation.z =
            (j ? -1 : 1) *
            (bag.status === 'open' ? 1.32 * (1 - smooth(bag.zip)) : 0);
        });
        prop.zipper.position.set(0, 0.62, -0.33 + bag.zip * 0.66);
        prop.label.position.y = 0.94 * fullness;
        prop.label.visible =
          prompts &&
          nearBags.has(bag.id) &&
          s.actors
            .slice(0, s.players)
            .some((a) => Math.hypot(a.x - point.x, a.y - point.y) < 150);
        prop.text(
          `${bag.id + 1} · ${bag.weight}/${bag.capacity} кг${bag.status === 'open' && bag.zip > 0 ? ` · ${Math.round(bag.zip * 100)}%` : ''}`,
        );
        prop.root.updateWorldMatrix(true, true);
        bag.carriers.forEach((id, carrierIndex) => {
          const rig = rigs[id];
          const gripSettle = movingGripSettle(
            time - (activityTransitions.get(id)?.since ?? time),
          );
          for (const side of ['left', 'right'] as const) {
            target.set(
              bag.carriers.length > 1
                ? carrierIndex
                  ? 0.29
                  : -0.29
                : side === 'left'
                  ? -0.17
                  : 0.17,
              0.75,
              side === 'left' ? -0.31 : 0.31,
            );
            prop.body.localToWorld(target);
            if (gripSettle < 1) {
              (side === 'left' ? rig.leftHand : rig.rightHand).getWorldPosition(
                hand,
              );
              target.lerpVectors(hand, target, gripSettle);
            }
            rig.reach(side, target);
          }
        });
        for (const actor of s.actors)
          if (actor.zipping === bag.id && actor.working) {
            prop.zipper.getWorldPosition(target);
            rigs[actor.id].reach('right', target);
            prop.body.localToWorld(handOffset.set(-0.28, 0.61, 0));
            rigs[actor.id].reach('left', handOffset);
          }
      });
      s.items.forEach((item) => {
        let prop = itemProps.get(item.id);
        if (!prop) {
          prop = createMovingItem(kit, item);
          itemProps.set(item.id, prop);
        }
        prop.root.visible = true;
        prop.root.scale.setScalar(1);
        prop.root.rotation.set(0, 0, 0);
        prop.label.visible =
          prompts &&
          item.status === 'floor' &&
          nearItems.has(item.id) &&
          s.actors
            .slice(0, s.players)
            .some((a) => Math.hypot(a.x - item.x, a.y - item.y) < 105);
        if (item.status === 'packed') {
          const bag = s.bags.find((b) => b.id === item.bagId),
            bagProp = bag && bags.get(bag.id);
          prop.root.visible =
            !!bagProp && bag?.status === 'open' && bag.zip < 0.9;
          if (bagProp && bag) {
            const ordinal = s.items
              .filter(
                (other) => other.bagId === bag.id && other.status === 'packed',
              )
              .findIndex((other) => other.id === item.id);
            target.set(
              (ordinal % 2 ? 1 : -1) * 0.18,
              0.2 + Math.floor(ordinal / 4) * 0.15,
              (Math.floor(ordinal / 2) % 2 ? 1 : -1) * 0.16,
            );
            bagProp.body.localToWorld(target);
            prop.root.position.copy(target);
            prop.root.scale.setScalar(0.72);
          }
        } else if (item.carrier !== null && rigs[item.carrier]) {
          const actor = s.actors[item.carrier],
            rig = rigs[item.carrier];
          if (actor.activity === 'free') {
            target
              .copy(world(actor.x, actor.y, 1.03))
              .add(
                new THREE.Vector3(
                  Math.sin(actor.facing) * 0.34,
                  0,
                  Math.cos(actor.facing) * 0.34,
                ),
              );
            const settleGrip = movingGripSettle(
              time - (activityTransitions.get(item.carrier)?.since ?? time),
            );
            rig.rightHand.getWorldPosition(hand);
            target.lerpVectors(hand, target, settleGrip);
            rig.reach('right', target);
            handOffset
              .copy(target)
              .add(
                new THREE.Vector3(
                  Math.cos(actor.facing) * -0.13,
                  0,
                  Math.sin(actor.facing) * 0.13,
                ),
              );
            rig.leftHand.getWorldPosition(hand);
            handOffset.lerpVectors(hand, handOffset, settleGrip);
            rig.reach('left', handOffset);
          }
          rig.rightHand.getWorldPosition(hand);
          const bag =
            actor.packingBag == null
              ? undefined
              : s.bags.find((b) => b.id === actor.packingBag);
          const bagProp = bag && bags.get(bag.id);
          if (actor.activity === 'packing' && bagProp) {
            const progress = smooth(actor.activityProgress ?? 0);
            const forward = world(actor.x, actor.y, 0.98).add(
              new THREE.Vector3(
                Math.sin(actor.facing) * 0.31,
                0,
                Math.cos(actor.facing) * 0.31,
              ),
            );
            target.set(0, 0.42, 0);
            bagProp.body.localToWorld(target);
            hand.lerpVectors(forward, target, progress);
            hand.y +=
              Math.sin(progress * Math.PI) * (0.12 + item.weight * 0.012);
            rig.reach('right', hand);
            rig.reach(
              'left',
              handOffset.copy(hand).add(new THREE.Vector3(-0.11, 0, 0)),
            );
            prop.root.scale.setScalar(1 - progress * 0.2);
          }
          prop.root.position.copy(hand);
          prop.root.position.y -= 0.1;
          prop.root.rotation.y = actor.facing;
        } else prop.root.position.copy(world(item.x, item.y, 0.018));
      });
      studio.update(
        time,
        !!s.alert?.active,
        s.alert?.progress ?? 0,
        s.actors.some((a) => a.activity === 'toilet'),
        {
          title: movingIncident(s.alert.count).title,
          operation: s.alert.operation,
          awaitingRelease: s.alert.awaitingRelease,
        },
      );
      const speakerIndex = movingCrew.findIndex(
        (person) => person.name === s.speaker,
      );
      const speechRect = placeSpeechBubble(
        speechRef,
        speakerIndex >= 0
          ? rigs[speakerIndex].head
          : s.speaker === 'Ноутбук'
            ? world(movingStations.laptop.x, movingStations.laptop.y, 1.7)
            : null,
        camera,
        element,
        !!s.dialogueId &&
          s.messageUntil > time &&
          s.phase !== 'brief' &&
          !s.paused,
        rigs.filter((rig) => rig.root.visible).map((rig) => rig.head),
      );
      placeActionCues(
        cues.current,
        rigs.map((rig) => rig.head),
        camera,
        element,
        s.phase === 'moving' && !s.paused,
        speechRect ? [speechRect] : [],
      );
      renderer.render(scene, camera);
      countRenderedFrame(performance.now());
    };
    animation = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      graphics.dispose();
      kit.dispose();
      disposeGameRenderer(renderer);
      renderer.domElement.remove();
    };
  }, [game, onCameraAspect, speechRef]);
  return (
    <div
      ref={host}
      className="moving-scene world-canvas"
      style={{ width: '100%', height: '100%', minHeight: 460 }}
    >
      <span hidden className="webgl-fallback">
        Для этой главы нужен WebGL. Открой игру в браузере с поддержкой 3D.
      </span>
    </div>
  );
}

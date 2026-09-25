'use client';
import { createGraphicsController } from '../world/graphics';
import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { people } from '@/lib/game/presets';
import {
  stallX,
  walkingToiletStage,
  type Roma2State,
} from '@/lib/game/roma2/engine';
import {
  TOILET_EXIT,
  TOILET_RAGS,
  TOILET_SCREEN,
} from '@/lib/game/roma2/layout';
import { createToiletVisitor, createToiletFloor } from './visitor';
import { makeLabel } from '../world/labels';
import { renderedFrameCounter } from '@/lib/game/performance';
import { RenderKit } from '../world/render-kit';
import { createRig } from '../world/rig';
import { placeActionCues, type ActionCueRefs } from '../world/action-cues';
import { placeSpeechBubble } from '../world/speech-position';
import type { SpeechBubbleRef } from '../world/speech-bubble';

export function roma2Speaker(s: Roma2State) {
  return s.actors.reduce(
    (best, a, i) => (a.lineUntil > s.actors[best].lineUntil ? i : best),
    0,
  );
}
export default function Roma2Scene({
  game,
  cues,
  speechRef,
}: {
  game: RefObject<Roma2State>;
  cues?: ActionCueRefs;
  speechRef?: SpeechBubbleRef;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#374644');
    const kit = new RenderKit(scene);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      element.querySelector<HTMLElement>('.webgl-fallback')!.hidden = false;
      return;
    }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.setAttribute(
      'aria-label',
      'Казарменный санузел: тряпки у ведра в дальнем углу, три кабинки-укрытия, ширма и посетитель с видимым направлением взгляда.',
    );
    element.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    const key = new THREE.DirectionalLight('#fff3d4', 2.8);
    key.position.set(-4, 10, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const graphics = createGraphicsController(renderer, key, scene);
    Object.assign(key.shadow.camera, {
      left: -7,
      right: 7,
      top: 12,
      bottom: -12,
      near: 0.1,
      far: 35,
    });
    key.shadow.normalBias = 0.025;
    scene.add(key, new THREE.HemisphereLight('#e5f4ec', '#6b6655', 2));
    kit.box(10, 0.2, 14, '#666e65', 0, -0.13, 3.3);
    createToiletFloor(kit);
    kit.box(10, 3.5, 0.16, '#d6d4b9', 0, 1.75, -3.7);
    kit.box(0.16, 3.5, 14, '#bfc9b8', -5, 1.75, 3.3);
    for (let x = -4.75; x < 5; x += 0.5)
      for (let y = 0.25; y < 1.7; y += 0.5)
        kit.box(0.475, 0.475, 0.035, '#789885', x, y, -3.58, undefined, 0);
    // High frosted windows, surface pipes and yellowed fluorescent fittings.
    for (const x of [-3.1, 0, 3.1]) {
      kit.box(1.6, 0.72, 0.1, '#edf0db', x, 2.8, -3.53);
      kit.box(1.42, 0.54, 0.05, '#97bbb3', x, 2.8, -3.45);
      kit.box(0.06, 0.6, 0.06, '#e8e7d3', x, 2.8, -3.4);
      kit.box(1.15, 0.09, 0.16, '#f5f0bd', x, 3.24, -2.8);
    }
    kit.rod(
      new THREE.Vector3(-4.8, 2.1, -3.4),
      new THREE.Vector3(4.7, 2.1, -3.4),
      0.045,
      '#626b64',
    );
    const fixtures = [0, 1, 2].map((i) => {
      const x = stallX(i),
        root = new THREE.Group();
      root.position.x = x;
      scene.add(root);
      kit.box(0.65, 0.78, 0.28, '#d0d4be', 0, 1.02, -2.35, root, 0.05);
      kit.cylinder(0.16, 0.26, 0.37, '#dedec7', 0, 0.19, -1.5, root);
      kit.sphere(0.39, 0.2, 0.52, '#e4e2cc', 0, 0.43, -1.5, root);
      const bowl = kit.sphere(
        0.28,
        0.025,
        0.37,
        '#454d42',
        0,
        0.59,
        -1.48,
        root,
      );
      const seat = kit.torus(0.31, 0.045, '#313d36', 0, 0.6, -1.48, root);
      seat.rotation.x = Math.PI / 2;
      seat.scale.y = 1.33;
      const mess = new THREE.Group();
      root.add(mess);
      for (let n = 0; n < 11; n++) {
        const angle = n * 2.4;
        kit.sphere(
          0.04 + (n % 3) * 0.012,
          0.009,
          0.055,
          '#6b4525',
          Math.sin(angle) * 0.29,
          0.635,
          -1.48 + Math.cos(angle) * 0.37,
          mess,
          8,
        );
      }
      kit.box(0.1, 1.65, 3.7, '#779484', -1.55, 0.825, -1.55, root);
      const door = new THREE.Group();
      door.position.set(-1.49, 0, -0.35);
      root.add(door);
      kit.box(2.98, 1.36, 0.09, '#72917d', 1.49, 0.73, 0, door);
      kit.box(0.16, 0.07, 0.1, '#b9b59b', 2.55, 0.96, 0.09, door);
      kit.box(0.13, 0.25, 0.33, '#909384', -1.36, 0.95, -0.85, root);
      const emptyRoll = kit.cylinder(
        0.07,
        0.07,
        0.24,
        '#967858',
        -1.22,
        0.95,
        -0.85,
        root,
      );
      emptyRoll.rotation.z = Math.PI / 2;
      const rag = new THREE.Group();
      scene.add(rag);
      const clothGeo = new THREE.PlaneGeometry(0.68, 0.55, 8, 8);
      const positions = clothGeo.getAttribute('position');
      for (let n = 0; n < positions.count; n++)
        positions.setZ(
          n,
          Math.sin(positions.getX(n) * 22) * 0.022 +
            Math.cos(positions.getY(n) * 17) * 0.013,
        );
      clothGeo.computeVertexNormals();
      const clothMat = new THREE.MeshStandardMaterial({
        color: '#716b4e',
        side: THREE.DoubleSide,
        roughness: 1,
      });
      const cloth = kit.mesh(clothGeo, clothMat, rag);
      cloth.rotation.x = -Math.PI / 2;
      for (let n = 0; n < 5; n++)
        kit.sphere(
          0.035,
          0.008,
          0.055,
          '#423c2a',
          Math.sin(n * 4) * 0.23,
          0.024,
          Math.cos(n * 3) * 0.17,
          rag,
          8,
        );
      rag.position.set(
        TOILET_RAGS.x + (i - 1) * 0.2,
        0.06 + i * 0.025,
        TOILET_RAGS.z,
      );
      const rig = createRig(kit, people[0], scene, { anonymous: true });
      return { door, rag, clothMat, mess, bowl, rig };
    });
    kit.box(0.1, 1.65, 3.7, '#779484', 4.65, 0.825, -1.55);
    // Common wash aisle, radiators, mop bucket and the doorway remain navigable.
    for (let i = 0; i < 2; i++) {
      kit.box(
        0.55,
        0.12,
        0.9,
        '#e1e2ce',
        -4.7,
        0.85,
        4.0 + i * 1.4,
        undefined,
        0.08,
      );
      kit.sphere(0.2, 0.025, 0.3, '#596e65', -4.65, 0.91, 4.0 + i * 1.4);
      kit.box(0.04, 0.9, 0.7, '#aec2b6', -4.86, 1.65, 4.0 + i * 1.4);
      kit.cylinder(0.025, 0.025, 0.28, '#a9ada4', -4.7, 1.02, 4.0 + i * 1.4);
    }
    kit.cylinder(0.27, 0.2, 0.4, '#667d72', 4.1, 0.2, 8.6);
    kit.rod(
      new THREE.Vector3(4.1, 0.2, 8.6),
      new THREE.Vector3(4.35, 1.8, 8.55),
      0.027,
      '#a5966f',
    );
    for (let i = 0; i < 8; i++)
      kit.box(0.09, 0.6, 0.17, '#b7bdac', 3.25 + i * 0.14, 0.46, -3.45);
    const screen = TOILET_SCREEN;
    kit.box(screen.w, 1.65, screen.d, '#799480', screen.x, 0.825, screen.z);
    for (const end of [-1, 1])
      kit.box(
        0.5,
        0.12,
        0.25,
        '#586e60',
        screen.x,
        0.06,
        screen.z + end * (screen.d / 2 - 0.15),
      );
    const ragSign = makeLabel(kit, 'ПОЛОВЫЕ ТРЯПКИ', '#e5dba4', 2.5);
    ragSign.position.set(TOILET_RAGS.x, 0.85, TOILET_RAGS.z);
    scene.add(ragSign);
    const coverSign = makeLabel(kit, 'УКРЫТИЕ', '#c8dfbd', 1.4);
    coverSign.position.set(screen.x, 1.85, screen.z);
    scene.add(coverSign);
    kit.box(1.7, 0.02, 0.45, '#8ca478', TOILET_EXIT.x, 0.02, TOILET_EXIT.z);
    const arrow = kit.box(
      0.07,
      0.025,
      0.6,
      '#e9efce',
      0,
      0.05,
      TOILET_EXIT.z - 0.05,
    );
    for (const side of [-1, 1]) {
      const tip = kit.box(
        0.065,
        0.025,
        0.3,
        '#e9efce',
        side * 0.1,
        0.05,
        TOILET_EXIT.z + 0.15,
      );
      tip.rotation.y = (side * Math.PI) / 4;
    }
    const visitor = createToiletVisitor(kit);
    const hand = new THREE.Vector3();
    const brown = new THREE.Color('#583518');
    const countFrame = renderedFrameCounter();
    const resize = () => {
      camera.aspect = element.clientWidth / Math.max(1, element.clientHeight);
      const distance = Math.max(17.5, 15 / camera.aspect);
      camera.position.set(0.8, distance * 0.75, 3 + distance);
      camera.lookAt(0, 0.65, 3);
      camera.updateProjectionMatrix();
      renderer.setSize(element.clientWidth, element.clientHeight, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    let frame = 0,
      lastRender = -Infinity;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (!graphics.shouldRender(now)) return;
      const s = game.current;
      // Menus/hidden tabs do not need a full-speed 3D loop.
      if (
        document.hidden ||
        ((s.paused || s.phase !== 'playing') && now - lastRender < 200)
      )
        return;
      lastRender = now;
      fixtures.forEach((f, i) => {
        const opening = s.actors.some(
          (actor) =>
            walkingToiletStage(actor) &&
            Math.abs(actor.x - stallX(i)) < 1.3 &&
            actor.z > -0.8 &&
            actor.z < 1.2,
        );
        f.door.rotation.y = opening ? -1.4 : 0;
        const a = s.actors[i];
        f.rig.root.visible = !!a;
        if (!a) {
          f.mess.visible = false;
          f.rag.visible = false;
          return;
        }
        f.rag.visible = true;
        const seated =
          ['relief', 'paper', 'call', 'wipe'].includes(a.stage) ||
          a.recovery > 0;
        f.rig.root.position.set(a.x, 0, a.z);
        f.rig.root.rotation.y = seated ? 0 : a.heading;
        f.rig.update(
          s.elapsed,
          seated ? 'toilet' : a.moving ? 'walk' : 'idle',
          a.working ? 1 : 0.4,
        );
        if (a.stage === 'relief' && a.working) {
          f.rig.head.rotation.x += 0.18 + Math.sin(s.elapsed * 5) * 0.055;
          f.rig.leftArm.rotation.z += 0.12;
          f.rig.rightArm.rotation.z -= 0.12;
        }
        if (a.stage === 'rag' && a.working) {
          f.rig.setCrouch(0.4);
          f.rig.head.rotation.x = 0.35;
          f.rig.reach('right', hand.set(TOILET_RAGS.x, 0.18, TOILET_RAGS.z));
        }
        if (a.stage === 'wipe' || (a.stage === 'escape' && a.reaction > 0)) {
          f.rig.rightArm.rotation.x =
            0.5 + Math.sin(s.elapsed * 19) * (a.reaction ? 0.25 : 0.02);
          f.rig.rightArm.rotation.z = -0.2;
          f.rig.head.rotation.z = a.reaction
            ? Math.sin(s.elapsed * 12) * 0.12
            : 0;
        }
        f.rig.speak(
          a.lineUntil > s.elapsed && !s.paused
            ? Math.sin(s.elapsed * 13) * 0.5 + 0.5
            : 0,
        );
        f.mess.visible = a.mess > 0.25;
        f.mess.scale.setScalar(Math.max(0.2, a.mess));
        f.bowl.material = kit.material(a.mess > 0.65 ? '#5b3d20' : '#454d42');
        f.clothMat.color.set('#716b4e').lerp(brown, a.ragDirt);
        if (a.stage === 'wipe') {
          f.rag.position.set(
            stallX(i) + 0.28,
            0.58 + Math.sin(s.elapsed * 13) * (a.reaction ? 0.035 : 0),
            -1.52,
          );
          f.rag.rotation.z = 0.8;
        } else if (a.carryingRag) {
          f.rig.root.updateMatrixWorld(true);
          f.rig.rightHand.getWorldPosition(hand);
          f.rag.position.copy(hand);
          f.rag.rotation.set(0, a.heading, 0.9);
        } else if (['escape', 'done'].includes(a.stage)) {
          f.rag.position.set(stallX(i) + 0.7, 0.045, -0.8);
          f.rag.rotation.set(0, 0.4, 0);
        } else {
          f.rag.position.set(
            TOILET_RAGS.x + (i - 1) * 0.2,
            0.06 + i * 0.025,
            TOILET_RAGS.z,
          );
          f.rag.rotation.set(0, 0, 0);
        }
      });
      visitor.update(s);
      ragSign.visible = s.actors.some((a) => a.stage === 'rag');
      coverSign.visible =
        s.phase === 'playing' && s.actors.some(walkingToiletStage);
      arrow.visible = s.actors.some((a) => a.stage === 'escape');
      scene.updateMatrixWorld(true);
      const speaker = roma2Speaker(s),
        a = s.actors[speaker];
      const bubble = placeSpeechBubble(
        speechRef,
        fixtures[speaker].rig.head,
        camera,
        element,
        s.phase === 'playing' && !s.paused && a.lineUntil > s.elapsed,
        fixtures.slice(0, s.players).map((f) => f.rig.head),
      );
      placeActionCues(
        cues,
        fixtures.slice(0, s.players).map((f) => f.rig.head),
        camera,
        element,
        s.phase === 'playing' && !s.paused,
        bubble ? [bubble] : [],
      );
      renderer.render(scene, camera);
      countFrame(now);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      graphics.dispose();
      kit.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [game, cues, speechRef]);
  return (
    <div className="scene-host roma2-scene" ref={host}>
      <p className="webgl-fallback" hidden>
        Для сцены нужен WebGL. Включи аппаратное ускорение браузера.
      </p>
    </div>
  );
}

'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { presentedVehicle } from '../../../lib/game/city/vehicle-presentation';
import { RenderKit } from '../world/render-kit';
import { createCityEnvironment } from '../city/environment';
import { createMustang } from '../city/mustang';
import { createAmgGt } from './amg-gt';
import { createNordschleife } from './nordschleife';
import { createRaceEffects } from './effects';
import { raceCourse } from '../../../lib/game/race/course';
import { CAR_COLORS } from '../../../lib/game/race/vehicles';
import type { RaceState } from '../../../lib/game/race/types';
import { followCityHeading } from '../city/camera';
import { renderedFrameCounter } from '../../../lib/game/performance';
import {
  clearRaceCamera,
  raceCameraFraming,
} from '../../../lib/game/race/camera';

export default function RaceScene({
  game,
  localIds,
  configuration,
}: {
  game: RefObject<RaceState>;
  localIds: string[];
  configuration: string;
}) {
  const host = useRef<HTMLDivElement>(null),
    views = useRef(localIds);
  useEffect(() => {
    views.current = localIds;
  }, [localIds]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const course = raceCourse(game.current.trackId),
      scene = new THREE.Scene(),
      kit = new RenderKit(scene);
    scene.background = new THREE.Color(
      course.id === 'krasnoyarsk' ? '#8cabb3' : '#9aaeb5',
    );
    scene.fog = new THREE.Fog(scene.background, 180, 430);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      // oxlint-disable-next-line react/react-compiler
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute('aria-label', `Гонка · ${course.name}`);
    element.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight('#d9ecf4', '#647256', 2.7));
    const sun = new THREE.DirectionalLight('#ffedc9', 2.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    sun.shadow.camera.far = 170;
    sun.shadow.normalBias = 0.08;
    scene.add(sun, sun.target);
    let terrainHeight: ((x: number, z: number) => number) | undefined;
    if (course.id === 'krasnoyarsk') createCityEnvironment(kit);
    else terrainHeight = createNordschleife(kit, course).heightAt;
    const updateEffects = createRaceEffects(kit);
    const models = game.current.racers.map((r, i) => {
      const color = CAR_COLORS.find((c) => c.id === r.colorId)!.hex,
        driverId = ['nikita', 'yaroslav', 'roma'][i % 3];
      const carKit = new RenderKit(scene);
      return {
        id: r.id,
        kit: carKit,
        model:
          r.vehicleId === 'amg-gt'
            ? createAmgGt(carKit, color, driverId)
            : createMustang(carKit, { color, driverId }),
      };
    });
    const gates = course.gates.map((g, i) => {
      const group = new THREE.Group();
      group.position.set(g.x, g.y, g.z);
      group.rotation.y = Math.atan2(g.dx, g.dz);
      scene.add(group);
      const mat = new THREE.MeshStandardMaterial({
        color: '#adc8b3',
        emissive: '#588769',
        emissiveIntensity: 0.7,
        roughness: 0.5,
      });
      for (const side of [-1, 1]) {
        const p = kit.box(
          0.19,
          3.3,
          0.19,
          '#c3d5c5',
          side * g.halfWidth,
          1.65,
          0,
          group,
          0.04,
        );
        p.material = mat;
      }
      const beam = kit.box(
        g.halfWidth * 2 + 0.25,
        0.13,
        0.13,
        '#c3d5c5',
        0,
        3.3,
        0,
        group,
        0.025,
      );
      beam.material = mat;
      kit.materials.add(mat);
      for (let j = 0; j < 12; j++)
        kit.box(
          g.halfWidth / 6,
          0.025,
          0.55,
          j % 2 ? '#f3f1d7' : '#273c42',
          -g.halfWidth + ((j + 0.5) * g.halfWidth) / 6,
          0.05,
          0,
          group,
          0,
        );
      return { group, mat, index: i };
    });
    const cameras = [0, 1, 2].map(
      () => new THREE.PerspectiveCamera(57, 1, 0.15, 600),
    );
    const headings = Array.from(
      { length: 3 },
      (_, i) => game.current.racers[i]?.car.heading ?? 0,
    );
    const initialized = [false, false, false],
      look = Array.from({ length: 3 }, () => new THREE.Vector3()),
      previousFocus = Array.from({ length: 3 }, () => new THREE.Vector3());
    let width = 1,
      height = 1,
      last = performance.now(),
      raf = 0;
    const resize = () => {
      width = Math.max(1, element.clientWidth);
      height = Math.max(1, element.clientHeight);
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const countFrame = renderedFrameCounter();
    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const actual = game.current;
      const state: RaceState = {
        ...actual,
        racers: actual.racers.map((r) => {
          if (actual.phase !== 'racing') return r;
          return {
            ...r,
            ...presentedVehicle(r.car, r.elevation, r.pitch, actual.paused),
          };
        }),
      };
      // Animate wheels/heads exactly once. The viewport passes only read models.
      for (const item of models) {
        const r = state.racers.find((r) => r.id === item.id);
        if (!r) continue;
        let car = r.car,
          elevation = r.elevation;
        if (state.phase === 'lobby') {
          const i = state.racers.indexOf(r),
            p = course.sample(-6 - Math.floor(i / 2) * 6),
            side = i % 2 === 0 ? -1.8 : 1.8;
          car = {
            ...car,
            x: p.x - p.dz * side,
            z: p.z + p.dx * side,
            heading: Math.atan2(p.dx, -p.dz),
          };
          elevation = p.y;
        }
        item.model.root.rotation.order = 'YXZ';
        item.model.update(car, state.paused ? 0 : dt);
        item.model.root.position.y = elevation + 0.04;
        item.model.root.rotation.x = r.pitch;
      }
      updateEffects(state, dt);
      const ids = views.current.length ? views.current : [state.racers[0]?.id],
        count = Math.min(3, ids.length);
      renderer.setScissorTest(true);
      for (let i = 0; i < count; i++) {
        const r = state.racers.find((r) => r.id === ids[i]) ?? state.racers[0];
        if (!r) continue;
        const model = models.find((m) => m.id === r.id)!.model;
        for (const item of models)
          item.model.root.visible = state.phase !== 'lobby' || item.id === r.id;
        const x = Math.floor((i * width) / count),
          w = Math.floor(((i + 1) * width) / count) - x,
          aspect = w / height,
          camera = cameras[i];
        const preview = state.phase === 'lobby',
          speed = preview ? 0 : r.car.speed;
        const heading = preview ? -model.root.rotation.y : r.car.heading;
        if (
          initialized[i] &&
          previousFocus[i].distanceTo(model.root.position) > 45
        ) {
          initialized[i] = false;
        }
        if (!initialized[i]) headings[i] = heading;
        previousFocus[i].copy(model.root.position);
        headings[i] = followCityHeading(headings[i], heading, dt);
        const fx = Math.sin(headings[i]),
          fz = -Math.cos(headings[i]);
        const framing = raceCameraFraming(speed, aspect),
          lead = framing.lead,
          px = model.root.position.x,
          pz = model.root.position.z;
        const target = new THREE.Vector3(
          px + fx * lead,
          r.elevation + 0.8,
          pz + fz * lead,
        );
        if (preview)
          target.copy(model.root.position).add(new THREE.Vector3(0, 0.6, 0));
        if (!initialized[i]) {
          look[i].copy(target);
          initialized[i] = true;
        } else look[i].lerp(target, 1 - Math.exp(-dt * 8));
        const distance = preview
            ? 10 * Math.max(1, 0.9 / aspect)
            : framing.distance,
          heightOffset = preview ? 6 : framing.height;
        camera.position.set(
          look[i].x - fx * distance,
          look[i].y + heightOffset,
          look[i].z - fz * distance,
        );
        if (preview) {
          // A front-quarter view of this player's car, with space for its card.
          const radius = 8.2 * Math.max(1, 0.65 / aspect);
          const offset = new THREE.Vector3(0.64, 0.47, -0.77)
            .multiplyScalar(radius)
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), model.root.rotation.y);
          camera.position.copy(model.root.position).add(offset);
        }
        if (terrainHeight) {
          const clear = clearRaceCamera(
            camera.position,
            model.root.position,
            terrainHeight,
          );
          camera.position.set(clear.x, clear.y, clear.z);
        }
        camera.aspect = aspect;
        camera.fov = preview ? 48 : 57;
        camera.lookAt(look[i]);
        if (preview && count === 1 && width > 850)
          camera.setViewOffset(width, height, width * 0.22, 0, width, height);
        else if (preview && count > 1)
          camera.setViewOffset(w, height, 0, height * 0.035, w, height);
        else camera.clearViewOffset();
        camera.updateProjectionMatrix();
        sun.position.set(px - 35, r.elevation + 70, pz + 25);
        sun.target.position.set(px, r.elevation, pz);
        sun.target.updateMatrixWorld();
        gates.forEach((g) => {
          const active = g.index === r.nextGate;
          g.mat.color.set(active ? '#e8ff91' : '#86ad9e');
          g.mat.emissiveIntensity = active ? 1.1 : 0.18;
          g.group.visible = !preview;
        });
        renderer.setViewport(x, 0, w, height);
        renderer.setScissor(x, 0, w, height);
        renderer.render(scene, camera);
      }
      countFrame(now);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      models.forEach((m) => m.kit.dispose());
      kit.dispose();
      renderer.dispose();
      element.replaceChildren();
    };
  }, [game, configuration]);
  return (
    <div className="race-world" ref={host}>
      {failed && (
        <p className="webgl-error">Не удалось включить 3D. Перезапусти игру.</p>
      )}
    </div>
  );
}

'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { CityState } from '@/lib/game/city/engine';
import { CITY_BOUNDS } from '@/lib/game/city/layout';
import { RenderKit } from '../world/render-kit';
import { createCityEnvironment } from './environment';
import { createMustang } from './mustang';

const SKID_CAPACITY = 160,
  SMOKE_CAPACITY = 20;
/** Fixed isometric miniature. The complete driving map stays visible, so a
 * destination never moves off screen just because the driver starts drifting. */
export default function CityScene({
  game,
  targetStop = -1,
  closeView = false,
}: {
  game: RefObject<CityState>;
  targetStop?: number;
  closeView?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    selectedStop = useRef(targetStop);
  const following = useRef(closeView);
  useEffect(() => {
    following.current = closeView;
  }, [closeView]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    selectedStop.current = targetStop;
  }, [targetStop]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#8cabb3');
    const kit = new RenderKit(scene);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      // WebGL can be unavailable; report this external initialization failure.
      // oxlint-disable-next-line react/react-compiler
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute(
      'aria-label',
      'Красный Mustang с Никитой, Яриком и Ромой на вечерней карте Красноярска: Енисей, два моста и жилые кварталы.',
    );
    element.appendChild(renderer.domElement);
    const camera = new THREE.OrthographicCamera(-35, 35, 25, -25, 0.1, 180);
    const look = new THREE.Vector3(0, 0, -2),
      outward = new THREE.Vector3(0.39, 0.75, 0.55).normalize();
    camera.position.copy(look).addScaledVector(outward, 90);
    camera.lookAt(look);
    camera.updateMatrixWorld();
    const sun = new THREE.DirectionalLight('#ffe4b0', 3.0);
    sun.position.set(-22, 38, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    sun.shadow.camera.left = -42;
    sun.shadow.camera.right = 42;
    sun.shadow.camera.top = 37;
    sun.shadow.camera.bottom = -37;
    sun.shadow.camera.far = 120;
    sun.shadow.normalBias = 0.05;
    sun.shadow.bias = -0.00008;
    scene.add(sun, new THREE.HemisphereLight('#d4ecff', '#91a083', 2.1));
    const evening = new THREE.DirectionalLight('#a9c8ff', 1.25);
    evening.position.set(23, 16, -15);
    scene.add(evening);
    const city = createCityEnvironment(kit),
      car = createMustang(kit);
    // Two narrow tracks per drift sample; a fixed ring buffer cannot grow after
    // a long drive. They fade into the road instead of accumulating draw calls.
    const skidGeometry = new THREE.PlaneGeometry(0.095, 0.55),
      skidMaterial = new THREE.MeshBasicMaterial({
        color: '#213442',
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    kit.geometries.add(skidGeometry);
    kit.materials.add(skidMaterial);
    const skids = new THREE.InstancedMesh(
      skidGeometry,
      skidMaterial,
      SKID_CAPACITY,
    );
    skids.frustumCulled = false;
    scene.add(skids);
    const tracks = Array.from({ length: SKID_CAPACITY }, () => ({
      x: 0,
      z: 0,
      angle: 0,
      life: 0,
    }));
    const dummy = new THREE.Object3D(),
      fadeColor = new THREE.Color();
    const smokeCanvas = document.createElement('canvas');
    smokeCanvas.width = 64;
    smokeCanvas.height = 64;
    const context = smokeCanvas.getContext('2d')!;
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
    gradient.addColorStop(0, '#e1e4dbaa');
    gradient.addColorStop(0.42, '#e1e4db66');
    gradient.addColorStop(1, '#e1e4db00');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    const smokeTexture = new THREE.CanvasTexture(smokeCanvas);
    kit.textures.add(smokeTexture);
    const smoke = Array.from({ length: SMOKE_CAPACITY }, () => {
      const material = new THREE.SpriteMaterial({
        map: smokeTexture,
        color: '#e6e4d4',
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      kit.materials.add(material);
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      scene.add(sprite);
      return { sprite, age: 2, x: 0, z: 0 };
    });
    let skidCursor = 0,
      smokeCursor = 0,
      emitClock = 0,
      last = performance.now(),
      raf = 0,
      lastElapsed = game.current.elapsed;
    const projected = new THREE.Vector3();
    const currentLook = look.clone();
    const resize = () => {
      camera.position.copy(look).addScaledVector(outward, 90);
      camera.lookAt(look);
      camera.updateMatrixWorld();
      const width = Math.max(1, element.clientWidth),
        height = Math.max(1, element.clientHeight),
        aspect = width / height;
      // Fit the game boundary, tall buildings, and scenic northern hills.
      let extentX = 0,
        extentY = 0;
      for (const x of [CITY_BOUNDS.minX - 5, CITY_BOUNDS.maxX + 5])
        for (const z of [CITY_BOUNDS.minZ - 10, CITY_BOUNDS.maxZ + 2])
          for (const y of [0, 8]) {
            projected.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
            extentX = Math.max(extentX, Math.abs(projected.x));
            extentY = Math.max(extentY, Math.abs(projected.y));
          }
      const halfHeight = Math.max(extentY, extentX / aspect) * 1.045;
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    let lastCameraTime = performance.now();
    const render = (now: number) => {
      const s = game.current,
        dt = s.paused ? 0 : Math.min((now - last) / 1000, 0.05);
      last = now;
      if (s.elapsed < lastElapsed) {
        tracks.forEach((t) => (t.life = 0));
        smoke.forEach((p) => (p.age = 2));
        emitClock = 0;
      }
      lastElapsed = s.elapsed;
      const cameraDelta = Math.min((now - lastCameraTime) / 1000, 0.05);
      lastCameraTime = now;
      const desiredLook = following.current
        ? projected.set(s.x, 0.5, s.z)
        : look;
      currentLook.lerp(desiredLook, 1 - Math.exp(-cameraDelta * 4));
      camera.position.copy(currentLook).addScaledVector(outward, 90);
      camera.lookAt(currentLook);
      camera.zoom +=
        ((following.current ? 2.5 : 1) - camera.zoom) *
        (1 - Math.exp(-cameraDelta * 4));
      camera.updateProjectionMatrix();
      car.update(s, dt);
      city.update(s.elapsed, selectedStop.current, s.nearStop);
      emitClock += dt;
      if (s.drifting && emitClock > 0.075) {
        emitClock = 0;
        for (const side of [-1, 1]) {
          const x =
              s.x +
              side * 0.8 * Math.cos(s.heading) -
              1.3 * Math.sin(s.heading),
            z =
              s.z +
              side * 0.8 * Math.sin(s.heading) +
              1.3 * Math.cos(s.heading);
          Object.assign(tracks[skidCursor], {
            x,
            z,
            angle: -s.heading,
            life: 1,
          });
          skidCursor = (skidCursor + 1) % SKID_CAPACITY;
          const puff = smoke[smokeCursor];
          puff.age = 0;
          puff.x = x;
          puff.z = z;
          smokeCursor = (smokeCursor + 1) % SMOKE_CAPACITY;
        }
      }
      tracks.forEach((track, i) => {
        track.life = Math.max(0, track.life - dt / 8);
        dummy.position.set(track.x, 0.092, track.z);
        dummy.rotation.set(-Math.PI / 2, 0, track.angle);
        dummy.scale.setScalar(track.life > 0 ? 1 : 0);
        dummy.updateMatrix();
        skids.setMatrixAt(i, dummy.matrix);
        fadeColor.setRGB(
          1 + (1 - track.life) * 1.1,
          1 + (1 - track.life) * 0.8,
          1 + (1 - track.life) * 0.65,
        );
        skids.setColorAt(i, fadeColor);
      });
      skids.instanceMatrix.needsUpdate = true;
      if (skids.instanceColor) skids.instanceColor.needsUpdate = true;
      smoke.forEach((puff, i) => {
        puff.age += dt;
        const alive = puff.age < 1.55;
        puff.sprite.visible = alive;
        if (!alive) return;
        puff.sprite.position.set(
          puff.x + Math.sin(i * 4.7) * puff.age * 0.22,
          0.25 + puff.age * 0.48,
          puff.z + puff.age * 0.2,
        );
        puff.sprite.scale.setScalar(0.35 + puff.age * 0.7);
        puff.sprite.material.opacity = (1 - puff.age / 1.55) * 0.43;
      });
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      kit.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [game]);
  return (
    <div
      className="three-host city-three-host"
      ref={host}
      aria-label="Красноярск в миниатюре и красный Mustang друзей"
    >
      {failed && (
        <div className="webgl-error">
          Не удалось включить 3D. Проверь аппаратное ускорение браузера.
        </div>
      )}
    </div>
  );
}

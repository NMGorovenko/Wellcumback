'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { CityState } from '@/lib/game/city/engine';
import { RenderKit } from '../world/render-kit';
import { createCityEnvironment } from './environment';
import { createMustang } from './mustang';
import { cityDriveCamera, cityOverviewCamera } from './camera';

const SKID_CAPACITY = 160,
  SMOKE_CAPACITY = 20;
/** Close driving camera follows the car and its travel path. The full
 * isometric map remains available through the existing overview toggle. */
export default function CityScene({
  game,
  targetStop = -1,
  closeView = true,
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
    const overview = cityOverviewCamera(1),
      cameraDistance = overview.distance;
    const camera = new THREE.OrthographicCamera(
      -35,
      35,
      25,
      -25,
      0.1,
      overview.far,
    );
    const look = new THREE.Vector3(
        overview.look.x,
        overview.look.y,
        overview.look.z,
      ),
      outward = new THREE.Vector3(
        overview.outward.x,
        overview.outward.y,
        overview.outward.z,
      );
    camera.position.copy(look).addScaledVector(outward, cameraDistance);
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
    sun.shadow.camera.far = 360;
    sun.shadow.normalBias = 0.05;
    sun.shadow.bias = -0.00008;
    scene.add(sun.target);
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
    const currentLook = look.clone(),
      currentOutward = outward.clone();
    let aspect = 1,
      viewportHeight = 1,
      overviewHalfHeight = 25,
      currentHalfHeight = 0;
    const resize = () => {
      camera.position.copy(look).addScaledVector(outward, cameraDistance);
      camera.lookAt(look);
      camera.updateMatrixWorld();
      const width = Math.max(1, element.clientWidth),
        height = Math.max(1, element.clientHeight);
      aspect = width / height;
      viewportHeight = height;
      overviewHalfHeight = cityOverviewCamera(aspect).halfHeight;
      if (!currentHalfHeight) {
        const driveView = cityDriveCamera(game.current, aspect);
        currentHalfHeight = following.current
          ? driveView.halfHeight
          : overviewHalfHeight;
        if (following.current) {
          currentLook.set(driveView.look.x, driveView.look.y, driveView.look.z);
          currentOutward.set(
            driveView.outward.x,
            driveView.outward.y,
            driveView.outward.z,
          );
        }
      }
      camera.left = -currentHalfHeight * aspect;
      camera.right = currentHalfHeight * aspect;
      camera.top = currentHalfHeight;
      camera.bottom = -currentHalfHeight;
      camera.position
        .copy(currentLook)
        .addScaledVector(currentOutward, cameraDistance);
      camera.lookAt(currentLook);
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
      const driveView = cityDriveCamera(s, aspect);
      const smoothCamera = 1 - Math.exp(-cameraDelta * 5);
      const desiredLook = following.current
        ? projected.set(driveView.look.x, driveView.look.y, driveView.look.z)
        : look;
      currentLook.lerp(desiredLook, smoothCamera);
      const desiredOutward = following.current
        ? projected.set(
            driveView.outward.x,
            driveView.outward.y,
            driveView.outward.z,
          )
        : outward;
      currentOutward.lerp(desiredOutward, smoothCamera).normalize();
      const halfHeight = following.current
        ? driveView.halfHeight
        : overviewHalfHeight;
      currentHalfHeight += (halfHeight - currentHalfHeight) * smoothCamera;
      camera.position
        .copy(currentLook)
        .addScaledVector(currentOutward, cameraDistance);
      camera.lookAt(currentLook);
      camera.left = -currentHalfHeight * aspect;
      camera.right = currentHalfHeight * aspect;
      camera.top = currentHalfHeight;
      camera.bottom = -currentHalfHeight;
      camera.updateProjectionMatrix();
      car.update(s, dt, following.current);
      city.update(
        s.elapsed,
        selectedStop.current,
        s.nearStop,
        !following.current && currentHalfHeight > overviewHalfHeight * 0.65,
        (currentHalfHeight * 2 * 150) / viewportHeight,
      );
      // Spend the shadow map on the nearby street when driving; overview covers both banks.
      const shadowSize = following.current ? 27 : 160;
      const shadowTarget = following.current ? currentLook : look;
      sun.target.position.copy(shadowTarget);
      sun.position.copy(shadowTarget).add(projected.set(-55, 135, 45));
      sun.shadow.camera.left = -shadowSize;
      sun.shadow.camera.right = shadowSize;
      sun.shadow.camera.top = shadowSize;
      sun.shadow.camera.bottom = -shadowSize;
      sun.shadow.camera.updateProjectionMatrix();
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

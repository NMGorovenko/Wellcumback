'use client';
import { createGraphicsController } from '../world/graphics';
import { presentedVehicle } from '@/lib/game/city/vehicle-presentation';
import { renderedFrameCounter } from '@/lib/game/performance';
import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { CityState } from '@/lib/game/city/engine';
import { citySurfacePose } from '@/lib/game/city/surface';
import { RenderKit } from '../world/render-kit';
import { SceneLoading } from '../world/scene-loading';
import { loadCityEnvironment, type CityLoadProgress } from './environment';
import { createCityAtmosphere } from './atmosphere';
import { createMustang } from './mustang';
import { citySpeech } from '@/lib/game/city/dialogue';
import { placeSpeechBubble } from '../world/speech-position';
import type { SpeechBubbleRef } from '../world/speech-bubble';
import {
  cityDriveCamera,
  cityCruiseCamera,
  clearCityCruiseCamera,
  cityCameraFocus,
  cityFaceCamera,
  cityOverviewCamera,
  followCityHeading,
  type CityCameraMode,
} from './camera';

const SKID_CAPACITY = 160,
  SMOKE_CAPACITY = 20;
export type CityReviewCamera = {
  position: { x: number; y: number; z: number };
  look: { x: number; y: number; z: number };
  fov: number;
  shadowSize?: number;
  fitWidth?: boolean;
};
/** Close driving camera follows the car and its travel path. The full
 * isometric map remains available through the existing overview toggle. */
export default function CityScene({
  game,
  targetStop = -1,
  cameraMode = 'drive',
  speechRef,
  onReady,
  reviewCamera,
}: {
  game: RefObject<CityState>;
  targetStop?: number;
  cameraMode?: CityCameraMode;
  speechRef: SpeechBubbleRef;
  onReady?: (ready: boolean) => void;
  reviewCamera?: CityReviewCamera;
}) {
  const host = useRef<HTMLDivElement>(null),
    selectedStop = useRef(targetStop);
  const mode = useRef(cameraMode);
  const inspection = useRef<CityReviewCamera | undefined>(undefined);
  useEffect(() => {
    inspection.current =
      process.env.NODE_ENV === 'development' ? reviewCamera : undefined;
  }, [reviewCamera]);
  useEffect(() => {
    mode.current = cameraMode;
  }, [cameraMode]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState<CityLoadProgress | null>({
    label: 'Готовимся к поездке',
    progress: 0,
  });
  useEffect(() => {
    selectedStop.current = targetStop;
  }, [targetStop]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const abort = new AbortController();
    let teardown = () => {};
    const initialize = async () => {
      onReady?.(false);
      setLoading({ label: 'Готовимся к поездке', progress: 0 });
      setFailed(false);
      const countRenderedFrame = renderedFrameCounter();
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#b8ced4');
      const kit = new RenderKit(scene);
      const atmosphere = createCityAtmosphere(kit);
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          powerPreference: 'high-performance',
        });
      } catch {
        // WebGL can be unavailable; report this external initialization failure.
        // oxlint-disable-next-line react/react-compiler
        kit.dispose();
        setFailed(true);
        return;
      }
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.domElement.setAttribute(
        'aria-label',
        'Красный Mustang с Никитой, Яриком и Ромой на вечерней карте Красноярска: Енисей и Кача, мосты, террасы и жилые кварталы.',
      );
      element.appendChild(renderer.domElement);
      teardown = () => {
        kit.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
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
      const cruiseFar = Math.max(
        2000,
        Math.min(5200, overview.distance * 0.65),
      );
      const cruiseCamera = new THREE.PerspectiveCamera(58, 1, 0.12, cruiseFar);
      const cruiseFog = new THREE.Fog(
        scene.background,
        cruiseFar * 0.26,
        cruiseFar * 0.95,
      );
      const cruisePosition = new THREE.Vector3(),
        cruiseLook = new THREE.Vector3();
      let previousMode: CityCameraMode | null = null;
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
      const sun = new THREE.DirectionalLight('#fff0d7', 2.5);
      sun.position.set(-22, 38, 16);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1536, 1536);
      const graphics = createGraphicsController(renderer, sun, scene);
      sun.shadow.camera.left = -42;
      sun.shadow.camera.right = 42;
      sun.shadow.camera.top = 37;
      sun.shadow.camera.bottom = -37;
      sun.shadow.camera.far = 360;
      sun.shadow.normalBias = 0.05;
      sun.shadow.bias = -0.00008;
      const shadowOutward = new THREE.Vector3(-55, 135, 45).normalize();
      const shadowRight = new THREE.Vector3(45, 0, 55).normalize();
      const shadowUp = new THREE.Vector3()
        .crossVectors(shadowOutward, shadowRight)
        .normalize();
      scene.add(sun.target);
      scene.add(sun, new THREE.HemisphereLight('#d4ecff', '#7d876c', 1.25));
      const evening = new THREE.DirectionalLight('#b5caff', 0.4);
      evening.position.set(23, 16, -15);
      scene.add(evening);
      const city = await loadCityEnvironment(kit, abort.signal, setLoading);
      if (abort.signal.aborted) return;
      const car = createMustang(kit);
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
      skidGeometry.rotateX(-Math.PI / 2);
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
        y: 0,
        pitch: 0,
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
        return { sprite, age: 2, x: 0, y: 0, z: 0 };
      });
      const splashGeometry = new THREE.RingGeometry(0.86, 1, 32);
      kit.geometries.add(splashGeometry);
      const splash = [0, 1].map(() => {
        const material = new THREE.MeshBasicMaterial({
          color: '#d2edf1',
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        kit.materials.add(material);
        const ring = new THREE.Mesh(splashGeometry, material);
        ring.rotation.x = -Math.PI / 2;
        ring.visible = false;
        scene.add(ring);
        return ring;
      });
      let skidCursor = 0,
        smokeCursor = 0,
        emitClock = 0,
        last = performance.now(),
        raf = 0,
        lastElapsed = game.current.elapsed,
        lastTravelRevision = game.current.travelRevision ?? 0;
      const projected = new THREE.Vector3();
      const currentLook = look.clone(),
        currentOutward = outward.clone();
      let cameraHeading = game.current.heading;
      const localView = (state = game.current) =>
        mode.current === 'faces'
          ? cityFaceCamera(state, aspect)
          : cityDriveCamera({ ...state, heading: cameraHeading }, aspect);
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
        cruiseCamera.aspect = aspect;
        cruiseCamera.updateProjectionMatrix();
        viewportHeight = height;
        overviewHalfHeight = cityOverviewCamera(aspect).halfHeight;
        if (!currentHalfHeight) {
          const driveView = localView();
          currentHalfHeight =
            mode.current !== 'map' ? driveView.halfHeight : overviewHalfHeight;
          if (mode.current !== 'map') {
            currentLook.set(
              driveView.look.x,
              driveView.look.y,
              driveView.look.z,
            );
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
        if (!graphics.shouldRender(now)) {
          raf = requestAnimationFrame(render);
          return;
        }
        const presented = presentedVehicle(game.current),
          s = {
            ...presented.car,
            elevation: presented.elevation,
            pitch: presented.pitch,
          },
          dt = s.paused ? 0 : Math.max(0, Math.min((now - last) / 1000, 0.05));
        last = now;
        const discontinuity =
          s.elapsed < lastElapsed ||
          (s.travelRevision ?? 0) !== lastTravelRevision;
        if (discontinuity) {
          tracks.forEach((t) => (t.life = 0));
          smoke.forEach((p) => (p.age = 2));
          emitClock = 0;
        }
        lastElapsed = s.elapsed;
        lastTravelRevision = s.travelRevision ?? 0;
        city.destruction.update(s.damage, s.elapsed);
        const cameraDelta = Math.max(
          0,
          Math.min((now - lastCameraTime) / 1000, 0.05),
        );
        lastCameraTime = now;
        cameraHeading = discontinuity
          ? s.heading
          : followCityHeading(cameraHeading, s.heading, cameraDelta);
        const driveView = localView(s);
        const smoothCamera = 1 - Math.exp(-cameraDelta * 8);
        if (discontinuity) {
          currentLook.set(driveView.look.x, driveView.look.y, driveView.look.z);
          previousMode = null;
        }
        const desiredLook =
          mode.current !== 'map'
            ? projected.set(
                driveView.look.x,
                driveView.look.y,
                driveView.look.z,
              )
            : look;
        currentLook.lerp(desiredLook, smoothCamera);
        const desiredOutward =
          mode.current !== 'map'
            ? projected.set(
                driveView.outward.x,
                driveView.outward.y,
                driveView.outward.z,
              )
            : outward;
        currentOutward.lerp(desiredOutward, smoothCamera).normalize();
        const halfHeight =
          mode.current !== 'map' ? driveView.halfHeight : overviewHalfHeight;
        currentHalfHeight += (halfHeight - currentHalfHeight) * smoothCamera;
        camera.position
          .copy(currentLook)
          .addScaledVector(
            currentOutward,
            mode.current === 'map'
              ? cameraDistance
              : Math.max(24, currentHalfHeight * 3),
          );
        if (mode.current !== 'map' && mode.current !== 'cruise') {
          const clear = clearCityCruiseCamera(
            camera.position,
            s,
            undefined,
            undefined,
            city.cameraOccluders,
          );
          const focus = cityCameraFocus(currentLook, camera.position, clear, s);
          camera.position.set(clear.x, clear.y, clear.z);
          camera.lookAt(focus.x, focus.y, focus.z);
        } else camera.lookAt(currentLook);
        camera.left = -currentHalfHeight * aspect;
        camera.right = currentHalfHeight * aspect;
        camera.top = currentHalfHeight;
        camera.bottom = -currentHalfHeight;
        camera.updateProjectionMatrix();
        let activeCamera: THREE.Camera = camera;
        if (mode.current === 'cruise') {
          const view = cityCruiseCamera(
            { ...s, heading: cameraHeading },
            aspect,
          );
          const blend = previousMode === 'cruise' ? smoothCamera : 1;
          cruisePosition.lerp(
            projected.set(view.position.x, view.position.y, view.position.z),
            blend,
          );
          cruiseLook.lerp(
            projected.set(view.look.x, view.look.y, view.look.z),
            blend,
          );
          const clear = clearCityCruiseCamera(
            cruisePosition,
            s,
            undefined,
            undefined,
            city.cameraOccluders,
          );
          const focus = cityCameraFocus(cruiseLook, cruisePosition, clear, s);
          cruiseCamera.position.set(clear.x, clear.y, clear.z);
          cruiseCamera.lookAt(focus.x, focus.y, focus.z);
          cruiseCamera.fov += (view.fov - cruiseCamera.fov) * blend;
          cruiseCamera.updateProjectionMatrix();
          activeCamera = cruiseCamera;
          scene.fog = cruiseFog;
        } else scene.fog = null;
        const review = inspection.current;
        if (review) {
          cruiseCamera.position.set(
            review.position.x,
            review.position.y,
            review.position.z,
          );
          projected.set(review.look.x, review.look.y, review.look.z);
          // Keep the authored landmark frame usable in a narrow review panel.
          cruiseCamera.position
            .sub(projected)
            .multiplyScalar(
              review.fitWidth === false ? 1 : Math.max(1, 16 / (9 * aspect)),
            )
            .add(projected);
          cruiseCamera.lookAt(projected);
          cruiseCamera.fov = review.fov;
          cruiseCamera.updateProjectionMatrix();
          activeCamera = cruiseCamera;
          scene.fog = null;
        }
        previousMode = mode.current;
        car.update(s, dt, mode.current === 'faces');
        car.root.rotation.order = 'YXZ';
        car.root.position.y = presented.elevation + 0.04;
        car.root.rotation.x = presented.pitch;
        const line = citySpeech(s);
        placeSpeechBubble(
          speechRef,
          line ? car.passengers[line.passenger] : null,
          activeCamera,
          element,
          !!line,
          car.passengers,
        );
        city.update(
          s.elapsed,
          selectedStop.current,
          s.nearStop,
          mode.current === 'map' &&
            currentHalfHeight > overviewHalfHeight * 0.65,
          (currentHalfHeight * 2 * 150) / viewportHeight,
          s,
        );
        // A city-sized shadow frustum wastes resolution. Follow the presented car
        // in every street view and turn shadows off for the multi-kilometre map.
        // Snap in light space so asphalt shadows do not shimmer as the car moves.
        const shadowSize =
          review?.shadowSize ?? (mode.current === 'cruise' ? 45 : 32);
        sun.castShadow = !!review || mode.current !== 'map';
        sun.shadow.autoUpdate = sun.castShadow;
        const texel = (shadowSize * 2) / sun.shadow.mapSize.x;
        if (review) projected.set(review.look.x, review.look.y, review.look.z);
        else projected.set(s.x, presented.elevation, s.z);
        const shadowX = projected.dot(shadowRight),
          shadowY = projected.dot(shadowUp);
        projected.addScaledVector(
          shadowRight,
          Math.round(shadowX / texel) * texel - shadowX,
        );
        projected.addScaledVector(
          shadowUp,
          Math.round(shadowY / texel) * texel - shadowY,
        );
        sun.target.position.copy(projected);
        sun.position.copy(sun.target.position).add(projected.set(-55, 135, 45));
        sun.shadow.camera.left = -shadowSize;
        sun.shadow.camera.right = shadowSize;
        sun.shadow.camera.top = shadowSize;
        sun.shadow.camera.bottom = -shadowSize;
        sun.shadow.camera.updateProjectionMatrix();
        splash.forEach((ring, index) => {
          const age = (s.flight?.waterTime ?? 0) - index * 0.12;
          ring.visible = age > 0 && age < 1.3;
          if (!ring.visible) return;
          ring.position.set(
            s.x,
            (s.elevation ?? 0) + 0.69 + index * 0.005,
            s.z,
          );
          ring.scale.setScalar(1.2 + age * 7);
          ring.material.opacity = Math.max(0, 1 - age / 1.3) * 0.7;
        });
        emitClock += dt;
        if (s.drifting && !s.flight?.airborne && emitClock > 0.075) {
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
            const contact = citySurfacePose(
              x,
              z,
              s.heading,
              presented.elevation,
              s.surfaceId,
            );
            Object.assign(tracks[skidCursor], {
              x,
              z,
              angle: -s.heading,
              y: contact.elevation + 0.105,
              pitch: contact.pitch,
              life: 1,
            });
            skidCursor = (skidCursor + 1) % SKID_CAPACITY;
            const puff = smoke[smokeCursor];
            puff.age = 0;
            puff.x = x;
            puff.z = z;
            puff.y = contact.elevation;
            smokeCursor = (smokeCursor + 1) % SMOKE_CAPACITY;
          }
        }
        tracks.forEach((track, i) => {
          track.life = Math.max(0, track.life - dt / 8);
          dummy.position.set(track.x, track.y, track.z);
          dummy.rotation.order = 'YXZ';
          dummy.rotation.set(track.pitch, track.angle, 0);
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
            puff.y + 0.25 + puff.age * 0.48,
            puff.z + puff.age * 0.2,
          );
          puff.sprite.scale.setScalar(0.35 + puff.age * 0.7);
          puff.sprite.material.opacity = (1 - puff.age / 1.55) * 0.43;
        });
        atmosphere.update(activeCamera, s.elapsed, mode.current === 'cruise');
        city.lod.update(
          review?.look ??
            (mode.current === 'cruise' ? activeCamera.position : s),
          graphics.settings().detail,
          mode.current === 'map',
          mode.current === 'map'
            ? (currentHalfHeight * 2) / viewportHeight
            : undefined,
        );
        renderer.render(scene, activeCamera);
        countRenderedFrame(performance.now());
        raf = requestAnimationFrame(render);
      };
      teardown = () => {
        cancelAnimationFrame(raf);
        observer.disconnect();
        city.lod.dispose();
        graphics.dispose();
        kit.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };

      setLoading({ label: 'Свет и материалы', progress: 0.97 });
      await new Promise<void>((resolve) => setTimeout(resolve, 16));
      if (abort.signal.aborted) return;
      await renderer.compileAsync(scene, camera);
      if (abort.signal.aborted) return;
      raf = requestAnimationFrame(render);
      setLoading(null);
      onReady?.(true);
    };
    void initialize().catch(() => {
      if (!abort.signal.aborted) {
        teardown();
        setFailed(true);
        setLoading(null);
      }
    });
    return () => {
      abort.abort();
      teardown();
    };
  }, [game, speechRef, onReady]);
  return (
    <div
      className="three-host city-three-host"
      ref={host}
      aria-label="Красноярск в миниатюре и красный Mustang друзей"
    >
      {loading && !failed && <SceneLoading {...loading} />}
      {failed && (
        <div className="webgl-error">
          Не удалось включить 3D. Проверь аппаратное ускорение браузера.
        </div>
      )}
    </div>
  );
}

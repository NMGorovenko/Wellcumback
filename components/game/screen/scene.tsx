/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The dynamic WebGL scene has an accessible image role, not an image URL. */
'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { people, room } from '@/lib/game/presets';
import { createCharacter } from './character';
import type { GameState } from '@/lib/game/screen/engine';

type Props = { game?: RefObject<GameState>; playing?: boolean };
export default function Scene({ game, playing = false }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      // WebGL is an external system; initialization failure must reach the HUD.
      // oxlint-disable-next-line react/react-compiler
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor('#9ea48f');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#a5ab97', 35, 65);
    const camera = new THREE.OrthographicCamera(-14, 14, 10, -10, 0.1, 100);
    camera.position.set(18, 12, 22);
    camera.lookAt(0, 3, 0);
    scene.add(new THREE.HemisphereLight('#ffefd4', '#536348', 2.8));
    const sun = new THREE.DirectionalLight('#ffe3ad', 4);
    sun.position.set(1, 17, 13);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -20,
      right: 20,
      top: 20,
      bottom: -20,
    });
    sun.shadow.bias = -0.001;
    sun.shadow.normalBias = 0.04;
    scene.add(sun);
    const materials: THREE.Material[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    const textures: THREE.Texture[] = [];
    function box(
      w: number,
      h: number,
      d: number,
      color: string,
      x = 0,
      y = 0,
      z = 0,
      parent: THREE.Object3D = scene,
    ) {
      const geo = new THREE.BoxGeometry(w, h, d);
      geometries.push(geo);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
      materials.push(mat);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    }
    function round(
      r: number,
      h: number,
      color: string,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = scene,
    ) {
      const geo = new THREE.CylinderGeometry(r, r, h, 12);
      geometries.push(geo);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
      materials.push(mat);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    }
    function label(
      text: string,
      w: number,
      h: number,
      x: number,
      y: number,
      z: number,
      color = '#313c2e',
      bg = '#e4e7c6',
      parent: THREE.Object3D = scene,
    ) {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 128;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 40px Arial';
      ctx.fillText(text, 256, 64);
      const texture = new THREE.CanvasTexture(c);
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.push(texture);
      const mat = new THREE.MeshBasicMaterial({ map: texture });
      materials.push(mat);
      const geo = new THREE.PlaneGeometry(w, h);
      geometries.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    }
    box(23, 0.3, 17, room.floor, 0, -0.2, 1);
    for (let z = -6; z < 10; z += 0.65) {
      box(23, 0.012, 0.018, '#594a36', 0, -0.04, z);
      for (let x = -11; x < 11; x += 3.5)
        box(
          0.014,
          0.013,
          0.64,
          '#5e4a37',
          x + (Math.round(z * 2) % 2) * 1.5,
          -0.03,
          z,
        );
    }
    box(23, 11, 0.4, room.wall, 0, 5.4, -6);
    box(0.35, 11, 14, '#939d8c', -11.5, 5.4, 1);
    box(23, 0.25, 0.3, '#d4d6ba', 0, 0.05, -5.72);
    const ceiling = box(23, 0.2, 0.6, '#d6d7bf', 0, 10.4, -5.65);
    ceiling.rotation.z = room.ceilingSlope;
    for (let i = -11; i < 12; i += 0.5) {
      box(0.016, 10.3, 0.015, '#929c8a', i, 5.4, -5.79);
    }
    // Tiny sofa against the absurdly large screen.
    const sofa = new THREE.Group();
    scene.add(sofa);
    sofa.position.set(4.3, 0, 1.5);
    box(3.3, 0.65, 1.35, room.sofa, 0, 0.65, 0, sofa);
    box(3.4, 1.35, 0.4, '#677b60', 0, 1.2, -0.65, sofa);
    box(0.4, 1.1, 1.5, '#7e906e', -1.7, 0.85, 0, sofa);
    box(0.4, 1.1, 1.5, '#7e906e', 1.7, 0.85, 0, sofa);
    for (const x of [-0.8, 0.8]) box(1.48, 0.2, 1.18, '#8e9f78', x, 1, 0, sofa);
    for (const x of [-1.3, 1.3])
      for (const z of [-0.5, 0.5])
        box(0.15, 0.4, 0.15, '#423a2c', x, 0.2, z, sofa);
    const pillow = box(0.65, 0.65, 0.23, '#cb9e66', 1.05, 1.46, -0.3, sofa);
    pillow.rotation.z = -0.25;
    // Rug, coffee table and half-finished Saturday.
    box(6, 0.025, 4, '#a47754', 3.5, 0.01, 4.3);
    for (const z of [2.5, 6.1]) box(5.6, 0.02, 0.12, '#d0b27c', 3.5, 0.03, z);
    box(1.7, 0.12, 1.15, '#bd9e6b', 3.5, 0.85, 4);
    for (const x of [2.9, 4.1])
      for (const z of [3.6, 4.4]) box(0.12, 0.8, 0.12, '#423f30', x, 0.42, z);
    round(0.14, 0.24, '#e4d8b3', 3.7, 1.01, 4);
    box(0.48, 0.07, 0.65, '#435743', 3.13, 0.96, 3.9);
    // Radiator and window, a plant, cardboard, slippers.
    box(2.8, 3.6, 0.2, '#d8dcc8', -8, 6.6, -5.6);
    box(2.45, 3.25, 0.1, '#91b6b1', -8, 6.6, -5.43);
    box(0.12, 3.3, 0.15, '#edead5', -8, 6.6, -5.3);
    box(2.5, 0.13, 0.15, '#edead5', -8, 6.6, -5.3);
    box(3.2, 0.13, 0.65, '#e0dcc5', -8, 4.85, -5.25);
    for (let i = 0; i < 10; i++)
      box(0.18, 1.6, 0.35, '#c4c9b4', -9.2 + i * 0.26, 2.7, -5.45);
    round(0.45, 0.8, '#b89064', 8.6, 0.4, -2.8);
    for (let i = 0; i < 7; i++) {
      const leaf = box(
        0.2,
        1.9,
        0.65,
        i % 2 ? '#576e3d' : '#697f43',
        8.6,
        1.3,
        -2.8,
      );
      leaf.rotation.z = (i - 3) * 0.22;
      leaf.rotation.y = i * 0.9;
    }
    const carton = box(1.9, 0.7, 0.8, '#b49363', -4, 0.37, 3);
    carton.rotation.y = 0.2;
    label('135″  ↑  ХРУПКОЕ', 1.55, 0.35, -4, 0.4, 3.43, '#51452e', '#b49363');
    box(0.6, 0.12, 0.26, '#6c7864', -0.3, 0.12, 5);
    box(0.6, 0.12, 0.26, '#6c7864', 0.3, 0.12, 5.2);
    const screen = new THREE.Group();
    scene.add(screen);
    screen.scale.y = 0.7; // Cinemascope frame: mounted bottom stays above the floor.
    screen.position.set(1.4, 6.2, -5.12);
    const frame = [
      box(12.3, 0.19, 0.25, '#343b32', 0, 3.5, 0, screen),
      box(0.19, 7, 0.25, '#343b32', 6.05, 0, 0, screen),
      box(12.3, 0.19, 0.25, '#343b32', 0, -3.5, 0, screen),
      box(0.19, 7, 0.25, '#343b32', -6.05, 0, 0, screen),
    ];
    const cloth = box(11.9, 6.85, 0.08, '#edeedb', 0, 0, 0.02, screen);
    const title = label(
      'ВЕЧЕР ДЛЯ СВОИХ',
      6,
      0.9,
      0,
      0.15,
      0.08,
      '#a4af8c',
      '#edeedb',
      screen,
    );
    const corners = [
      [-6, 3.45],
      [6, 3.45],
      [6, -3.45],
      [-6, -3.45],
    ].map(([x, y]) => box(0.35, 0.35, 0.3, '#d6ee8a', x, y, 0.15, screen));
    const rods = [
      box(11.8, 0.04, 0.15, '#d4e990', 0, 3.2, 0.2, screen),
      box(0.04, 6.4, 0.15, '#d4e990', 5.75, 0, 0.2, screen),
      box(11.8, 0.04, 0.15, '#d4e990', 0, -3.2, 0.2, screen),
      box(0.04, 6.4, 0.15, '#d4e990', -5.75, 0, 0.2, screen),
    ];
    const clips: THREE.Mesh[][] = [];
    for (let i = 0; i < 4; i++) {
      clips[i] = [];
      for (let j = 0; j < 4; j++) {
        const k = j - 1.5;
        clips[i].push(
          box(
            0.22,
            0.22,
            0.35,
            '#c7e578',
            i % 2 === 0 ? k * 2.5 : i === 1 ? 5.95 : -5.95,
            i % 2 === 1 ? k * 1.4 : i === 0 ? 3.45 : -3.45,
            0.22,
            screen,
          ),
        );
      }
    }
    const human = (index: number, x: number, z: number) =>
      createCharacter(people[index], box, round, scene, x, z);
    const humans = [
      human(0, -2.9, -2.6),
      human(1, 6.7, -2.2),
      human(2, 1, 1.4),
    ];
    humans[0].rotation.y = 0.3;
    humans[1].rotation.y = -0.5;
    humans[2].rotation.y = -0.6;
    const chairGroup = new THREE.Group();
    scene.add(chairGroup);
    chairGroup.position.set(-2.8, 0, -3.5);
    function chair(y: number) {
      const g = new THREE.Group();
      chairGroup.add(g);
      box(1.1, 0.17, 1, '#b69a62', 0, 1.8 + y, 0, g);
      for (const x of [-0.42, 0.42])
        for (const z of [-0.38, 0.38]) {
          const leg = box(0.12, 1.8, 0.12, '#837048', x, 0.9 + y, z, g);
          leg.rotation.z = x * 0.12;
        }
      box(1, 0.75, 0.12, '#b69a62', 0, 2.2 + y, -0.47, g);
      box(1, 0.09, 0.1, '#837048', 0, 0.7 + y, 0.4, g);
      return g;
    }
    chair(0);
    const secondChair = chair(1.9);
    secondChair.rotation.y = 0.15;
    secondChair.visible = false;
    const drill = box(0.2, 0.2, 0.55, '#ddad42', 0, 0, 0, humans[0]);
    drill.position.set(0.48, 1.8, -0.28);
    box(0.07, 0.06, 0.4, '#666d60', 0.48, 1.8, -0.7, humans[0]);
    const hooks = [
      box(0.16, 0.16, 0.3, '#d5ee89', -3, 6, -5.4),
      box(0.16, 0.16, 0.3, '#d5ee89', 5.8, 6, -5.4),
    ];
    const ringGeo = new THREE.TorusGeometry(0.16, 0.04, 6, 16);
    geometries.push(ringGeo);
    const ringMat = new THREE.MeshStandardMaterial({ color: '#b6c872' });
    materials.push(ringMat);
    const rings = [-4.4, 4.4].map((x) => {
      const m = new THREE.Mesh(ringGeo, ringMat);
      m.position.set(x, 3, 0.2);
      screen.add(m);
      return m;
    });
    let raf = 0;
    let t = 0;
    function resize() {
      const w = el!.clientWidth,
        h = el!.clientHeight;
      renderer.setSize(w, h);
      const aspect = w / h;
      const size = playing ? 10 : 9.4;
      camera.left = -size * aspect;
      camera.right = size * aspect;
      camera.top = size;
      camera.bottom = -size;
      camera.updateProjectionMatrix();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    function render() {
      raf = requestAnimationFrame(render);
      t += 0.015;
      const s = game?.current;
      if (s && playing) {
        const construction = ['frame', 'rods', 'tension'].includes(s.phase);
        const target = construction
          ? new THREE.Vector3(1.4, 6, -1)
          : new THREE.Vector3(1.4, 4.6, -1);
        const cam = construction
          ? new THREE.Vector3(1.4, 7.5, 21)
          : new THREE.Vector3(3, 7.4, 23);
        camera.position.lerp(cam, 0.05);
        camera.lookAt(target);
        screen.position.set(1.4, 6, -4.8);
        screen.rotation.set(0, 0, 0);
        screen.visible = s.phase !== 'drill';
        cloth.visible = s.phase !== 'frame';
        title.visible = s.phase === 'result';
        frame.forEach((f, i) => {
          (f.material as THREE.MeshStandardMaterial).color.set(
            construction && s.phase === 'frame' && i >= s.corners
              ? '#899378'
              : '#343b32',
          );
        });
        corners.forEach((m, i) => {
          m.visible = s.phase === 'frame';
          (m.material as THREE.MeshStandardMaterial).color.set(
            i < s.corners ? '#dcf484' : i === s.corners ? '#f6c666' : '#75836c',
          );
          m.scale.setScalar(i === s.corners ? 1.2 + Math.sin(t * 6) * 0.15 : 1);
        });
        rods.forEach((m, i) => {
          m.visible = s.phase === 'rods' || s.phase === 'tension';
          m.scale.set(
            i % 2 === 0 ? Math.max(0.01, s.rods[i]) : 1,
            i % 2 ? Math.max(0.01, s.rods[i]) : 1,
            1,
          );
        });
        clips.forEach((arr, i) =>
          arr.forEach(
            (m, j) => (m.visible = s.phase === 'tension' && j < s.clips[i]),
          ),
        );
        secondChair.visible = s.chairs === 2;
        chairGroup.visible = s.phase === 'drill';
        chairGroup.position.x = s.holes.length === 0 ? -3 : 5.8;
        chairGroup.rotation.z = -s.balance * 0.14;
        hooks.forEach((m, i) => {
          m.visible = ['drill', 'lift', 'level', 'result'].includes(s.phase);
          m.position.y = s.holes[i] ?? s.aim;
          (m.material as THREE.MeshStandardMaterial).color.set(
            s.holes[i] ? '#dcf484' : '#e8a754',
          );
        });
        humans.forEach(
          (h, i) => (h.visible = i < s.players || (s.players === 1 && i === 1)),
        );
        if (s.phase === 'drill') {
          humans[0].position.set(
            chairGroup.position.x - s.balance * 0.6,
            s.cooldown > 0.6 ? 0 : s.chairs === 1 ? 1.9 : 3.8,
            -3.6,
          );
          humans[0].rotation.y = Math.PI;
          humans[0].rotation.z = -s.balance * 0.14;
          humans[1].position.set(chairGroup.position.x + 1.2, 0, -2.8);
        } else if (s.phase === 'lift') {
          const ringHeight = (s.liftLeft + s.liftRight) / 2;
          const upright = Math.min(
            1,
            Math.max(0.1, (ringHeight - 0.12) / 4.55),
          );
          const tilt = Math.acos(upright);
          screen.rotation.x = tilt;
          screen.position.set(
            1.4 + s.liftX,
            ringHeight - 2.1 * upright,
            -4.8 + 2.45 * Math.sin(tilt),
          );
          screen.rotation.z = Math.atan2(s.liftRight - s.liftLeft, 8.8);
          humans[0].position.set(
            -3 + s.liftX,
            Math.max(0, s.liftLeft - 5),
            -3.7,
          );
          humans[1].position.set(
            5.8 + s.liftX,
            Math.max(0, s.liftRight - 5),
            -3.7,
          );
        } else if (s.phase === 'level' || s.phase === 'result') {
          screen.position.y = (s.holes[0] + s.holes[1]) / 2 - 2.1;
          screen.rotation.z = s.angle;
          humans[0].position.set(-3, 0, -2);
          humans[1].position.set(6.5, 0, -2);
        } else {
          humans[0].position.set(
            s.side === 3 ? -5 : s.side === 1 ? 8 : 0,
            0,
            -2,
          );
          humans[1].position.set(6.7, 0, -2.2);
        }
        rings.forEach((m) => (m.visible = s.phase === 'lift'));
        drill.visible = s.phase === 'drill';
      } else {
        corners.forEach((m) => (m.visible = false));
        rods.forEach((m) => (m.visible = false));
        clips.flat().forEach((m) => (m.visible = false));
        rings.forEach((m) => (m.visible = false));
        hooks.forEach((m) => (m.visible = false));
        humans[0].position.y = 1.9;
        humans[0].rotation.y = Math.PI;
        humans[2].rotation.z = Math.sin(t) * 0.035;
        chairGroup.rotation.z = Math.sin(t) * 0.01;
      }
      renderer.render(scene, camera);
    }
    render();
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((tx) => tx.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [game, playing]);
  return (
    <div
      className="scene-canvas"
      ref={host}
      role="img"
      aria-label="Трёхмерная квартира с огромным экраном, маленьким диваном и бригадой друзей"
    >
      {failed && (
        <p className="render-error">
          Не удалось включить 3D. Включите аппаратное ускорение браузера и
          обновите страницу.
        </p>
      )}
    </div>
  );
}

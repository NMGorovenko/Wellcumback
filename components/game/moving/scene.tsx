'use client';
import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import {
  movingCrew,
  movingCarryPoint,
  type MovingState,
} from '@/lib/game/moving/engine';
import {
  entry,
  mapSize,
  MAP_UNITS_PER_METRE,
  movingOverview,
  obstacles,
} from '@/lib/game/moving/layout';
import { people } from '@/lib/game/presets';
import { RenderKit } from '../world/render-kit';
import { createRig } from '../world/rig';
import { makeLabel } from '../world/labels';
import { placeActionCues, type ActionCueRefs } from '../world/action-cues';

const world = (x: number, y: number, height = 0) =>
  new THREE.Vector3(
    (x - mapSize.width / 2) / MAP_UNITS_PER_METRE,
    height,
    (y - mapSize.height / 2) / MAP_UNITS_PER_METRE,
  );
function createStudio(kit: RenderKit) {
  kit.box(8, 0.15, 15, '#c3baaa', 0, -0.09, 0);
  for (let i = 0; i < 25; i++)
    kit.box(
      0.014,
      0.012,
      14.4,
      i % 2 ? '#b5ab98' : '#cfc4ae',
      -3.65 + i * 0.3,
      0,
      0,
      kit.scene,
      0,
    );
  // Low side walls preserve the continuous overview; the far wall carries the balcony.
  kit.box(0.12, 0.45, 14.5, '#dbd6c8', -3.86, 0.2, 0);
  kit.box(0.12, 0.45, 14.5, '#dbd6c8', 3.86, 0.2, 0);
  kit.box(7.8, 2.6, 0.14, '#ddd8c9', 0, 1.25, -7.3);
  kit.box(3.5, 2.15, 0.17, '#f3eee4', 0, 1.25, -7.18);
  kit.box(3.22, 1.87, 0.04, '#b2cfcd', 0, 1.25, -7.06);
  kit.box(0.07, 2.12, 0.1, '#f0eee5', 0.45, 1.25, -7.01);
  kit.box(3.3, 0.06, 0.1, '#f0eee5', 0, 1.05, -7.01);
  kit.box(3.3, 0.08, 0.42, '#e4dfd4', 0, 0.29, -6.95);
  for (let i = 0; i < 7; i++)
    kit.box(0.025, 0.7, 0.025, '#d9dfd3', -1.45 + i * 0.48, 0.78, -7.02);
  const balcony = makeLabel(kit, 'БАЛКОН', '#d9efed', 1.35);
  balcony.position.set(0, 2.6, -7.02);
  kit.scene.add(balcony);
  for (const o of obstacles) {
    const p = world(o.x + o.w / 2, o.y + o.h / 2),
      w = o.w / 70,
      d = o.h / 70;
    if (o.kind === 'sofa') {
      kit.box(w, 0.42, d, '#777d75', p.x, 0.26, p.z, kit.scene, 0.09);
      kit.box(
        0.2,
        0.73,
        d,
        '#858a80',
        p.x - w / 2 + 0.05,
        0.61,
        p.z,
        kit.scene,
        0.07,
      );
      for (let i = 0; i < 3; i++)
        kit.box(
          w - 0.15,
          0.2,
          d / 3 - 0.05,
          '#a4a598',
          p.x + 0.04,
          0.59,
          p.z - d / 3 + (i * d) / 3,
          kit.scene,
          0.08,
        );
      kit.box(
        0.65,
        0.15,
        0.5,
        '#d4d0c0',
        p.x + 0.12,
        0.82,
        p.z - 0.9,
        kit.scene,
        0.07,
      );
    } else if (o.kind === 'desk') {
      kit.box(w, 0.1, d, '#755741', p.x, 0.79, p.z);
      for (const dx of [-w / 2 + 0.07, w / 2 - 0.07])
        for (const dz of [-d / 2 + 0.1, d / 2 - 0.1])
          kit.box(0.07, 0.75, 0.07, '#474744', p.x + dx, 0.39, p.z + dz);
      kit.box(0.11, 0.62, 0.93, '#282d2c', p.x + 0.21, 1.16, p.z - 0.75);
      kit.box(0.018, 0.5, 0.8, '#75939b', p.x + 0.14, 1.17, p.z - 0.75);
      kit.box(0.26, 0.04, 0.65, '#353735', p.x - 0.25, 0.87, p.z - 0.75);
      kit.cylinder(0.09, 0.08, 0.19, '#e3dac4', p.x - 0.16, 0.94, p.z + 0.4);
      kit.box(0.45, 0.55, 0.55, '#353735', p.x + 0.2, 0.3, p.z + 0.8);
    } else if (o.kind === 'kitchen') {
      kit.box(w, 0.86, d, '#c7b699', p.x, 0.43, p.z);
      kit.box(w + 0.02, 0.09, d + 0.03, '#554b3f', p.x, 0.89, p.z);
      kit.box(0.65, 0.025, 0.65, '#919b91', p.x + 0.35, 0.95, p.z);
      kit.cylinder(0.023, 0.023, 0.35, '#b8c0b3', p.x + 0.4, 1.13, p.z + 0.36);
      kit.box(
        0.8,
        1.85,
        0.87,
        '#dce0d5',
        p.x - w / 2 + 0.4,
        0.93,
        p.z + d / 2 - 0.45,
      );
      kit.box(
        0.025,
        0.36,
        0.035,
        '#80877d',
        p.x - w / 2 + 0.81,
        1.22,
        p.z + d / 2 - 0.8,
      );
      for (let i = 0; i < 3; i++)
        kit.box(
          0.04,
          0.3,
          0.025,
          '#4a4b42',
          p.x - 0.2 + i * 0.6,
          0.57,
          p.z - d / 2 - 0.02,
        );
    } else if (o.kind === 'wardrobe') {
      kit.box(w, 2.32, d, '#935d37', p.x, 1.16, p.z);
      kit.box(0.025, 2.25, d - 0.08, '#d8c29b', p.x - w / 2 - 0.014, 1.15, p.z);
      for (const z of [-0.12, 0.12])
        kit.box(0.04, 0.48, 0.04, '#47362b', p.x - w / 2 - 0.05, 1.08, p.z + z);
    } else {
      for (let i = 0; i < 3; i++) {
        kit.box(
          w * 0.95,
          0.43,
          d * 0.85,
          '#b08b57',
          p.x,
          0.23 + i * 0.44,
          p.z,
          kit.scene,
          0.008,
        );
        kit.box(w * 0.96, 0.035, 0.14, '#d3bb87', p.x, 0.45 + i * 0.44, p.z);
      }
    }
  }
  const rug = kit.mesh(
    new THREE.CircleGeometry(1.12, 40),
    kit.material('#777970'),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.copy(world(300, 235, 0.014));
  rug.scale.y = 1.55;
  for (let i = -2; i <= 2; i++) {
    const stripe = kit.box(0.018, 0.01, 2.7, '#b5b5a5', i * 0.4, 0.026, -4.35);
    stripe.rotation.y = 0.35;
  }
  const door = world(entry.x, entry.y);
  kit.box(1.55, 0.025, 1.2, '#78a66f', door.x, 0.025, door.z);
  const sign = makeLabel(kit, 'К ДВЕРИ ↓', '#c9f0ad', 1.65);
  sign.position.copy(door).y = 0.32;
  kit.scene.add(sign);
  for (let i = 0; i < 3; i++)
    kit.box(
      0.065,
      0.01,
      0.45,
      '#d8e6bc',
      door.x,
      0.045,
      door.z - 1.3 - i * 0.7,
    );
}
function makeBag(kit: RenderKit) {
  const root = new THREE.Group(),
    body = new THREE.Group();
  kit.scene.add(root);
  root.add(body);
  kit.box(0.79, 0.53, 0.68, '#e8bd12', 0, 0.31, 0, body, 0.07);
  kit.box(0.79, 0.1, 0.69, '#272b28', 0, 0.08, 0, body);
  const flaps = [-1, 1].map((side) => {
    const flap = new THREE.Group();
    body.add(flap);
    flap.position.set(side * 0.36, 0.58, 0);
    kit.box(0.39, 0.035, 0.65, '#f2cd20', -side * 0.18, 0, 0, flap);
    return flap;
  });
  for (const side of [-1, 1]) {
    for (const x of [-0.22, 0.22])
      kit.box(0.045, 0.49, 0.018, '#252a27', x, 0.33, side * 0.35, body);
    const handle = kit.torus(0.2, 0.023, '#252a27', 0, 0.72, side * 0.28, body);
    handle.scale.y = 0.8;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 80;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  kit.textures.add(texture);
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthWrite: false,
  });
  kit.materials.add(material);
  const label = new THREE.Sprite(material);
  label.scale.set(1.15, 0.24, 1);
  root.add(label);
  let previous = '';
  return {
    root,
    body,
    flaps,
    label,
    text(value: string) {
      if (value === previous) return;
      previous = value;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, 384, 80);
      ctx.fillStyle = '#252b25ec';
      ctx.fillRect(0, 0, 384, 80);
      ctx.fillStyle = '#f5df78';
      ctx.font = '600 33px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(value, 192, 40, 370);
      texture.needsUpdate = true;
    },
  };
}

export default function MovingScene({
  game,
  cueRefs,
}: {
  game: RefObject<MovingState>;
  cueRefs?: ActionCueRefs;
}) {
  const host = useRef<HTMLDivElement>(null),
    cues = useRef(cueRefs);
  useEffect(() => {
    cues.current = cueRefs;
  }, [cueRefs]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#b7bcae');
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute(
      'aria-label',
      'Длинная студия Ярика: балкон вверху, кухня и вход внизу, шкаф справа, диван слева, стол с компьютером у окна. Жёлтые сумки и вещи в проходе.',
    );
    element.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(43, 1, 0.08, 60);
    const sun = new THREE.DirectionalLight('#fff2cf', 2.8);
    sun.position.set(-3, 12, -6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 11;
    sun.shadow.camera.bottom = -11;
    sun.shadow.normalBias = 0.035;
    scene.add(sun, new THREE.HemisphereLight('#ddebea', '#80715b', 2.3));
    createStudio(kit);
    const rigs = movingCrew.map((person) =>
      createRig(
        kit,
        people.find((p) => p.id === person.preset)!,
      ),
    );
    const itemProps = game.current.items.map((item) => {
      const root = new THREE.Group();
      scene.add(root);
      if (item.kind === 'books')
        for (let j = 0; j < 4; j++)
          kit.box(
            0.32,
            0.06,
            0.42,
            ['#708b72', '#9f5e41', '#d6cbaa', '#45616b'][j],
            0,
            0.045 + j * 0.065,
            0,
            root,
          );
      else if (item.kind === 'clothes')
        for (let j = 0; j < 3; j++)
          kit.sphere(
            0.24,
            0.075,
            0.21,
            ['#777281', '#b3a08d', '#6a786d'][j],
            0,
            0.08 + j * 0.11,
            0,
            root,
          );
      else if (item.kind === 'cables') {
        for (let j = 0; j < 3; j++) {
          const coil = kit.torus(
            0.14,
            0.024,
            '#313632',
            0,
            0.05 + j * 0.04,
            0,
            root,
          );
          coil.rotation.x = Math.PI / 2;
        }
      } else {
        kit.box(0.46, 0.34, 0.45, '#aa8454', 0, 0.19, 0, root);
        kit.box(0.12, 0.012, 0.46, '#d8c199', 0, 0.37, 0, root);
      }
      const label = makeLabel(
        kit,
        `${item.label} · ${item.weight} кг`,
        '#eadbb7',
        1.3,
      );
      label.position.y = 0.62;
      root.add(label);
      return { root, label };
    });
    const bags: ReturnType<typeof makeBag>[] = [];
    const resize = () => {
      const width = Math.max(1, element.clientWidth),
        height = Math.max(1, element.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
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
    const hand = new THREE.Vector3();
    const draw = () => {
      animation = requestAnimationFrame(draw);
      const s = game.current,
        time = s.elapsed;
      rigs.forEach((rig, i) => {
        const actor = s.actors[i];
        rig.root.visible = !!actor;
        if (!actor) return;
        rig.root.position.copy(world(actor.x, actor.y));
        rig.root.rotation.y = actor.facing;
        const walking = Math.hypot(actor.vx, actor.vy) > 0.001;
        rig.update(
          time,
          s.phase === 'result'
            ? 'celebrate'
            : actor.working
              ? 'work'
              : actor.bagId !== null || actor.heldItem !== null
                ? 'carry'
                : walking
                  ? 'walk'
                  : 'idle',
          actor.stamina < 25 ? 0.85 : 0.5,
        );
        rig.setCrouch(
          actor.working ? 0.24 : actor.stamina < 25 && !walking ? 0.1 : 0,
        );
      });
      bags.forEach((prop) => {
        prop.root.visible = false;
      });
      s.bags.forEach((bag, i) => {
        const prop = bags[i] ?? (bags[i] = makeBag(kit));
        prop.root.visible = bag.status !== 'delivered';
        if (!prop.root.visible) return;
        const fullness = 0.48 + (0.52 * bag.weight) / bag.capacity;
        prop.body.scale.y = fullness;
        const carriedPoint =
          bag.status === 'carried'
            ? movingCarryPoint(bag.carriers.map((id) => s.actors[id]))
            : bag;
        prop.root.position.copy(
          world(
            carriedPoint.x,
            carriedPoint.y,
            bag.status === 'carried' ? 0.55 : 0.02,
          ),
        );
        prop.root.rotation.z =
          bag.status === 'carried' ? Math.sin(time * 8) * 0.025 : 0;
        prop.flaps.forEach((flap, j) => {
          flap.rotation.z =
            (j ? -1 : 1) * (bag.status === 'open' ? 0.85 * (1 - bag.zip) : 0);
        });
        prop.label.position.y = 0.94 * fullness;
        prop.text(
          `${bag.id + 1} · ${bag.weight}/${bag.capacity} кг${bag.status === 'open' ? ' · ОТКР.' : ''}`,
        );
        for (const id of bag.carriers) {
          const rig = rigs[id];
          const handle = prop.root.localToWorld(
            new THREE.Vector3(
              id === bag.carriers[0] ? -0.23 : 0.23,
              0.7 * fullness,
              0,
            ),
          );
          rig.reach('left', handle);
          rig.reach('right', handle);
        }
      });
      s.items.forEach((item, i) => {
        const prop = itemProps[i];
        prop.root.visible = item.status !== 'packed';
        prop.label.visible = item.status === 'floor';
        if (item.carrier !== null) {
          rigs[item.carrier].rightHand.getWorldPosition(hand);
          prop.root.position.copy(hand);
          prop.root.position.y -= 0.1;
        } else prop.root.position.copy(world(item.x, item.y, 0.015));
      });
      placeActionCues(
        cues.current,
        rigs.slice(0, s.players).map((rig) => rig.head),
        camera,
        element,
        s.phase === 'moving' && !s.paused,
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
      className="moving-scene world-canvas"
      style={{ width: '100%', height: '100%', minHeight: 460 }}
    >
      <span hidden className="webgl-fallback">
        Для этой главы нужен WebGL. Открой игру в браузере с поддержкой 3D.
      </span>
    </div>
  );
}

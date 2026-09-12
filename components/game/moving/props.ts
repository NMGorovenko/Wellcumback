import * as THREE from 'three';
import type { RenderKit } from '../world/render-kit';
import { makeLabel } from '../world/labels';

/** Recognisable moving-day objects, also reused as the visible contents of open bags. */
export function createMovingItem(
  kit: RenderKit,
  item: { label: string; kind: string; weight: number },
) {
  const root = new THREE.Group();
  kit.scene.add(root);
  const name = `${item.kind} ${item.label}`.toLowerCase();
  if (/клавиат/.test(name)) {
    kit.box(0.43, 0.035, 0.18, '#3e4849', 0, 0.04, 0, root);
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 10; col++)
        kit.box(
          0.029,
          0.007,
          0.026,
          '#939e96',
          -0.177 + col * 0.039,
          0.061,
          -0.055 + row * 0.033,
          root,
          0,
        );
  } else if (/books|книг/.test(name)) {
    for (let i = 0; i < 3; i++) {
      const book = new THREE.Group();
      root.add(book);
      book.position.set((i % 2) * 0.018, 0.033 + i * 0.066, 0);
      book.rotation.y = i * 0.07;
      const color = ['#506b70', '#a57b59', '#718064'][i];
      kit.box(0.29, 0.065, 0.37, color, 0, 0, 0, book, 0.007);
      kit.box(0.274, 0.047, 0.35, '#e0d8c4', 0.007, 0, 0.005, book, 0.002);
      kit.box(0.2, 0.004, 0.05, '#e6dab8', 0, 0.035, -0.08, book, 0);
    }
  } else if (/cables|провод|заряд/.test(name)) {
    for (let i = 0; i < 3; i++) {
      const coil = kit.torus(
        0.125 - i * 0.013,
        0.013,
        '#343b38',
        0,
        0.027 + i * 0.035,
        0,
        root,
      );
      coil.rotation.x = Math.PI / 2;
    }
    kit.box(0.09, 0.06, 0.12, '#656c67', 0.15, 0.037, 0.04, root);
    kit.rod(
      new THREE.Vector3(0.09, 0.05, 0),
      new THREE.Vector3(0.19, 0.033, -0.08),
      0.012,
      '#333c38',
      root,
    );
    kit.box(0.043, 0.022, 0.071, '#b3bab0', 0.19, 0.033, -0.1, root, 0.004);
  } else if (/clothes|куртк|постел|полотен/.test(name)) {
    for (let i = 0; i < 3; i++) {
      const color = ['#91a7a1', '#c7ccc0', '#626b79'][i];
      const cloth = kit.box(
        0.38 - i * 0.025,
        0.075,
        0.3,
        color,
        0,
        0.05 + i * 0.075,
        0,
        root,
        0.035,
      );
      cloth.rotation.y = i * 0.09;
      kit.box(0.3, 0.004, 0.015, '#d1d8cb', 0, 0.09 + i * 0.075, 0.1, root, 0);
    }
    if (/куртк/.test(name))
      kit.box(0.02, 0.012, 0.27, '#aeb7b0', 0, 0.24, 0, root, 0);
  } else if (/кастрю|сковор/.test(name)) {
    const pan = /сковор/.test(name);
    kit.cylinder(
      0.2,
      0.17,
      pan ? 0.06 : 0.18,
      '#aeb7ad',
      0,
      pan ? 0.06 : 0.12,
      0,
      root,
    );
    kit.cylinder(
      0.177,
      0.177,
      0.012,
      '#454f45',
      0,
      pan ? 0.095 : 0.216,
      0,
      root,
    );
    if (pan) kit.box(0.29, 0.035, 0.075, '#3c463e', 0.29, 0.085, 0, root);
    else
      for (const x of [-0.23, 0.23]) {
        const handle = kit.torus(0.055, 0.013, '#5a665a', x, 0.16, 0, root);
        handle.rotation.x = Math.PI / 2;
      }
  } else if (/посуд|круж|dish|mug/.test(name)) {
    for (let i = 0; i < 3; i++) {
      kit.cylinder(0.18, 0.13, 0.035, '#e4ded0', 0, 0.026 + i * 0.04, 0, root);
      const rim = kit.torus(
        0.163,
        0.009,
        '#8babb0',
        0,
        0.043 + i * 0.04,
        0,
        root,
      );
      rim.rotation.x = Math.PI / 2;
    }
    kit.cylinder(0.077, 0.062, 0.135, '#b3c5bd', 0.04, 0.19, 0, root);
    kit.cylinder(0.063, 0.063, 0.005, '#4e6057', 0.04, 0.26, 0, root);
    kit.torus(0.044, 0.012, '#b3c5bd', 0.115, 0.2, 0, root);
  } else if (/обув|shoe/.test(name)) {
    for (const x of [-0.1, 0.1]) {
      kit.box(0.15, 0.042, 0.34, '#dddacc', x, 0.035, 0, root, 0.04);
      kit.sphere(0.073, 0.09, 0.145, '#5a616a', x, 0.1, -0.01, root, 12);
      for (let i = 0; i < 3; i++)
        kit.box(
          0.083,
          0.009,
          0.01,
          '#c5c9ba',
          x,
          0.183 - i * 0.008,
          -0.08 + i * 0.046,
          root,
          0,
        );
    }
  } else if (/колонк/.test(name)) {
    for (const x of [-0.12, 0.12]) {
      kit.box(0.2, 0.34, 0.21, '#4e5049', x, 0.18, 0, root);
      for (const y of [0.12, 0.27]) {
        const speaker = kit.cylinder(
          y < 0.2 ? 0.069 : 0.036,
          y < 0.2 ? 0.069 : 0.036,
          0.012,
          '#272e2a',
          x,
          y,
          0.111,
          root,
        );
        speaker.rotation.x = Math.PI / 2;
      }
    }
  } else if (/инструмент|tool/.test(name)) {
    kit.box(0.39, 0.15, 0.29, '#4a5755', 0, 0.09, 0, root, 0.028);
    kit.box(0.2, 0.033, 0.035, '#252e2c', 0, 0.23, 0, root);
    for (const x of [-0.11, 0.11])
      kit.box(0.035, 0.08, 0.035, '#252e2c', x, 0.19, 0, root);
    kit.box(0.28, 0.025, 0.02, '#b9c2b6', 0, 0.183, 0.095, root);
    kit.box(0.12, 0.04, 0.06, '#ae8343', 0.12, 0.2, 0.095, root);
  } else {
    kit.box(0.4, 0.31, 0.36, '#b89868', 0, 0.17, 0, root, 0.008);
    kit.box(0.085, 0.015, 0.37, '#d9c6a3', 0, 0.334, 0, root, 0);
    kit.box(0.19, 0.1, 0.007, '#ece4d0', 0.04, 0.2, 0.183, root, 0);
    for (let j = 0; j < 3; j++)
      kit.box(
        0.12 - j * 0.02,
        0.006,
        0.008,
        '#7b705b',
        0.04,
        0.22 - j * 0.022,
        0.189,
        root,
        0,
      );
  }
  const label = makeLabel(
    kit,
    `${item.label} · ${item.weight} кг`,
    '#e8dec5',
    1.28,
  );
  label.position.y = 0.65;
  root.add(label);
  return { root, label };
}

export function createMovingBag(kit: RenderKit) {
  const root = new THREE.Group(),
    body = new THREE.Group();
  kit.scene.add(root);
  root.add(body);
  kit.box(0.84, 0.13, 0.73, '#2e3330', 0, 0.08, 0, body, 0.035);
  // Separate fabric walls leave a real cavity for the packed objects.
  for (const side of [-1, 1]) {
    kit.box(0.84, 0.44, 0.045, '#dcb415', 0, 0.36, side * 0.35, body, 0.018);
    kit.box(0.045, 0.44, 0.7, '#e9bf19', side * 0.4, 0.36, 0, body, 0.018);
    for (const x of [-0.23, 0.23]) {
      kit.box(0.043, 0.54, 0.014, '#252d29', x, 0.35, side * 0.38, body, 0.006);
      kit.box(
        0.006,
        0.47,
        0.005,
        '#687060',
        x + 0.012,
        0.35,
        side * 0.389,
        body,
        0,
      );
    }
    const handle = kit.torus(
      0.22,
      0.024,
      '#242c27',
      0,
      0.75,
      side * 0.31,
      body,
    );
    handle.scale.y = 0.83;
    for (let i = 0; i < 4; i++) {
      const crease = kit.box(
        0.1,
        0.013,
        0.005,
        '#ba9819',
        -0.32 + i * 0.21,
        0.26 + (i % 2) * 0.1,
        side * 0.375,
        body,
        0,
      );
      crease.rotation.z = (i % 2 ? 1 : -1) * 0.45;
    }
  }
  kit.box(0.74, 0.025, 0.62, '#806d20', 0, 0.15, 0, body);
  const flaps = [-1, 1].map((side) => {
    const flap = new THREE.Group();
    body.add(flap);
    flap.position.set(side * 0.4, 0.59, 0);
    kit.box(0.4, 0.025, 0.7, '#efc82b', -side * 0.2, 0, 0, flap, 0.008);
    kit.box(0.022, 0.018, 0.7, '#353c2d', -side * 0.39, 0.018, 0, flap, 0);
    return flap;
  });
  const zipper = new THREE.Group();
  body.add(zipper);
  kit.box(0.065, 0.018, 0.045, '#aeb0a0', 0, 0, 0, zipper, 0.006);
  const pull = kit.torus(0.029, 0.007, '#c6c9b8', 0, 0.02, 0.026, zipper);
  pull.rotation.x = Math.PI / 2;
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
  label.scale.set(1.24, 0.26, 1);
  root.add(label);
  let previous = '';
  return {
    root,
    body,
    flaps,
    zipper,
    label,
    text(value: string) {
      if (value === previous) return;
      previous = value;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 384, 80);
      ctx.fillStyle = '#30382fee';
      ctx.fillRect(0, 0, 384, 80);
      ctx.fillStyle = '#f2db7a';
      ctx.font = '600 31px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(value, 192, 40, 370);
      texture.needsUpdate = true;
    },
  };
}

export function createMovingPhone(kit: RenderKit) {
  const root = new THREE.Group();
  kit.scene.add(root);
  kit.box(0.13, 0.023, 0.24, '#292f35', 0, 0, 0, root, 0.014);
  kit.box(0.111, 0.003, 0.197, '#b9c9c1', 0, 0.014, 0, root, 0.007);
  kit.box(0.08, 0.002, 0.062, '#75919b', 0, 0.017, -0.04, root, 0.003);
  for (let i = 0; i < 3; i++)
    kit.box(
      0.073 - i * 0.011,
      0.002,
      0.006,
      '#536f77',
      0,
      0.017,
      0.011 + i * 0.021,
      root,
      0,
    );
  return root;
}

import * as THREE from 'three';
import type { CityBuilding } from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';

/** Side elevations and roof forms from the inspected photographs in the city references doc.
 * The photographs are references only. All parts remain inside the collision parcel, at local y=0.
 */
export function addMallSurroundings(
  kit: RenderKit,
  g: THREE.Group,
  b: CityBuilding,
) {
  const { w, h, d } = b;
  const white = '#e4dfd3',
    glass = '#386078',
    frame = '#6e949e',
    orange = '#c88145';
  const box = (
    bw: number,
    bh: number,
    bd: number,
    color: string,
    x: number,
    y: number,
    z: number,
    name?: string,
  ) => {
    const mesh = kit.box(bw, bh, bd, color, x, y, z, g, 0);
    if (name) mesh.name = name;
    return mesh;
  };
  const rod = (a: number[], c: number[], color = white, radius = 0.055) =>
    kit.rod(new THREE.Vector3(...a), new THREE.Vector3(...c), radius, color, g);

  if (b.kind === 'planeta') {
    const wingH = h * 0.46,
      back = -d / 2 + 0.09;
    const colors = [orange, '#e0bc42', '#8baca6', white, '#c36a41', '#d2c7aa'];
    // The anchor-store wing reaches forward beside the main gallery, making the
    // plan stepped rather than a single rectangle (Malltech's oblique aerial).
    const anchorX = -w * 0.425,
      anchorZ = d * 0.29,
      anchorW = w * 0.14,
      anchorD = d * 0.25,
      anchorH = wingH * 0.96;
    box(
      anchorW,
      anchorH,
      anchorD,
      white,
      anchorX,
      anchorH / 2,
      anchorZ,
      'planeta:projecting-anchor-wing',
    );
    box(anchorW, 0.18, anchorD, white, anchorX, anchorH, anchorZ);
    box(
      anchorW - 0.45,
      0.065,
      anchorD - 0.45,
      '#56616a',
      anchorX,
      anchorH + 0.12,
      anchorZ,
    );
    box(
      anchorW - 0.1,
      anchorH * 0.17,
      0.12,
      '#418266',
      anchorX,
      anchorH * 0.78,
      anchorZ + anchorD / 2 + 0.045,
    );
    box(
      anchorW * 0.29,
      anchorH * 0.42,
      0.12,
      glass,
      anchorX,
      anchorH * 0.21,
      anchorZ + anchorD / 2 + 0.048,
    );
    // The opposite long elevation is banded too, but has mostly solid cladding
    // and a separate glazed entrance rather than a copy of the main portal.
    for (let row = 0; row < 8; row++) {
      let left = -w / 2 + 0.12;
      for (let i = 0; left < w / 2 - 0.12; i++) {
        const bw = Math.min(
          w * [0.067, 0.098, 0.041, 0.075][(i + row) % 4],
          w / 2 - 0.12 - left,
        );
        box(
          bw,
          wingH * 0.094,
          0.14,
          colors[(i * 3 + row + 2) % colors.length],
          left + bw / 2,
          wingH * (0.07 + row * 0.103),
          back,
          'planeta:rear-cladding',
        );
        left += bw;
      }
    }
    // Blank anchor-store end walls and the green stripe are visible in the owner aerial.
    box(
      0.14,
      wingH * 0.84,
      d * 0.68,
      '#bcc5c2',
      -w / 2 + 0.09,
      wingH * 0.44,
      -d * 0.14,
    );
    box(
      0.17,
      wingH * 0.12,
      d * 0.68,
      '#418266',
      -w / 2 + 0.095,
      wingH * 0.74,
      -d * 0.14,
    );
    box(
      0.14,
      wingH * 0.87,
      d * 0.68,
      orange,
      w / 2 - 0.09,
      wingH * 0.445,
      -d * 0.14,
    );
    for (const side of [-1, 1])
      for (let i = 0; i < 9; i++)
        box(
          0.08,
          wingH * 0.9,
          0.025,
          '#b6c1c0',
          side * (w / 2 - 0.055),
          wingH * 0.46,
          -d * 0.46 + i * d * 0.078,
        );

    const tx = w * 0.265,
      tw = w * 0.06,
      th = h * 0.79;
    box(
      tw,
      th,
      d * 0.093,
      glass,
      tx,
      th / 2,
      -d * 0.449,
      'planeta:rear-glass-tower',
    );
    // Glazing on the exterior face remains visible down to the separate entrance.
    box(
      w * 0.15,
      wingH * 0.79,
      0.15,
      glass,
      tx,
      wingH * 0.395,
      back - 0.005,
      'planeta:rear-entrance',
    );
    for (let i = 0; i <= 4; i++)
      box(
        0.075,
        th,
        0.1,
        frame,
        tx - tw / 2 + (tw * i) / 4,
        th / 2,
        -d * 0.497,
      );
    for (let i = 0; i <= 9; i++)
      box(tw, 0.075, 0.1, frame, tx, (th * i) / 9, -d * 0.497);
    for (let i = 0; i < 3; i++)
      box(
        tw + 0.22,
        h * 0.022,
        d * 0.093 + 0.22,
        colors[i],
        tx,
        th - i * h * 0.025,
        -d * 0.449,
      );
    for (let level = 0; level < 3; level++) {
      const y1 = th * (0.1 + level * 0.27),
        y2 = y1 + th * 0.25;
      rod([tx - tw / 2, y1, -d * 0.497], [tx + tw / 2, y2, -d * 0.497], frame);
      rod([tx + tw / 2, y1, -d * 0.497], [tx - tw / 2, y2, -d * 0.497], frame);
    }
    for (let i = 0; i <= 9; i++)
      box(
        0.08,
        wingH * 0.79,
        0.11,
        frame,
        tx + w * 0.15 * (i / 9 - 0.5),
        wingH * 0.395,
        back - 0.025,
      );
    box(w * 0.16, 0.18, 0.75, white, tx, wingH * 0.83, -d * 0.49 + 0.4);

    // Tall white cinema/service volumes, with only the sparse small windows visible in the photographs.
    for (const [x, bw, bh, z, bd] of [
      [-w * 0.14, w * 0.14, h * 0.24, -d * 0.365, d * 0.26],
      [w * 0.095, w * 0.105, h * 0.2, -d * 0.355, d * 0.24],
    ]) {
      box(
        bw,
        bh,
        bd,
        white,
        x,
        wingH + bh / 2,
        z,
        'planeta:raised-white-block',
      );
      box(bw - 0.35, 0.07, bd - 0.35, '#56616a', x, wingH + bh + 0.05, z);
      for (let i = 0; i < 3; i++)
        box(
          0.7,
          0.6,
          0.1,
          glass,
          x + bw * (i / 3 - 0.33),
          wingH + bh * (0.32 + (i % 2) * 0.29),
          z - bd / 2 - 0.055,
        );
    }
    // Rows of pitched rooflights, distinct from the two pyramids at the front.
    for (const x of [-w * 0.395, -w * 0.275, w * 0.015]) {
      const bw = w * 0.075,
        rise = h * 0.075,
        length = d * 0.29,
        z = -d * 0.255;
      const shape = new THREE.Shape();
      shape.moveTo(-bw / 2, 0);
      shape.lineTo(0, rise);
      shape.lineTo(bw / 2, 0);
      shape.closePath();
      const roof = kit.mesh(
        new THREE.ExtrudeGeometry(shape, {
          depth: length,
          bevelEnabled: false,
        }),
        kit.material(glass, 0.32, 0.25),
        g,
      );
      roof.position.set(x, wingH + 0.2, z - length / 2);
      roof.name = 'planeta:pitched-rooflight';
      for (let i = 0; i <= 7; i++) {
        const rz = z - length / 2 + (length * i) / 7;
        rod([x - bw / 2, wingH + 0.2, rz], [x, wingH + rise + 0.2, rz]);
        rod([x, wingH + rise + 0.2, rz], [x + bw / 2, wingH + 0.2, rz]);
      }
    }
    // Aerials show a real flat canopy roof, with a strip skylight, above the open portal.
    box(
      w * 0.334,
      0.17,
      d * 0.21,
      '#56616a',
      0,
      h - 0.18,
      d * 0.34,
      'planeta:portal-roof',
    );
    box(w * 0.075, 0.09, d * 0.15, frame, 0, h - 0.04, d * 0.34);
    for (let i = 0; i <= 6; i++)
      box(w * 0.075, 0.055, 0.06, white, 0, h + 0.035, d * (0.265 + i * 0.025));
  } else if (b.kind === 'komsomoll') {
    const blue = '#186586',
      roofColor = '#9eaeb0';
    // Alta+ aerials show blue stair/service volumes along the sides and rear,
    // white low front wings, and a shallow barrel roof over the central hall.
    for (const side of [-1, 1]) {
      box(
        0.15,
        h * 0.68,
        d * 0.62,
        blue,
        side * (w / 2 - 0.09),
        h * 0.34,
        -d * 0.17,
        'komsomoll:blue-side',
      );
      box(
        w * 0.19,
        0.15,
        d * 0.83,
        '#b4afa2',
        side * w * 0.394,
        h * 0.684,
        -d * 0.065,
      );
      for (const z of [-d * 0.325, -d * 0.11]) {
        box(
          w * 0.075,
          h * 0.79,
          d * 0.085,
          blue,
          side * w * 0.46,
          h * 0.395,
          z,
          'komsomoll:blue-stair-tower',
        );
        box(w * 0.075, 0.13, d * 0.085, white, side * w * 0.46, h * 0.79, z);
        const faceX = side * (w / 2 - 0.09);
        box(
          0.065,
          h * 0.64,
          d * 0.09,
          glass,
          faceX,
          h * 0.32,
          z + d * 0.085,
          'komsomoll:side-glazing',
        );
        for (let i = 0; i <= 8; i++)
          box(
            0.075,
            0.075,
            d * 0.09,
            frame,
            faceX + side * 0.02,
            (h * 0.64 * i) / 8,
            z + d * 0.085,
          );
        for (const offset of [-0.04, 0, 0.04])
          box(
            0.075,
            h * 0.64,
            0.075,
            frame,
            faceX + side * 0.02,
            h * 0.32,
            z + d * (0.085 + offset),
          );
      }
    }
    box(w - 0.4, h * 0.085, 0.18, white, 0, h * 0.64, -d / 2 + 0.1);
    for (const x of [-w * 0.405, w * 0.39]) {
      box(w * 0.09, h * 0.81, d * 0.09, blue, x, h * 0.405, -d * 0.449);
      box(w * 0.09, 0.16, d * 0.09, white, x, h * 0.81, -d * 0.449);
    }
    const half = w * 0.245,
      rise = h * 0.085,
      length = d * 0.67,
      roofY = h * 0.852;
    const roofShape = new THREE.Shape();
    for (let i = 0; i <= 24; i++) {
      const a = (Math.PI * i) / 24,
        x = half * Math.cos(a),
        y = rise * Math.sin(a);
      if (!i) roofShape.moveTo(x, y);
      else roofShape.lineTo(x, y);
    }
    roofShape.closePath();
    const roof = kit.mesh(
      new THREE.ExtrudeGeometry(roofShape, {
        depth: length,
        bevelEnabled: false,
      }),
      kit.material(roofColor),
      g,
    );
    roof.name = 'komsomoll:curved-central-roof';
    roof.position.set(-w * 0.04, roofY, -d * 0.465);
    for (let i = 1; i < 10; i++) {
      const angle = (Math.PI * i) / 10;
      box(
        0.05,
        0.04,
        length,
        '#b6c1c0',
        -w * 0.04 + half * Math.cos(angle),
        roofY + rise * Math.sin(angle) + 0.025,
        -d * 0.13,
      );
    }
    for (const side of [-1, 1]) {
      box(w * 0.19, 0.22, 0.2, white, side * w * 0.394, h * 0.698, -d * 0.478);
      box(0.2, 0.22, d * 0.83, white, side * w * 0.489, h * 0.698, -d * 0.065);
      for (let i = 0; i < 3; i++) {
        const x = side * w * 0.375,
          z = -d * (0.16 + i * 0.1);
        box(
          w * 0.035,
          h * 0.045,
          d * 0.048,
          white,
          x,
          h * 0.708,
          z,
          'komsomoll:roof-equipment',
        );
        box(w * 0.03, 0.06, d * 0.04, roofColor, x, h * 0.733, z);
      }
    }
  } else if (b.kind === 'kubatura') {
    // The cinema-side photograph and the owner's corner photograph show a long,
    // projecting glazed gallery with an orange lower edge and white brackets.
    const sideX = w / 2 - 0.09,
      galleryZ = -d * 0.12,
      galleryD = d * 0.59;
    box(
      0.8,
      h * 0.13,
      galleryD,
      glass,
      sideX - 0.33,
      h * 0.625,
      galleryZ,
      'kubatura:side-gallery',
    );
    box(
      0.92,
      h * 0.026,
      galleryD + 0.08,
      orange,
      sideX - 0.38,
      h * 0.545,
      galleryZ,
    );
    box(0.87, 0.15, galleryD + 0.08, white, sideX - 0.35, h * 0.702, galleryZ);
    for (let i = 0; i <= 17; i++)
      box(
        0.08,
        h * 0.13,
        0.055,
        frame,
        sideX + 0.038,
        h * 0.625,
        galleryZ - galleryD / 2 + (galleryD * i) / 17,
      );
    box(0.085, 0.055, galleryD, frame, sideX + 0.036, h * 0.625, galleryZ);
    for (let i = 0; i < 7; i++) {
      const z = galleryZ + galleryD * (i / 6 - 0.5);
      rod(
        [w / 2 - 0.68, h * 0.43, z],
        [w / 2 - 0.11, h * 0.535, z],
        white,
        0.1,
      );
    }
    // Sparse cinema/service windows, unlike a residential regular window grid.
    for (const [z, y] of [
      [-0.33, 0.78],
      [-0.2, 0.78],
      [-0.06, 0.77],
      [-0.33, 0.34],
      [-0.12, 0.32],
      [0.06, 0.32],
    ]) {
      box(0.085, h * 0.034, d * 0.051, frame, w / 2 - 0.553, y * h, z * d);
      box(0.07, h * 0.025, d * 0.039, glass, w / 2 - 0.49, y * h, z * d);
    }
    for (const side of [-1, 1]) {
      for (let i = 1; i < 6; i++)
        box(
          0.05,
          0.04,
          d * 0.75,
          '#b6c1c0',
          side * (w / 2 - 0.58),
          h * i * 0.145,
          -d * 0.115,
        );
      box(
        0.22,
        0.23,
        d * 0.75,
        white,
        side * (w / 2 - 0.13),
        h * 0.876,
        -d * 0.115,
      );
    }
    box(w - 0.5, 0.23, 0.22, white, 0, h * 0.876, -d / 2 + 0.13);
    // The rounded front corners have open horizontal crowns, visible on the older
    // all-building photograph; no invented loading-door layout on the unseen rear.
    for (const [bayX, bayW, bulge] of [
      [-w * 0.398, w * 0.15, d * 0.1],
      [w * 0.355, w * 0.25, d * 0.17],
    ]) {
      for (let i = 0; i < 16; i++) {
        const a = i / 16,
          c = (i + 1) / 16;
        for (const y of [h * 0.94, h * 0.982])
          rod(
            [
              bayX + (a - 0.5) * bayW,
              y,
              d * 0.27 + bulge * Math.sin(a * Math.PI),
            ],
            [
              bayX + (c - 0.5) * bayW,
              y,
              d * 0.27 + bulge * Math.sin(c * Math.PI),
            ],
            orange,
            0.06,
          );
        if (i % 2 === 0)
          box(
            0.065,
            h * 0.065,
            0.065,
            orange,
            bayX + (a - 0.5) * bayW,
            h * 0.951,
            d * 0.27 + bulge * Math.sin(a * Math.PI),
          );
      }
    }
  }
}

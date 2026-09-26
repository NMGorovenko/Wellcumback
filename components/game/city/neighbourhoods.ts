import { partitionCityInstances } from './spatial-batches.ts';
import { cityPlanting } from '../../../lib/game/city/trees.ts';
import * as THREE from 'three';
import type { CityBuilding } from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import type { CityLodRange, CityLodTier } from './lod.ts';

type HousingStyle = NonNullable<CityBuilding['style']>;
type Point = [number, number, number];
const styles: HousingStyle[] = ['heritage', 'panel', 'tower', 'cottage'];
const materials = new WeakMap<RenderKit, THREE.MeshStandardMaterial>();
const SOLID = 12;
// Ochre masonry, weathered concrete and muted painted panels from the city refs.
// Vertex colours keep these neighbourhood variations on the same atlas/material.
const facadePalette: Record<HousingStyle, readonly string[]> = {
  heritage: ['#d9b8b3', '#e2d2ad', '#cebc96', '#d9ccad', '#c59b7a', '#bcbac0'],
  panel: ['#d0d0c5', '#c4c7c6', '#cbd0c3', '#c5c3ba', '#d2cec0', '#aebdc4'],
  tower: ['#d8d9ce', '#becbd0', '#c9cbd1', '#cfa080', '#b7cbd4', '#d6c2a8'],
  cottage: ['#a78c68', '#8e9c7d', '#aa8265', '#9b9485', '#b39870', '#8d9e98'],
};

/** One locally drawn atlas per scene, not one texture or mesh per window. */
function housingMaterial(kit: RenderKit) {
  const cached = materials.get(kit);
  if (cached) return cached;
  const canvas =
    typeof document === 'undefined' ? null : document.createElement('canvas');
  const ctx = canvas?.getContext('2d');
  let map: THREE.Texture | undefined;
  if (canvas && ctx) {
    canvas.width = canvas.height = 1024;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1024, 1024);
    for (let tile = 0; tile < 16; tile++) {
      if (tile === SOLID) continue;
      const x = (tile % 4) * 256,
        y = Math.floor(tile / 4) * 256;
      const style = styles[Math.floor(tile / 3)],
        variant = tile % 3;
      const rect = (
        color: string,
        px: number,
        py: number,
        w: number,
        h: number,
      ) => {
        ctx.fillStyle = color;
        ctx.fillRect(x + px, y + py, w, h);
      };
      if (tile > SOLID) {
        // Entrance bays: rusticated storefront, modest stairwell, glazed lobby.
        const modern = tile === 15;
        rect('#a8a6a0', 0, 205, 256, 51);
        rect(modern ? '#d6dbd9' : '#d3cbbb', 65, 58, 126, 176);
        rect('#374749', 77, 69, 102, 165);
        rect('#768d90', 86, 80, 38, modern ? 135 : 76);
        rect('#688085', 131, 80, 37, modern ? 135 : 76);
        rect('#e6debb', 170, 161, 5, 14);
        rect('#666c6b', 54, 48, 148, 13);
        continue;
      }
      if (style === 'panel') {
        rect('#b6b4aa', 0, 0, 256, 4);
        rect('#c8c6bc', 0, 0, 3, 256);
        rect('#e2dfd5', 5, 5, 246, 8);
        if (variant === 2)
          for (let row = 0; row < 24; row++) {
            rect('#c1b7a4', 0, row * 11, 256, 1);
            for (let col = 0; col < 8; col++)
              rect('#c1b7a4', col * 36 + (row % 2) * 18, row * 11, 1, 11);
          }
      } else if (
        style === 'cottage' ||
        (style === 'heritage' && variant === 2)
      ) {
        for (let row = 0; row < 16; row++) {
          rect('#d0c7ba', 0, row * 16, 256, 2);
          if (style === 'heritage')
            for (let col = 0; col < 5; col++)
              rect('#d0c7ba', col * 64 + (row % 2) * 32, row * 16, 2, 16);
        }
      }
      const tall = style === 'heritage',
        glazed = style === 'tower' && variant === 1;
      const wx = glazed ? 28 : style === 'panel' && variant === 1 ? 42 : 63,
        ww = glazed ? 200 : style === 'panel' && variant === 1 ? 172 : 130;
      const wy = tall ? 40 : 53,
        wh = tall ? 168 : 143;
      rect(tall ? '#f8f2df' : '#e8e8df', wx - 9, wy - 8, ww + 18, wh + 16);
      rect(variant === 2 ? '#6a787b' : '#536a73', wx, wy, ww, wh);
      rect('#8b9fa4', wx + 5, wy + 4, ww * 0.4, wh * 0.45);
      rect('#cbd4d0', wx + ww * 0.47, wy, 6, wh);
      rect('#cbd4d0', wx, wy + wh * 0.43, ww, 5);
      if (variant === 2 && style !== 'heritage') {
        rect('#89938c', wx - 15, 180, ww + 30, 44);
        rect('#d9d9cb', wx - 19, 176, ww + 38, 7);
        for (let rail = 0; rail < 5; rail++)
          rect('#d0d1c5', wx - 10 + rail * 34, 184, 3, 38);
      }
      if (tall) {
        rect('#f2e9d2', wx - 15, wy - 16, ww + 30, 10);
        rect('#bab5a9', wx - 12, wy + wh + 9, ww + 24, 5);
        if (variant === 0) {
          rect('#f6eee1', wx - 21, wy - 18, 12, wh + 33);
          rect('#f6eee1', wx + ww + 9, wy - 18, 12, wh + 33);
        }
      }
      if (style === 'cottage') {
        rect('#729399', wx - 25, wy - 8, 14, wh + 16);
        rect('#729399', wx + ww + 11, wy - 8, 14, wh + 16);
      }
    }
    map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    kit.textures.add(map);
  }
  const material = new THREE.MeshStandardMaterial({
    ...(map ? { map } : {}),
    vertexColors: true,
    roughness: 0.88,
  });
  kit.materials.add(material);
  materials.set(kit, material);
  return material;
}

/** Merge the complete house into one draw call, including its balcony volumes. */
function houseGeometry(roofHeight: number) {
  const positions: number[] = [],
    normals: number[] = [],
    uv: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const colorCache = new Map<string, THREE.Color>();
  const lodRanges: CityLodRange[] = [];
  let tier: CityLodTier = 'house-detail';
  const silhouette = (draw: () => void) => {
    const previous = tier;
    tier = 'silhouette';
    draw();
    tier = previous;
  };
  const first = new THREE.Vector3(),
    second = new THREE.Vector3();
  function face(points: Point[], color: string, tile = SOLID) {
    const offset = positions.length / 3;
    first.set(
      points[1][0] - points[0][0],
      points[1][1] - points[0][1],
      points[1][2] - points[0][2],
    );
    second.set(
      points[2][0] - points[0][0],
      points[2][1] - points[0][1],
      points[2][2] - points[0][2],
    );
    first.cross(second).normalize();
    let tint = colorCache.get(color);
    if (!tint) {
      tint = new THREE.Color(color);
      colorCache.set(color, tint);
    }
    // Half-texel inset keeps neighbouring atlas cells out of the window frames.
    const u = (tile % 4) / 4,
      v = 1 - (Math.floor(tile / 4) + 1) / 4,
      inset = 1 / 1024;
    const coords = [
      [u + inset, v + inset],
      [u + 0.25 - inset, v + inset],
      [u + 0.25 - inset, v + 0.25 - inset],
      [u + inset, v + 0.25 - inset],
    ];
    points.forEach((p, i) => {
      positions.push(...p);
      normals.push(first.x, first.y, first.z);
      colors.push(tint.r, tint.g, tint.b);
      uv.push(...coords[i]);
    });
    const start = indices.length;
    indices.push(offset, offset + 1, offset + 2);
    if (points.length === 4) indices.push(offset, offset + 2, offset + 3);
    const previous = lodRanges.at(-1);
    if (previous?.tier === tier) previous.count += indices.length - start;
    else lodRanges.push({ start, count: indices.length - start, tier });
  }
  function wall(
    origin: Point,
    right: Point,
    width: number,
    height: number,
    color: string,
    tile = SOLID,
    columns = 1,
    floors = 1,
    entrances = false,
  ) {
    const point = (across: number, up: number): Point => [
      origin[0] + right[0] * across,
      origin[1] + up,
      origin[2] + right[2] * across,
    ];
    for (let floor = 0; floor < floors; floor++)
      for (let col = 0; col < columns; col++) {
        const x = (width * col) / columns,
          y = (height * floor) / floors,
          dx = width / columns,
          dy = height / floors;
        const entry = entrances && floor === 0 && col % 4 === 1;
        face(
          [
            point(x, y),
            point(x + dx, y),
            point(x + dx, y + dy),
            point(x, y + dy),
          ],
          color,
          entry ? (tile >= 9 ? 14 : 13 + Math.floor(tile / 3)) : tile,
        );
      }
  }
  function box(
    w: number,
    h: number,
    d: number,
    color: string,
    x: number,
    y: number,
    z: number,
    tile = SOLID,
    detail = true,
    frontEntries = false,
    endColor = color,
    explicitFloors?: number,
    leftCoveredHeight = 0,
    rightCoveredHeight = 0,
    endTile = tile,
  ) {
    const previousTier = tier;
    // Roof caps, chimneys and equipment belong to the distant outline too.
    if (y - h / 2 >= roofHeight - 0.15) tier = 'silhouette';
    const left = x - w / 2,
      right = x + w / 2,
      back = z - d / 2,
      front = z + d / 2,
      bottom = y - h / 2,
      top = y + h / 2;
    const columns = (span: number) =>
      tile === SOLID
        ? 1
        : Math.max(1, Math.min(detail ? 22 : 14, Math.round(span / 2.65)));
    const floorHeight = [2.8, 2.7, 2.7, 2.6][Math.floor(tile / 3)] || 2.95;
    const floors =
      tile === SOLID
        ? 1
        : Math.max(
            1,
            Math.min(32, explicitFloors ?? Math.round(h / floorHeight)),
          );
    wall(
      [left, bottom, front],
      [1, 0, 0],
      w,
      h,
      color,
      tile,
      columns(w),
      floors,
      frontEntries,
    );
    wall(
      [right, bottom, back],
      [-1, 0, 0],
      w,
      h,
      color,
      tile,
      columns(w),
      floors,
    );
    // Adjacent slab sections hide their common walls. Keep only an exposed
    // upper strip at a height step, instead of drawing every hidden window.
    for (const side of [-1, 1]) {
      const covered = Math.max(
        0,
        Math.min(h, side < 0 ? leftCoveredHeight : rightCoveredHeight),
      );
      if (covered >= h) continue;
      wall(
        side < 0
          ? [left, bottom + covered, back]
          : [right, bottom + covered, front],
        side < 0 ? [0, 0, 1] : [0, 0, -1],
        d,
        h - covered,
        endColor,
        endTile,
        endTile === SOLID ? 1 : columns(d),
        endTile === SOLID
          ? 1
          : Math.max(1, Math.round((floors * (h - covered)) / h)),
      );
    }
    face(
      [
        [left, top, front],
        [right, top, front],
        [right, top, back],
        [left, top, back],
      ],
      color,
    );
    face(
      [
        [left, bottom, back],
        [right, bottom, back],
        [right, bottom, front],
        [left, bottom, front],
      ],
      color,
    );
    tier = previousTier;
  }
  function gable(w: number, d: number, y: number, rise: number, color: string) {
    const a: Point = [-w / 2, y, -d / 2],
      b: Point = [w / 2, y, -d / 2],
      c: Point = [0, y + rise, -d / 2];
    const d1: Point = [-w / 2, y, d / 2],
      e: Point = [w / 2, y, d / 2],
      f: Point = [0, y + rise, d / 2];
    silhouette(() => {
      face([a, c, b], color);
      face([d1, e, f], color);
      face([a, d1, f, c], color);
      face([b, c, f, e], color);
    });
  }
  function finish() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(normals, 3),
    );
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.userData.cityLodRanges = lodRanges;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
  return { box, gable, finish, silhouette };
}

/** Krasnoyarsk street types: Mira masonry, Soviet slabs, Vzletka towers, timber outskirts. */
export function createNeighbourhoodBuilding(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
  index: number,
) {
  if (b.kind || !b.style) return false;
  const low = 'lowDetail' in b && b.lowDetail === true;
  const seed = Math.abs(
    index * 13 + Math.floor(b.x / 35) + Math.floor(b.z / 37),
  );
  const variant =
      Math.abs(index + Math.floor(b.x / 57) + Math.floor(b.z / 73)) % 4,
    style = styles.indexOf(b.style),
    tile = style * 3 + (variant % 3);
  const g = houseGeometry(b.h),
    { box } = g;
  // Recess the walls so that balconies and entrance canopies remain in the parcel.
  const turned = b.orientation === 'north-south';
  // The Mira balcony slabs project 0.36m beyond their wall. A 0.40m inset
  // leaves their rails inside collision bounds, including rotated parcels.
  const depthInset = b.style === 'heritage' && low ? 0.8 : 0.6;
  const w = Math.max(1, (turned ? b.d : b.w) - 0.5),
    d = Math.max(1, (turned ? b.w : b.d) - depthInset),
    h = b.h;
  const facade =
      b.style === 'panel' && variant === 2
        ? '#b28b73'
        : facadePalette[b.style][seed % facadePalette[b.style].length],
    end = ['#797c72', '#977764', '#778887', '#87847a'][variant];
  const trim = '#e7dfc9',
    roof = ['#647574', '#766a60', '#57676d', '#75645c'][variant];
  const accent =
    b.style === 'tower'
      ? ['#728b91', '#aa7760', '#b2a489', '#6e8280'][variant]
      : '#a2917e';
  const body = (
    bw: number,
    bh: number,
    bd: number,
    x = 0,
    z = 0,
    tint = facade,
    leftCoveredHeight = 0,
    rightCoveredHeight = 0,
  ) =>
    g.silhouette(() =>
      box(
        bw,
        bh,
        bd,
        tint,
        x,
        bh / 2,
        z,
        tile,
        !low,
        true,
        b.style === 'panel' || b.style === 'tower' ? end : tint,
        b.floors ? Math.max(1, Math.round((b.floors * bh) / h)) : undefined,
        leftCoveredHeight,
        rightCoveredHeight,
        b.style === 'panel' ? SOLID : tile,
      ),
    );
  const cornice = (y: number, thickness = 0.22) =>
    box(w + 0.28, thickness, d + 0.28, trim, 0, y, 0);
  if (b.style === 'heritage') {
    body(w, h, d);
    box(
      w + 0.04,
      Math.min(0.75, h * 0.1),
      d + 0.04,
      '#928a7e',
      0,
      Math.min(0.75, h * 0.1) / 2,
      0,
    );
    cornice(h - 0.18, 0.28);
    cornice(Math.min(3.1, h * 0.32), 0.15);
    // Mira's five-storey masonry reads through pale pilasters, a darker shop
    // floor and individual projecting balconies, even in the merged distant mesh.
    if (low) {
      const shopHeight = Math.min(2.8, h * 0.27);
      const bays = Math.max(2, Math.min(10, Math.round(w / 5.5)));
      for (let bay = 0; bay < bays; bay++) {
        const bx = -w / 2 + (w / bays) * (bay + 0.5);
        box(
          w / bays - 0.16,
          shopHeight,
          0.14,
          variant === 0 ? '#9e6963' : '#8c8477',
          bx,
          shopHeight / 2,
          d / 2 + 0.02,
        );
        box(
          (w / bays) * 0.69,
          shopHeight * 0.67,
          0.05,
          '#45606a',
          bx,
          shopHeight * 0.43,
          d / 2 + 0.12,
        );
        box(
          (w / bays) * 0.75,
          0.28,
          0.19,
          ['#574951', '#6f7a68', '#8b5345', '#485b65'][bay % 4],
          bx,
          shopHeight - 0.34,
          d / 2 + 0.16,
        );
      }
      for (const px of [-w / 2 + 0.26, -w * 0.15, w * 0.15, w / 2 - 0.26]) {
        box(
          0.36,
          h - shopHeight,
          0.18,
          trim,
          px,
          (h + shopHeight) / 2,
          d / 2 + 0.1,
        );
        box(0.65, 0.32, 0.24, trim, px, h - 0.45, d / 2 + 0.13);
      }
      const floors = b.floors ?? Math.round(h / 2.8);
      for (let floor = 1; floor < floors; floor++)
        for (const side of [-1, 1]) {
          if ((floor + variant) % 3 === 0 && side > 0) continue;
          const bx = side * w * 0.3,
            y = (floor * h) / floors + 0.13;
          const bw = Math.min(2.5, w * 0.15);
          box(bw, 0.18, 0.8, trim, bx, y, d / 2 - 0.04);
          box(bw, 0.13, 0.12, trim, bx, y + 0.8, d / 2 + 0.29);
          for (const rail of [-0.4, 0, 0.4])
            box(
              0.11,
              0.68,
              0.1,
              variant === 0 ? trim : '#60696a',
              bx + bw * rail,
              y + 0.45,
              d / 2 + 0.29,
            );
        }
    }
    if (variant === 0 || variant === 2)
      g.gable(w + 0.22, d + 0.22, h, Math.min(1.8, w * 0.11), roof);
    else {
      box(w + 0.2, 0.32, d + 0.2, roof, 0, h + 0.1, 0);
      box(w * 0.3, 0.65, d * 0.42, facade, 0, h + 0.35, 0);
      box(w * 0.33, 0.18, d * 0.45, trim, 0, h + 0.73, 0);
    }
    if (!low) {
      for (const side of [-1, 1]) {
        for (const x of [-w / 2 + 0.18, 0, w / 2 - 0.18])
          box(
            0.28,
            h - 0.3,
            0.12,
            trim,
            x,
            (h - 0.3) / 2,
            side * (d / 2 + 0.04),
          );
        for (const x of [-w * 0.28, w * 0.28]) {
          box(
            Math.min(2.2, w * 0.2),
            0.16,
            0.42,
            trim,
            x,
            h * 0.52,
            (side * d) / 2,
          );
          box(
            Math.min(2.2, w * 0.2),
            0.45,
            0.06,
            '#69716b',
            x,
            h * 0.52 + 0.26,
            side * (d / 2 + 0.2),
          );
        }
      }
      box(1.8, 0.17, 0.65, roof, 0, Math.min(2.3, h * 0.4), d / 2 - 0.03);
    }
  } else if (b.style === 'panel') {
    // Long five-/nine-storey slabs, with modest flat roofs and repeated stairwells.
    const sections = Math.max(1, Math.min(5, Math.round(w / 12)));
    for (let section = 0; section < sections; section++) {
      const sw = w / sections,
        x = -w / 2 + sw * (section + 0.5);
      const sh =
        h * ((variant === 2 || variant === 3) && section % 2 ? 0.78 : 1);
      const sectionTint =
        variant === 1 && section % 2
          ? facadePalette.panel[(seed + 2) % facadePalette.panel.length]
          : facade;
      const sectionHeight = (i: number) =>
        h * ((variant === 2 || variant === 3) && i % 2 ? 0.78 : 1);
      body(
        sw,
        sh,
        d,
        x,
        0,
        sectionTint,
        section > 0 ? sectionHeight(section - 1) : 0,
        section < sections - 1 ? sectionHeight(section + 1) : 0,
      );
      // Shared-height sections meet at an edge; overlapping coplanar caps shimmer.
      box(sw, 0.2, d + 0.15, roof, x, sh + 0.05, 0);
      if (low) {
        box(1.6, 0.14, 0.52, roof, x, 1.9, d / 2 - 0.04);
        for (const side of [-1, 1])
          box(
            Math.min(2.1, sw * 0.24),
            Math.max(0.8, sh - 2.3),
            0.3,
            variant === 1 ? '#a1aaa1' : '#b6b39c',
            x - sw * 0.25,
            (sh + 2.3) / 2 - 0.1,
            side * (d / 2 + 0.02),
            5,
            false,
          );
        // Visible stairwell and mismatched balcony enclosures distinguish the
        // concrete Akadem slabs from the red-brick late-Soviet blocks.
        box(
          0.5,
          sh - 0.5,
          0.13,
          variant === 2 ? '#dfd9cb' : '#8e9e9d',
          x + sw * 0.27,
          (sh - 0.5) / 2,
          d / 2 + 0.05,
        );
        const floors = Math.max(
          2,
          Math.round(((b.floors ?? h / 2.7) * sh) / h),
        );
        for (let floor = 1; floor < floors; floor++) {
          const y = (floor * sh) / floors;
          const bx = x - sw * 0.25;
          const bw = Math.min(2.1, sw * 0.24);
          box(bw + 0.1, 0.12, 0.55, '#e1ded3', bx, y, d / 2 - 0.01);
          if ((floor + section + seed) % 4 === 0)
            box(bw, 0.74, 0.12, '#838e83', bx, y + 0.43, d / 2 + 0.2);
        }
      }
      if (!low) {
        box(0.65, sh - 0.4, 0.1, accent, x, (sh - 0.4) / 2, d / 2 + 0.03);
        box(1.8, 0.16, 0.62, roof, x, 2.1, d / 2 - 0.04);
        for (const side of [-1, 1])
          for (const offset of [-0.26, 0.26]) {
            const bx = x + sw * offset,
              bw = Math.min(2.15, sw * 0.22);
            // Glazed loggia stacks are a single shallow volume; texture carries each floor.
            box(
              bw,
              Math.max(0.8, sh - 3),
              0.34,
              variant === 2 ? '#b4c4c2' : '#c3c0ad',
              bx,
              (sh + 3) / 2 - 0.15,
              side * (d / 2 + 0.02),
              4,
              true,
            );
          }
      }
    }
  } else if (b.style === 'tower') {
    // Vzletka: an offset high section, lower wing and continuous glazed balcony columns.
    const stepped = variant === 1 || variant === 3;
    if (stepped) {
      body(w * 0.63, h, d, -w * 0.185);
      body(w * 0.37, h * 0.73, d * 0.9, w * 0.315, d * 0.05, '#b4b9a9');
      box(w * 0.38, 0.28, d * 0.92, trim, w * 0.315, h * 0.73 + 0.08, d * 0.05);
    } else body(w, h, d);
    box(
      stepped ? w * 0.64 : w + 0.1,
      0.3,
      d + 0.12,
      trim,
      stepped ? -w * 0.185 : 0,
      h + 0.1,
      0,
    );
    box(w * 0.24, 0.85, d * 0.34, roof, -w * 0.18, h + 0.5, 0);
    if (low)
      for (const side of [-1, 1]) {
        box(
          w * 0.16,
          h - 0.7,
          0.25,
          '#b8cbcc',
          -w * 0.32,
          (h - 0.7) / 2,
          side * (d / 2 + 0.08),
          7,
          false,
        );
        box(
          w * 0.07,
          h - 0.3,
          0.1,
          accent,
          w * 0.035,
          (h - 0.3) / 2,
          side * (d / 2 + 0.02),
        );
        if (variant === 0 || variant === 2)
          for (let floor = 2; floor < (b.floors ?? 18); floor += 3)
            box(
              w * 0.96,
              0.24,
              0.18,
              variant === 0 ? '#66828e' : '#eee8d9',
              0,
              (floor * h) / (b.floors ?? 18),
              side * (d / 2 + 0.05),
            );
      }
    if (!low)
      for (const side of [-1, 1]) {
        for (const x of [-w * 0.34, w * 0.08]) {
          box(
            w * 0.14,
            h - 0.7,
            0.16,
            accent,
            x,
            (h - 0.7) / 2,
            side * (d / 2 + 0.03),
          );
          box(
            w * 0.13,
            Math.max(1, h - 3),
            0.25,
            '#d9e2dc',
            x,
            (h + 3) / 2 - 0.2,
            side * (d / 2 + 0.12),
            7,
            true,
          );
        }
        box(
          Math.min(3.4, w * 0.35),
          0.2,
          0.62,
          roof,
          -w * 0.16,
          2.5,
          side * (d / 2 - 0.03),
        );
      }
  } else {
    // Low timber/brick houses have steep roofs, coloured architraves and a chimney.
    body(w, h, d);
    g.gable(w + 0.28, d + 0.28, h, Math.min(2.8, w * 0.27), roof);
    box(0.55, 1.25, 0.55, '#ae9781', w * 0.24, h + 1.1, -d * 0.14);
    if (!low) {
      cornice(h - 0.1, 0.16);
      box(
        Math.min(2.1, w * 0.5),
        0.15,
        0.6,
        roof,
        0,
        Math.min(2.3, h * 0.75),
        d / 2 - 0.02,
      );
      box(Math.min(2.2, w * 0.5), 0.2, 0.62, '#8e8e80', 0, 0.1, d / 2 - 0.02);
    }
  }
  const mesh = kit.mesh(g.finish(), housingMaterial(kit), root);
  mesh.name = `housing-${b.style}-${variant}${low ? '-distant' : ''}`;
  mesh.position.set(b.x, 0, b.z);
  if (turned) mesh.rotation.y = Math.PI / 2;
  mesh.userData.floors = b.floors;
  mesh.userData.district = b.district;
  mesh.castShadow = !low;
  return true;
}

export function createNeighbourhoodGreenery(kit: RenderKit, root: THREE.Group) {
  const { points, lawns } = cityPlanting;
  if (!points.length) return;
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.19, 2.3, 5);
  const pineGeo = new THREE.ConeGeometry(1.25, 3.7, 6);
  const birchGeo = new THREE.IcosahedronGeometry(1.3, 0);
  [trunkGeo, pineGeo, birchGeo].forEach((g) => kit.geometries.add(g));
  const trunks = new THREE.InstancedMesh(
    trunkGeo,
    kit.material('#8f927e'),
    points.length,
  );
  const pines = new THREE.InstancedMesh(
    pineGeo,
    kit.material('#50765b'),
    points.length,
  );
  const birches = new THREE.InstancedMesh(
    birchGeo,
    kit.material('#76935b'),
    points.length,
  );
  const transform = new THREE.Object3D(),
    counts = [0, 0];
  points.forEach((p, i) => {
    transform.position.set(p.x, p.scale * 1.15, p.z);
    transform.scale.setScalar(p.scale);
    transform.updateMatrix();
    trunks.setMatrixAt(i, transform.matrix);
    transform.position.y = p.scale * (p.pine ? 3 : 2.6);
    if (!p.pine) transform.scale.y *= 1.35;
    transform.updateMatrix();
    (p.pine ? pines : birches).setMatrixAt(
      counts[p.pine ? 0 : 1]++,
      transform.matrix,
    );
  });
  pines.count = counts[0];
  birches.count = counts[1];
  trunks.userData.cityTreeIndices = points.map((_, i) => i);
  pines.userData.cityTreeIndices = points.flatMap((p, i) =>
    p.pine ? [i] : [],
  );
  birches.userData.cityTreeIndices = points.flatMap((p, i) =>
    p.pine ? [] : [i],
  );
  trunks.name = 'neighbourhood-tree-trunks';
  pines.name = 'neighbourhood-pines';
  birches.name = 'neighbourhood-birches';
  for (const mesh of [trunks, pines, birches]) {
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
    partitionCityInstances(mesh);
  }
  if (lawns.length) {
    const geometry = new THREE.CircleGeometry(1, 12);
    geometry.rotateX(-Math.PI / 2);
    kit.geometries.add(geometry);
    const grass = new THREE.InstancedMesh(
      geometry,
      kit.material('#819566'),
      lawns.length,
    );
    grass.name = 'neighbourhood-courtyard-lawns';
    lawns.forEach((p, i) => {
      transform.position.set(p.x, 0.032, p.z);
      transform.scale.set(p.radius, 1, p.radius * 0.8);
      transform.rotation.y = (i % 7) * 0.43;
      transform.updateMatrix();
      grass.setMatrixAt(i, transform.matrix);
    });
    grass.receiveShadow = true;
    grass.computeBoundingSphere();
    root.add(grass);
    partitionCityInstances(grass);
  }
}

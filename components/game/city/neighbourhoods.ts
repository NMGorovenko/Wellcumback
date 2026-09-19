import * as THREE from 'three';
import {
  cityBuildings,
  cityRoads,
  distanceToRoad,
  inCityWater,
  CITY_BOUNDS,
  CITY_PARKING,
  type CityBuilding,
} from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';

type HousingStyle = NonNullable<CityBuilding['style']>;
type Point = [number, number, number];
const styles: HousingStyle[] = ['heritage', 'panel', 'tower', 'cottage'];
const materials = new WeakMap<RenderKit, THREE.MeshStandardMaterial>();
const SOLID = 12;
// Ochre masonry, weathered concrete and muted painted panels from the city refs.
// Vertex colours keep these neighbourhood variations on the same atlas/material.
const facadePalette: Record<HousingStyle, readonly string[]> = {
  heritage: ['#bc955d', '#b77c67', '#b6ac8f', '#c8ad77', '#ad917a', '#a88c85'],
  panel: ['#a79c80', '#b88470', '#95a392', '#a7a69c', '#b79a6b', '#9aabb1'],
  tower: ['#a77d66', '#9eaaa5', '#b69d76', '#a88876', '#98a3aa', '#b7ab93'],
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
      const wx = glazed ? 28 : 63,
        ww = glazed ? 200 : 130;
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
function houseGeometry() {
  const positions: number[] = [],
    normals: number[] = [],
    uv: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const colorCache = new Map<string, THREE.Color>();
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
    indices.push(offset, offset + 1, offset + 2);
    if (points.length === 4) indices.push(offset, offset + 2, offset + 3);
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
  ) {
    const left = x - w / 2,
      right = x + w / 2,
      back = z - d / 2,
      front = z + d / 2,
      bottom = y - h / 2,
      top = y + h / 2;
    const columns = (span: number) =>
      tile === SOLID
        ? 1
        : Math.max(1, Math.min(detail ? 22 : 10, Math.round(span / 2.65)));
    const floorHeight = [1.85, 1.65, 1.8, 2.5][Math.floor(tile / 3)] || 2.95;
    const floors =
      tile === SOLID
        ? 1
        : Math.max(1, Math.min(detail ? 32 : 18, Math.round(h / floorHeight)));
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
    wall(
      [right, bottom, front],
      [0, 0, -1],
      d,
      h,
      endColor,
      tile,
      columns(d),
      floors,
    );
    wall(
      [left, bottom, back],
      [0, 0, 1],
      d,
      h,
      endColor,
      tile,
      columns(d),
      floors,
    );
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
  }
  function gable(w: number, d: number, y: number, rise: number, color: string) {
    const a: Point = [-w / 2, y, -d / 2],
      b: Point = [w / 2, y, -d / 2],
      c: Point = [0, y + rise, -d / 2];
    const d1: Point = [-w / 2, y, d / 2],
      e: Point = [w / 2, y, d / 2],
      f: Point = [0, y + rise, d / 2];
    face([a, c, b], color);
    face([d1, e, f], color);
    face([a, d1, f, c], color);
    face([b, c, f, e], color);
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
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
  return { box, gable, finish };
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
  const g = houseGeometry(),
    { box } = g;
  // Recess the walls so that balconies and entrance canopies remain in the parcel.
  const w = Math.max(1, b.w - 0.5),
    d = Math.max(1, b.d - 0.6),
    h = b.h * (b.style === 'panel' ? [0.76, 1, 0.88, 0.96][variant] : 1);
  const facade = facadePalette[b.style][seed % facadePalette[b.style].length],
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
  ) =>
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
    );
  const cornice = (y: number, thickness = 0.22) =>
    box(w + 0.28, thickness, d + 0.28, trim, 0, y, 0);
  if (b.style === 'heritage') {
    body(w, h, d);
    box(
      w,
      Math.min(0.75, h * 0.1),
      d,
      '#928a7e',
      0,
      Math.min(0.75, h * 0.1) / 2,
      0,
    );
    cornice(h - 0.18, 0.28);
    cornice(Math.min(3.1, h * 0.32), 0.15);
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
      body(sw, sh, d, x, 0, sectionTint);
      box(sw + 0.04, 0.2, d + 0.15, roof, x, sh + 0.05, 0);
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
  mesh.castShadow = !low;
  return true;
}

export function createNeighbourhoodGreenery(kit: RenderKit, root: THREE.Group) {
  const points: { x: number; z: number; scale: number; pine: boolean }[] = [];
  const lawns: { x: number; z: number; radius: number }[] = [];
  const width = CITY_BOUNDS.maxX - CITY_BOUNDS.minX,
    depth = CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ;
  const obstacles = [...CITY_PARKING, ...cityBuildings];
  const waterDirections = Array.from({ length: 8 }, (_, i) => [
    Math.cos((i * Math.PI) / 4),
    Math.sin((i * Math.PI) / 4),
  ]);
  const clear = (x: number, z: number, radius: number) => {
    if (
      x - radius < CITY_BOUNDS.minX ||
      x + radius > CITY_BOUNDS.maxX ||
      z - radius < CITY_BOUNDS.minZ ||
      z + radius > CITY_BOUNDS.maxZ ||
      inCityWater(x, z, radius + 2) ||
      // The island predicate uses an exact outline, so also check its edges.
      waterDirections.some(([dx, dz]) =>
        inCityWater(x + dx * radius, z + dz * radius, 2),
      ) ||
      cityRoads.some(
        (r) => distanceToRoad(x, z, r) < r.width / 2 + radius + 2.5,
      )
    )
      return false;
    return !obstacles.some(
      (p) =>
        Math.abs(x - p.x) < p.w / 2 + radius + 1.2 &&
        Math.abs(z - p.z) < p.d / 2 + radius + 1.2,
    );
  };
  // Fixed budgets: the larger geography must not multiply draw calls or trees.
  // Neighbour-cell checks keep adjacent street groups from stacking canopies.
  const occupied = new Map<string, { x: number; z: number }[]>();
  const addTree = (x: number, z: number, n: number) => {
    if (points.length >= 2400) return;
    const scale = 1.04 + (n % 5) * 0.12;
    if (!clear(x, z, 1.35 * scale)) return;
    const cx = Math.floor(x / 5),
      cz = Math.floor(z / 5);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        if (
          occupied
            .get(`${cx + dx}/${cz + dz}`)
            ?.some((p) => Math.hypot(p.x - x, p.z - z) < 4.5)
        )
          return;
    const key = `${cx}/${cz}`,
      cell = occupied.get(key) ?? [];
    cell.push({ x, z });
    occupied.set(key, cell);
    points.push({ x, z, scale, pine: x < -2100 ? n % 3 !== 0 : n % 4 === 0 });
  };
  // Alternating roadside birch groups and deeper courtyard groves leave visible
  // gaps at entrances. A small meadow under a grove breaks up empty pale ground.
  cityRoads.forEach((r, ri) => {
    if (r.bridge) return;
    const dx = r.to.x - r.from.x,
      dz = r.to.z - r.from.z;
    const length = Math.hypot(dx, dz);
    if (length < 65) return;
    const tx = dx / length,
      tz = dz / length;
    for (
      let station = 0, t = 52 + (ri % 3) * 21;
      t < length - 28;
      station++, t += 180
    )
      for (const side of [-1, 1]) {
        const n = ri * 113 + station * 7 + (side + 1);
        const courtyard = n % 2 === 0;
        const offset = r.width / 2 + (courtyard ? 49 : 13);
        const x = r.from.x + tx * t - tz * side * offset;
        const z = r.from.z + tz * t + tx * side * offset;
        const radius = 10 + (n % 4);
        if (courtyard && lawns.length < 240 && clear(x, z, radius))
          lawns.push({ x, z, radius });
        for (let tree = 0; tree < 5; tree++) {
          const along = (tree - 2) * 5.5;
          const across = tree % 2 ? 2.8 : -2.2;
          addTree(
            x + tx * along - tz * across,
            z + tz * along + tx * across,
            n + tree,
          );
        }
      }
  });
  // A little distant woodland remains between the developed street corridors.
  for (let n = 0; n < 180; n++) {
    const x = CITY_BOUNDS.minX + ((n * 0.61803398875) % 1) * width;
    const z = CITY_BOUNDS.minZ + ((n * 0.41421356237) % 1) * depth;
    addTree(x, z, n);
  }
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
  trunks.name = 'neighbourhood-tree-trunks';
  pines.name = 'neighbourhood-pines';
  birches.name = 'neighbourhood-birches';
  for (const mesh of [trunks, pines, birches]) {
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
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
  }
}

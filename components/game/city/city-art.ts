import * as THREE from 'three';
import type { RenderKit } from '../world/render-kit.ts';
import { cityGroundHeight } from '../../../lib/game/city/surface.ts';
import {
  CITY_MURALS,
  METRO_CONSTRUCTION,
  type CityMural,
  type CityMuralSubject,
} from '../../../lib/game/city/city-art.ts';

/** Original vector interpretations of photographed local subjects. No source
 * photograph or scan is shipped as a game texture. Kept at 512 px wide. */
export function cityMuralSvg(subject: CityMuralSubject) {
  const defs = `<defs>
    <linearGradient id="sky" x2="0" y2="1"><stop stop-color="#163e66"/><stop offset="1" stop-color="#a9d3c9"/></linearGradient>
    <linearGradient id="ice" x2=".3" y2="1"><stop stop-color="#edf5e5"/><stop offset="1" stop-color="#6faec8"/></linearGradient>
    <linearGradient id="fur" x2="1" y2=".9"><stop stop-color="#c39564"/><stop offset=".45" stop-color="#78513a"/><stop offset="1" stop-color="#302e2a"/></linearGradient>
    <linearGradient id="face" x2="1" y2=".2"><stop stop-color="#ecd0a5"/><stop offset="1" stop-color="#aa7e60"/></linearGradient>
    <pattern id="grain" width="23" height="29" patternUnits="userSpaceOnUse"><path d="M2 3h2M15 21h1M6 16h1" stroke="#fff" stroke-opacity=".12" stroke-width="2"/></pattern>
  </defs>`;
  let art: string;
  if (subject === 'stolby') {
    const trees = Array.from({ length: 34 }, (_, i) => {
      const x = ((i * 89) % 550) - 20,
        y = 394 + ((i * 31) % 105),
        s = 0.65 + (i % 5) * 0.13;
      return `<path transform="translate(${x} ${y}) scale(${s})" d="M0-105L-23-55H-14L-36-13H-23L-44 29H44L23-13H36L14-55H23Z" fill="${i % 2 ? '#214c43' : '#386452'}"/>`;
    }).join('');
    art = `<rect width="512" height="1024" fill="#b9b7a5"/>
      <path d="M45 50L142 26 215 47 306 20 466 63 472 191 497 316 470 455 490 608 463 784 483 957 327 994 171 971 27 1007 43 863 21 738 43 586 20 442 37 319 22 172Z" fill="#242f35"/>
      <path d="M64 71L147 51 219 70 307 44 447 80 455 192 477 318 451 454 471 609 444 782 461 938 327 970 171 949 50 977 62 865 40 737 62 586 40 443 55 319 41 170Z" fill="url(#sky)"/>
      <path d="M60 207Q155 137 234 208T462 171M58 145Q170 89 271 150T451 120" fill="none" stroke="#d8e3d0" stroke-width="34" opacity=".45"/>
      <path d="M53 440L105 270 144 249 164 351 185 213 215 172 239 261 256 359 294 230 321 252 349 373 384 289 416 301 465 468Z" fill="#789295"/>
      <path d="M95 354L109 286 139 269 151 367 180 429 189 252 211 194 221 302 249 432 300 250 313 266 329 387 310 419 384 310 398 313 430 436" fill="none" stroke="#b0b6a2" stroke-width="15"/>
      <path d="M45 497Q155 418 266 448T470 490V970H44Z" fill="#416658"/>${trees}
      <path d="M204 733Q332 746 398 978H66Q199 899 180 810Z" fill="#8aa7a0"/>
      <path d="M250 809Q198 887 167 951M225 831Q287 892 330 970" stroke="#d5e5d3" stroke-width="17" fill="none"/>
      <path d="M138 666Q93 571 173 517Q248 466 332 524Q414 579 371 707L350 884 293 912 270 750 232 748 217 897 151 907Z" fill="url(#fur)"/>
      <path d="M156 696L170 849 204 847 222 685M283 676L307 854 342 847 350 670" fill="#584131"/>
      <ellipse cx="174" cy="554" rx="30" ry="38" fill="#5b4433"/><ellipse cx="333" cy="554" rx="30" ry="38" fill="#59402e"/>
      <path d="M171 551Q249 502 335 555L352 645 310 702 245 724 188 684 160 617Z" fill="url(#fur)"/>
      <path d="M178 581L229 594 198 622M330 581L277 594 307 623" fill="#b48f68"/>
      <ellipse cx="207" cy="606" rx="8" ry="6" fill="#191f20"/><ellipse cx="302" cy="606" rx="8" ry="6" fill="#191f20"/>
      <path d="M245 615Q214 643 220 667Q253 695 289 665L273 617Z" fill="#bca17b"/>
      <path d="M228 641Q253 624 279 641L266 661 245 665Z" fill="#222b2b"/><path d="M253 663V679L233 682M253 679L278 680" stroke="#443b30" stroke-width="4" fill="none"/>
      <path d="M142 538L174 522M327 527L354 552M142 664L159 689M358 699L344 727" stroke="#d0a572" stroke-width="7"/>`;
  } else if (subject === 'polar') {
    art = `<rect width="512" height="640" fill="url(#sky)"/>
      <path d="M-25 186Q104 40 205 113T538 6M-26 116Q109 13 246 53T538-30" stroke="#6dd1ac" stroke-opacity=".62" stroke-width="28" fill="none"/>
      <path d="M-10 165Q134 26 222 94T531 13" stroke="#c7e29d" stroke-opacity=".8" stroke-width="6" fill="none"/>
      <path d="M0 270L84 242 191 276 289 247 382 285 512 238V640H0Z" fill="#61a4bb"/>
      <path d="M12 307L157 277 274 308 171 344 55 348Z" fill="#bedfdb"/>
      <path d="M206 227L434 211 486 238 445 292 224 290 167 247Z" fill="#b12e31"/>
      <path d="M217 256L466 247 445 278 232 280Z" fill="#dc5750"/>
      <path d="M268 221V157H323V190H381V220Z" fill="#dce4d8"/><path d="M276 166H311V177H276M327 198H370V208H327" stroke="#265972" stroke-width="9"/>
      <path d="M293 157V132H307V156M362 190V158H374V190" fill="#d24a41"/>
      <path d="M378 156V112M379 120H417M380 139H397" stroke="#d6dfd4" stroke-width="3"/>
      <text x="342" y="266" font-family="sans-serif" font-size="10" fill="#fae8d2">НОРИЛЬСК</text>
      <path d="M0 463L72 435 201 480 340 454 512 487V640H0Z" fill="url(#ice)"/>
      <path d="M0 570L128 532 232 568 315 534 512 590M126 532L145 638M319 535L280 638" fill="none" stroke="#3485a5" stroke-width="14"/>
      <path d="M47 405Q35 346 118 335Q204 315 265 365L321 387 337 419 305 443 243 423 217 454 206 523 179 530 172 447 113 442 105 518 72 522 70 441Z" fill="url(#ice)"/>
      <path d="M119 344Q168 331 201 344L215 409 170 421 90 408Z" fill="#f2f2db"/>
      <ellipse cx="257" cy="375" rx="12" ry="15" fill="#e9eddb"/><ellipse cx="302" cy="402" rx="4" ry="5" fill="#233b4c"/>
      <path d="M323 402L338 409 336 419 321 420Z" fill="#223c4f"/>
      <path d="M297 487Q290 448 328 442Q373 431 408 463L440 482 447 498 425 511 396 494 390 537 371 540 365 500 337 500 332 542 311 543Z" fill="#f5f1d9"/>
      <ellipse cx="411" cy="473" rx="7" ry="9" fill="#f8f2dd"/><circle cx="428" cy="490" r="3" fill="#22415a"/><path d="M440 491L449 494 446 500 439 500Z" fill="#22415a"/>
      <path d="M83 426L78 497M196 441L197 500M319 480L320 529M379 493L380 530" fill="none" stroke="#9ab8bf" stroke-width="7"/>`;
  } else {
    art = `<rect width="512" height="896" fill="#87b0c6"/>
      <path d="M0 233Q204 133 512 211V0H0Z" fill="#c7d8d4"/>
      <path d="M34 104H478" stroke="#4e7389" stroke-width="2"/>
      <text x="256" y="70" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="27" letter-spacing="3" fill="#476979">МЫ КРАСНОЯРЦЫ</text>
      <path d="M39 645Q54 511 157 482L191 444 330 443 350 487Q452 519 483 653Z" fill="#343f45"/>
      <path d="M150 510L210 488 261 566 302 488 363 519 324 642 177 646Z" fill="#475258"/>
      <path d="M230 511L257 541 286 513 274 571 296 602 245 592Z" fill="#c1b79e"/>
      <path d="M166 254Q176 151 272 156Q375 163 375 296L343 427 288 488 206 455 168 369Z" fill="#463f3b"/>
      <path d="M187 266Q195 211 266 209L321 235 345 300 325 382 280 424 219 401 185 341Z" fill="url(#face)"/>
      <path d="M183 270Q157 204 210 171Q302 127 350 202L354 269 315 221 270 208 226 245Z" fill="#51473f"/>
      <path d="M185 271Q169 312 185 357L211 365 203 301Z" fill="#b28c69"/>
      <path d="M198 349Q227 371 251 354L268 343 293 355 335 332 333 419 293 477 240 468 197 420Z" fill="#655044"/>
      <path d="M205 374L226 404 253 442 288 448 322 405 306 466 280 486 242 471 212 436Z" fill="#9b7e61"/>
      <path d="M212 275Q235 264 253 280M285 278Q307 268 324 280" fill="none" stroke="#58473b" stroke-width="10"/>
      <path d="M215 290L247 290M286 290L317 291" stroke="#f3dbc0" stroke-width="6"/>
      <ellipse cx="233" cy="291" rx="5" ry="6" fill="#303b3e"/><ellipse cx="303" cy="291" rx="5" ry="6" fill="#303b3e"/>
      <path d="M269 285L260 329 280 334" fill="none" stroke="#9f7054" stroke-width="7"/>
      <path d="M234 358Q266 340 294 358M242 370Q267 365 289 369" stroke="#433e38" stroke-width="9" fill="none"/>
      <text x="256" y="637" text-anchor="middle" font-family="serif" font-style="italic" font-size="40" fill="#eee3c7">В. Суриков</text>
      <path d="M0 687Q152 646 276 678T512 669V896H0Z" fill="#e1e3d6"/>
      <path d="M0 795L80 748 164 797 256 743 387 789 512 755V896H0Z" fill="#bacbd0"/>
      <path d="M300 704H380V766H400V822H269V768H288V744H300Z" fill="#eef0df"/>
      <path d="M295 761H390M282 788H405M326 717V746M359 769V793" stroke="#adbec6" stroke-width="6"/>
      <path d="M87 787Q102 750 166 766L207 746 236 765 220 786 190 783 178 815 202 854 187 862 150 821 123 821 104 862 88 861 102 809Z" fill="#4e433d"/>
      <path d="M206 747L209 716 234 737 242 753 229 766Z" fill="#675244"/>
      <path d="M144 768L133 717 158 698 177 716 184 758 173 781Z" fill="#a55139"/><circle cx="154" cy="694" r="13" fill="#c29c73"/>
      <path d="M137 686L140 672 163 673 169 688M174 725L216 706" stroke="#53433d" stroke-width="10"/>
      <path d="M40 802L28 850 53 851 60 808M426 779L412 838 451 839 444 782M478 812L467 866 496 865 495 816" fill="#876341"/>
      <g fill="#c39c77"><circle cx="47" cy="789" r="12"/><circle cx="435" cy="766" r="13"/><circle cx="486" cy="800" r="10"/></g>
      <path d="M411 818L376 798M58 812L88 800" stroke="#825638" stroke-width="11"/>
      <path d="M12 875Q163 839 288 863T512 851" stroke="#edf1e3" stroke-width="16" fill="none"/>`;
  }
  const height = subject === 'polar' ? 640 : subject === 'stolby' ? 1024 : 896;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="${height}" viewBox="0 0 512 ${height}">${defs}${art}<rect width="512" height="${height}" fill="url(#grain)"/></svg>`;
}

function muralHost(kit: RenderKit, parent: THREE.Group, spec: CityMural) {
  const group = new THREE.Group();
  group.name = spec.id;
  group.userData = { address: spec.address, subject: spec.subject };
  group.position.set(spec.x, cityGroundHeight(spec.x, spec.z), spec.z);
  group.rotation.y = spec.angle;
  parent.add(group);
  const w = spec.facadeWidth,
    d = spec.buildingDepth,
    h = spec.h;
  kit.box(w, h, d, spec.color, 0, h / 2, 0, group, 0);
  kit.box(w + 0.3, 0.35, d + 0.3, '#68787a', 0, h + 0.17, 0, group, 0);
  kit.box(w + 0.1, 1, d + 0.1, '#79766a', 0, 0.5, 0, group, 0);
  // Windows on the long sides leave the documented mural end fully blind.
  for (let floor = 0; floor < spec.floors; floor++) {
    const y = 1.9 + floor * ((h - 2) / spec.floors);
    for (let col = 0; col < Math.floor(d / 4); col++) {
      const z = -d / 2 + 2 + col * 4;
      for (const side of [-1, 1]) {
        for (const glass of [false, true]) {
          const window = kit.mesh(
            new THREE.PlaneGeometry(glass ? 1.42 : 1.7, glass ? 1.4 : 1.65),
            kit.material(
              glass ? ((col + floor) % 5 ? '#557888' : '#a9af9c') : '#d8d5c6',
            ),
            group,
          );
          window.position.set(side * (w / 2 + (glass ? 0.055 : 0.03)), y, z);
          window.rotation.y = (side * Math.PI) / 2;
          window.castShadow = false;
        }
      }
    }
  }
  const material = new THREE.MeshStandardMaterial({
    color: '#c5d5cb',
    roughness: 1,
  });
  if (
    typeof document !== 'undefined' &&
    typeof document.createElementNS === 'function'
  ) {
    const texture = new THREE.TextureLoader().load(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cityMuralSvg(spec.subject))}`,
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    kit.textures.add(texture);
    material.map = texture;
    material.color.set('#ffffff');
  }
  const plane = kit.mesh(
    new THREE.PlaneGeometry(w - 0.45, h - 1.35),
    material,
    group,
  );
  plane.name = `${spec.id}:art`;
  plane.position.set(0, (h + 0.7) / 2, d / 2 + 0.035);
  plane.castShadow = false;
  // Unpainted brick sill roots the artwork in the facade rather than a billboard.
  kit.box(w, 0.18, 0.16, '#968a77', 0, 0.72, d / 2 + 0.06, group, 0);
}

function construction(kit: RenderKit, parent: THREE.Group) {
  const p = METRO_CONSTRUCTION;
  const group = new THREE.Group();
  group.name = p.id;
  group.position.set(p.x, cityGroundHeight(p.x, p.z), p.z);
  parent.add(group);
  kit.box(p.w, 0.16, p.d, '#958773', 0, 0.08, 0, group, 0);
  // A flat excavated cut has dark inner walls, steel walers and cross struts.
  // Ground remains intact below it: this is an enclosed visual construction set.
  kit.box(14, 0.18, 20, '#393b37', 14, 0.18, 0, group, 0);
  for (const side of [-1, 1]) {
    kit.box(0.4, 1.1, 20.6, '#84776b', 14 + side * 7.2, 0.65, 0, group, 0);
    kit.box(14.8, 1.1, 0.4, '#8c7d6d', 14, 0.65, side * 10.1, group, 0);
  }
  for (let z = -9; z <= 9; z += 3) {
    kit.box(14.5, 0.36, 0.38, '#8b6652', 14, 1.05, z, group, 0);
    for (const side of [-1, 1])
      kit.box(0.4, 1.3, 0.5, '#615a51', 14 + side * 7, 0.7, z, group, 0);
  }
  // Irregular layered spoil heap, with a cutaway shoulder beside the excavator.
  const rings = 5,
    steps = 22,
    positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const soil = new THREE.Color();
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings,
      radius = Math.pow(1 - t, 0.75);
    for (let j = 0; j < steps; j++) {
      const angle = (j / steps) * Math.PI * 2;
      const irregular =
        1 + 0.08 * Math.sin(j * 2.4 + ring) + 0.04 * Math.cos(j * 4.3);
      const x = -8 + Math.cos(angle) * 13 * radius * irregular + t * 1.8;
      const z = Math.sin(angle) * 11 * radius * irregular;
      const y =
        0.2 +
        Math.sin((t * Math.PI) / 2) * 10.8 +
        (ring && ring < rings ? Math.sin(j * 1.7 + ring) * 0.48 : 0);
      positions.push(x, y, z);
      soil
        .set(ring % 2 ? '#a29480' : '#b1a18a')
        .multiplyScalar(0.92 + ((j * 7 + ring * 3) % 11) * 0.016);
      colors.push(soil.r, soil.g, soil.b);
    }
  }
  for (let ring = 0; ring < rings; ring++)
    for (let j = 0; j < steps; j++) {
      const a = ring * steps + j,
        b = ring * steps + ((j + 1) % steps),
        c = a + steps,
        d = b + steps;
      indices.push(a, c, b, b, c, d);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const heap = kit.mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      flatShading: true,
    }),
    group,
  );
  heap.name = 'metro-cityhall:spoil-heap';
  // Corrugated blue perimeter with cream accents and a normal construction gate.
  for (const side of [-1, 1])
    for (let x = -22; x <= 22; x += 4) {
      kit.box(3.85, 2.4, 0.16, '#447c91', x, 1.3, side * 13.4, group, 0);
      kit.box(0.13, 2.7, 0.2, '#c1c5b3', x - 2, 1.4, side * 13.4, group, 0);
      kit.box(3.9, 0.16, 0.22, '#c4c9b7', x, 2.3, side * 13.4, group, 0);
    }
  for (const side of [-1, 1])
    for (let z = -11; z <= 11; z += 3.7) {
      kit.box(0.16, 2.4, 3.55, '#447c91', side * 23.9, 1.3, z, group, 0);
    }
  for (let i = 0; i < 2; i++) {
    kit.box(5.5, 2.8, 3.4, '#d4d6c5', -16 + i * 6.3, 1.5, -8.9, group, 0);
    kit.box(5.7, 0.2, 3.6, '#668995', -16 + i * 6.3, 3, -8.9, group, 0);
    kit.box(1.4, 1, 0.12, '#447386', -16 + i * 6.3, 1.9, -7.14, group, 0);
  }
  const excavator = new THREE.Group();
  excavator.name = 'metro-cityhall:excavator';
  excavator.position.set(0.8, 0.3, 6.8);
  excavator.rotation.y = -0.55;
  group.add(excavator);
  for (const side of [-1, 1])
    kit.box(1, 0.9, 5.5, '#343c3c', side * 1.15, 0.6, 0, excavator, 0);
  kit.box(3.4, 1.2, 3.3, '#d68b32', 0, 1.8, -0.5, excavator, 0);
  kit.box(1.4, 2.1, 1.7, '#dc9a41', -0.85, 3, -0.3, excavator, 0);
  kit.box(1.1, 1.5, 1.75, '#477084', -0.86, 3.18, -0.28, excavator, 0);
  const arm = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    width: number,
    color: string,
  ) => {
    const delta = b.clone().sub(a),
      mesh = kit.box(
        width,
        delta.length(),
        width,
        color,
        0,
        0,
        0,
        excavator,
        0,
      );
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
  };
  arm(
    new THREE.Vector3(0.6, 2.5, 0.3),
    new THREE.Vector3(0.6, 6.6, 2.1),
    0.6,
    '#e3a13d',
  );
  arm(
    new THREE.Vector3(0.6, 6.6, 2.1),
    new THREE.Vector3(0.6, 2.7, 5.8),
    0.48,
    '#cb832a',
  );
  arm(
    new THREE.Vector3(0.4, 3.1, 1),
    new THREE.Vector3(0.4, 5.8, 2),
    0.18,
    '#a9b1ad',
  );
  kit.box(1.6, 1.3, 1.35, '#535954', 0.6, 2.2, 6, excavator, 0);
}

/** Add once to the undraped city scene root; all landmarks sample ground here. */
export function createCityArt(kit: RenderKit, parent: THREE.Group) {
  const group = new THREE.Group();
  group.name = 'city-art';
  parent.add(group);
  for (const spec of CITY_MURALS) muralHost(kit, group, spec);
  construction(kit, group);
  return group;
}

import * as THREE from 'three';
import { RenderKit } from './render-kit';

/** Photo-based landmarks. Room widened for cooperative movement; not a survey. */
export function createApartment(k: RenderKit) {
  const wall = '#c6c4bd',
    wood = '#94704a',
    steel = '#25292a',
    fabric = '#434748';
  k.box(12.8, 0.18, 6.8, '#6e5137', 0, -0.13, 0, k.scene, 0);
  // Generated from the supplied room's warm oak reference; live lighting adds depth.
  const oak = k.texture('/materials/apartment-oak-v1.png');
  oak.wrapS = oak.wrapT = THREE.MirroredRepeatWrapping;
  oak.repeat.set(2.8, 5.2);
  oak.center.set(0.5, 0.5);
  oak.rotation = Math.PI / 2;
  const floorMat = new THREE.MeshStandardMaterial({
    map: oak,
    bumpMap: oak,
    bumpScale: 0.007,
    roughness: 0.72,
    color: '#ded3bf',
  });
  const floor = k.mesh(new THREE.PlaneGeometry(12.8, 6.8), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.018;
  floor.castShadow = false;
  k.box(12.8, 3.65, 0.16, wall, 0, 1.76, -3.34, k.scene, 0);
  k.box(0.18, 3.65, 6.8, '#b8b7b0', -6.31, 1.76, 0, k.scene, 0);
  k.box(0.18, 3.65, 6.8, '#c1c0b9', 6.31, 1.76, 0, k.scene, 0);
  for (const z of [-3.24, 3.3])
    k.box(12.55, 0.09, 0.035, '#dedcd3', 0, 0.035, z, k.scene, 0.008);
  k.box(12.6, 0.06, 0.14, '#ebe5d6', 0, 3.45, -3.22);
  // The ceiling line is slightly crooked — the bubble level will tell the truth.
  const trim = k.box(5.9, 0.035, 0.055, '#e4e0d5', 0.05, 3.38, -3.22);
  trim.rotation.z = 0.022;
  // Screen console, soundbar and a very small amount of familiar everyday clutter.
  k.box(3.4, 0.44, 0.45, wood, 0, 0.25, -2.99, k.scene, 0.035);
  k.box(3.3, 0.015, 0.012, '#6b5035', 0, 0.28, -2.757);
  for (const x of [-0.56, 0.56])
    k.box(0.008, 0.33, 0.009, '#624e37', x, 0.23, -2.76);
  k.box(1.38, 0.07, 0.11, '#252727', 0, 0.515, -3.04, k.scene, 0.022);
  k.box(0.14, 0.022, 0.05, '#23292a', 1.23, 0.49, -2.93, k.scene, 0.01);
  // L-shaped charcoal sofa opposite screen; chaise nearest the kitchen.
  const sofa = new THREE.Group();
  sofa.position.set(-0.2, 0, 2.5);
  k.scene.add(sofa);
  k.box(3.2, 0.3, 0.93, fabric, 0, 0.3, 0, sofa, 0.09);
  k.box(3.24, 0.61, 0.24, '#393e40', 0, 0.67, 0.46, sofa, 0.1);
  k.box(0.23, 0.48, 1.08, '#383d3f', -1.64, 0.48, -0.03, sofa, 0.08);
  k.box(0.23, 0.48, 1.08, '#383d3f', 1.64, 0.48, -0.03, sofa, 0.08);
  for (let i = 0; i < 3; i++) {
    k.box(
      0.98,
      0.15,
      0.79,
      '#55595a',
      (i - 1) * 1.03,
      0.53,
      -0.01,
      sofa,
      0.065,
    );
    k.box(0.94, 0.43, 0.16, '#4a4f51', (i - 1) * 1.03, 0.79, 0.31, sofa, 0.07);
  }
  k.box(1.05, 0.32, 1.4, '#414749', -1.02, 0.31, -0.6, sofa, 0.09);
  k.box(0.99, 0.15, 1.34, '#565c5d', -1.02, 0.55, -0.58, sofa, 0.08);
  for (const x of [-1.4, 1.4])
    for (const z of [-0.32, 0.34])
      k.cylinder(0.035, 0.045, 0.16, '#815d39', x, 0.08, z, sofa);
  for (const x of [-0.4, 1.05]) {
    const pillow = k.box(0.45, 0.42, 0.14, '#ac8740', x, 0.82, 0.18, sofa, 0.1);
    pillow.rotation.z = x < 0 ? -0.12 : 0.2;
    pillow.rotation.x = -0.2;
  }
  // Kitchen occupies the left end, with fridge and marble backsplash.
  const kitchen = new THREE.Group();
  kitchen.position.set(-5.61, 0, -0.78);
  kitchen.rotation.y = Math.PI / 2;
  k.scene.add(kitchen);
  k.box(2.55, 0.84, 0.59, '#aaa69a', 0, 0.46, 0, kitchen, 0.018);
  k.box(2.63, 0.065, 0.68, '#9b7953', 0, 0.91, 0.025, kitchen, 0.018);
  for (const x of [-0.85, 0, 0.85]) {
    k.box(0.82, 0.74, 0.025, '#d0cfc7', x, 0.46, 0.312, kitchen, 0.009);
    k.box(0.24, 0.015, 0.025, '#565a58', x, 0.73, 0.335, kitchen, 0.005);
  }
  k.box(2.63, 0.75, 0.04, '#dbdcd4', 0, 1.33, -0.32, kitchen, 0.005);
  for (let i = 0; i < 7; i++) {
    const line = k.box(
      0.55,
      0.006,
      0.005,
      '#b5b9b2',
      (((i * 3) % 5) - 2) * 0.44,
      1.08 + (i % 4) * 0.15,
      -0.293,
      kitchen,
      0.001,
    );
    line.rotation.z = (i % 2 ? 1 : -1) * 0.36;
  }
  for (const x of [-0.9, -0.03, 0.84]) {
    k.box(0.84, 0.92, 0.34, '#e1e0d8', x, 2.2, -0.17, kitchen, 0.015);
    k.box(0.82, 0.9, 0.015, '#edede5', x, 2.2, 0.01, kitchen, 0.007);
  }
  k.box(0.5, 0.035, 0.35, '#343b3b', -0.6, 0.957, 0.015, kitchen, 0.075);
  k.torus(0.13, 0.012, '#303738', -0.65, 1.15, -0.1, kitchen);
  k.cylinder(0.014, 0.014, 0.2, '#313939', -0.78, 1.055, -0.1, kitchen);
  k.box(0.51, 0.012, 0.35, '#202426', 0.69, 0.951, 0.01, kitchen, 0.018);
  for (const x of [0.53, 0.83])
    for (const z of [-0.1, 0.1]) {
      const ring = k.torus(0.058, 0.005, '#5b6160', x, 0.963, z, kitchen);
      ring.rotation.x = Math.PI / 2;
    }
  const hood = k.box(
    0.62,
    0.47,
    0.2,
    '#272b2d',
    0.68,
    1.83,
    0.1,
    kitchen,
    0.015,
  );
  hood.rotation.x = -0.38;
  k.box(0.76, 2.03, 0.72, '#939b9c', -1.88, 1.035, 0.03, kitchen, 0.035);
  k.box(0.73, 0.007, 0.02, '#505858', -1.88, 0.72, 0.407, kitchen, 0.002);
  k.box(0.035, 0.28, 0.026, '#c9d0ce', -1.58, 1.29, 0.411, kitchen, 0.008);
  // Open rack beside the refrigerator.
  const rack = new THREE.Group();
  rack.position.set(-4.55, 0, 2.18);
  k.scene.add(rack);
  for (const x of [-0.45, 0.45])
    for (const z of [-0.19, 0.19])
      k.box(0.035, 1.95, 0.035, steel, x, 0.98, z, rack, 0.005);
  for (let i = 0; i < 5; i++)
    k.box(0.95, 0.045, 0.45, wood, 0, 0.18 + i * 0.42, 0, rack, 0.008);
  k.box(0.65, 0.31, 0.34, '#b7b9b2', 0, 1.21, 0, rack, 0.016);
  k.box(0.49, 0.2, 0.014, '#272e30', -0.06, 1.22, 0.176, rack, 0.015);
  k.cylinder(
    0.026,
    0.026,
    0.026,
    '#666e6e',
    0.275,
    1.23,
    0.19,
    rack,
  ).rotation.x = Math.PI / 2;
  // Peninsula/bar and green fabric stools.
  k.box(0.92, 0.92, 1.82, '#929087', -3.8, 0.47, -1.25, k.scene, 0.02);
  k.box(1.1, 0.075, 1.98, wood, -3.77, 0.965, -1.25, k.scene, 0.02);
  const stool = (x: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    k.scene.add(g);
    for (const sx of [-0.23, 0.23])
      for (const sz of [-0.2, 0.2])
        k.rod(
          new THREE.Vector3(sx * 1.24, 0.04, sz * 1.24),
          new THREE.Vector3(sx, 0.81, sz),
          0.017,
          '#252c29',
          g,
        );
    k.box(0.59, 0.13, 0.57, '#386250', 0, 0.83, 0, g, 0.12);
    const back = k.box(0.6, 0.42, 0.12, '#365b4c', 0, 1.05, 0.25, g, 0.09);
    back.rotation.x = 0.1;
    k.rod(
      new THREE.Vector3(-0.26, 0.36, -0.22),
      new THREE.Vector3(0.26, 0.36, -0.22),
      0.015,
      '#3d4942',
      g,
    );
    return g;
  };
  const stools = [stool(-2.94, -1.8), stool(-2.94, -0.62)];
  stools.forEach((s) => (s.rotation.y = -Math.PI / 2));
  // Hallway with light grey door and horizontal glass inserts, left of the screen.
  k.box(0.95, 2.21, 0.07, '#777b77', -4.46, 1.1, -3.23, k.scene, 0.018);
  for (let i = 0; i < 4; i++)
    for (const dy of [-0.035, 0.035])
      k.box(
        0.78,
        0.014,
        0.016,
        '#c7c5ac',
        -4.46,
        0.4 + i * 0.45 + dy,
        -3.185,
        k.scene,
        0.002,
      );
  k.box(1.04, 0.055, 0.11, '#dfdfd5', -4.46, 2.23, -3.21);
  for (const x of [-4.97, -3.95])
    k.box(0.055, 2.26, 0.11, '#dfdfd5', x, 1.1, -3.21);
  k.box(0.14, 0.04, 0.04, '#2b3132', -4.1, 1.06, -3.15);
  // Window / balcony at the right end, framed by tall graphite curtains.
  k.box(0.05, 2.92, 4.3, '#162229', 6.18, 1.55, 0.1, k.scene, 0);
  for (const z of [-1.85, 0.1, 2.05])
    k.box(0.08, 2.95, 0.07, '#dedfd8', 6.12, 1.55, z);
  for (const y of [0.13, 2.97]) k.box(0.08, 0.08, 4.0, '#dadbd4', 6.12, y, 0.1);
  for (let i = 0; i < 22; i++) {
    const z = -2.8 + i * 0.267;
    if (z > -0.65 && z < 0.32) continue;
    const curtain = k.cylinder(
      0.082,
      0.1,
      3.18,
      i % 2 ? '#66655e' : '#77766c',
      5.97,
      1.63,
      z,
    );
    curtain.scale.x = 0.55;
  }
  // Night city lights beyond the window, small and restrained.
  for (let i = 0; i < 24; i++) {
    const light = k.box(
      0.012,
      0.022,
      0.045,
      i % 3 ? '#d5b87b' : '#a7bfc1',
      6.145,
      0.27 + (i % 5) * 0.065,
      -1.75 + ((i * 7) % 31) * 0.115,
      k.scene,
      0,
    );
    (light.material as THREE.MeshStandardMaterial).emissive.set(
      i % 3 ? '#a1763e' : '#7ba1a2',
    );
  }
  // Live-edge wooden desk faces the window; monitor, laptop, speakers, mesh chair.
  const desk = new THREE.Group();
  desk.position.set(4.96, 0, 1.08);
  desk.rotation.y = -Math.PI / 2;
  k.scene.add(desk);
  k.box(1.9, 0.07, 0.77, '#77573b', 0, 0.77, 0, desk, 0.035);
  for (const x of [-0.67, 0.67]) {
    k.box(0.07, 0.72, 0.1, steel, x, 0.37, 0, desk, 0.01);
    k.box(0.56, 0.045, 0.09, steel, x, 0.025, 0, desk, 0.012);
  }
  k.box(0.98, 0.58, 0.06, '#20282b', 0.03, 1.18, -0.22, desk, 0.035);
  const monitor = k.box(
    0.91,
    0.5,
    0.007,
    '#4c6775',
    0.03,
    1.18,
    -0.183,
    desk,
    0.003,
  );
  const mm = new THREE.MeshStandardMaterial({
    color: '#62828c',
    emissive: '#314957',
    emissiveIntensity: 0.65,
    roughness: 0.45,
  });
  monitor.material = mm;
  k.materials.add(mm);
  for (let i = 0; i < 9; i++)
    k.box(
      0.06,
      0.17 + (i % 4) * 0.038,
      0.005,
      ['#948b88', '#8571a4', '#597d92'][i % 3],
      -0.36 + i * 0.086,
      1.21,
      -0.175,
      desk,
      0.002,
    );
  k.box(0.08, 0.2, 0.08, '#363e3f', 0.03, 0.86, -0.24, desk, 0.01);
  k.box(0.34, 0.023, 0.18, '#383e3f', 0.03, 0.8, -0.2, desk, 0.02);
  k.box(0.38, 0.02, 0.27, '#737a7c', 0, 0.819, 0.22, desk, 0.012);
  const laptop = k.box(
    0.38,
    0.24,
    0.015,
    '#313b44',
    0,
    0.94,
    0.077,
    desk,
    0.012,
  );
  laptop.rotation.x = -0.22;
  for (const x of [-0.65, 0.67]) {
    k.box(0.14, 0.25, 0.14, '#242b2e', x, 0.94, -0.2, desk, 0.025);
    k.torus(0.035, 0.007, '#717b77', x, 0.94, -0.123, desk);
  }
  const chair = new THREE.Group();
  chair.position.set(3.97, 0, 1.1);
  chair.rotation.y = Math.PI / 2;
  k.scene.add(chair);
  k.box(0.51, 0.12, 0.49, '#262e31', 0, 0.52, 0, chair, 0.075);
  const back = k.box(0.49, 0.6, 0.085, '#343d40', 0, 0.86, 0.24, chair, 0.055);
  back.rotation.x = 0.08;
  k.box(0.29, 0.17, 0.1, '#343b3d', 0, 1.23, 0.29, chair, 0.065);
  k.cylinder(0.035, 0.055, 0.43, '#878e8e', 0, 0.25, 0, chair);
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5;
    k.rod(
      new THREE.Vector3(0, 0.12, 0),
      new THREE.Vector3(Math.cos(a) * 0.34, 0.075, Math.sin(a) * 0.34),
      0.018,
      '#9a9f9b',
      chair,
    );
    k.sphere(
      0.045,
      0.045,
      0.03,
      '#202629',
      Math.cos(a) * 0.34,
      0.045,
      Math.sin(a) * 0.34,
      chair,
    );
  }
  // Separate dark armchair by the screen end of the window.
  const arm = new THREE.Group();
  arm.position.set(4.6, 0, -1.99);
  arm.rotation.y = -0.65;
  k.scene.add(arm);
  k.box(0.92, 0.36, 0.8, '#303637', 0, 0.31, 0, arm, 0.16);
  k.box(0.87, 0.69, 0.24, '#33393b', 0, 0.65, -0.34, arm, 0.12);
  for (const x of [-0.46, 0.46])
    k.box(0.18, 0.42, 0.87, '#2b3335', x, 0.49, 0, arm, 0.08);
  k.box(0.7, 0.12, 0.58, '#434b4d', 0, 0.52, 0.02, arm, 0.06);
  // AC and vertical black radiator alongside the work area.
  k.box(0.22, 0.31, 1.0, '#d5d7cf', 6.08, 2.91, 2.5, k.scene, 0.075);
  k.box(0.035, 0.025, 0.84, '#929a98', 5.95, 2.8, 2.5, k.scene, 0.006);
  for (let i = 0; i < 8; i++)
    k.cylinder(0.023, 0.023, 1.62, '#242b2d', 6.03, 1.19, 2.3 + i * 0.06);
  // Pendant fixtures at the kitchen and window ends, ceiling omitted for playable camera.
  for (const x of [-4.05, 4.82])
    for (const z of [-0.9, 0.7]) {
      k.cylinder(0.008, 0.008, 0.65, '#292c2a', x, 3.1, z);
      k.cylinder(0.055, 0.055, 0.42, '#292e2e', x, 2.69, z);
      const bulb = k.cylinder(0.041, 0.041, 0.01, '#fff0cf', x, 2.48, z);
      const m = new THREE.MeshStandardMaterial({
        color: '#ffe6b2',
        emissive: '#ffe2a1',
        emissiveIntensity: 2,
      });
      bulb.material = m;
      k.materials.add(m);
    }
  return { stools, sofa };
}

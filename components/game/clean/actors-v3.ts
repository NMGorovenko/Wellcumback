import * as THREE from 'three';
import { people } from '../../../lib/game/presets.ts';
import { cleanCrew } from '../../../lib/game/clean/engine.ts';
import type { RenderKit } from '../world/render-kit';
import { createRig, type Pose } from '../world/rig.ts';
import { makeLabel } from '../world/labels.ts';
import { createPants, createTrouserLeak, positionRod } from './props-v3.ts';

// Anonymous rigs never load a person's portrait. This story role is separate
// from the named cleanup crew and disappears when Roma takes over.
const anonymousSoldier = { ...people[0], name: 'Солдат', portrait: '' };

export function createSoldier(kit: RenderKit) {
  const rig = createRig(kit, anonymousSoldier, kit.scene, { anonymous: true });
  rig.root.name = 'anonymous-soldier';
  const leak = createTrouserLeak(kit, rig.root);
  const bag = new THREE.Group();
  kit.scene.add(bag);
  const pants = createPants(kit, bag);
  pants.root.scale.setScalar(0.75);
  pants.root.position.y = -0.25;
  const plasticMaterial = new THREE.MeshStandardMaterial({
    color: '#c8d2a6',
    transparent: true,
    opacity: 0.15,
    roughness: 0.6,
    depthWrite: false,
  });
  const plastic = kit.mesh(
    new THREE.SphereGeometry(1, 16, 12),
    plasticMaterial,
    bag,
  );
  plastic.scale.set(0.21, 0.25, 0.13);
  plastic.position.y = -0.25;
  plastic.castShadow = false;
  kit.torus(0.045, 0.009, '#bfc79e', 0, -0.018, 0, bag);
  const strain = makeLabel(kit, 'ТЕРПЛЮ…', '#efd48f', 1.1);
  rig.root.add(strain);
  strain.position.set(0, 2.32, 0);
  const relief = makeLabel(kit, 'ГОСПОДИ, СПАСИБО', '#d4e7af', 1.65);
  rig.root.add(relief);
  relief.position.set(0, 2.32, 0);
  const target = new THREE.Vector3();
  return {
    rig,
    leak,
    bag,
    pants,
    strain,
    relief,
    updateBag(loading: boolean, progress: number, destination: THREE.Vector3) {
      rig.rightHand.getWorldPosition(target);
      bag.position.copy(target);
      bag.rotation.set(0, rig.root.rotation.y, 0.1);
      if (loading) {
        const amount = THREE.MathUtils.smoothstep(progress, 0.25, 0.9);
        bag.position.lerp(destination, amount);
        bag.rotation.z += amount * 1.4;
        bag.scale.setScalar(1 - amount * 0.4);
      } else bag.scale.setScalar(1);
    },
  };
}

export function createNpc(kit: RenderKit, index: number) {
  const rig = createRig(kit, anonymousSoldier, kit.scene, { anonymous: true });
  rig.root.scale.setScalar(index === 0 ? 1.03 : index === 1 ? 0.97 : 1.0);
  const name = makeLabel(
    kit,
    index === 0 ? 'ДНЕВАЛЬНЫЙ' : 'СОСЛУЖИВЕЦ',
    '#d9dfc1',
    index === 0 ? 1.7 : 1.4,
  );
  name.position.set(0, 2.24, 0);
  rig.root.add(name);
  const shock = makeLabel(kit, '?!', '#f0c17e', 0.6);
  shock.position.set(0, 2.6, 0);
  rig.root.add(shock);
  const suited = new THREE.Group();
  rig.head.add(suited);
  kit.sphere(0.194, 0.23, 0.135, '#b6bca0', 0, 0.014, -0.066, suited);
  kit.sphere(0.048, 0.055, 0.034, '#717c64', 0.174, -0.09, 0.085, suited, 12);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const context = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  kit.textures.add(texture);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  kit.materials.add(material);
  const speech = new THREE.Sprite(material);
  speech.scale.set(3.8, 0.72, 1);
  speech.position.set(0, 2.85, 0);
  rig.root.add(speech);
  let lastLine = '';
  return {
    rig,
    name,
    shock,
    suited,
    speech,
    previous: new THREE.Vector3(),
    say(line: string) {
      speech.visible = !!line;
      if (!line || line === lastLine) return;
      lastLine = line;
      context.clearRect(0, 0, 1024, 192);
      context.fillStyle = '#221f18ed';
      context.beginPath();
      context.roundRect(4, 4, 1016, 180, 24);
      context.fill();
      context.fillStyle = '#ffe6a4';
      context.font = '600 38px Arial';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const words = line.split(' '),
        lines: string[] = [];
      let current = '';
      for (const word of words) {
        if ((current + ' ' + word).length > 38 && current) {
          lines.push(current);
          current = word;
        } else current += (current ? ' ' : '') + word;
      }
      if (current) lines.push(current);
      lines
        .slice(0, 3)
        .forEach((text, row) =>
          context.fillText(
            text,
            512,
            94 + (row - (lines.length - 1) / 2) * 48,
            960,
          ),
        );
      texture.needsUpdate = true;
    },
  };
}

export function createCleaner(kit: RenderKit, index: number) {
  const color = ['#b3bea0', '#a4b5a1', '#b2b493'][index];
  const role = cleanCrew[index];
  const person = people.find((person) => person.id === role.id)!;
  const rig = createRig(kit, { ...person, uniform: false, color });
  rig.root.name = `cleaner-${role.id}`;
  // Hood and side filter leave the photographed face readable through a clear visor.
  kit.sphere(0.191, 0.233, 0.13, color, 0, 0.018, -0.065, rig.head);
  for (const sign of [-1, 1]) {
    kit.sphere(
      0.04,
      0.05,
      0.045,
      '#71876d',
      sign * 0.165,
      -0.075,
      0.065,
      rig.head,
      12,
    );
    const leg =
      index < 3 ? [rig.leftLeg, rig.rightLeg][sign < 0 ? 0 : 1] : rig.leftLeg;
    kit.cylinder(0.079, 0.065, 0.38, color, 0, -0.2, 0, leg);
    const knee = leg.children.find((child) => child instanceof THREE.Group);
    if (knee) kit.cylinder(0.062, 0.06, 0.33, color, 0, -0.17, 0, knee);
  }
  const visorMat = new THREE.MeshPhysicalMaterial({
    color: '#d5e5c1',
    transparent: true,
    opacity: 0.055,
    roughness: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const visor = kit.mesh(
    new THREE.SphereGeometry(1, 18, 14),
    visorMat,
    rig.head,
  );
  visor.position.set(0, -0.003, 0.105);
  visor.scale.set(0.157, 0.199, 0.08);
  visor.castShadow = false;
  const name = makeLabel(kit, role.name, '#eef0d5', 1.25);
  name.position.set(0, 2.29, 0);
  rig.root.add(name);
  const tool = new THREE.Group();
  kit.scene.add(tool);
  const handle = kit.cylinder(0.016, 0.016, 1, '#a99067', 0, 0, 0, tool);
  const mopHead = new THREE.Group();
  tool.add(mopHead);
  kit.box(0.43, 0.035, 0.14, '#849886', 0, 0.038, 0, mopHead, 0.02);
  const ragMaterial = new THREE.MeshStandardMaterial({
    color: '#d0d4b9',
    roughness: 1,
  });
  for (let i = 0; i < 10; i++) {
    const strand = kit.mesh(
      new THREE.CapsuleGeometry(0.015, 0.14, 2, 6),
      ragMaterial,
      mopHead,
    );
    strand.rotation.x = Math.PI / 2;
    strand.position.set((i - 4.5) * 0.044, 0.017, i % 2 ? -0.03 : 0.03);
  }
  const sponge = new THREE.Group();
  rig.rightHand.add(sponge);
  kit.box(0.09, 0.065, 0.12, '#c5c897', 0, -0.022, 0.017, sponge, 0.018);
  const suds = new THREE.Group();
  kit.scene.add(suds);
  for (let i = 0; i < 7; i++)
    kit.sphere(
      0.02 + (i % 2) * 0.014,
      0.018,
      0.021,
      '#d8e8c8',
      Math.cos(i * 2.4) * 0.22,
      0.025,
      Math.sin(i * 2.4) * 0.12,
      suds,
      8,
    );
  const top = new THREE.Vector3(),
    bottom = new THREE.Vector3(),
    midpoint = new THREE.Vector3(),
    delta = new THREE.Vector3(),
    hand = new THREE.Vector3(),
    cleanColor = new THREE.Color('#d0d4b9'),
    dirtColor = new THREE.Color('#685034');
  return {
    rig,
    tool,
    name,
    sponge,
    suds,
    previous: new THREE.Vector3(),
    updateTool(
      time: number,
      activity: string,
      target: THREE.Vector3,
      dirt: number,
    ) {
      const scrubbing = activity === 'mop',
        rinsing = activity === 'rinse';
      sponge.visible = false;
      tool.visible = true;
      rig.root.updateWorldMatrix(true, true);
      top.set(0.16, 1.14, 0.24);
      rig.root.localToWorld(top);
      bottom.copy(target);
      if (scrubbing) {
        bottom.x += Math.sin(time * 8) * 0.15;
        bottom.z += Math.cos(time * 8) * 0.08;
      }
      if (!scrubbing && !rinsing) {
        bottom.set(0.33, 0.035, 0.29);
        rig.root.localToWorld(bottom);
      }
      positionRod(handle, top, bottom, midpoint, delta);
      mopHead.position.copy(bottom);
      mopHead.rotation.y = rig.root.rotation.y;
      hand.copy(top).lerp(bottom, 0.22);
      rig.reach('right', hand);
      hand.copy(top).lerp(bottom, 0.46);
      rig.reach('left', hand);
      suds.visible = scrubbing && target.y < 0.15;
      suds.position.copy(bottom);
      suds.rotation.y = time * 0.4;
      ragMaterial.color.copy(cleanColor).lerp(dirtColor, Math.min(1, dirt));
    },
    scrubMachine(time: number, point: THREE.Vector3) {
      tool.visible = false;
      sponge.visible = true;
      suds.visible = false;
      hand.copy(point);
      hand.y += Math.sin(time * 9) * 0.06;
      rig.reach('right', hand);
      hand.copy(point);
      hand.x += 0.18;
      rig.reach('left', hand);
    },
  };
}

export function actorPose(activity: string): Pose {
  if (activity === 'walk') return 'walk';
  if (activity === 'mop') return 'mop';
  if (activity === 'react') return 'catch';
  if (activity === 'brace' || activity === 'load') return 'carry';
  if (['shower', 'rinse', 'valve', 'gear'].includes(activity)) return 'work';
  return 'idle';
}

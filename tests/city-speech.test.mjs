import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { freshCity } from '../lib/game/city/engine.ts';
import { citySpeech, BRIDGE_QUIP } from '../lib/game/city/dialogue.ts';
import { createMustang } from '../components/game/city/mustang.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import {
  cityDriveCamera,
  cityFaceCamera,
  cityOverviewCamera,
} from '../components/game/city/camera.ts';
import {
  placeSpeechBubble,
  speechPlacement,
  speechTail,
} from '../components/game/world/speech-position.ts';

void test('shared city speech resolves the actual passenger and never gives network notices a speaker', () => {
  const s = freshCity();
  for (const [radio, passenger, speaker, text] of [
    ['Никита: Все сели? Поехали.', 0, 'Никита', 'Все сели? Поехали.'],
    [BRIDGE_QUIP, 1, 'Ярик', 'Хоть бы с моста в реку не слететь'],
    ['Ярослав: План: доехать.', 1, 'Ярик', 'План: доехать.'],
    ['Рома: Я год ждал!', 2, 'Рома', 'Я год ждал!'],
  ]) {
    s.radio = radio;
    const snapshot = JSON.parse(JSON.stringify(s));
    assert.deepEqual(citySpeech(snapshot), { passenger, speaker, text });
  }
  for (const radio of [
    'Ждём связь с водителем…',
    'Система: нет связи',
    'Никита: ',
  ])
    assert.equal(citySpeech({ ...s, radio }), null);
  assert.equal(citySpeech({ ...s, paused: true }), null);
  assert.equal(citySpeech({ ...s, elapsed: s.radioUntil }), null);
});

void test('comic tail follows each actual animated passenger in drive, face and map cameras', () => {
  const scene = new THREE.Scene(),
    kit = new RenderKit(scene);
  kit.texture = () => {
    const t = new THREE.Texture();
    kit.textures.add(t);
    return t;
  };
  const car = createMustang(kit);
  try {
    for (const [width, height] of [
      [1440, 900],
      [1920, 1080],
      [390, 844],
    ])
      for (const mode of ['drive', 'faces', 'map'])
        for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2])
          for (const speed of [0, 32])
            for (const elevation of [0, 60]) {
              const s = {
                ...freshCity(),
                x: 0,
                z: 0,
                elevation,
                pitch: elevation ? 0.14 : 0,
                heading,
                speed,
                vx: speed * Math.sin(heading),
                vz: -speed * Math.cos(heading),
                elapsed: 2.6,
                steering: 0.7,
              };
              car.update(s, 0.025, mode === 'faces');
              // CityScene applies the authoritative surface pose after the car's
              // local wheel/body animation; passenger anchors inherit this pose.
              car.root.rotation.order = 'YXZ';
              car.root.position.y = s.elevation + 0.04;
              car.root.rotation.x = s.pitch;
              const aspect = width / height;
              const overview = cityOverviewCamera(aspect);
              const view =
                mode === 'map'
                  ? overview
                  : mode === 'faces'
                    ? cityFaceCamera(s, aspect)
                    : cityDriveCamera(s, aspect);
              const half = view.halfHeight;
              const camera = new THREE.OrthographicCamera(
                -half * aspect,
                half * aspect,
                half,
                -half,
                0.1,
                overview.far,
              );
              camera.position
                .set(view.look.x, view.look.y, view.look.z)
                .addScaledVector(
                  new THREE.Vector3(
                    view.outward.x,
                    view.outward.y,
                    view.outward.z,
                  ),
                  overview.distance,
                );
              camera.lookAt(view.look.x, view.look.y, view.look.z);
              camera.updateMatrixWorld();
              for (const name of ['Никита', 'Ярик', 'Рома']) {
                const line = citySpeech({ ...s, radio: `${name}: Поехали!` });
                const head = car.passengers[line.passenger];
                let path = '';
                const bubble = {
                  hidden: false,
                  offsetWidth: width < 640 ? 245 : 292,
                  offsetHeight: 80,
                  style: {},
                  querySelector: () => ({
                    setAttribute: (_name, value) => {
                      path = value;
                    },
                  }),
                };
                const host = { clientWidth: width, clientHeight: height };
                const rect = placeSpeechBubble(
                  { current: bubble },
                  head,
                  camera,
                  host,
                  true,
                  car.passengers,
                );
                assert.ok(
                  rect,
                  `${mode} ${width} ${heading} ${speed} at ${elevation}m: balloon stays in frame`,
                );
                assert.equal(bubble.style.visibility, 'visible');
                assert.ok(rect.x >= 10 && rect.x + rect.w <= width - 10);
                assert.ok(rect.y >= 82 && rect.y + 80 <= height - 20);
                const projected = head.getWorldPosition(new THREE.Vector3());
                projected.y += 0.16;
                projected.project(camera);
                const ax = ((projected.x + 1) * width) / 2,
                  ay = ((1 - projected.y) * height) / 2;
                // First quadratic ends exactly at the speaker, regardless of bubble displacement.
                const coords = path.split(/\s+/).map(Number);
                assert.ok(Math.abs(coords[6] + rect.x - ax) < 0.001);
                assert.ok(
                  Math.abs(
                    coords[7] + rect.y + 80 + (ay < rect.y ? -8 : 8) - ay,
                  ) < 0.001,
                );
                placeSpeechBubble(
                  { current: bubble },
                  head,
                  camera,
                  host,
                  false,
                );
                assert.equal(bubble.style.visibility, 'hidden');
              }
            }
  } finally {
    kit.dispose();
  }
});

void test('a balloon pushed sideways by a tall HUD still points back at the speaker', () => {
  const ax = 180,
    ay = 650,
    w = 280,
    h = 80;
  const p = speechPlacement(
    ax,
    ay,
    w,
    h,
    1280,
    720,
    [],
    [{ x: 14, y: 82, w: 290, h: 624 }],
  );
  assert.ok(p.x >= 312, 'body clears the panel');
  const coords = speechTail(ax, ay, { ...p, w, h }, p.tail)
    .split(/\s+/)
    .map(Number);
  assert.equal(coords[6] + p.x, ax);
  assert.equal(coords[7] + p.y + h + 8, ay);
});

void test('at the north edge of the map, the balloon goes below the speaker and its tail stays outside the text', () => {
  const ax = 552,
    ay = 148,
    w = 292,
    h = 80;
  const rect = { ...speechPlacement(ax, ay, w, h, 1280, 720), w, h };
  assert.ok(rect.y > ay + 18, 'speaker stays above the balloon');
  const numbers = speechTail(ax, ay, rect, rect.tail).split(/\s+/).map(Number);
  assert.ok(numbers[2] <= -h + 2, 'tail starts at the top edge');
  assert.equal(
    numbers[7] + rect.y + h,
    ay + 8,
    'tip stops just below the head',
  );
  assert.ok(
    numbers[5] < -h && numbers[7] < -h && numbers[10] < -h,
    'both curves stay outside the text body',
  );
  assert.equal(
    speechTail(140, 130, { x: 0, y: 82, w: 280, h: 80 }, 132),
    '',
    'impossible overlap hides the tail rather than drawing over text',
  );
});

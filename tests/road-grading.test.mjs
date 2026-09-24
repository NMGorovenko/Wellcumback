import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoadGrading } from '../lib/game/city/road-grading.ts';

const road = (id, from, to, extra = {}) => ({
  id,
  from,
  to,
  width: 8,
  ...extra,
});
const point = (x, z = 0) => ({ x, z });
const sample = (grade, natural, x, z = 0) => grade(x, z, natural(x, z));

function boundedProfile(grade, natural, r, maximum = 0.1) {
  const dx = r.to.x - r.from.x,
    dz = r.to.z - r.from.z;
  const length = Math.hypot(dx, dz),
    steps = Math.ceil(length / 0.25);
  let previous = sample(grade, natural, r.from.x, r.from.z);
  assert.ok(Number.isFinite(previous));
  for (let i = 1; i <= steps; i++) {
    const x = r.from.x + (dx * i) / steps,
      z = r.from.z + (dz * i) / steps;
    const y = sample(grade, natural, x, z);
    assert.ok(Number.isFinite(y), `${r.id} at ${x},${z}`);
    const slope = Math.abs(y - previous) / (length / steps);
    assert.ok(slope <= maximum + 1e-6, `${r.id} grade ${slope} at ${x},${z}`);
    previous = y;
  }
}

void test('a bridge anchor propagates a ten-percent grade through more than 239 eight-metre links', () => {
  const street = road('long-street', point(0), point(4096));
  const bridge = road('bridge', point(-20), point(0), { bridge: 'existing' });
  const natural = (x) => (x <= 0 ? 0 : 1000);
  const grade = createRoadGrading([street, bridge], natural);
  assert.equal(sample(grade, natural, 0), 0);
  for (const x of [8, 2048, 4096])
    assert.ok(Math.abs(sample(grade, natural, x) - x * 0.1) < 1e-7);
  boundedProfile(grade, natural, street);
});

void test('tiny shared links and collinear junction caps preserve the same bounded grade', () => {
  const streets = [
    road('west', point(0), point(80)),
    road('short-link', point(80), point(80.02)),
    road('east', point(80.02), point(160)),
  ];
  const bridge = road('bridge', point(-20), point(0), { bridge: 'existing' });
  const natural = (x) => (x <= 0 ? 0 : 1000);
  const grade = createRoadGrading([...streets, bridge], natural);
  for (const r of streets) boundedProfile(grade, natural, r);
  assert.ok(Math.abs(sample(grade, natural, 80) - 8) < 1e-7);
  assert.ok(Math.abs(sample(grade, natural, 80.02) - 8.002) < 1e-7);
});

void test('a crossing added between existing profile samples stays continuous on both axes', () => {
  const streets = [
    road('east-west', point(-103), point(101)),
    road('north-south', point(0, -107), point(0, 99)),
  ];
  const natural = (x, z) => x + z;
  const grade = createRoadGrading(streets, natural);
  // The node graph has a 10% budget; blending two differently oriented
  // profiles also changes their weights. Allow that documented contribution
  // while retaining a margin beneath the physical road limit of 20%.
  for (const r of streets) boundedProfile(grade, natural, r, 0.15);
  const junction = sample(grade, natural, 0, 0);
  for (const p of [
    point(-0.001),
    point(0.001),
    point(0, -0.001),
    point(0, 0.001),
  ])
    assert.ok(
      Math.abs(sample(grade, natural, p.x, p.z) - junction) <= 0.000101,
    );
});

void test('a minimum Kacha deck floor applies between profile nodes as well as at nodes', () => {
  const street = road('crossing', point(0), point(160));
  const natural = () => 0;
  const minimum = (x) => (x >= 75 && x <= 85 ? 12 : undefined);
  const grade = createRoadGrading([street], natural, minimum);
  for (let x = 75; x <= 85; x += 0.125)
    assert.ok(
      sample(grade, natural, x) >= 12 - 1e-8,
      `bridge floor at ${x} must clear the channel`,
    );
  boundedProfile(grade, natural, street);
});

void test('compatible existing bridge endpoints stay exact while a low interior rises to meet them', () => {
  const street = road('street', point(0), point(400));
  const bridges = [
    road('west-bridge', point(-30), point(0), { bridge: 'west' }),
    road('east-bridge', point(400), point(430), { bridge: 'east' }),
  ];
  const natural = (x) => (x <= 0 ? 20 : x >= 400 ? 34 : 0);
  const grade = createRoadGrading([street, ...bridges], natural);
  assert.equal(sample(grade, natural, 0), 20);
  assert.equal(sample(grade, natural, 400), 34);
  assert.ok(sample(grade, natural, 200) >= 14 - 1e-8);
  boundedProfile(grade, natural, street);
});

void test('an angled junction blend never dips below a gently falling river clearance', () => {
  const streets = [
    road('crossing', point(0), point(160)),
    road('bank-street', point(80, -50), point(80, 50)),
  ];
  const natural = () => 0;
  const minimum = (x, z) =>
    x >= 75 && x <= 85 && Math.abs(z) <= 12 ? 12 + x * 0.002 : undefined;
  const grade = createRoadGrading(streets, natural, minimum);
  for (let x = 75; x <= 85; x += 0.125)
    assert.ok(sample(grade, natural, x) >= minimum(x, 0) - 1e-8);
  for (const r of streets) boundedProfile(grade, natural, r, 0.15);
});

void test('raised crossings do not join the ground network and distant terrain is unchanged', () => {
  const lower = road('underpass', point(-100), point(100), { layer: 'lower' });
  const upper = road('upper', point(0, -80), point(0, 80), { layer: 'raised' });
  const natural = (_x, z) => (z === 0 ? 5 : 90);
  const grade = createRoadGrading([lower, upper], natural);
  boundedProfile(grade, natural, lower);
  assert.equal(sample(grade, natural, 0), 5);
  assert.equal(grade(20, 17, 123), 123, 'beyond the twelve-metre shoulder');
  assert.equal(grade(9000, 9000, 456), 456, 'outside the spatial index');
  assert.equal(createRoadGrading([], natural)(0, 0, 42), 42);
});

void test('zero-length placeholders never send NaNs to the terrain sampler or poison a valid road', () => {
  const street = road('street', point(0), point(160));
  const placeholder = road('placeholder', point(80), point(80));
  const natural = (x, z) => {
    assert.ok(
      Number.isFinite(x) && Number.isFinite(z),
      'finite terrain coordinates',
    );
    return x <= 0 ? 0 : 1000;
  };
  const grade = createRoadGrading([street, placeholder], natural);
  boundedProfile(grade, natural, street);
  assert.ok(Math.abs(sample(grade, natural, 80) - 8) < 1e-7);
});

void test('a deep road cut returns continuously to natural terrain across its entire shoulder', () => {
  const street = road('cut', point(-50), point(50), { width: 14 });
  const grade = createRoadGrading([street], () => 0);
  assert.equal(grade(0, 7, 40), 0);
  assert.equal(grade(0, 19, 40), 40);
  let previous = grade(0, 7, 40);
  for (let step = 1; step <= 1200; step++) {
    const height = grade(0, 7 + step / 100, 40);
    assert.ok(Number.isFinite(height));
    assert.ok(height >= previous - 1e-9);
    // A 40m cubic shoulder over 12m peaks at 5m/m. Tiny absolute Gaussian
    // weights must not cut it short and introduce a multi-metre vertical seam.
    assert.ok(height - previous <= 0.050001, `shoulder step ${step}`);
    previous = height;
  }
});

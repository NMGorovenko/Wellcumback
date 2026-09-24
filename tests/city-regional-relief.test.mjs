import test from 'node:test';
import assert from 'node:assert/strict';
import { cityNaturalLandHeight as height } from '../lib/game/city/terrain.ts';
import {
  CITY_BOBROVY_LOG,
  CITY_BOUNDS,
  riverBankZ,
} from '../lib/game/city/layout.ts';
import { STUD } from '../lib/game/city/studgorodok.ts';
import { KACHA_POINTS, sampleKacha } from '../lib/game/city/kacha.ts';

// These bounds describe relative game relief, not surveyed metre elevations.
// Regional ordering follows the geological sources in city-relief-019.md.
void test('the low historic centre sits below the northern and western terraces', () => {
  const centre = height(-70, -125);
  const pokrovka = height(0, -900);
  const sovietTerrace = height(550, -924);
  const upperSvobodny = height(-1100, -250);
  assert.ok(centre >= 6 && centre <= 15);
  assert.ok(pokrovka > centre + 55);
  assert.ok(sovietTerrace > centre + 25);
  assert.ok(pokrovka > sovietTerrace + 25);
  assert.ok(upperSvobodny > height(STUD.home.x, STUD.home.z) + 20);
  assert.ok(
    height(-7, CITY_BOUNDS.minZ - 14) > centre + 20,
    'Karaulnaya rises above the centre',
  );
});

void test('regional terrace tops are broad surfaces rather than isolated round hills', () => {
  for (const [x, z, minimum] of [
    [550, -1000, 40],
    [1450, 1400, 85],
    [-2000, 500, 40],
  ]) {
    const samples = [];
    for (const dx of [-30, 0, 30])
      for (const dz of [-20, 0, 20]) samples.push(height(x + dx, z + dz));
    assert.ok(Math.min(...samples) > minimum);
    assert.ok(Math.max(...samples) - Math.min(...samples) < 6);
  }
  assert.ok(
    height(-1560, 420) > height(-2000, 500) + 8,
    'the western lower terrace remains below the Akademgorodok shoulder',
  );
});

void test('the right-bank urban basin stays below Kuznetsovo and both Bazaikha valley sides', () => {
  const urban = height(1160, 805.5);
  const kuznet = height(1606, 1404);
  const valley = height(-430, 1450);
  assert.ok(urban >= 10 && urban < 35);
  assert.ok(kuznet > urban + 55);
  assert.ok(valley < 30);
  assert.ok(height(-700, 1450) > valley + 45);
  assert.ok(height(-130, 1450) > valley + 45);
  const { base, summit } = CITY_BOBROVY_LOG;
  assert.ok(height(base.x, base.z) < 30);
  assert.ok(height(summit.x, summit.z) > height(base.x, base.z) + 100);
});

void test('Kacha has a descending riverbed and a northern bluff below Pokrovka', () => {
  let previous = Infinity;
  for (const point of KACHA_POINTS) {
    const river = sampleKacha(point.x, point.z);
    const bed = height(point.x, point.z);
    assert.ok(Math.abs(bed - river.bedHeight) < 1e-8);
    assert.ok(bed < river.waterHeight - 1);
    assert.ok(
      bed < previous,
      'water and bed fall continuously toward the mouth',
    );
    previous = bed;
  }
  const river = sampleKacha(-90, -280);
  const north = height(river.x - river.nx * 120, river.z - river.nz * 120);
  const south = height(river.x + river.nx * 120, river.z + river.nz * 120);
  assert.ok(north > river.bankHeight + 35);
  assert.ok(north > south + 25, 'Pokrovka forms the high northern valley side');
});

void test('the established Studgorodok cliff and Nikolaevsky landings retain their elevations', () => {
  const preserved = [
    [STUD.home, 64.13515601815902],
    [STUD.ikit, 64.48564610113469],
    [STUD.ring, 54.13748510069005],
    [STUD.sign, 53.98201524725643],
    [STUD.avenueJunction, 27.768761590730406],
    [{ x: -580, z: 621 }, 14.51963459030785],
  ];
  for (const [point, expected] of preserved)
    assert.ok(Math.abs(height(point.x, point.z) - expected) < 1e-8);
  const shelf = height(-637, 430);
  assert.ok(shelf >= 8 && shelf <= 14);
  assert.ok(height(STUD.sign.x, STUD.sign.z) > shelf + 35);
  assert.ok(height(-1100, riverBankZ(-1100, -1) - 0.1) < 4);
});

void test('the regional field remains finite and inside the scenery height budget', () => {
  for (let x = -2500; x <= 1750; x += 50)
    for (let z = -1750; z <= 1650; z += 50) {
      const y = height(x, z);
      assert.ok(Number.isFinite(y));
      assert.ok(y >= -2 && y <= 180, `${x},${z}: ${y}`);
    }
});

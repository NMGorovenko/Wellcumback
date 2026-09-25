import { riverBankZ, riverZ } from './layout.ts';
import { KACHA_HALF_WIDTH, nearKacha, sampleKacha } from './kacha.ts';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

// Upper edge of the Studgorodok terrace in the compact city map. The lower
// industrial shelf is a separate landform; the cliff does not end in water.
const studCliff = [
  { x: -1400, z: 570 },
  { x: -1100, z: 535 },
  { x: -1010, z: 515 },
  { x: -900, z: 440 },
  { x: -800, z: 370 },
  { x: -735, z: 330 },
  { x: -650, z: 300 },
  { x: -560, z: 285 },
];

function studCliffZ(x: number) {
  let i = 0;
  while (i < studCliff.length - 2 && x > studCliff[i + 1].x) i++;
  const a = studCliff[i],
    b = studCliff[i + 1],
    t = clamp((x - a.x) / (b.x - a.x));
  return a.z + (b.z - a.z) * t;
}

/** The established Studgorodok cliff and existing bridge landing heights. */
function establishedLandHeight(x: number, z: number) {
  if (z < riverZ(x)) {
    const bank = riverBankZ(x, -1),
      inland = Math.max(0, bank - z),
      west = 1 - smooth((x + 650) / 400);
    let terrace =
      6 +
      58 * Math.exp(-(((x + 1150) / 650) ** 2) - ((z - 450) / 850) ** 2) +
      5 * Math.exp(-(((x - 700) / 850) ** 2) - ((z + 1150) / 850) ** 2) +
      10 * Math.exp(-(((x + 880) / 120) ** 2) - ((z - 370) / 240) ** 2) +
      32 * Math.exp(-(((x + 60) / 520) ** 2) - ((z + 1470) / 430) ** 2) +
      9 * Math.exp(-(((x - 850) / 480) ** 2) - ((z + 1050) / 500) ** 2);
    // The upper bridge approach follows the lower eastern shoulder of the
    // terrace rather than climbing to the height of the Orbita courtyard.
    terrace -=
      12 * Math.exp(-(((x + 728) / 120) ** 2) - ((z - 195) / 130) ** 2);

    const local = smooth((x + 1500) / 100) * (1 - smooth((x + 620) / 100));
    if (local > 0) {
      const edge = Math.min(studCliffZ(x), bank - 28),
        // Horizontal distances are compressed unevenly. Reserve dry ground
        // below the slope even where the current river is close to the edge.
        descentWidth = Math.max(12, Math.min(55, bank - edge - 16)),
        descent = smooth((z - edge) / descentWidth),
        shelf = 9 + 2 * Math.exp(-(((x + 870) / 300) ** 2));
      terrace += (shelf - terrace) * descent * local;
    }

    // The natural toe has room to slope to the water. The previous four-metre
    // transition made a continuous wall along the entire western waterline.
    return 3 + (terrace - 3) * (1 - west * (1 - smooth(inland / 26)));
  }
  return (
    7 +
    28 * Math.exp(-(((x - 700) / 900) ** 2) - ((z - 900) / 500) ** 2) +
    12 * Math.exp(-(((x + 900) / 800) ** 2) - ((z - 1100) / 550) ** 2) +
    112 * Math.exp(-(((x + 870) / 270) ** 2) - ((z - 1660) / 235) ** 2) +
    46 * Math.exp(-(((x + 150) / 590) ** 2) - ((z - 1490) / 320) ** 2)
  );
}

const band = (
  value: number,
  start: number,
  full: number,
  end: number,
  zero: number,
) =>
  smooth((value - start) / (full - start)) *
  (1 - smooth((value - end) / (zero - end)));

function leftBankTerraces(x: number, z: number, inland: number) {
  // A low historic-city platform, a western terrace, then a higher university
  // shoulder inland. Flat tops come from bounded steps, not isolated humps.
  const west = 1 - smooth((x + 900) / 520);
  const westernTop = 46 + 18 * smooth((x + 2050) / 500);
  let height =
    6 +
    6 * smooth((inland - 60) / 180) +
    (westernTop - 12) * west * smooth((inland - 20) / 140) +
    28 * west * smooth((inland - 380) / 350);

  // The Soviet district occupies a broad, moderate terrace. Pokrovka rises
  // again west of it, with its southern face above the Kacha and old centre.
  const northEast = smooth((x + 500) / 500);
  height += 35 * northEast * smooth((-z - 220) / 500);
  height += 38 * band(x, -600, -320, 160, 480) * smooth((-z - 140) / 250);
  return height;
}

// Compressed valley axis through the lower Bobrovy Log station. The valley
// separates the Stolby slopes to its west/south from the Torgashino uplands.
const bazaikhaValley = [
  { x: -1080, z: 740, floor: 13 },
  { x: -990, z: 970, floor: 17 },
  { x: -838, z: 1224, floor: 21 },
  { x: -430, z: 1450, floor: 25 },
  { x: -180, z: 1700, floor: 30 },
];

function bazaikhaHeight(x: number, z: number, height: number) {
  if (x < -1270 || x > 10 || z < 550) return height;
  let distanceSquared = Infinity;
  let floor = 0;
  for (let i = 1; i < bazaikhaValley.length; i++) {
    const a = bazaikhaValley[i - 1],
      b = bazaikhaValley[i];
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz));
    const d = (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2;
    if (d < distanceSquared) {
      distanceSquared = d;
      floor = a.floor + (b.floor - a.floor) * t;
    }
  }
  const weight = 1 - smooth((Math.sqrt(distanceSquared) - 34) / 130);
  return height + (Math.min(height, floor) - height) * weight;
}

function rightBankTerraces(x: number, z: number, inland: number) {
  // Krasrab and the bridge squares lie on the lower urban terrace. The
  // southern surfaces begin behind it, rather than lifting the waterfront.
  let height = 12 + 12 * smooth((inland - 150) / 220);
  const south = smooth((z - 850) / 530);
  // Kuznetsovo is an open plateau, distinct from the steeper Stolby side.
  const kuznet = smooth((x - 650) / 650);
  height += (54 * smooth((x + 550) / 450) * (1 - kuznet) + 70 * kuznet) * south;
  height +=
    125 *
    smooth((z - 1250) / 370) *
    (1 - smooth((x + 700) / 500)) *
    smooth((x + 1900) / 400);
  return bazaikhaHeight(x, z, height);
}

/** Relative, compressed game heights, not surveyed elevations. Broad terrace
 * steps express the city basin; tributary valleys divide the uplands.
 * See docs/city-relief-019.md for factual relationships and source limits. */
export function cityNaturalLandHeight(x: number, z: number) {
  const left = z < riverZ(x);
  const inland = Math.max(
    0,
    left ? riverBankZ(x, -1) - z : z - riverBankZ(x, 1),
  );
  const regional = left
    ? leftBankTerraces(x, z, inland)
    : rightBankTerraces(x, z, inland);
  // Preserve the recent Orbita cliff, low shelf and Nikolaevsky ramp cut.
  // The protected core has no regional height change; only its outer shoulder
  // blends into the larger western upland.
  const northBlend = 180 + 220 * smooth((x + 1000) / 440);
  const stud = left
    ? band(x, -1650, -1450, -560, -440) *
      smooth((z - 40 + northBlend) / northBlend)
    : 0;
  // Existing Yenisei bridge landings retain their established full-width
  // profile. The wider southern/northern landforms start farther inland.
  const shore =
    (left ? smooth((x + 650) / 150) : 1) * (1 - smooth((inland - 140) / 360));
  const preserve = Math.max(stud, shore);
  let height =
    preserve > 0
      ? regional + (establishedLandHeight(x, z) - regional) * preserve
      : regional;
  if (left && nearKacha(x, z, 180)) {
    const river = sampleKacha(x, z);
    if (river.distance <= KACHA_HALF_WIDTH)
      return Math.min(height, river.bedHeight);
    if (river.distance < 180) {
      const bank =
        river.bedHeight +
        (river.bankHeight - river.bedHeight) *
          smooth((river.distance - KACHA_HALF_WIDTH) / 4);
      // The documented red bluff is the northern side below Pokrovka.
      // The compressed escarpment still needs a broad shoulder for street approaches.
      const bluff =
        river.signedDistance < 0 ? band(river.x, -650, -400, 240, 400) : 0;
      const valley = smooth(
        (river.distance - KACHA_HALF_WIDTH - 4) / (120 + 30 * bluff),
      );
      height = bank + (Math.max(bank, height) - bank) * valley;
    }
  }
  // The opera, fountain and city hall occupy the upper Theatre Square terrace;
  // the museum and Dubrovinskogo remain below it. The eastern edge retreats
  // behind the museum, while the western square extends towards the river.
  // A2 records about 7 m between the existing terraces (centre-reference-021).
  // This bounded shoulder stops before every Yenisei bridge landing and Kacha.
  const squareSouth = 142 - 22 * smooth((x - 170) / 30);
  const square =
    band(x, -120, -20, 260, 360) *
    smooth((z + 170) / 120) *
    (1 - smooth((z - squareSouth) / 12));
  height += 6.5 * square;
  return height;
}

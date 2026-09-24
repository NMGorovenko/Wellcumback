/** One local, uniform projection preserves bearings within the photographed
 * neighbourhood. The rest of the city remains a compressed game map.
 * Source anchors / accuracy: docs/studgorodok-geography-019.md. */
export const studGeo = (lat: number, lon: number) => ({
  x: -640 + (lon - 92.8075) * 62250 * 0.5,
  z: 465 - (lat - 55.9921) * 111320 * 0.5,
});
export const STUD = {
  home: studGeo(55.992306, 92.795672),
  tower32: studGeo(55.991745, 92.796436),
  tower34: studGeo(55.991519, 92.79554),
  ikit: studGeo(55.994336, 92.797027),
  ring: studGeo(55.9971, 92.7996),
  sign: studGeo(55.993841, 92.802363),
  arrival: { x: -958, z: 455 },
  courtyardExit: { x: -960, z: 408 },
  campusJunction: { x: -917, z: 348 },
  borisovaJunction: { x: -895, z: 305 },
  northwest: { x: -1040, z: 95 },
  avenueJunction: { x: -650, z: 200 },
  bridge: [
    { x: -640, z: 435 },
    { x: -610, z: 528 },
    { x: -580, z: 621 },
  ],
};
export const STUD_SOUTH_STREET = [
  { x: STUD.ring.x, z: STUD.ring.z + 16 },
  { x: -878, z: 245 },
  STUD.borisovaJunction,
  STUD.campusJunction,
  { x: -948, z: 380 },
  STUD.courtyardExit,
  STUD.arrival,
];
export const STUD_NORTHWEST_STREET = [
  { x: STUD.ring.x - 11.314, z: STUD.ring.z - 11.314 },
  { x: -970, z: 122 },
  STUD.northwest,
];
export const STUD_NORTHEAST_STREET = [
  { x: STUD.ring.x + 11.314, z: STUD.ring.z - 11.314 },
  { x: -800, z: 80 },
  { x: -680, z: 100 },
  STUD.avenueJunction,
];
export const STUD_BRIDGE_APPROACH = [
  STUD.avenueJunction,
  { x: -655, z: 260 },
  { x: -650, z: 350 },
  STUD.bridge[0],
];

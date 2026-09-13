import { CITY_MUSTANG, type VehicleTuning } from '../city/car-physics.ts';
export type VehicleId = 'mustang' | 'amg-one';
export const VEHICLES = {
  mustang: { name: 'Mustang', character: 'Задний привод · свободный занос' },
  'amg-one': {
    name: 'AMG ONE',
    character: 'Полный привод · точная траектория',
  },
} as const;
export const CAR_COLORS = [
  { id: 'red', name: 'Красный', hex: '#ce2d40' },
  { id: 'blue', name: 'Синий', hex: '#368de5' },
  { id: 'yellow', name: 'Жёлтый', hex: '#f5cd42' },
  { id: 'green', name: 'Зелёный', hex: '#54c391' },
  { id: 'violet', name: 'Фиолетовый', hex: '#ae7ce5' },
  { id: 'white', name: 'Белый', hex: '#e9e9df' },
] as const;
export type ColorId = (typeof CAR_COLORS)[number]['id'];
/** Balanced arcade performance; manufacturer dimensions inform the art, not an
 * automatic win for the hypercar. Mustang trades corner grip for straight speed. */
export function vehicleTuning(id: VehicleId, city: boolean): VehicleTuning {
  if (id === 'mustang')
    return city
      ? CITY_MUSTANG
      : {
          ...CITY_MUSTANG,
          maxSpeed: 54,
          acceleration: 23,
          power: 430,
          brake: 23,
          drag: 0.12,
          torqueFalloff: 0.12,
          steeringSpeed: 17,
          automaticSlip: 0.35,
          downforce: 0.00025,
          transmission: {
            ratios: [4.15, 2.7, 1.65, 1.16, 0.86, 0.62],
            idle: 780,
            maxRpm: 6500,
            rpmPerSpeed: 140,
            shiftRpm: 5800,
            duration: 0.2,
            maxSpeed: 54,
          },
        };
  return {
    ...CITY_MUSTANG,
    maxSpeed: city ? 31 : 50,
    acceleration: city ? 25 : 22,
    power: city ? 255 : 410,
    brake: city ? 33 : 27,
    torqueFalloff: 0.1,
    shiftTorque: 0.55,
    grip: 10,
    driftGrip: 0.9,
    automaticSlip: 0.055,
    downforce: 0.0005,
    yaw: 1.75,
    driftYaw: 0.6,
    steeringSpeed: city ? 24 : 18,
    drag: city ? 0.2 : 0.13,
    transmission: {
      ratios: [12.803, 9.267, 7.058, 5.581, 4.562, 3.878, 3.435],
      idle: 1500,
      maxRpm: 11000,
      rpmPerSpeed: city ? 64 : 48,
      shiftRpm: 10100,
      downshiftRpm: 3800,
      duration: 0.12,
      maxSpeed: city ? 31 : 50,
    },
  };
}

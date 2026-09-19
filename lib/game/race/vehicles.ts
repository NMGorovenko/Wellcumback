import { CITY_MUSTANG, type VehicleTuning } from '../city/car-physics.ts';
export type VehicleId = 'mustang' | 'amg-gt';
export const VEHICLES = {
  mustang: { name: 'Mustang', character: 'Задний привод · свободный занос' },
  'amg-gt': {
    name: 'AMG GT',
    character: 'V8 · полный привод · цепкий выход из поворота',
  },
} as const;
export const CAR_COLORS = [
  { id: 'red', name: 'Красный', hex: '#ce2d40' },
  { id: 'blue', name: 'Синий', hex: '#368de5' },
  { id: 'yellow', name: 'Жёлтый', hex: '#f5cd42' },
  { id: 'green', name: 'Зелёный', hex: '#54c391' },
  { id: 'violet', name: 'Фиолетовый', hex: '#ae7ce5' },
  { id: 'white', name: 'Белый', hex: '#e9e9df' },
  { id: 'black', name: 'Чёрный', hex: '#141920' },
  { id: 'orange', name: 'Оранжевый', hex: '#ef862f' },
  { id: 'cyan', name: 'Бирюзовый', hex: '#40ced1' },
] as const;
export type ColorId = (typeof CAR_COLORS)[number]['id'];
export function defaultVehicleColor(
  vehicle: VehicleId,
  current: ColorId,
  occupied: ColorId[],
): ColorId {
  const preferred = vehicle === 'amg-gt' ? 'black' : 'red';
  return occupied.includes(preferred) ? current : preferred;
}
/** Balanced arcade performance. Mustang trades corner grip for straight speed;
 * the front-engine GT is stable under power and has a nine-speed automatic. */
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
    maxSpeed: city ? 295 / 3.6 : 50,
    acceleration: city ? 10 : 22,
    power: city ? 650 : 410,
    brake: city ? 20 : 27,
    torqueFalloff: city ? 0.02 : 0.1,
    shiftTorque: 0.55,
    grip: 10,
    driftGrip: 0.9,
    automaticSlip: 0.12,
    downforce: city ? 0.0005 : 0.00035,
    yaw: 1.75,
    driftYaw: 0.6,
    steeringSpeed: city ? 23 : 18,
    drag: city ? 0.085 : 0.13,
    transmission: {
      ratios: [5.35, 3.24, 2.25, 1.64, 1.21, 1, 0.87, 0.72, 0.6],
      idle: 760,
      maxRpm: 7000,
      rpmPerSpeed: city ? 100 : 138,
      shiftRpm: 6200,
      downshiftRpm: 2400,
      duration: 0.17,
      maxSpeed: city ? 295 / 3.6 : 50,
    },
  };
}

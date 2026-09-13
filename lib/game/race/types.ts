import type { CityState } from '../city/engine.ts';
import type { CarInput } from '../city/car-physics.ts';
import type { TrackId } from './course.ts';
import type { ColorId, VehicleId } from './vehicles.ts';
export type RaceMode = 'circuit' | 'drift';
export type RacePhase = 'lobby' | 'countdown' | 'racing' | 'result';
export type Racer = {
  id: string;
  memberSlot: number;
  localIndex: number;
  name: string;
  vehicleId: VehicleId;
  colorId: ColorId;
  ready: boolean;
  car: CityState;
  elevation: number;
  pitch: number;
  started: boolean;
  laps: number;
  nextGate: number;
  passedGates: number;
  lapStart: number;
  bestLap: number | null;
  finishTime: number | null;
  score: number;
  combo: number;
  comboDuration: number;
  straightTime: number;
  feedback: string;
  feedbackUntil: number;
  respawns: number;
  previousReset: boolean;
};
export type RaceInput = CarInput & { reset: boolean };
export const neutralRaceInput = (): RaceInput => ({
  throttle: 0,
  steer: 0,
  handbrake: false,
  reset: false,
});
export type RaceState = {
  paused: boolean;
  players: number;
  phase: RacePhase;
  trackId: TrackId;
  mode: RaceMode;
  laps: 1 | 3;
  racers: Racer[];
  elapsed: number;
  countdown: number;
  accumulator: number;
  revision: number;
};

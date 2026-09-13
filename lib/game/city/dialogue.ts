import { BRIDGES } from './layout.ts';
import type { CityState } from './engine.ts';

export const BRIDGE_QUIP = 'Ярик: Хоть бы с моста в реку не слететь';
export const RARE_QUIP =
  'Ярик: Что видит бабка перед смертью - турбина дует мустанг пиздует';
export type CityConversation = {
  bridge: string | null;
  bridgeAfter: number;
  nextQuip: number;
  seed: number;
};
export const freshCityConversation = (): CityConversation => ({
  bridge: null,
  bridgeAfter: 0,
  nextQuip: 70,
  seed: 0x6d2b79f5,
});

function random(s: CityState, c: CityConversation) {
  // Saved RNG mixed with the actual trip, never client wall-clock randomness.
  c.seed =
    (Math.imul(c.seed ^ Math.round(s.x * 101 + s.z * 37), 1664525) +
      1013904223) >>>
    0;
  return c.seed / 0x100000000;
}
export function advanceCityConversation(s: CityState) {
  const c = (s.conversation ??= freshCityConversation());
  const previous = BRIDGES.find((b) => b.id === c.bridge);
  if (
    previous &&
    (Math.abs(s.x - previous.x) > previous.w / 2 + 3 ||
      Math.abs(s.z - previous.z) > previous.d / 2 + 3)
  )
    c.bridge = null;
  const entered = BRIDGES.find(
    (b) => Math.abs(s.x - b.x) < b.w / 2 && Math.abs(s.z - b.z) < b.d / 2,
  );
  if (entered && c.bridge !== entered.id) {
    c.bridge = entered.id;
    if (s.speed > 1 && s.elapsed >= c.bridgeAfter) {
      s.radio = BRIDGE_QUIP;
      s.radioUntil = s.elapsed + 6;
      c.bridgeAfter = s.elapsed + 30;
    }
  }
  if (s.elapsed < c.nextQuip || s.speed < 4 || s.radioUntil > s.elapsed) return;
  c.nextQuip = s.elapsed + 60 + random(s, c) * 75;
  if (random(s, c) < 0.3) {
    s.radio = RARE_QUIP;
    s.radioUntil = s.elapsed + 8;
  }
}

const PASSENGER_SPEAKERS = [
  { speaker: 'Никита', aliases: ['Никита'] },
  { speaker: 'Ярик', aliases: ['Ярик', 'Ярослав'] },
  { speaker: 'Рома', aliases: ['Рома'] },
] as const;

/** Read the shared trip's dialogue without giving network status text a voice. */
export function citySpeech(
  s: Pick<CityState, 'radio' | 'radioUntil' | 'elapsed' | 'paused'>,
) {
  if (s.paused || s.elapsed >= s.radioUntil) return null;
  const separator = s.radio.indexOf(':');
  if (separator < 0) return null;
  const name = s.radio.slice(0, separator).trim();
  const passenger = PASSENGER_SPEAKERS.findIndex((person) =>
    person.aliases.some((alias) => alias === name),
  );
  const text = s.radio.slice(separator + 1).trim();
  if (passenger < 0 || !text) return null;
  return { passenger, speaker: PASSENGER_SPEAKERS[passenger].speaker, text };
}

import { levelCheck, levelLabels } from '@/lib/game/screen/level-check';
import type { GameState, Phase } from '@/lib/game/screen/engine';

export const NAMES = ['Никита', 'Ярик', 'Рома'];
export const SHORT_NAMES = ['Никита', 'Ярик', 'Рома'];
export const SIDES = ['Дальняя', 'Правая', 'Ближняя', 'Левая'];
export const SIDE_ARROWS = ['↑', '→', '↓', '←'];
export const ACTION_LABELS = ['E', 'Enter', 'O'];
export const MOVE_LABELS = ['W A S D', '↑ ← ↓ →', 'I J K L'];
export const ACT_NAMES = ['Рамка', 'Полотно', 'На стену'];

export function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function actNumber(phase: Phase) {
  return phase === 'frame'
    ? 0
    : phase === 'rods' || phase === 'tension'
      ? 1
      : 2;
}

export function progress(state: GameState): { value: number; label: string } {
  switch (state.phase) {
    case 'frame':
      return { value: state.corners / 4, label: `${state.corners} из 4 углов` };
    case 'rods':
      return {
        value: state.rods.reduce((a, b) => a + b, 0) / 4,
        label: `${state.rods.filter((n) => n === 1).length} из 4 спиц`,
      };
    case 'tension': {
      const count = state.clips.reduce((a, b) => a + b, 0);
      return { value: count / 16, label: `${count} из 16 пружин` };
    }
    case 'drill':
      return {
        value: (state.holes.length + state.drill) / 2,
        label: `${state.holes.length} из 2 отверстий`,
      };
    case 'lift':
      return {
        value: state.latch,
        label: `${state.latched.filter(Boolean).length} из 2 крючков`,
      };
    case 'level':
      return {
        value: Math.min(
          1,
          ([
            'fetch',
            'pickup',
            'chairs',
            'position',
            'climb',
            'place',
            'settle',
            'celebrate',
          ].indexOf(levelCheck(state).mode) +
            levelCheck(state).progress) /
            8,
        ),
        label: levelLabels[levelCheck(state).mode],
      };
    case 'result':
      return { value: 1, label: 'Кино будет!' };
  }
}

export function instructions(state: GameState): [string, string][] {
  switch (state.phase) {
    case 'frame':
      return state.frameStage === 'align'
        ? [
            ['A / D', 'сдвиг профиля'],
            [state.players > 1 ? '↑ / ↓' : 'W / S', 'поворот уголка'],
            ['E', 'вставить'],
            ...(state.players > 1
              ? [['Enter', 'Ярик придерживает'] as [string, string]]
              : []),
          ]
        : [
            ['E', 'щёлкнуть в зелёной зоне'],
            ...(state.players > 1
              ? [['E / Enter / O', 'щёлкнуть может каждый'] as [string, string]]
              : []),
          ];
    case 'rods':
      return [
        ['НАПРАВЛЕНИЯ', 'обойти полотно'],
        ['ДЕЙСТВИЕ', 'держать и вставлять'],
        ['← / → + ДЕЙСТВИЕ', 'направлять спицу'],
      ];
    case 'tension':
      return [
        ['ДЕЙСТВИЕ', 'тянуть → отпустить в зелёной зоне'],
        ['Q', 'зарядить → отпустить бросок'],
        ['ДЕЙСТВИЕ ПОЛУЧАТЕЛЯ', 'поймать'],
      ];
    case 'drill':
      return state.drillMode === 'position'
        ? [
            ['A / D', 'перевезти стулья'],
            ['W / S', 'два стула / один'],
            ['E', 'залезть у отметки'],
          ]
        : state.players === 1
          ? [
              ['W / S', 'целиться'],
              ['E', 'сверлить с перерывами'],
              ['НАПАРНИК', 'страхует автоматически'],
            ]
          : [
              ['A / D', 'держать равновесие'],
              ['↑ / ↓', 'целиться'],
              ['Enter', 'сверлить с перерывами'],
            ];
    case 'lift':
      return [
        [
          state.players > 1 ? 'W/S · ↑/↓' : 'W / S',
          state.players > 1 ? 'оба края' : 'поднять край',
        ],
        ['A / D', 'сдвинуть экран'],
        [state.players > 1 ? 'E + Enter' : 'E', 'зацепить'],
      ];
    case 'level':
      return [
        ['НАПРАВЛЕНИЯ ЯРИКА', 'к полке, затем стулья — в центр'],
        [
          state.players > 1 ? 'ДЕЙСТВИЕ' : 'E',
          'взять уровень, подняться и положить на экран',
        ],
      ];
    case 'result':
      return [];
  }
}

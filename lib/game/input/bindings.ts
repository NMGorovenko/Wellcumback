/** Stable engine commands. Physical keyboard preferences are mapped onto these. */
export const PLAYER_BINDINGS = [
  {
    left: 'KeyA',
    right: 'KeyD',
    up: 'KeyW',
    down: 'KeyS',
    action: 'KeyE',
    secondary: 'ShiftLeft',
  },
  {
    left: 'ArrowLeft',
    right: 'ArrowRight',
    up: 'ArrowUp',
    down: 'ArrowDown',
    action: 'Enter',
    secondary: 'ShiftRight',
  },
  {
    left: 'KeyJ',
    right: 'KeyL',
    up: 'KeyI',
    down: 'KeyK',
    action: 'KeyO',
    secondary: 'KeyU',
  },
] as const;

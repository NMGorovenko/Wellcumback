import { PLAYER_BINDINGS } from './bindings.ts';

export type PlayerControl = keyof (typeof PLAYER_BINDINGS)[number];
export type CanonicalKey =
  | (typeof PLAYER_BINDINGS)[number][PlayerControl]
  | 'KeyQ';
export type InputProfile = 'game' | 'city';
export const CITY_KEYS = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyE',
  'ShiftLeft',
  'KeyQ',
] as const;
export type CityKey = (typeof CITY_KEYS)[number];
export const CITY_CONTROL_NAMES: Record<PlayerControl, string> = {
  up: 'Газ',
  down: 'Тормоз / назад',
  left: 'Руль влево',
  right: 'Руль вправо',
  action: 'Начать историю',
  secondary: 'Дрифт',
};
export type ControlSettings = {
  version: 1;
  keys: Record<CanonicalKey, string>;
  cityKeys: Record<CityKey, string>;
  showWorldPrompts: boolean;
  showFps: boolean;
};
export const CONTROL_STORAGE_KEY = 'wellcum.controls.v1';
export const CONTROL_NAMES: Record<PlayerControl, string> = {
  up: 'Вверх',
  down: 'Вниз',
  left: 'Влево',
  right: 'Вправо',
  action: 'Действие / держать',
  secondary: 'Второе действие / пылесос',
};
export const PLAYER_NAMES = ['Игрок 1', 'Игрок 2', 'Игрок 3'] as const;
export const CANONICAL_KEYS = [
  ...PLAYER_BINDINGS.flatMap((b) => Object.values(b)),
  'KeyQ',
] as CanonicalKey[];
export function defaultControlSettings(): ControlSettings {
  return {
    version: 1,
    keys: Object.fromEntries(
      CANONICAL_KEYS.map((key) => [key, key]),
    ) as ControlSettings['keys'],
    cityKeys: Object.fromEntries(
      CITY_KEYS.map((key) => [key, key === 'ShiftLeft' ? 'Space' : key]),
    ) as ControlSettings['cityKeys'],
    showWorldPrompts: true,
    showFps: false,
  };
}
export function physicalKeyLabel(code: string): string {
  const labels: Record<string, string> = {
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ShiftLeft: 'левый Shift',
    ShiftRight: 'правый Shift',
    Escape: 'Esc',
    Space: 'Пробел',
    Enter: 'Enter',
    NumpadEnter: 'Num Enter',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Minus: '−',
    Equal: '=',
    Backquote: '`',
  };
  return (
    labels[code] ??
    code
      .replace(/^Key/, '')
      .replace(/^Digit/, '')
      .replace(/^Numpad/, 'Num ')
  );
}
export function getPhysicalBinding(
  settings: ControlSettings,
  key: CanonicalKey,
  profile: InputProfile = 'game',
): string {
  return profile === 'city'
    ? (settings.cityKeys[key as CityKey] ?? '')
    : settings.keys[key];
}
export function bindingName(
  key: CanonicalKey,
  profile: InputProfile = 'game',
): string {
  if (profile === 'city') {
    if (key === 'KeyQ') return 'Машина · сигнал';
    const control = Object.entries(PLAYER_BINDINGS[0]).find(
      ([, value]) => value === key,
    )?.[0] as PlayerControl | undefined;
    return control ? `Машина · ${CITY_CONTROL_NAMES[control]}` : 'Машина';
  }
  if (key === 'KeyQ') return 'Общее · бросок / смена инструмента';
  for (let player = 0; player < PLAYER_BINDINGS.length; player++)
    for (const [control, canonical] of Object.entries(PLAYER_BINDINGS[player]))
      if (canonical === key)
        return `${PLAYER_NAMES[player]} · ${CONTROL_NAMES[control as PlayerControl]}`;
  return key;
}
function keyProblem(code: string): string | null {
  if (code === 'KeyF') return 'F оставлена для полноэкранного режима.';
  if (code === 'Escape' || code === 'Tab')
    return 'Esc и Tab оставлены для меню и навигации.';
  return /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(Left|Right|Up|Down)|Shift(Left|Right)|Enter|NumpadEnter|Space|Comma|Period|Slash|Backslash|Semicolon|Quote|Bracket(Left|Right)|Minus|Equal|Backquote)$/.test(
    code,
  )
    ? null
    : 'Выбери букву, цифру, стрелку, Shift или знак. Системные клавиши не назначаются.';
}
export type RebindResult =
  | { ok: true; settings: ControlSettings }
  | { ok: false; reason: string; conflict?: CanonicalKey };
export function rebindControl(
  settings: ControlSettings,
  canonical: CanonicalKey,
  physical: string,
  profile: InputProfile = 'game',
): RebindResult {
  const supported: readonly CanonicalKey[] =
    profile === 'city' ? CITY_KEYS : CANONICAL_KEYS;
  if (!supported.includes(canonical))
    return { ok: false, reason: 'Неизвестное действие.' };
  const problem = keyProblem(physical);
  if (problem) return { ok: false, reason: problem };
  if (profile === 'game' && physical === 'Space' && canonical !== 'KeyE')
    return {
      ok: false,
      reason:
        'Пробел — дополнительное действие первого игрока и подтверждение в меню.',
    };
  const conflict = supported.find(
    (key) =>
      key !== canonical &&
      getPhysicalBinding(settings, key, profile) === physical,
  );
  if (conflict)
    return {
      ok: false,
      conflict,
      reason: `${physicalKeyLabel(physical)} уже занята: ${bindingName(conflict, profile)}. Сначала переназначь это действие.`,
    };
  return {
    ok: true,
    settings: {
      ...settings,
      ...(profile === 'city'
        ? { cityKeys: { ...settings.cityKeys, [canonical]: physical } }
        : { keys: { ...settings.keys, [canonical]: physical } }),
    },
  };
}
/** Unknown/unbound physical keys never fall through as engine commands. This is
 * essential when a former canonical key has been moved to another physical key. */
export function canonicalKeyForPhysical(
  settings: ControlSettings,
  physical: string,
  profile: InputProfile = 'game',
): CanonicalKey | null {
  if (profile === 'city')
    return CITY_KEYS.find((key) => settings.cityKeys[key] === physical) ?? null;
  return (
    CANONICAL_KEYS.find((key) => settings.keys[key] === physical) ??
    (physical === 'Space' ? 'KeyE' : null)
  );
}
export function mapPhysicalKeys(
  settings: ControlSettings,
  physical: Iterable<string>,
  profile: InputProfile = 'game',
): Set<string> {
  const mapped = new Set<string>();
  for (const code of physical) {
    const canonical = canonicalKeyForPhysical(settings, code, profile);
    if (canonical) mapped.add(canonical);
  }
  return mapped;
}
export function parseControlSettings(raw: string | null): ControlSettings {
  const defaults = defaultControlSettings();
  if (!raw) return defaults;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return defaults;
    const obj = data as Partial<ControlSettings>;
    if (obj.version !== 1 || !obj.keys || typeof obj.keys !== 'object')
      return defaults;
    const keys = {} as ControlSettings['keys'];
    for (const canonical of CANONICAL_KEYS) {
      const physical = obj.keys[canonical];
      if (
        typeof physical !== 'string' ||
        keyProblem(physical) ||
        (physical === 'Space' && canonical !== 'KeyE')
      )
        return defaults;
      keys[canonical] = physical;
    }
    if (new Set(Object.values(keys)).size !== CANONICAL_KEYS.length)
      return defaults;
    let cityKeys = defaults.cityKeys;
    // v1 saves predate vehicle controls. Keep their keyboard preferences and add
    // vehicle defaults; a corrupt vehicle subsection does not erase game keys.
    if (obj.cityKeys && typeof obj.cityKeys === 'object') {
      const values = CITY_KEYS.map((key) => obj.cityKeys![key]);
      if (
        values.every(
          (value) => typeof value === 'string' && !keyProblem(value),
        ) &&
        new Set(values).size === CITY_KEYS.length
      )
        cityKeys = Object.fromEntries(
          CITY_KEYS.map((key, i) => [key, values[i]]),
        ) as ControlSettings['cityKeys'];
    }
    return {
      version: 1,
      keys,
      cityKeys,
      showFps: obj.showFps === true,
      showWorldPrompts:
        typeof obj.showWorldPrompts === 'boolean' ? obj.showWorldPrompts : true,
    };
  } catch {
    return defaults;
  }
}
export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function loadControlSettings(storage: SettingsStorage) {
  try {
    return {
      settings: parseControlSettings(storage.getItem(CONTROL_STORAGE_KEY)),
      storageWarning: null as string | null,
    };
  } catch {
    return {
      settings: defaultControlSettings(),
      storageWarning:
        'Браузер не разрешил читать настройки. Пока используются стандартные клавиши.',
    };
  }
}
export function saveControlSettings(
  storage: SettingsStorage,
  settings: ControlSettings,
): string | null {
  try {
    storage.setItem(CONTROL_STORAGE_KEY, JSON.stringify(settings));
    return null;
  } catch {
    return 'Настройки работают до закрытия страницы. Браузер не разрешил сохранить их.';
  }
}

import {
  defaultGraphicsSettings,
  GRAPHICS_PRESETS,
  GRAPHICS_STORAGE_KEY,
  parseGraphicsSettings,
  type GraphicsDetail,
  type GraphicsSettings,
} from './settings.ts';

const initial = {
  settings: defaultGraphicsSettings(),
  warning: null as string | null,
};
let snapshot = initial,
  initialized = false;
const listeners = new Set<() => void>();
export const getGraphicsSnapshot = () => snapshot;
export const getServerGraphicsSnapshot = () => initial;
export const getGraphicsSettings = () => snapshot.settings;
export const subscribeGraphics = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function publish(settings: GraphicsSettings, warning: string | null = null) {
  snapshot = { settings, warning };
  listeners.forEach((listener) => listener());
}
export function initializeGraphicsSettings() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  try {
    publish(
      parseGraphicsSettings(window.localStorage.getItem(GRAPHICS_STORAGE_KEY)),
    );
  } catch {
    publish(
      defaultGraphicsSettings(),
      'Настройки будут действовать до закрытия игры.',
    );
  }
  window.addEventListener('storage', (event) => {
    if (event.key === GRAPHICS_STORAGE_KEY || event.key === null)
      publish(parseGraphicsSettings(event.newValue));
  });
}
export function updateGraphicsSettings(
  patch: Partial<Omit<GraphicsSettings, 'version'>>,
) {
  const settings = parseGraphicsSettings(
    JSON.stringify({ ...snapshot.settings, ...patch, version: 1 }),
  );
  let warning: string | null = null;
  try {
    if (typeof window !== 'undefined')
      window.localStorage.setItem(
        GRAPHICS_STORAGE_KEY,
        JSON.stringify(settings),
      );
  } catch {
    warning = 'Настройки будут действовать до закрытия игры.';
  }
  publish(settings, warning);
}
export const setGraphicsPreset = (preset: GraphicsDetail) =>
  updateGraphicsSettings(GRAPHICS_PRESETS[preset]);
export const resetGraphicsSettings = () =>
  updateGraphicsSettings(defaultGraphicsSettings());

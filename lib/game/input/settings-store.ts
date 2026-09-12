import {
  CONTROL_STORAGE_KEY,
  defaultControlSettings,
  loadControlSettings,
  parseControlSettings,
  rebindControl,
  saveControlSettings,
  type CanonicalKey,
  type ControlSettings,
  type InputProfile,
} from './settings.ts';

const initial = {
  settings: defaultControlSettings(),
  storageWarning: null as string | null,
};
let snapshot = initial,
  initialized = false,
  blockers = 0;
const listeners = new Set<() => void>();
export const getControlSettingsSnapshot = () => snapshot;
export const getServerControlSettingsSnapshot = () => initial;
export const getControlSettings = () => snapshot.settings;
export function subscribeControlSettings(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function publish(settings: ControlSettings, storageWarning: string | null) {
  snapshot = { settings, storageWarning };
  listeners.forEach((listener) => listener());
}
export function initializeControlSettings() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  try {
    const saved = loadControlSettings(window.localStorage);
    publish(saved.settings, saved.storageWarning);
  } catch {
    publish(
      defaultControlSettings(),
      'Хранилище недоступно. Настройки будут работать до закрытия страницы.',
    );
  }
  window.addEventListener('storage', (event) => {
    if (event.key === CONTROL_STORAGE_KEY || event.key === null)
      publish(parseControlSettings(event.newValue), null);
  });
}
function update(settings: ControlSettings) {
  let warning: string | null = null;
  try {
    if (typeof window !== 'undefined')
      warning = saveControlSettings(window.localStorage, settings);
  } catch {
    warning =
      'Настройки работают до закрытия страницы. Браузер не разрешил сохранить их.';
  }
  publish(settings, warning);
}
export function setControlBinding(
  canonical: CanonicalKey,
  physical: string,
  profile: InputProfile = 'game',
) {
  const result = rebindControl(snapshot.settings, canonical, physical, profile);
  if (result.ok) update(result.settings);
  return result;
}
export const resetControlSettings = () => update(defaultControlSettings());
export const setWorldPrompts = (showWorldPrompts: boolean) =>
  update({ ...snapshot.settings, showWorldPrompts });

/** A modal owns input while open. It does not alter device-to-player assignment. */
export const isControlInputBlocked = () => blockers > 0;
export function acquireControlInputBlock() {
  blockers++;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      blockers--;
    }
  };
}

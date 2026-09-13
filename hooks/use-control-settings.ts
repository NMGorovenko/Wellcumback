'use client';
import { useEffect, useSyncExternalStore } from 'react';
import {
  getControlSettingsSnapshot,
  getServerControlSettingsSnapshot,
  initializeControlSettings,
  resetControlSettings,
  setControlBinding,
  setWorldPrompts,
  setShowFps,
  subscribeControlSettings,
} from '@/lib/game/input/settings-store';

/** Shared reactive preferences work without adding a provider to the app tree. */
export function useControlSettings() {
  const snapshot = useSyncExternalStore(
    subscribeControlSettings,
    getControlSettingsSnapshot,
    getServerControlSettingsSnapshot,
  );
  useEffect(initializeControlSettings, []);
  return {
    ...snapshot,
    rebind: setControlBinding,
    reset: resetControlSettings,
    setWorldPrompts,
    setShowFps,
  };
}

'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { useControlSettings } from '@/hooks/use-control-settings';
import {
  enableFps,
  getFps,
  getServerFps,
  subscribeFps,
} from '@/lib/game/performance';

export function FpsMeter() {
  const { settings } = useControlSettings();
  const fps = useSyncExternalStore(subscribeFps, getFps, getServerFps);
  useEffect(() => {
    const update = () => enableFps(settings.showFps && !document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      enableFps(false);
    };
  }, [settings.showFps]);
  if (!settings.showFps) return null;
  return (
    <output className="fps-meter" aria-label="Частота кадров">
      {fps ?? '—'} FPS
    </output>
  );
}

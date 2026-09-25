export type GraphicsDetail = 'low' | 'medium' | 'high';
export type GraphicsShadows = 'off' | GraphicsDetail;
export type GraphicsSettings = {
  version: 1;
  detail: GraphicsDetail;
  shadows: GraphicsShadows;
  resolution: 0.75 | 1 | 1.5 | 2;
  frameLimit: 0 | 30 | 60 | 120;
};
export const GRAPHICS_STORAGE_KEY = 'friendslop.graphics.v1';
export const GRAPHICS_PRESETS = {
  low: { detail: 'low', shadows: 'low', resolution: 1 },
  medium: { detail: 'medium', shadows: 'medium', resolution: 1.5 },
  high: { detail: 'high', shadows: 'high', resolution: 2 },
} as const;
export const defaultGraphicsSettings = (): GraphicsSettings => ({
  version: 1,
  ...GRAPHICS_PRESETS.medium,
  frameLimit: 0,
});
export function parseGraphicsSettings(raw: string | null): GraphicsSettings {
  const defaults = defaultGraphicsSettings();
  try {
    const data = JSON.parse(raw ?? 'null');
    if (!data || data.version !== 1) return defaults;
    return {
      version: 1,
      detail: ['low', 'medium', 'high'].includes(data.detail)
        ? data.detail
        : defaults.detail,
      shadows: ['off', 'low', 'medium', 'high'].includes(data.shadows)
        ? data.shadows
        : defaults.shadows,
      resolution: [0.75, 1, 1.5, 2].includes(data.resolution)
        ? data.resolution
        : defaults.resolution,
      frameLimit: [0, 30, 60, 120].includes(data.frameLimit)
        ? data.frameLimit
        : defaults.frameLimit,
    };
  } catch {
    return defaults;
  }
}
export function graphicsPreset(
  settings: GraphicsSettings,
): GraphicsDetail | null {
  return (
    (Object.keys(GRAPHICS_PRESETS) as GraphicsDetail[]).find((key) => {
      const preset = GRAPHICS_PRESETS[key];
      return (
        settings.detail === preset.detail &&
        settings.shadows === preset.shadows &&
        settings.resolution === preset.resolution
      );
    }) ?? null
  );
}
/** A cap on device pixels, rather than a multiplier that makes 4K displays costly. */
export function graphicsPixelRatio(
  settings: GraphicsSettings,
  deviceRatio: number,
) {
  return Math.min(
    Math.max(0.5, Number.isFinite(deviceRatio) ? deviceRatio : 1),
    settings.resolution,
  );
}
export function graphicsShadowSize(settings: GraphicsSettings) {
  return { off: 0, low: 512, medium: 1024, high: 2048 }[settings.shadows];
}
/** Render scheduling only: simulation and networking keep their own clock. */
export function createRenderPacer() {
  let next = 0,
    previous = -Infinity,
    previousLimit = -1;
  return (now: number, limit: GraphicsSettings['frameLimit']) => {
    if (limit !== previousLimit || now < previous || now - previous > 250)
      next = now;
    previousLimit = limit;
    previous = now;
    if (!limit) return true;
    if (now + 0.1 < next) return false;
    const interval = 1000 / limit;
    next += Math.max(1, Math.floor((now - next) / interval) + 1) * interval;
    return true;
  };
}

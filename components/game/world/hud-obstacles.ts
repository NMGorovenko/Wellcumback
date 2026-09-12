export type HudRect = { x: number; y: number; w: number; h: number };
const cache = new WeakMap<HTMLElement, { at: number; rects: HudRect[] }>();
const selector = [
  '.topbar > *',
  '.world-heading',
  '.hud-top',
  '.hud-progress',
  '.hud-section',
  '.sidebar-toolbar',
  '.sidebar-heading',
  '.clean-status',
  '.clean-help',
  '.clean-camera-toggle',
  '.moving-bar',
  '.moving-footer',
  '.moving-alert',
  '.moving-day-clock',
  '.room-strip',
].join(',');

/** Measure only the small HUD islands, never the transparent full-screen
 * container. Cache layout reads across characters and animation frames. */
export function hudObstacles(host: HTMLElement): HudRect[] {
  const root = host.closest?.('.play-viewport');
  if (!root) return [];
  const now = performance.now(),
    prior = cache.get(host);
  if (prior && now - prior.at < 100) return prior.rects;
  const canvas = host.getBoundingClientRect();
  const rects: HudRect[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    const rect = element.getBoundingClientRect();
    if (
      rect.width < 2 ||
      rect.height < 2 ||
      getComputedStyle(element).visibility === 'hidden'
    )
      continue;
    const x = rect.left - canvas.left,
      y = rect.top - canvas.top;
    if (
      x < canvas.width &&
      y < canvas.height &&
      x + rect.width > 0 &&
      y + rect.height > 0
    )
      rects.push({ x, y, w: rect.width, h: rect.height });
  }
  cache.set(host, { at: now, rects });
  return rects;
}

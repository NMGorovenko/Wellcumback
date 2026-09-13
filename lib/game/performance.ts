/** Count completed rendered frames, independently of the simulation tick rate. */
export function createFrameSampler(interval = 500) {
  let start: number | null = null;
  let previous: number | null = null;
  let frames = 0;
  return {
    reset() {
      start = previous = null;
      frames = 0;
    },
    sample(now: number): number | null {
      if (!Number.isFinite(now)) return null;
      if (previous === null || now <= previous) {
        start = previous = now;
        frames = 0;
        return null;
      }
      previous = now;
      frames++;
      const elapsed = now - start!;
      if (elapsed < interval) return null;
      const fps = Math.round((frames * 1000) / elapsed);
      start = now;
      frames = 0;
      return fps;
    },
  };
}

let enabled = false;
let revision = 0;
let fps: number | null = null;
const listeners = new Set<() => void>();
export const getFps = () => fps;
export const getServerFps = () => null;
export const subscribeFps = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function enableFps(value: boolean) {
  enabled = value;
  revision++;
  fps = null;
  listeners.forEach((listener) => listener());
}
/** Each scene owns its sampler; disabling the setting incurs only one branch. */
export function renderedFrameCounter() {
  if (enabled) {
    fps = null;
    listeners.forEach((listener) => listener());
  }
  const sampler = createFrameSampler();
  let seenRevision = -1;
  return (now: number) => {
    if (!enabled) return;
    if (seenRevision !== revision) {
      sampler.reset();
      seenRevision = revision;
    }
    const measured = sampler.sample(now);
    if (measured !== null && measured !== fps) {
      fps = measured;
      listeners.forEach((listener) => listener());
    }
  };
}

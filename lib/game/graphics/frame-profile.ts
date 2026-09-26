import type * as THREE from 'three';
export type FrameProfileReport = {
  seconds: number;
  fps: number;
  frameP95: number;
  cpu: Record<string, number>;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  objects: number;
  heapMiB?: number;
  pixels: string;
};
/** Development-only bounded sampler. GPU submission time is not GPU execution time. */
export function createFrameProfile(
  report: (sample: FrameProfileReport) => void,
) {
  const phases: Record<string, number[]> = {};
  let previous = 0,
    last = 0,
    start = 0,
    windowStart = 0,
    frames = 0;
  const intervals: number[] = [];
  const append = (values: number[], value: number) => {
    if (values.length >= 360) values.shift();
    values.push(value);
  };
  const mean = (values: number[]) =>
    Math.round(
      (values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)) * 100,
    ) / 100;
  return {
    begin(now: number) {
      if (!start) start = windowStart = now;
      if (previous) append(intervals, now - previous);
      previous = now;
      last = performance.now();
      frames++;
    },
    mark(name: string) {
      const now = performance.now();
      append((phases[name] ??= []), now - last);
      last = now;
    },
    end(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
      const now = performance.now();
      if (now - windowStart < 2000) return;
      let objects = 0;
      scene.traverse(() => objects++);
      const sorted = [...intervals].sort((a, b) => a - b);
      const memory = (
        performance as Performance & { memory?: { usedJSHeapSize: number } }
      ).memory;
      report({
        seconds: Math.round((now - start) / 1000),
        fps: Math.round((frames * 1000) / (now - windowStart)),
        frameP95:
          Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 10) / 10,
        cpu: Object.fromEntries(
          Object.entries(phases).map(([k, v]) => [k, mean(v)]),
        ),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs?.length ?? 0,
        objects,
        heapMiB: memory
          ? Math.round(memory.usedJSHeapSize / 1048576)
          : undefined,
        pixels: `${renderer.domElement.width}×${renderer.domElement.height}`,
      });
      frames = 0;
      windowStart = now;
      intervals.length = 0;
      for (const samples of Object.values(phases)) samples.length = 0;
    },
  };
}

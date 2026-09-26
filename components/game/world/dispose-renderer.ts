import type { WebGLRenderer } from 'three';
/** A removed canvas can retain its GL context until GC. Release it immediately
 * between stories/restarts so old driver allocations cannot pile up. */
export function disposeGameRenderer(renderer: WebGLRenderer) {
  renderer.dispose();
  renderer.forceContextLoss();
}

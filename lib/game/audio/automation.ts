type Target = { from: number; value: number; at: number; lag: number };
/** A live parameter owns at most an anchor and one exponential target. Silent
 * upstream nodes are not necessarily processed/pruned by every browser version.
 * Future OfflineAudioContext scheduling must retain its earlier, unplayed events. */
export function createAudioTargets(
  context: Pick<BaseAudioContext, 'currentTime'>,
) {
  const targets = new WeakMap<AudioParam, Target>();
  const target = (
    param: AudioParam,
    value: number,
    at = context.currentTime,
    lag = 0.035,
  ) => {
    const previous = targets.get(param);
    if (
      previous &&
      previous.value === value &&
      previous.lag === lag &&
      at >= previous.at
    )
      return;
    const from =
      previous && at >= previous.at
        ? previous.value +
          (previous.from - previous.value) *
            Math.exp(-(at - previous.at) / previous.lag)
        : param.value;
    // Anchor the analytically continued envelope before removing consumed history.
    // Reading param.value here is unreliable for culled/silent audio branches.
    if (at <= context.currentTime) {
      param.cancelScheduledValues(0);
      param.setValueAtTime(from, at);
    } else param.cancelScheduledValues(at);
    param.setTargetAtTime(value, at, lag);
    targets.set(param, { from, value, at, lag });
  };
  target.forget = (param: AudioParam) => targets.delete(param);
  return target;
}

/** Short mechanical foley; dialogue stays in comic bubbles. */
export function playSpringFoley(
  context: AudioContext,
  kind: 'release' | 'impact',
  pan = 0,
) {
  if (context.state !== 'running') return;
  const now = context.currentTime;
  const impact = kind === 'impact';
  const duration = impact ? 0.12 : 0.36;
  const frequencies = impact ? [160, 315] : [510, 1375, 2260];
  const levels = impact ? [0.025, 0.009] : [0.024, 0.009, 0.004];
  const stereo = context.createStereoPanner();
  stereo.pan.value = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
  stereo.connect(context.destination);
  let remaining = frequencies.length;
  frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      frequency * (impact ? 0.38 : 0.68),
      now + duration,
    );
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(levels[index], now + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(stereo);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      if (--remaining === 0) stereo.disconnect();
    };
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  });
}

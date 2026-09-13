import { timingDial, type TimingCue } from '@/lib/game/input/timing-cue';

/** The key stays inside the clock; the small verb distinguishes a tap from
 * releasing a held spring/tool. All motion comes from the game snapshot. */
export function TimingDial({
  cue,
  label,
  held,
}: {
  cue: TimingCue;
  label: string;
  held: boolean;
}) {
  const dial = timingDial(cue);
  const feedback = cue.feedback ?? 'waiting';
  const verb = cue.mode === 'release' || held ? 'отпусти' : 'нажми';
  const caption = {
    waiting: verb,
    good: 'Есть!',
    early: 'Рано',
    late: 'Поздно',
    wrong: 'Другую кнопку',
  }[feedback];
  return (
    <figure
      className="timing-dial"
      data-ready={dial.ready}
      data-feedback={feedback}
      data-held={held}
      aria-label={`${caption} ${label} в светлой отметке`}
    >
      <div className="timing-dial-face">
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <circle className="timing-dial-track" cx="40" cy="40" r="33" />
          <circle
            className="timing-dial-window"
            cx="40"
            cy="40"
            r="33"
            pathLength="100"
            strokeDasharray={`${dial.length} ${100 - dial.length}`}
            strokeDashoffset={-dial.start}
            transform="rotate(-90 40 40)"
          />
          <g transform={`rotate(${dial.angle} 40 40)`}>
            <path className="timing-dial-needle" d="M 40 17 L 40 5" />
            <circle className="timing-dial-tip" cx="40" cy="7" r="3" />
          </g>
        </svg>
        <kbd>{label}</kbd>
      </div>
      <span className="timing-dial-caption">{caption}</span>
    </figure>
  );
}

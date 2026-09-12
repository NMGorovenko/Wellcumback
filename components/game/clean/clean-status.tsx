import { inputPrompt, type PadFrame } from '@/lib/game/input/gamepads';
import { cleanSupportTask } from '@/lib/game/clean/support';
import {
  cleanCrew,
  cleanFloorProgress,
  type CleanState,
} from '@/lib/game/clean/engine';

export function CleanMeter({
  label,
  value,
  detail,
  warning = false,
}: {
  label: string;
  value: number;
  detail?: string;
  warning?: boolean;
}) {
  return (
    <div className={`sidebar-meter${warning ? ' is-warning' : ''}`}>
      <div className="meter-caption">
        <span>{label}</span>
        <strong>{detail ?? `${Math.round(value * 100)}%`}</strong>
      </div>
      <progress
        aria-label={label}
        max={1}
        value={Math.max(0, Math.min(1, value))}
      />
    </div>
  );
}
function RhythmCue({
  game,
  pads,
}: {
  game: CleanState;
  pads: Pick<PadFrame, 'assignments'>;
}) {
  const r = game.rhythm,
    total = r.period + r.window + 0.08;
  const expected = inputPrompt(
    pads,
    0,
    r.expected === 'KeyQ' ? 'throw' : 'action',
  );
  const feedback = {
    waiting: 'Лови светлое окно',
    good: 'Держимся!',
    early: 'Рано',
    late: 'Поздно',
    wrong: 'Другую кнопку',
  }[r.feedback];
  return (
    <div className={`rhythm-cue rhythm-${r.feedback}`}>
      <div className="rhythm-caption">
        <kbd>{expected}</kbd>
        <span>
          {feedback}
          <small>
            {r.combo > 1 ? `Серия ×${r.combo}` : 'Нажимай по очереди'}
          </small>
        </span>
      </div>
      <div
        className="rhythm-track"
        aria-label={`Нажми ${expected} в светлом окне`}
      >
        <span
          className="rhythm-window"
          style={{
            left: `${((r.period - r.window) / total) * 100}%`,
            width: `${((2 * r.window) / total) * 100}%`,
          }}
        />
        <i style={{ left: `${Math.min(1, r.clock / total) * 100}%` }} />
      </div>
    </div>
  );
}
export default function CleanStatus({
  game,
  pads,
}: {
  game: CleanState;
  pads: Pick<PadFrame, 'assignments'>;
}) {
  const s = game,
    cleaned = s.spots.filter((p) => p.progress >= 1).length;
  return (
    <div className="clean-status">
      {['duty', 'find', 'accident', 'toilet'].includes(s.phase) && (
        <CleanMeter
          label="Терпение на исходе"
          value={s.urge}
          warning={s.urge > 0.7}
        />
      )}
      {s.phase === 'find' && <RhythmCue game={s} pads={pads} />}
      {s.phase === 'toilet' && s.relief === 0 && (
        <CleanMeter
          label={s.containment.suppressed ? 'Держим напор' : 'Силы сдержаться'}
          value={s.containment.stamina}
          warning={s.containment.stamina < 0.25}
        />
      )}
      {s.phase === 'toilet' && s.relief > 0 && (
        <CleanMeter label="Наконец-то…" value={s.relief} />
      )}
      {s.phase === 'shower' && (
        <CleanMeter label="Смываем последствия" value={s.shower} />
      )}
      {s.phase === 'laundry' && (
        <CleanMeter label="Штаны в барабан" value={s.laundryProgress} />
      )}
      {['spin', 'response', 'clean'].includes(s.phase) && s.spin < 1 && (
        <>
          <CleanMeter label="Отжим" value={s.spin} />
          <CleanMeter
            label="Раскачка"
            value={s.balance}
            warning={s.balance > 0.5}
          />
        </>
      )}
      {s.phase === 'accident' && s.npcs[0].line && (
        <p className="clean-reaction">Дневальный: «{s.npcs[0].line}»</p>
      )}
      {s.phase === 'response' && (
        <p className="clean-reaction">
          {s.responseStage === 'gear'
            ? '«Нам нужна химзащита».'
            : '«Это, блять, какой режим стирки?»'}
        </p>
      )}
      {s.players > 1 && !['brief', 'clean', 'result'].includes(s.phase) && (
        <div className="clean-support-status" aria-label="Помощь друзей">
          {Array.from({ length: s.players - 1 }, (_, slot) => {
            const actor = slot + 1,
              task = cleanSupportTask(s, actor);
            return (
              <p key={actor}>
                <strong>{cleanCrew[actor].name}</strong>
                <span>
                  {task ? task.destination : 'Всё готово. Сбор у прачечной.'}
                </span>
              </p>
            );
          })}
        </div>
      )}
      {s.phase === 'clean' && (
        <>
          {s.valve < 1 && (
            <CleanMeter label="Перекрой воду" value={s.valve} warning />
          )}
          <CleanMeter
            label="Чистый проход"
            value={cleanFloorProgress(s)}
            detail={`${cleaned} / ${s.spots.length}`}
          />
          <CleanMeter label="Корпус стиралки" value={s.machineClean} />
          <div className="mop-meters">
            {Array.from({ length: s.actorCount }, (_, i) => (
              <CleanMeter
                key={i}
                label={cleanCrew[i].name}
                value={s.dirt[i] / 0.98}
                warning={s.dirt[i] > 0.75}
                detail={
                  s.rinse[i] > 0
                    ? `Полощет ${Math.round(s.rinse[i] * 100)}%`
                    : `Швабра ${Math.round((s.dirt[i] / 0.98) * 100)}%`
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

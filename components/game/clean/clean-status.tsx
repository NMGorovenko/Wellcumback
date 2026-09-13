import {
  cleanRole,
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
export default function CleanStatus({ game }: { game: CleanState }) {
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
                label={cleanRole(s, i).name}
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

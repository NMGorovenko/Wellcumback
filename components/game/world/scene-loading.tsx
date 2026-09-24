'use client';

export function SceneLoading({
  label,
  progress,
  title = 'Красноярск',
}: {
  label: string;
  progress: number;
  title?: string;
}) {
  return (
    <output className="scene-loading" aria-live="polite">
      <div className="scene-loading-card">
        <span className="scene-loading-mark" aria-hidden="true">
          ↗
        </span>
        <strong>{title}</strong>
        <span>{label}</span>
        <progress aria-label="Загрузка сцены" value={progress} max={1} />
      </div>
    </output>
  );
}

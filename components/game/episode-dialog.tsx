'use client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

export type EpisodeOption = { id: string; title: string; description: string };
export function EpisodeDialog({
  open,
  options,
  selected,
  onSelect,
  onChoose,
  onClose,
}: {
  open: boolean;
  options: readonly EpisodeOption[];
  selected: number;
  onSelect: (index: number) => void;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="screen-brief-dialog episode-dialog">
        <span className="tiny-label">ПЕРЕМОТКА · ТРЕНИРОВКА</span>
        <DialogTitle>С какого момента?</DialogTitle>
        <DialogDescription>
          Перейди прямо к нужному эпизоду. Текущая попытка начнётся заново, очки
          тренировки не попадут в счёт вечера.
        </DialogDescription>
        <div className="episode-options">
          {options.map((episode, index) => (
            <button
              type="button"
              key={episode.id}
              className={`episode-option${selected === index ? ' pad-selected' : ''}`}
              onFocus={() => onSelect(index)}
              onPointerEnter={() => onSelect(index)}
              onClick={() => onChoose(episode.id)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{episode.title}</strong>
                <small>{episode.description}</small>
              </div>
              <b aria-hidden="true">→</b>
            </button>
          ))}
        </div>
        <p className="brief-note">
          ↑↓ / стик — выбрать · Enter / нижняя кнопка геймпада — начать · Esc /
          правая кнопка — назад
        </p>
      </DialogContent>
    </Dialog>
  );
}

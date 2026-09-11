'use client';
import type { RefObject, ReactNode } from 'react';
import type { GameState } from '@/lib/game/screen/engine';
import {
  NAMES,
  SHORT_NAMES,
  SIDES,
  SIDE_ARROWS,
  MOVE_LABELS,
} from './screen-hud-data';
export type KeyRef = RefObject<Set<string>>;

export function Meter({
  label,
  value,
  min = 0,
  max = 1,
  target,
  hint,
  danger = false,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  target?: [number, number];
  hint?: string;
  danger?: boolean;
}) {
  const percent = (n: number) =>
    Math.max(0, Math.min(100, ((n - min) / (max - min)) * 100));
  return (
    <div className={`hud-meter${danger ? ' is-danger' : ''}`}>
      <div className="hud-meter-label">
        <span>{label}</span>
        {hint && <strong>{hint}</strong>}
      </div>
      <meter
        className="hud-meter-semantic"
        min={min}
        max={max}
        value={value}
        aria-label={label}
      />
      <div className="hud-meter-track" aria-hidden="true">
        {target && (
          <span
            className="hud-meter-target"
            style={{
              left: `${percent(target[0])}%`,
              width: `${percent(target[1]) - percent(target[0])}%`,
            }}
          />
        )}
        <i
          className="hud-meter-marker"
          style={{ left: `${percent(value)}%` }}
        />
      </div>
    </div>
  );
}

export function Fill({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className={`hud-fill${danger ? ' is-danger' : ''}`}>
      <div className="hud-meter-label">
        <span>{label}</span>
        <strong>{Math.round(value * 100)}%</strong>
      </div>
      <progress max={1} value={value} aria-label={label} />
    </div>
  );
}

export function HoldButton({
  code,
  label,
  keys,
  unlock,
  disabled = false,
  children,
}: {
  code: string;
  label: string;
  keys: KeyRef;
  unlock: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const press = () => {
    if (!disabled) {
      unlock();
      keys.current.add(code);
    }
  };
  const release = () => keys.current.delete(code);
  return (
    <button
      type="button"
      className="hud-hold-button"
      disabled={disabled}
      aria-label={label}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        press();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onKeyDown={(event) => {
        if (event.code === 'Space' || event.code === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          press();
        }
      }}
      onKeyUp={(event) => {
        if (event.code === 'Space' || event.code === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          release();
        }
      }}
      onBlur={release}
    >
      {children ?? label}
    </button>
  );
}

export function SideChooser({
  state,
  selected,
  onSelected,
  onMove,
}: {
  state: GameState;
  selected: number;
  onSelected: (player: number) => void;
  onMove: (player: number, side: number) => void;
}) {
  const worker = state.workers[selected];
  return (
    <div className="hud-sides">
      <fieldset className="hud-player-tabs" aria-label="Чей участок показать">
        {NAMES.slice(0, state.players).map((name, index) => (
          <button
            type="button"
            key={name}
            aria-pressed={selected === index}
            onClick={() => onSelected(index)}
          >
            {SHORT_NAMES[index]}
          </button>
        ))}
      </fieldset>
      <div className="hud-meter-label">
        <span>{NAMES[selected]} · перейти к стороне</span>
        <small>{MOVE_LABELS[selected]}</small>
      </div>
      <div className="hud-side-grid">
        {SIDES.map((name, side) => (
          <button
            type="button"
            key={name}
            aria-pressed={worker.targetSide === side}
            onClick={() => onMove(selected, side)}
            title={`${name} сторона`}
          >
            <span>
              {SIDE_ARROWS[side]} {name}
            </span>
            <b>
              {state.phase === 'rods'
                ? `${Math.round(state.rods[side] * 100)}%`
                : `${state.clips[side]}/4`}
            </b>
          </button>
        ))}
      </div>
      {worker.animation === 'walk' && (
        <p className="hud-note">Идёт вокруг полотна. Дождись, пока подойдёт.</p>
      )}
    </div>
  );
}

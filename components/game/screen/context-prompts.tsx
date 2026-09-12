'use client';
import type { RefObject } from 'react';
import type { PadFrame } from '@/lib/game/input/gamepads';
import type { GameState } from '@/lib/game/screen/engine';
import { screenPrompts, screenPromptInput } from '@/lib/game/screen/prompts';
import { NAMES } from './screen-hud-data';

export function ContextPrompts({
  state,
  pads,
  cueRefs,
}: {
  state: GameState;
  pads: Pick<PadFrame, 'assignments'>;
  cueRefs?: RefObject<(HTMLDivElement | null)[]>;
}) {
  if (state.phase === 'result' || state.paused) return null;
  return (
    <div className="world-action-cues">
      {screenPrompts(state).map(({ worker, player, role, prompts }) => (
        <div
          key={worker}
          ref={(node) => {
            if (cueRefs) cueRefs.current[worker] = node;
          }}
          className={`context-worker${player === null ? ' is-helper' : ''}`}
        >
          <div className="context-worker-name">
            <strong>{NAMES[worker]}</strong>
            <span>{player === null ? 'помогает сам' : role}</span>
          </div>
          <div className="context-cues">
            {prompts.map((prompt) => {
              if (player === null) return null;
              const { control, text, mode, direction, emphasis, satisfied } =
                prompt;
              const { label, held } = screenPromptInput(
                pads,
                player,
                prompt,
                state.heldKeys,
              );
              return (
                <span
                  key={control}
                  className={`context-cue${held && !(direction && satisfied === false) ? ' is-held' : ''}${mode === 'release' ? ' is-release' : ''}${satisfied === false ? ' is-needed' : ''}`}
                  data-direction={direction}
                  data-emphasis={emphasis}
                  data-satisfied={satisfied}
                >
                  <kbd>{label}</kbd>
                  <span>
                    {mode && (
                      <small>
                        {mode === 'hold'
                          ? 'держи'
                          : mode === 'release'
                            ? 'отпусти'
                            : 'нажми'}
                      </small>
                    )}
                    {text}
                  </span>
                </span>
              );
            })}
            {player !== null && !prompts.length && (
              <span className="context-ai">
                {state.drillMode === 'fallen'
                  ? 'Поднимаемся после падения…'
                  : 'Ждёт напарника'}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

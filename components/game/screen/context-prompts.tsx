'use client';
import type { RefObject } from 'react';
import type { PadFrame } from '@/lib/game/input/gamepads';
import type { GameState } from '@/lib/game/screen/engine';
import { screenPrompts, screenPromptInput } from '@/lib/game/screen/prompts';
import { NAMES } from './screen-hud-data';
import { screenDrillStatus, drillBalanceText } from './screen-drill-status';

export function ContextPrompts({
  state,
  pads,
  cueRefs,
  localPlayer,
}: {
  state: GameState;
  pads: Pick<PadFrame, 'assignments'>;
  cueRefs?: RefObject<(HTMLDivElement | null)[]>;
  localPlayer?: number;
}) {
  if (state.phase === 'result' || state.paused) return null;
  const drill = state.phase === 'drill' ? screenDrillStatus(state) : null;
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
            <strong>
              {NAMES[worker]}
              {localPlayer === player ? ' · ты' : ''}
            </strong>
            <span>
              {drill
                ? worker === 0
                  ? drill.assistant
                  : worker === 1
                    ? drill.climber
                    : role
                : player === null
                  ? 'помогает сам'
                  : role}
            </span>
          </div>
          <div className="context-cues">
            {prompts.map((prompt) => {
              if (
                player === null ||
                (localPlayer !== undefined && player !== localPlayer)
              )
                return null;
              const { control, text, mode, direction, emphasis, satisfied } =
                prompt;
              const balance =
                !!drill &&
                control === 'horizontal' &&
                (!!direction || mode === 'release');
              if (balance && !direction)
                return (
                  <span
                    key={control}
                    className="context-cue"
                    data-emphasis={emphasis}
                  >
                    {drillBalanceText(worker)}
                  </span>
                );
              const { label } = screenPromptInput(
                pads,
                localPlayer === undefined ? player : 0,
                prompt,
                state.heldKeys,
              );
              // A remote slot uses this computer's first control profile for
              // labels, but authoritative held keys still belong to that slot.
              const { held } = screenPromptInput(
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
                    {mode && !balance && (
                      <small>
                        {mode === 'hold'
                          ? 'держи'
                          : mode === 'release'
                            ? 'отпусти'
                            : 'нажми'}
                      </small>
                    )}
                    {balance ? drillBalanceText(worker, direction) : text}
                  </span>
                </span>
              );
            })}
            {player !== null && !prompts.length && (
              <span className="context-ai">
                {state.phase === 'drill' && state.drillMode === 'fallen'
                  ? 'Поднимаемся после падения…'
                  : state.phase === 'lift' && state.latched[worker]
                    ? 'Край зацеплен ✓'
                    : state.phase === 'tension' &&
                        state.tool.status === 'flight'
                      ? 'Передаём отвёртку'
                      : 'Ждёт напарника'}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

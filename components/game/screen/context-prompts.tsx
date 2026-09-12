'use client';
import {
  inputPrompt,
  PLAYER_BINDINGS,
  type PadFrame,
} from '@/lib/game/input/gamepads';
import type { GameState } from '@/lib/game/screen/engine';
import { screenPrompts } from '@/lib/game/screen/prompts';
import { NAMES } from './screen-hud-data';

export function ContextPrompts({
  state,
  pads,
}: {
  state: GameState;
  pads: Pick<PadFrame, 'assignments'>;
}) {
  if (state.phase === 'result') return null;
  return (
    <footer
      className="context-prompts"
      aria-label="Кнопки сейчас — Никита слева, Ярик справа"
    >
      {screenPrompts(state).map(({ worker, player, role, prompts }) => (
        <div
          key={worker}
          className={`context-worker${player === null ? ' is-helper' : ''}`}
        >
          <div className="context-worker-name">
            <strong>{NAMES[worker]}</strong>
            <span>{player === null ? 'помогает сам' : role}</span>
          </div>
          <div className="context-cues">
            {prompts.map(({ control, text, mode }) => {
              if (player === null) return null;
              const binding = PLAYER_BINDINGS[player];
              const code =
                control === 'action' || control === 'secondary'
                  ? binding[control]
                  : control === 'throw'
                    ? 'KeyQ'
                    : '';
              const held =
                state.heldKeys.includes(code) ||
                (player === 0 &&
                  control === 'action' &&
                  state.heldKeys.includes('Space'));
              return (
                <span
                  key={control}
                  className={`context-cue${held ? ' is-held' : ''}${mode === 'release' ? ' is-release' : ''}`}
                >
                  <kbd>{inputPrompt(pads, player, control)}</kbd>
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
            {player === null && (
              <span className="context-ai">
                {state.phase === 'drill'
                  ? 'Держит основание и подаёт инструменты'
                  : 'Держит, ловит и отвечает на твои действия'}
              </span>
            )}
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
    </footer>
  );
}

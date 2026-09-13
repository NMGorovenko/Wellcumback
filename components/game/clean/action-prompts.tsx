'use client';
import type { CleanState } from '@/lib/game/clean/engine';
import { cleanCrew } from '@/lib/game/clean/engine';
import { cleanPrompts, cleanPromptInput } from '@/lib/game/clean/prompts';
import type { PadFrame } from '@/lib/game/input/gamepads';
import type { ActionCueRefs } from '../world/action-cues';

export function CleanActionPrompts({
  state,
  pads,
  cueRefs,
  heldKeys,
  localSlot,
}: {
  localSlot?: number;
  state: CleanState;
  pads: Pick<PadFrame, 'assignments'>;
  cueRefs: ActionCueRefs;
  heldKeys: ReadonlySet<string>;
}) {
  if (state.paused || ['brief', 'result'].includes(state.phase)) return null;
  return (
    <div
      className="world-action-cues"
      aria-label="Кнопки действий рядом с персонажами"
    >
      {Array.from({ length: state.actorCount }, (_, actor) => (
        <div
          key={actor}
          ref={(node) => {
            cueRefs.current[actor] = node;
          }}
          className="context-worker"
        >
          <div className="context-worker-name">
            <strong>
              {actor === 0 && state.phase !== 'clean'
                ? 'Солдат'
                : cleanCrew[actor].name}
            </strong>
          </div>
          <div className="context-cues">
            {cleanPrompts(state, actor).map((prompt) => {
              const input = cleanPromptInput(
                pads,
                localSlot === undefined ? actor : 0,
                prompt,
                localSlot === undefined || localSlot === actor
                  ? heldKeys
                  : new Set(),
              );
              return (
                <span
                  className={`context-cue${input.held ? ' is-held' : ''}${prompt.mode === 'release' ? ' is-release' : ''}`}
                  key={prompt.control}
                >
                  {(localSlot === undefined || localSlot === actor) && (
                    <kbd>{input.label}</kbd>
                  )}
                  <span>
                    {prompt.mode && (
                      <small>
                        {prompt.mode === 'hold'
                          ? 'держи'
                          : prompt.mode === 'release'
                            ? 'отпусти'
                            : 'нажми'}
                      </small>
                    )}
                    {prompt.text}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

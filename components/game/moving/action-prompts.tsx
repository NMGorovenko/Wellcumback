'use client';
import {
  movingCrew,
  movingIntent,
  REACH,
  type MovingState,
} from '@/lib/game/moving/engine';
import {
  gamepadPrompt,
  keyboardPrompt,
  type PadFrame,
  type InputControl,
} from '@/lib/game/input/gamepads';
import type { ActionCueRefs } from '../world/action-cues';

export function MovingActionPrompts({
  state,
  pads,
  cueRefs,
}: {
  state: MovingState;
  pads: Pick<PadFrame, 'assignments'>;
  cueRefs: ActionCueRefs;
}) {
  if (state.paused || state.phase !== 'moving') return null;
  return (
    <div
      className="world-action-cues"
      aria-label="Действия рядом с персонажами"
    >
      {state.actors.map((actor, i) => {
        const automated = i >= state.players;
        const travellingForTask =
          actor.activity === 'alert-walk' || actor.activity === 'toilet-walk';
        const intent = movingIntent(state, i),
          bag = state.bags.find((b) => b.id === (actor.bagId ?? actor.zipping));
        const control: InputControl = ['travel', 'search', 'blocked'].includes(
          intent.kind,
        )
          ? 'move'
          : (intent.control ?? 'action');
        const prompt = (kind: InputControl) =>
          gamepadPrompt(pads, i, kind) || keyboardPrompt(i, kind);
        const canOpen =
          actor.bagId === null &&
          actor.heldItem === null &&
          state.bags.some(
            (b) =>
              b.status === 'closed' &&
              Math.hypot(b.x - actor.x, b.y - actor.y) <= REACH,
          );
        return (
          <div
            key={i}
            ref={(node) => {
              cueRefs.current[i] = node;
            }}
            className={`context-worker moving-worker${automated ? ' is-assistant' : ''}${actor.stamina < 30 ? ' is-tired' : ''}`}
          >
            <div className="context-worker-name">
              <strong>
                {movingCrew[i].name}
                {automated ? ' · сама' : ` · ${i + 1}`}
              </strong>
              <span>
                {actor.activity === 'rest' ? 'Отдых · ' : ''}
                {Math.round(actor.stamina)}% сил
              </span>
            </div>
            <progress
              aria-label={`Силы: ${movingCrew[i].name}`}
              max={100}
              value={actor.stamina}
            />
            <div className="context-cues">
              <span className={`context-cue${actor.working ? ' is-held' : ''}`}>
                {!automated &&
                  !travellingForTask &&
                  actor.activity !== 'toilet' && (
                    <kbd>
                      {intent.release
                        ? `${prompt('action')} / ${prompt('secondary')}`
                        : prompt(control)}
                    </kbd>
                  )}
                <span>
                  {intent.hold && !automated && <small>держи</small>}
                  {intent.label}
                </span>
              </span>
              {!automated &&
                (actor.heldItem !== null ||
                  actor.bagId !== null ||
                  canOpen) && (
                  <span className="context-cue">
                    <kbd>{prompt('secondary')}</kbd>
                    <span>{canOpen ? 'открыть сумку' : 'опустить'}</span>
                  </span>
                )}
            </div>
            {actor.zipping !== null && bag && (
              <progress aria-label="Молния" max={1} value={bag.zip} />
            )}
            {['packing', 'laptop', 'toilet'].includes(actor.activity) && (
              <progress
                aria-label="Текущее действие"
                max={1}
                value={actor.activityProgress}
              />
            )}
            {actor.activity === 'rest' && (
              <small>
                {actor.stamina < 84
                  ? `Ещё около ${Math.ceil((84 - actor.stamina) / 3.6)} с передышки`
                  : 'Можно возвращаться к сумкам'}
              </small>
            )}
            {actor.packingBag !== null &&
              (() => {
                const packing = state.bags.find(
                  (b) => b.id === actor.packingBag,
                );
                const item = state.items.find(
                  (item) => item.id === actor.heldItem,
                );
                return packing && item ? (
                  <small>
                    {packing.weight}/{packing.capacity} кг · после вещи свободно{' '}
                    {Math.max(
                      0,
                      packing.capacity - packing.weight - item.weight,
                    )}{' '}
                    кг
                  </small>
                ) : null;
              })()}
            {bag && actor.bagId !== null && (
              <small>
                {bag.weight} кг ·{' '}
                {bag.carriers.length === 2
                  ? 'несём вдвоём'
                  : state.players > 1
                    ? 'друг может взять вторую ручку'
                    : 'можно донести одному'}
              </small>
            )}
            {actor.stamina < 30 && actor.activity === 'free' && (
              <small>
                {automated
                  ? 'Скоро понадобится передышка'
                  : 'Можно передохнуть на диване'}
              </small>
            )}
          </div>
        );
      })}
    </div>
  );
}

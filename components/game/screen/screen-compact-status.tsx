'use client';

import { Check } from 'lucide-react';
import {
  gamepadPrompt,
  keyboardPrompt,
  type PadFrame,
  type InputControl,
} from '@/lib/game/input/gamepads';
import {
  springWindow,
  throwTargetPower,
  type GameState,
} from '@/lib/game/screen/engine';
import { chairBalanceCue } from '@/lib/game/screen/prompts';
import { ACTION_LABELS, NAMES, SIDES } from './screen-hud-data';
import { Fill, Meter } from './screen-hud-primitives';
import { screenDrillStatus } from './screen-drill-status';

/** The playing HUD shows state. Detailed instructions and pointer controls live
 * in the explicitly opened help drawer, never over the play surface. */
function Edges({ view }: { view: GameState }) {
  return (
    <div className="hud-edge-progress" aria-label="Четыре стороны полотна">
      {SIDES.map((side, index) => {
        const value =
          view.phase === 'rods' ? view.rods[index] : view.clips[index] / 4;
        return (
          <div key={side} title={side}>
            <span>
              {side.slice(0, 1)}{' '}
              <b>
                {view.phase === 'rods'
                  ? `${Math.round(value * 100)}%`
                  : `${view.clips[index]}/4`}
              </b>
            </span>
            <progress max={1} value={value} aria-label={`${side} сторона`} />
          </div>
        );
      })}
    </div>
  );
}
export function ScreenCompactStatus({
  view,
  localPlayer,
  pads = { assignments: [] },
}: {
  view: GameState;
  localPlayer?: number;
  pads?: Pick<PadFrame, 'assignments'>;
}) {
  const hint = (player: number, control: InputControl, offline: string) =>
    localPlayer === undefined
      ? offline
      : player === localPlayer
        ? gamepadPrompt(pads, 0, control) || keyboardPrompt(0, control)
        : NAMES[player];
  switch (view.phase) {
    case 'frame':
      return (
        <>
          <div className="hud-compact-title">
            Угол {view.corners + 1} ·{' '}
            {view.frameStage === 'align' ? 'совместить' : 'защёлкнуть'}
          </div>
          {view.frameStage === 'align' ? (
            <>
              <Meter
                label="Сдвиг"
                value={view.frameFit}
                min={-1}
                max={1}
                target={[-0.1, 0.1]}
                hint={hint(0, 'horizontal', 'A / D')}
              />
              <Meter
                label="Поворот"
                value={view.frameTwist}
                min={-1}
                max={1}
                target={[-0.1, 0.1]}
                hint={hint(
                  view.players > 1 ? 1 : 0,
                  'vertical',
                  view.players > 1 ? 'Ярик · ↑ / ↓' : 'W / S',
                )}
              />
            </>
          ) : (
            <Meter
              label="До щелчка"
              value={view.cursor}
              target={[
                0.5 - (0.075 + view.frameBrace * 0.08),
                0.5 + (0.075 + view.frameBrace * 0.08),
              ]}
              hint={hint(localPlayer ?? 0, 'action', 'E')}
            />
          )}
        </>
      );
    case 'rods':
      return (
        <>
          <Edges view={view} />
          {view.workers.slice(0, view.players).map((worker, player) => (
            <div className="hud-compact-worker" key={player}>
              <Meter
                label={`${NAMES[player]} · ${SIDES[worker.side].toLowerCase()}`}
                value={view.rodAlignment[worker.side]}
                min={-1}
                max={1}
                target={[
                  view.rodTarget[worker.side] - 0.19,
                  view.rodTarget[worker.side] + 0.19,
                ]}
                hint={hint(player, 'action', ACTION_LABELS[player])}
                danger={view.rodPressure[worker.side] > 0.5}
              />
              {view.rodJam[worker.side] > 0 && (
                <span className="hud-compact-alert">
                  Закусило ·{' '}
                  {localPlayer === undefined || player === localPlayer
                    ? `отпусти ${hint(player, 'action', ACTION_LABELS[player])}`
                    : NAMES[player]}
                </span>
              )}
            </div>
          ))}
        </>
      );
    case 'tension': {
      const tool = view.tool,
        force = springWindow(view),
        target = throwTargetPower(view);
      return (
        <>
          <Edges view={view} />
          <div className="hud-compact-owner">
            <span>Отвёртка</span>
            <strong>
              {tool.status === 'ground'
                ? 'на полу'
                : tool.status === 'flight'
                  ? `→ ${NAMES[tool.target]}`
                  : NAMES[tool.owner]}
            </strong>
          </div>
          {view.springSupport > 0 &&
            tool.status === 'held' &&
            !tool.needsPass && (
              <span className="hud-compact-alert is-ready">
                Край поддержан · легче натянуть
              </span>
            )}
          {tool.status === 'ground' ? (
            <div className="hud-compact-alert">
              {SIDES[tool.groundSide]} сторона · подними действием
            </div>
          ) : tool.status === 'flight' ? (
            <Fill
              label={
                tool.target < view.players
                  ? `${hint(tool.target, 'action', ACTION_LABELS[tool.target])} · лови`
                  : 'Ярик ловит'
              }
              value={tool.flight}
            />
          ) : tool.status === 'charging' || tool.needsPass ? (
            <Meter
              label={
                localPlayer !== undefined && localPlayer !== tool.owner
                  ? `${NAMES[tool.owner]} · готовит бросок`
                  : `Бросок → отпусти ${hint(tool.owner, 'throw', 'Q')}`
              }
              value={tool.status === 'charging' ? tool.charge : 0}
              target={[target - 0.105, target + 0.105]}
            />
          ) : (
            <Meter
              label="Пружина → отпусти действие"
              value={view.spring.active ? view.spring.power : 0}
              target={force}
              danger={view.spring.power > force[1]}
            />
          )}
        </>
      );
    }
    case 'drill': {
      const balance = chairBalanceCue(view);
      const status = screenDrillStatus(view);
      return (
        <>
          <div className="hud-compact-title">
            {view.holes.length === 0 ? 'Левая' : 'Правая'} отметка
          </div>
          {view.drillMode === 'position' ? (
            <Meter
              label="Подставить стулья"
              value={view.chairX}
              min={-7}
              max={7}
              target={view.holes.length === 0 ? [-4.75, -4.05] : [4.05, 4.75]}
              hint={hint(0, 'horizontal', 'A / D')}
            />
          ) : view.drillMode === 'climb' || view.drillMode === 'descend' ? (
            <Fill
              label={
                view.drillMode === 'climb'
                  ? 'Ярик забирается'
                  : 'Ярик спускается'
              }
              value={view.drillMode === 'climb' ? view.climb : 1 - view.climb}
            />
          ) : view.drillMode === 'handoff' ? (
            status.transfer ? (
              <Fill
                label={
                  status.transfer === 'drill'
                    ? 'Передаём дрель'
                    : 'Передаём пылесос'
                }
                value={view.handoffProgress}
              />
            ) : status.pickup ? (
              <Fill
                label={`Никита ${status.assistant}`}
                value={view.drillAssistant.pickupProgress}
              />
            ) : (
              <div className="hud-compact-alert">Никита {status.assistant}</div>
            )
          ) : view.drillMode === 'fallen' ? (
            <Fill label="Без паники. Встаём." value={view.fallProgress} />
          ) : (
            <>
              <Fill
                label={view.drillHeat > 0.75 ? 'Остуди дрель' : 'Нагрев'}
                value={view.drillHeat}
                danger={view.drillHeat > 0.75}
              />
              <div className="hud-compact-alert">
                {view.vacuumRunning
                  ? 'Пылесос работает · пыль в контейнер'
                  : 'Пылесос выключен'}
              </div>
              <Fill
                label="Пыль на стене"
                value={Math.min(1, view.wallDust[0] + view.wallDust[1])}
                danger={view.wallDust[0] + view.wallDust[1] > 0.2}
              />
              {view.holes.length > 0 && (
                <div className="hud-compact-alert">
                  {Math.abs(view.aim - view.holes[0]) < 0.04
                    ? 'На уровне первого'
                    : view.aim > view.holes[0]
                      ? 'Выше первого'
                      : 'Ниже первого'}
                </div>
              )}
            </>
          )}
          {view.drillMode !== 'position' && view.drillMode !== 'fallen' && (
            <Meter
              label={
                !status.braced
                  ? 'Ярик держит равновесие'
                  : view.players === 1
                    ? 'Никита страхует стулья'
                    : balance.text
              }
              value={view.balance}
              min={-1}
              max={1}
              target={[-0.14, 0.14]}
              danger={balance.emphasis === 'danger'}
            />
          )}
        </>
      );
    }
    case 'lift':
      return (
        <>
          <Meter
            label={view.latched[0] ? 'Левый ✓' : 'Левый край'}
            value={view.liftLeft - view.holes[0]}
            min={-1.5}
            max={1.5}
            target={[-0.12, 0.12]}
            hint={hint(0, 'vertical', 'W / S')}
          />
          <Meter
            label={view.latched[1] ? 'Правый ✓' : 'Правый край'}
            value={view.liftRight - view.holes[1]}
            min={-1.5}
            max={1.5}
            target={[-0.12, 0.12]}
            hint={hint(1, 'vertical', view.players > 1 ? '↑ / ↓' : 'Ярик')}
          />
          <Meter
            label="Сдвиг"
            value={view.liftX}
            min={-2}
            max={2}
            target={[-0.16, 0.16]}
            hint={hint(0, 'horizontal', 'A / D')}
          />
        </>
      );
    case 'level':
      return (
        <>
          <Meter
            label="Уровень"
            value={view.bubble}
            min={-0.22}
            max={0.22}
            target={[-0.012, 0.012]}
          />
          <div
            className={`hud-compact-alert${view.levelStable >= 1 ? ' is-ready' : ''}`}
          >
            {view.levelStable >= 1 ? (
              <>
                <Check size={13} />{' '}
                {localPlayer !== undefined
                  ? `${hint(localPlayer, 'action', 'E')} · готово`
                  : view.players > 1
                    ? 'Действие · готово'
                    : 'E · готово'}
              </>
            ) : view.levelStable > 0 ? (
              'Дай пузырьку успокоиться'
            ) : (
              'Поправь подвесы A / D'
            )}
          </div>
        </>
      );
    case 'result':
      return null;
  }
}

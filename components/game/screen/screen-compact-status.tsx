'use client';

import { Check } from 'lucide-react';
import {
  springWindow,
  throwTargetPower,
  type GameState,
} from '@/lib/game/screen/engine';
import { ACTION_LABELS, NAMES, SIDES } from './screen-hud-data';
import { Fill, Meter } from './screen-hud-primitives';

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
export function ScreenCompactStatus({ view }: { view: GameState }) {
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
                hint="A / D"
              />
              <Meter
                label="Поворот"
                value={view.frameTwist}
                min={-1}
                max={1}
                target={[-0.1, 0.1]}
                hint="W / S"
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
              hint="E"
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
                hint={ACTION_LABELS[player]}
                danger={view.rodPressure[worker.side] > 0.5}
              />
              {view.rodJam[worker.side] > 0 && (
                <span className="hud-compact-alert">
                  Закусило — отпусти {ACTION_LABELS[player]}
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
          {tool.status === 'ground' ? (
            <div className="hud-compact-alert">
              {SIDES[tool.groundSide]} сторона · подними действием
            </div>
          ) : tool.status === 'flight' ? (
            <Fill
              label={
                tool.target < view.players
                  ? `${ACTION_LABELS[tool.target]} · лови`
                  : 'Никита ловит'
              }
              value={tool.flight}
            />
          ) : tool.status === 'charging' || tool.needsPass ? (
            <Meter
              label="Бросок → отпусти Q"
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
    case 'drill':
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
              hint="A / D"
            />
          ) : view.drillMode === 'climb' ? (
            <Fill label="Поднимаемся" value={view.climb} />
          ) : (
            <>
              <Meter
                label="Равновесие"
                value={view.balance}
                min={-1}
                max={1}
                target={[-0.5, 0.5]}
                danger={Math.abs(view.balance) > 0.7}
              />
              <Fill
                label={view.drillHeat > 0.75 ? 'Остуди дрель' : 'Нагрев'}
                value={view.drillHeat}
                danger={view.drillHeat > 0.75}
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
        </>
      );
    case 'lift':
      return (
        <>
          <Meter
            label={view.latched[0] ? 'Левый ✓' : 'Левый край'}
            value={view.liftLeft - view.holes[0]}
            min={-1.5}
            max={1.5}
            target={[-0.12, 0.12]}
            hint="W / S"
          />
          <Meter
            label={view.latched[1] ? 'Правый ✓' : 'Правый край'}
            value={view.liftRight - view.holes[1]}
            min={-1.5}
            max={1.5}
            target={[-0.12, 0.12]}
            hint={view.players > 1 ? '↑ / ↓' : 'Никита'}
          />
          <Meter
            label="Сдвиг"
            value={view.liftX}
            min={-2}
            max={2}
            target={[-0.16, 0.16]}
            hint="A / D"
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
                <Check size={13} /> E · готово
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

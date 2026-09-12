import {
  assistantObjective,
  pickupCandidate,
} from '../lib/game/screen/drill-tools.ts';
import {
  drillPath,
  drillDistance,
  nearChairs,
} from '../lib/game/screen/drill-space.ts';
const sign = (v, positive, negative, epsilon = 0.035) =>
  v > epsilon ? positive : v < -epsilon ? negative : null;
export function drillControls(s, options = {}) {
  const keys = new Set(),
    solo = s.players === 1,
    action = solo ? 'KeyE' : 'Enter';
  const add = (k) => {
    if (k) keys.add(k);
  };
  if (!solo) {
    const a = s.drillAssistant,
      goal = assistantObjective(s);
    const needFetch =
      s.toolsRemembered &&
      Object.values(s.drillTools).some(
        (t) => t.location === 'shelf' || t.location === 'ground',
      );
    const target = needFetch ? goal : assistantObjective(s);
    if (pickupCandidate(s)) add('KeyE');
    else if (drillDistance(a, target) > 0.03) {
      const path = drillPath(s, a, target),
        next = path[0];
      if (next) {
        add(sign(next.x - a.x, 'KeyD', 'KeyA', 0.012));
        add(sign(next.z - a.z, 'KeyS', 'KeyW', 0.012));
      }
    } else {
      add('KeyE');
      if (s.drillMode !== 'position')
        add(sign(-s.balance, 'KeyD', 'KeyA', 0.045));
    }
  }
  if (s.drillMode === 'position') {
    const target = s.holes.length ? -4.4 + 8.8 : -4.4;
    if (solo || nearChairs(s))
      add(sign(target - s.chairX, 'KeyD', 'KeyA', 0.04));
    if (
      Math.abs(s.chairX - target) < 0.08 &&
      !s.simulation.previousActions[solo ? 0 : 1]
    )
      add(action);
  } else if (s.drillMode === 'drill') {
    add(solo ? 'ShiftLeft' : 'ShiftRight');
    add(
      sign(
        5.9 - s.aim,
        solo ? 'KeyW' : 'ArrowUp',
        solo ? 'KeyS' : 'ArrowDown',
        0.01,
      ),
    );
    if (
      s.drillHeat < 0.73 &&
      (s.simulation.previousActions[solo ? 0 : 1] || s.drillHeat < 0.25)
    )
      add(action);
  } else if (['climb', 'handoff', 'descend'].includes(s.drillMode)) add(action);
  if (s.drillMode !== 'position' && !s.braceHeld && !options.noSelfBalance)
    add(
      sign(
        -s.balance,
        solo ? 'KeyD' : 'ArrowRight',
        solo ? 'KeyA' : 'ArrowLeft',
        0.055,
      ),
    );
  return keys;
}

export function equipDriller(s, gear = 'ready') {
  s.toolsRemembered = true;
  s.drillTools.drill.location = gear === 'none' ? 'assistant' : 'climber';
  s.drillTools.vacuum.location = gear === 'ready' ? 'climber' : 'assistant';
  s.drillGear = gear;
  return s;
}

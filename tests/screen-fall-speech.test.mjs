import test from 'node:test';
import assert from 'node:assert/strict';
import { freshGame, tick } from '../lib/game/screen/engine.ts';
for (const held of [[], ['drill'], ['vacuum'], ['drill', 'vacuum']])
  void test(`Yarik shouts while actual dropped tools are preserved: ${held.join('+') || 'nothing'}`, () => {
    const s = freshGame(2);
    Object.assign(s, {
      phase: 'drill',
      drillMode: 'handoff',
      climb: 1,
      toolsRemembered: true,
      balance: 1.4,
    });
    for (const kind of ['drill', 'vacuum'])
      s.drillTools[kind].location = held.includes(kind)
        ? 'climber'
        : 'assistant';
    tick(s, 1 / 60, new Set());
    assert.equal(s.drillMode, 'fallen');
    assert.equal(s.speechText, 'бляяяяяять');
    assert.equal(s.messageSpeaker, 1);
    for (const kind of ['drill', 'vacuum'])
      assert.equal(
        s.drillTools[kind].location,
        held.includes(kind) ? 'falling' : 'assistant',
      );
  });

import test from "node:test";
import assert from "node:assert/strict";
import { freshClean, cleanTick, stations, canStand } from "../lib/game/clean/engine.ts";
import { cleanPrompts, cleanPromptInput } from "../lib/game/clean/prompts.ts";

function stateAt(phase, station, distance, players = 1) {
  const s = freshClean(players);
  Object.assign(s, {
    phase,
    actorCount: phase === "clean" ? players : 1,
    spin: 1,
    valve: 1,
    machineClean: 1,
  });
  s.x[0] = stations[station].x - distance;
  s.y[0] = stations[station].y;
  assert.ok(canStand(s.x[0], s.y[0]), "test must use a legal standing position");
  return s;
}
const run = (s, keys) => cleanTick(s, 0.1, new Set(keys));
const action = (s) => cleanPrompts(s).some((p) => p.control === "action");

for (const [phase, station, field, radius] of [
  ["toilet", 1, "relief", 62],
  ["shower", 2, "shower", 62],
  ["laundry", 3, "laundryProgress", 70],
]) {
  void test(`${phase}: action badge and real progress share the exact ${radius}-unit boundary`, () => {
    for (const distance of [radius - 0.1, radius, radius + 0.1, radius + 7]) {
      const s = stateAt(phase, station, distance);
      assert.equal(action(s), distance < radius);
      run(s, ["KeyE"]);
      assert.equal(s[field] > 0, distance < radius);
    }
  });
}

void test("a running washer offers bracing before washing or a full-mop trip", () => {
  const s = stateAt("clean", 3, 55);
  Object.assign(s, { spin: 0.5, machine: 17, machineClean: 0, pantsLoaded: true });
  s.dirt[0] = 0.98;
  assert.equal(cleanPrompts(s)[0].text, "придержать стиралку");
  run(s, ["KeyE"]);
  assert.equal(s.activity[0], "brace");
  assert.equal(s.machineClean, 0);
  s.spin = 1;
  assert.equal(cleanPrompts(s)[0].control, "move");
  s.dirt[0] = 0;
  assert.equal(cleanPrompts(s)[0].text, "драить стиралку");
  run(s, ["KeyE"]);
  assert.ok(s.machineClean > 0);
});

void test("valve and bucket cues preserve work priority and the small dirt threshold", () => {
  const valve = stateAt("clean", 4, 30);
  valve.valve = 0;
  valve.dirt[0] = 0.98;
  assert.equal(cleanPrompts(valve)[0].text, "перекрыть воду");
  run(valve, ["KeyE"]);
  assert.ok(valve.valve > 0);
  for (const dirt of [0.001, 0.0011, 0.02, 0.98]) {
    const bucket = stateAt("clean", 5, 30);
    bucket.dirt[0] = dirt;
    assert.equal(
      cleanPrompts(bucket).some((p) => p.text === "прополоскать швабру"),
      dirt > 0.001,
    );
    run(bucket, ["KeyE"]);
    assert.equal(bucket.rinse[0] > 0, dirt > 0.001);
  }
});

void test("distant traces offer movement; only actual mop reach offers action", () => {
  for (const distance of [56.9, 57, 57.1, 150]) {
    const s = stateAt("clean", 7, 0);
    s.spots = [
      {
        id: 1,
        x: s.x[0] + distance,
        y: s.y[0],
        size: 8,
        weight: 1,
        kind: "footprint",
        foam: false,
        progress: 0,
        rotation: 0,
        createdAt: 0,
      },
    ];
    assert.equal(action(s), distance < 57);
    assert.equal(cleanPrompts(s)[0].control, distance < 57 ? "action" : "move");
    run(s, ["KeyE"]);
    assert.equal(s.spots[0].progress > 0, distance < 57);
  }
});

void test("a nearly saturated mop uses the same epsilon as work()", () => {
  const s = stateAt("clean", 3, 55);
  s.machineClean = 0;
  for (const dirt of [0.98 - 2e-8, 0.98 - 5e-9, 0.98]) {
    s.dirt[0] = dirt;
    assert.equal(action(s), dirt < 0.98 - 1e-8);
  }
});

void test("away from fixtures cleanup directs each player to the unfinished objective", () => {
  const s = stateAt("clean", 7, 0, 3);
  s.valve = 0;
  assert.match(cleanPrompts(s)[0].text, /вентилю/);
  s.valve = 1;
  s.spin = 0.5;
  assert.match(cleanPrompts(s)[0].text, /придержать/);
  s.spin = 1;
  s.machineClean = 0;
  assert.match(cleanPrompts(s)[0].text, /отмыть корпус/);
  s.dirt[0] = 0.98;
  assert.match(cleanPrompts(s)[0].text, /ведру/);
  assert.equal(cleanPrompts(s, 3).length, 0);
});

void test("held feedback uses merged inputs, the correct player and Space alias", () => {
  const pads = { assignments: [] },
    prompt = { control: "action", text: "" };
  for (const [actor, key, label] of [
    [0, "KeyE", "E"],
    [1, "Enter", "Enter"],
    [2, "KeyO", "O"],
  ]) {
    assert.deepEqual(cleanPromptInput(pads, actor, prompt, new Set([key])), { label, held: true });
    assert.equal(cleanPromptInput(pads, actor, prompt, new Set()).held, false);
    assert.equal(cleanPromptInput(pads, actor, prompt, new Set(["Space"])).held, actor === 0);
  }
  assert.equal(
    cleanPromptInput({ assignments: [{ player: 1, brand: "xbox" }] }, 1, prompt, new Set(["Enter"]))
      .held,
    true,
  );
  assert.equal(
    cleanPromptInput(pads, 0, { control: "move", text: "" }, new Set(["KeyA", "KeyD"])).held,
    false,
  );
  assert.equal(
    cleanPromptInput(pads, 0, { control: "move", text: "" }, new Set(["KeyW"])).held,
    true,
  );
});

void test("rhythm and containment cues show actual Q/E input and release exhausted containment", () => {
  const s = stateAt("find", 7, 0),
    pads = { assignments: [] };
  s.rhythm.expected = "KeyQ";
  assert.deepEqual(
    cleanPrompts(s).map((p) => p.control),
    ["move", "throw"],
  );
  assert.equal(cleanPromptInput(pads, 0, cleanPrompts(s)[1], new Set(["KeyQ"])).held, true);
  s.rhythm.expected = "KeyE";
  assert.deepEqual(
    cleanPrompts(s).map((p) => p.control),
    ["move", "action"],
  );
  s.phase = "toilet";
  assert.equal(cleanPrompts(s)[1].mode, "hold");
  s.containment.stamina = 0;
  assert.equal(cleanPrompts(s)[1].mode, "release");
  s.paused = true;
  assert.deepEqual(cleanPrompts(s), []);
});

// Run: node --test
// The epilog (V9, Phase 4 R1): a pure clock over the real time-of-day lerp. EffectsManager's
// constructor needs the DOM, so the sky is built from its prototype (as effects.test.js does);
// setTimeOfDay is replaced by a recorder (the real one only sets forcedTime and logs).
import test from "node:test";
import assert from "node:assert/strict";
import { Epilog, EPILOG_NIGHT_STEPS, EPILOG_DAWN_STEPS } from "../js/credits.js";
import { EffectsManager, TIME_TARGETS } from "../js/effects.js";
import { SUN_X } from "../js/sky.js";
import { JOR } from "../js/helpers.js";

const [mr, mg, mb, ma] = TIME_TARGETS.morning;
const MORNING = { r: mr, g: mg, b: mb, a: ma }; // effects.js's morning target

function sky(forcedTime, a = 0) {
  const f = Object.create(EffectsManager.prototype);
  return Object.assign(f, {
    forcedTime,
    timeMode: null, // the time fields updateTimeOfDay reads (V3 sky: clock and sun)
    clockMode: null,
    _clockMs: 0,
    sunX: SUN_X.noon,
    sunUp: 1,
    currentTimeState: { r: 255, g: 255, b: 255, a },
    calls: [],
    setTimeOfDay(mode) {
      this.forcedTime = mode;
      this.calls.push(mode);
    },
  });
}

// Game.update order: effects.update (the lerp) runs before credits.update (the epilog step).
// Returns the steps run until the card is due, or until `skipAt` (then the skip is applied).
function play(fx, skipAt = Infinity) {
  const ep = new Epilog(fx);
  fx.updateTimeOfDay(JOR.STEP_MS); // the trigger step
  ep.start();
  for (let i = 1; ; i++) {
    fx.updateTimeOfDay(JOR.STEP_MS);
    if (i === skipAt) {
      ep.end(true);
      return { ep, steps: i };
    }
    if (ep.step()) {
      ep.end(false);
      return { ep, steps: i };
    }
  }
}

test("epilog: 4.5 s of night, then 2 s of morning, then the card; the sky is set only on a change", () => {
  assert.equal(EPILOG_NIGHT_STEPS, 270);
  assert.equal(EPILOG_DAWN_STEPS, 120);
  const fx = sky("noon");
  const ep = new Epilog(fx);
  assert.equal(ep.running, false);
  ep.start();
  assert.equal(ep.running, true);
  let due = 0;
  const seen = [];
  for (let i = 1; i <= 400 && !due; i++) {
    if (ep.step()) due = i;
    seen.push(fx.forcedTime);
  }
  assert.equal(due, 390); // 6.5 s at 60 steps per second
  assert.equal(seen.indexOf("morning"), 269); // the 270th step turns the sky
  assert.deepEqual(fx.calls, ["night", "morning"]);
  // A console redok.time() mid-scene is overruled on the next step.
  const fx2 = sky(null);
  const ep2 = new Epilog(fx2);
  ep2.start();
  fx2.forcedTime = "noon";
  ep2.step();
  assert.equal(fx2.forcedTime, "night");
});

test("epilog: the card opens on a morning sky, after the sunrise or at once on a skip", () => {
  // Natural: 270 lerp steps toward night from noon, then 120 toward morning.
  const q = 1 - JOR.STEP_MS * 0.002;
  const night = 0.5 * (1 - q ** 270);
  const natural = play(sky("noon"));
  assert.equal(natural.steps, 390);
  assert.ok(Math.abs(natural.ep.fx.currentTimeState.a - (0.1 + (night - 0.1) * q ** 120)) < 1e-9);
  assert.ok(natural.ep.fx.currentTimeState.a > 0.106 && natural.ep.fx.currentTimeState.a < 0.108);
  assert.equal(natural.ep.running, false);
  // The night really fell before the sunrise (a past 0.45 from step ~68 on).
  const fx = sky("noon");
  const ep = new Epilog(fx);
  ep.start();
  for (let i = 0; i < 100; i++) {
    fx.updateTimeOfDay(JOR.STEP_MS);
    ep.step();
  }
  assert.ok(fx.currentTimeState.a > 0.45);
  // Skip mid-night (Esc / "Lewati"): the morning target exactly, tint and sun, no lerp.
  for (const at of [1, 60, 300]) {
    const skipped = play(sky("noon"), at);
    assert.deepEqual({ ...skipped.ep.fx.currentTimeState }, MORNING);
    assert.deepEqual([skipped.ep.fx.sunX, skipped.ep.fx.sunUp], [SUN_X.morning, 1]);
    assert.equal(skipped.ep.fx.forcedTime, "morning");
    assert.equal(skipped.ep.running, false);
  }
});

test("epilog: closing the card gives back the visitor's time once (clock or cheat)", () => {
  for (const before of [null, "night", "noon", "afternoon", "morning"]) {
    const { ep } = play(sky(before), 5);
    assert.equal(ep.fx.forcedTime, "morning");
    ep.restore();
    assert.equal(ep.fx.forcedTime, before);
    ep.restore(); // a second close (replay, then a later Esc) changes nothing
    assert.equal(ep.fx.forcedTime, before);
    assert.deepEqual(ep.fx.calls, ["night", "morning", before]);
  }
  // Never started (the card opened some other way): nothing to give back.
  const fx = sky("night");
  new Epilog(fx).restore();
  assert.deepEqual(fx.calls, []);
});

// Run: node --test
// The epilog (V9, Phase 4 R1): a pure clock over the real time-of-day lerp. EffectsManager's
// constructor needs the DOM, so the sky is built from its prototype (as effects.test.js does);
// setTimeOfDay is replaced by a recorder (the real one only sets forcedTime and logs).
import test from "node:test";
import assert from "node:assert/strict";
import { Epilog, EPILOG_DAWN_STEPS, CREDITS_X, RIDE_END_X, RETURN_X, rideSpeed } from "../js/credits.js";
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
// The ride ends on step `ride` (the bike stopped). Returns the steps run until the card is due,
// or until `skipAt` (then the skip is applied).
function play(fx, ride, skipAt = Infinity) {
  const ep = new Epilog(fx);
  fx.updateTimeOfDay(JOR.STEP_MS); // the trigger step
  ep.start();
  for (let i = 1; ; i++) {
    fx.updateTimeOfDay(JOR.STEP_MS);
    if (i === skipAt) {
      ep.end(true);
      return { ep, steps: i };
    }
    if (ep.step(i >= ride)) {
      ep.end(false);
      return { ep, steps: i };
    }
  }
}

// The scripted ride as player.update runs it (R-E3): each step's speed from the last speed and
// the distance left; the move ends on the step that reaches the target.
function ride(v0, x0) {
  const target = RIDE_END_X - 100; // the bike's left edge (200 px wide)
  let x = x0, v = v0, n = 0, jerk = 0, top = 0;
  while (x < target && n < 2000) {
    const next = rideSpeed(v, target - x);
    jerk = Math.max(jerk, Math.abs(next - v));
    top = Math.max(top, next);
    v = next;
    x += v;
    n++;
  }
  return { n, jerk, top, x, target };
}

test("epilog ride: from any entry speed the bike eases to a stop on the target in ~5 s", () => {
  assert.equal(CREDITS_X, 7100);
  assert.equal(RIDE_END_X, 8000);
  assert.equal(RETURN_X, 7150);
  for (const v0 of [0, 1, 4, 6, 10]) {
    for (const x0 of [CREDITS_X - 100, CREDITS_X - 100 + 9.9]) {
      const r = ride(v0, x0);
      assert.ok(r.n >= 260 && r.n <= 350, `v0 ${v0} x0 ${x0}: ${r.n} steps`);
      assert.ok(r.jerk <= 0.4, `v0 ${v0}: speed changes ${r.jerk} px/step in one step`);
      assert.ok(r.top <= Math.max(v0, 3), `v0 ${v0}: top ${r.top}`); // never speeds past the entry or the cruise
      assert.ok(r.x - r.target < 0.2, `v0 ${v0}: overshoot ${r.x - r.target}`); // player.update snaps onto it
    }
  }
  // The last steps crawl: the bike rolls to a stop, it does not brake hard.
  const v = [];
  for (let x = RIDE_END_X - 160, s = 3; x < RIDE_END_X - 100; x += s) v.push((s = rideSpeed(s, RIDE_END_X - 100 - x)));
  assert.ok(v.at(-1) < 0.5 && v.every((s, i) => i === 0 || s <= v[i - 1]), v.slice(-4).join());
  // A bike rolling backwards at the trigger is not driven left.
  assert.ok(rideSpeed(-4, 900) >= 0);
});

test("epilog: night while the bike rides, 120 steps of morning once it stops, then the card", () => {
  assert.equal(EPILOG_DAWN_STEPS, 120);
  for (const rideSteps of [1, 200, 280, 345]) {
    const fx = sky("noon");
    const ep = new Epilog(fx);
    assert.equal(ep.running, false);
    assert.equal(ep.riding, false);
    ep.start();
    assert.equal(ep.running, true);
    assert.equal(ep.riding, true);
    let due = 0;
    const seen = [];
    for (let i = 1; i <= 1000 && !due; i++) {
      if (ep.step(i >= rideSteps)) due = i;
      seen.push(fx.forcedTime);
      if (i === rideSteps) assert.equal(ep.riding, false); // the sunrise phase
    }
    assert.equal(due, rideSteps + 120, `ride ${rideSteps}`);
    assert.equal(seen.indexOf("morning"), rideSteps - 1); // the step the bike stops turns the sky
    assert.deepEqual(fx.calls, ["night", "morning"]);
    assert.equal(ep.running, true); // until Credits ends it
  }
  // A console redok.time() mid-scene is overruled on the next step, in either phase.
  const fx2 = sky(null);
  const ep2 = new Epilog(fx2);
  ep2.start();
  fx2.forcedTime = "noon";
  ep2.step(false);
  assert.equal(fx2.forcedTime, "night");
  ep2.step(true);
  fx2.forcedTime = "noon";
  ep2.step(false); // the ride cannot start again: the sunrise goes on
  assert.equal(fx2.forcedTime, "morning");
});

test("epilog: the card opens on a morning sky, after the sunrise or at once on a skip", () => {
  // Natural: R lerp steps toward night from noon, then 120 toward morning.
  const q = 1 - JOR.STEP_MS * 0.002;
  for (const R of [200, 280, 345]) {
    const night = 0.5 * (1 - q ** R);
    const natural = play(sky("noon"), R);
    assert.equal(natural.steps, R + 120);
    const a = natural.ep.fx.currentTimeState.a;
    assert.ok(Math.abs(a - (0.1 + (night - 0.1) * q ** 120)) < 1e-9);
    assert.ok(a > 0.106 && a < 0.108, `ride ${R}: a ${a}`);
    assert.equal(natural.ep.running, false);
  }
  // The night really fell before the bike stops (a past 0.45 from step ~68 on; a ride is >= 260).
  const fx = sky("noon");
  const ep = new Epilog(fx);
  ep.start();
  for (let i = 0; i < 100; i++) {
    fx.updateTimeOfDay(JOR.STEP_MS);
    ep.step(false);
  }
  assert.ok(fx.currentTimeState.a > 0.45);
  // Skip mid-ride or mid-sunrise (Esc / "Lewati"): the morning target exactly, tint and sun, no lerp.
  for (const at of [1, 60, 300]) {
    const skipped = play(sky("noon"), 280, at);
    assert.deepEqual({ ...skipped.ep.fx.currentTimeState }, MORNING);
    assert.deepEqual([skipped.ep.fx.sunX, skipped.ep.fx.sunUp], [SUN_X.morning, 1]);
    assert.equal(skipped.ep.fx.forcedTime, "morning");
    assert.equal(skipped.ep.running, false);
  }
});

test("epilog: closing the card gives back the visitor's time once (clock or cheat)", () => {
  for (const before of [null, "night", "noon", "afternoon", "morning"]) {
    const { ep } = play(sky(before), 280, 5);
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

// Run: node --test
// P7 juice. EffectsManager's constructor needs the DOM, so these build one from the
// prototype with only the particle fields; every method under test is DOM-free.
import test from "node:test";
import assert from "node:assert/strict";
import {
  EffectsManager, JUICE, JUICE_CAP, MAX_PARTICLES, PARTICLE_COLORS, LAND_DUST,
  SPARKS_PER_STEP, SKID_DOT_GAP, SHAKE_STEPS, shakeOffset, hourBucket, TIME_TARGETS,
} from "../js/effects.js";
import { SUN_X } from "../js/sky.js";

const DUST = "#8b7355";

function fx(reduced = false) {
  const f = Object.create(EffectsManager.prototype);
  return Object.assign(f, { particles: [], _pool: [], _halve: {}, shakeSteps: 0, _rm: { matches: reduced } });
}

// The Player fields juice() reads, with the real move-state offsets (player.js:54-57, 76).
const bike = (o = {}) => ({
  x: 1000, y: 500, width: 200, maxSpeed: 10, velocityX: 0, facingRight: true, braking: false,
  wheelieRotation: 0, currentAnimation: "move",
  exhaustOffsetsByState: { idle: [{ x: 52, y: 180, w: 45, h: 12 }], move: [{ x: 57, y: 180, w: 45, h: 12 }] },
  wheelX(i) {
    const ox = i ? 166 : 49;
    return this.x + (this.facingRight ? ox : this.width - ox);
  },
  ...o,
});

function withRandom(value, fn) {
  const real = Math.random;
  Math.random = () => value;
  try {
    fn();
  } finally {
    Math.random = real;
  }
}

const ofColor = (f, color) => f.particles.filter((q) => q.color === color);

test("P7: every juice kind has a colour renderParticles draws", () => {
  for (const [kind, k] of Object.entries(JUICE)) assert.ok(PARTICLE_COLORS.includes(k.color), kind);
});

test("P7: juice stops at JUICE_CAP, so dust and leaves keep their slots up to MAX_PARTICLES", () => {
  const f = fx();
  for (let i = 0; i < JUICE_CAP + 50; i++) f.emit("smoke", 0, 0, 1);
  assert.equal(f.particles.length, JUICE_CAP);
  f.createDustParticles(0, 0, { count: 500 });
  f.createLeafParticles(0, 0, { count: 5, force: true });
  assert.equal(f.particles.length, MAX_PARTICLES);
  assert.equal(ofColor(f, DUST).length, MAX_PARTICLES - JUICE_CAP);
});

test("particles: the dead go back to the pool and the next spawn reuses them", () => {
  const f = fx();
  f.emit("spark", 0, 0, 1);
  const first = f.particles[0];
  f.stepParticles(1000); // sparks live at most 260 ms
  assert.equal(f.particles.length, 0);
  f.createDustParticles(0, 0, { count: 1 });
  assert.equal(f.particles[0], first);
  assert.equal(first.color, DUST); // fully rewritten
  assert.ok(first.life > 0 && first.opacity === first.life / first.maxLife);
});

test("reduced motion: every colour is halved on its own, in the same step", () => {
  const f = fx(true);
  for (let i = 0; i < 4; i++) {
    f.emit("smoke", 0, 0, 1);
    f.emit("spark", 0, 0, 1);
  }
  f.createDustParticles(0, 0, { count: 4 });
  assert.equal(ofColor(f, JUICE.smoke.color).length, 2);
  assert.equal(ofColor(f, JUICE.spark.color).length, 2);
  assert.equal(ofColor(f, DUST).length, 2);
  assert.equal(fx(false).reducedMotion, false);
});

test("P7 smoke: only while moving, from the pipe's back end, drifting back and up", () => {
  const f = fx();
  withRandom(0, () => f.juice(bike({ velocityX: 0 }), 0, false));
  assert.equal(f.particles.length, 0);
  withRandom(0, () => f.juice(bike({ velocityX: 10 }), 0, false));
  assert.equal(f.particles.length, 1);
  const [s] = f.particles;
  assert.equal(s.color, JUICE.smoke.color);
  assert.equal(s.x, 1000 + 57 - 45 / 2);
  assert.equal(s.y, 500 + 180 - 2);
  assert.ok(s.vx < 0 && s.vy < 0);
  const g = fx();
  withRandom(0, () => g.juice(bike({ velocityX: -10, facingRight: false }), 0, false));
  assert.equal(g.particles[0].x, 1000 + 200 - 57 + 45 / 2);
  assert.ok(g.particles[0].vx > 0);
});

test("P7 hard brake: sparks + a skid streak behind the motion, nothing at cruise or slow", () => {
  const f = fx();
  // Moving right at 8 against KeyA: the sprite already faces left (player.js:211).
  const p = bike({ velocityX: 8, braking: true, facingRight: false });
  withRandom(0.99, () => f.juice(p, 0, false)); // 0.99: no smoke, no wake
  const trail = Math.min(p.wheelX(0), p.wheelX(1));
  const sparks = ofColor(f, JUICE.spark.color);
  const skid = ofColor(f, JUICE.skid.color);
  assert.equal(sparks.length, SPARKS_PER_STEP);
  assert.equal(skid.length, Math.ceil(8 / SKID_DOT_GAP));
  for (const q of sparks) assert.ok(q.x === trail && q.vx < 0 && q.vy < 0);
  for (const q of skid) assert.ok(q.x >= trail - 8 && q.x <= trail && q.y === 500 + 195 && q.vx === 0);
  for (const v of [10, 2.9]) {
    const g = fx();
    withRandom(0.99, () => g.juice(bike({ velocityX: v, braking: v < 3 }), 0, false));
    assert.equal(g.particles.length, 0, `v ${v}`);
  }
});

test("P7 landing: front-wheel dust and the thump on the drop to 0; reduced motion has no thump", () => {
  const f = fx();
  withRandom(0.5, () => f.juice(bike(), 0.05, false));
  assert.equal(ofColor(f, DUST).length, LAND_DUST);
  for (const q of f.particles) assert.ok(Math.abs(q.x - (1000 + 166)) <= 12);
  assert.equal(f.shakeSteps, SHAKE_STEPS);
  const r = fx(true);
  r.juice(bike(), 0.05, false);
  assert.equal(r.particles.length, LAND_DUST / 2);
  assert.equal(r.shakeSteps, 0);
  const s = fx();
  s.juice(bike({ wheelieRotation: 0.2 }), 0.35, false); // still up
  s.juice(bike(), 0, false); // never up
  assert.equal(s.shakeSteps + s.particles.length, 0);
});

test("P7 wake: Bab 3 only, from the trailing wheel, carried along the motion", () => {
  const f = fx();
  const p = bike({ velocityX: -10, facingRight: false });
  withRandom(0, () => f.juice(p, 0, true));
  const leaves = ofColor(f, JUICE.leaf.color);
  assert.equal(leaves.length, 1);
  assert.equal(leaves[0].x, Math.max(p.wheelX(0), p.wheelX(1)));
  assert.ok(leaves[0].vx < 0 && leaves[0].vy < 0); // ambient leaves fall (vy > 0)
  const g = fx();
  withRandom(0, () => g.juice(p, 0, false));
  assert.equal(ofColor(g, JUICE.leaf.color).length, 0);
});

test("P7 shake: 2 px at most, up only, gone after SHAKE_STEPS, seen at 30 Hz too", () => {
  const seq = [];
  for (let t = SHAKE_STEPS; t >= 0; t--) seq.push(shakeOffset(t));
  assert.deepEqual(seq, [-2, -2, 0, 0, -1, -1, 0]);
  assert.equal(shakeOffset(-1), 0);
  assert.equal(shakeOffset(SHAKE_STEPS + 1), 0);
  // Two steps per frame, either phase: the jolt still shows.
  assert.ok(seq.filter((_, i) => i % 2 === 0).some(Boolean));
  assert.ok(seq.filter((_, i) => i % 2 === 1).some(Boolean));
});

// Time of day (V3, R15): a bare manager with the time fields only.
const STEP = 1000 / 60;
const timeFx = (forcedTime = null) =>
  Object.assign(Object.create(EffectsManager.prototype), { forcedTime, timeMode: null, clockMode: null, _clockMs: 0, sunX: SUN_X.noon, sunUp: 1 });

// Runs fn with a Date whose clock says `hour`; returns how many Dates were made.
function atHour(hour, fn) {
  const RealDate = globalThis.Date;
  let made = 0;
  globalThis.Date = class {
    constructor() { made++; }
    getHours() { return hour; }
  };
  try {
    fn();
  } finally {
    globalThis.Date = RealDate;
  }
  return made;
}

test("time of day: clock buckets and their targets (a is the kopi contract)", () => {
  const hours = [0, 4, 5, 9, 10, 14, 15, 18, 19, 23];
  assert.deepEqual(hours.map(hourBucket), ["night", "night", "morning", "morning", "noon", "noon", "afternoon", "afternoon", "night", "night"]);
  assert.deepEqual(Object.keys(TIME_TARGETS).map((m) => TIME_TARGETS[m][3]), [0.1, 0, 0.15, 0.5]);
});

test("time of day: the clock is read once a second, not every step; the bucket is stored", () => {
  const f = timeFx();
  const made = atHour(21, () => {
    for (let i = 0; i < 110; i++) f.updateTimeOfDay(STEP);
  });
  assert.equal(made, 2); // 1.8 s of steps: read on step 1 and a second later
  assert.equal(f.timeMode, "night");
  assert.equal(f.currentTimeState.a, 0.5); // the first step snaps
  assert.deepEqual([f.sunX, f.sunUp], [SUN_X.morning, 0]); // a night start: set, where it will rise
  f.forcedTime = "noon";
  assert.equal(atHour(21, () => f.updateTimeOfDay(STEP)), 0);
  assert.equal(f.timeMode, "noon");
});

test("sun: glides between day spots, sets in place, jumps while hidden; snapTime lands in place", () => {
  const f = timeFx("noon");
  atHour(12, () => {
    f.updateTimeOfDay(STEP);
    assert.equal(f.sunX, SUN_X.noon);
    f.forcedTime = "afternoon";
    f.updateTimeOfDay(STEP);
    assert.ok(f.sunX > SUN_X.noon && f.sunX < SUN_X.afternoon, "gliding");
    for (let i = 0; i < 300; i++) f.updateTimeOfDay(STEP);
    assert.ok(Math.abs(f.sunX - SUN_X.afternoon) < 1e-3);
    f.forcedTime = "night";
    for (let i = 0; i < 300; i++) f.updateTimeOfDay(STEP);
    assert.ok(Math.abs(f.sunX - SUN_X.afternoon) < 1e-3 && f.sunUp < 1e-3, "sets where it stood");
    f.forcedTime = "morning";
    f.updateTimeOfDay(STEP);
    assert.equal(f.sunX, SUN_X.morning, "still behind the hills: jumps, then rises there");
    for (let i = 1; i < 120; i++) f.updateTimeOfDay(STEP);
    assert.ok(f.sunUp > 0.98 && f.sunX === SUN_X.morning, "risen in 2 s");
    const s = f.currentTimeState;
    f.forcedTime = "afternoon";
    f.snapTime();
    assert.equal(f.currentTimeState, s);
    const [r, g, b, a] = TIME_TARGETS.afternoon;
    assert.deepEqual([s.r, s.g, s.b, s.a, f.sunX, f.sunUp], [r, g, b, a, SUN_X.afternoon, 1]); // exact: assigned, not eased
    f.forcedTime = "night";
    f.snapTime();
    f.forcedTime = "morning";
    f.snapTime(); // the epilog skip: eased with k = 1, 0.5 -> 0.1 gave 0.09999999999999998
    assert.equal(s.a, TIME_TARGETS.morning[3]);
  });
});

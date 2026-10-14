// Run: node --test
// V7 night lighting and the V10 quality tier: the pure part of js/lighting.js (no DOM), the
// tier latch in Bengkel.record and the low-tier particle halving.
import test from "node:test";
import assert from "node:assert/strict";
import {
  nightK, lightingOn, darkAlpha, darkRgb, DARK_NIGHT, NIGHT_INK, LIGHT_CAP, createLightList, pushLight,
  bikePoint, fly, flyCount, FLY_MAX, FLY_END_X, createTier, tierStep, WARM,
} from "../js/lighting.js";
import { KOPI, kopiShown } from "../js/kopi.js";
import { CHAPTERS, chapterAt } from "../js/journey.js";
import { Bengkel } from "../js/bengkel.js";
import { EffectsManager } from "../js/effects.js";

const pack = ([r, g, b]) => (r << 16) | (g << 8) | b;
const STEP = 1000 / 60;

test("V7: lighting only above the 0.25 night line and never on the low tier", () => {
  // effects.currentTimeState.a: noon 0, morning 0.1, afternoon 0.15, night 0.5 (rain never changes a)
  assert.deepEqual([0, 0.1, 0.15, 0.25, 0.26, 0.5].map((a) => lightingOn(a, false)), [false, false, false, false, true, true]);
  assert.equal(lightingOn(0.5, true), false);
  // The same ramp as the night cup: the cup and the lights switch on in the same frame (R7).
  const pagar = KOPI.find((c) => c.id === "pagar");
  for (const a of [0, 0.2, 0.25, 0.3, 0.35, 0.44, 0.45, 0.5]) assert.equal(nightK(a), kopiShown(pagar, a, 0), String(a));
});

test("V7: the darkness starts as the flat tint at 0.25 (no pop) and ends at DARK_NIGHT", () => {
  const ts = (a) => ({ r: 10, g: 10, b: 30, a });
  assert.equal(darkAlpha(0.25), 0.25);
  assert.equal(darkRgb(ts(0.25)), pack([10, 10, 30]));
  assert.equal(darkAlpha(0.45), DARK_NIGHT);
  assert.equal(darkAlpha(0.5), DARK_NIGHT);
  assert.equal(darkRgb(ts(0.5)), pack(NIGHT_INK));
  let last = 0;
  for (let a = 0.25; a <= 0.5; a += 0.01) {
    assert.ok(darkAlpha(a) >= last, String(a));
    last = darkAlpha(a);
  }
  // Sunrise: rgb drifts warm while a is still above the line; the darkness follows it.
  assert.equal(darkRgb({ r: 200, g: 150, b: 80, a: 0.25 }), pack([200, 150, 80]));
});

test("V7: the light list culls lights outside the view and keeps the first LIGHT_CAP", () => {
  const L = createLightList();
  assert.equal(L.cap, LIGHT_CAP);
  const W = 375, H = 667;
  assert.equal(pushLight(L, WARM, -50, 300, 40, 1, W, H), -1); // fully left
  assert.equal(pushLight(L, WARM, W + 41, 300, 40, 1, W, H), -1); // fully right
  assert.equal(pushLight(L, WARM, 100, H + 41, 40, 1, W, H), -1); // below
  assert.equal(pushLight(L, WARM, 100, 300, 40, 0, W, H), -1); // dark: k 0
  assert.equal(pushLight(L, WARM, 100, 300, 40, NaN, W, H), -1);
  assert.equal(pushLight(L, WARM, -30, 300, 40, 1, W, H), 0); // its pool reaches the view
  for (let i = 1; i < 30; i++) pushLight(L, WARM, i, 300, 40, 1, W, H);
  assert.equal(L.n, LIGHT_CAP);
  assert.equal(L.x[LIGHT_CAP - 1], LIGHT_CAP - 1); // the earliest pushes win the cap
  assert.equal(pushLight(L, WARM, 100, 300, 40, 1, W, H), -1);
});

test("V7: a bike point mirrors with the sprite and turns with the wheelie about the rear wheel", () => {
  const bike = (o) => ({
    x: 1000, y: 500, width: 200, facingRight: true, wheelieRotation: 0, currentAnimation: "move",
    wheelOffsetsByState: { idle: [{ x: 43, y: 174 }], move: [{ x: 49, y: 174 }] }, ...o,
  });
  const out = new Float32Array(4);
  const plain = (o) => [...bikePoint(bike(o), 155, 124, out)].map((v) => v + 0); // -0 -> 0
  assert.deepEqual(plain(), [1155, 624, 0, 1]);
  assert.deepEqual(plain({ facingRight: false }), [1045, 624, 0, -1]);
  const r = [...bikePoint(bike({ wheelieRotation: 0.35 }), 155, 124, out)];
  const l = [...bikePoint(bike({ wheelieRotation: 0.35, facingRight: false }), 155, 124, out)];
  assert.ok(r[1] < 600 && Math.abs(r[1] - l[1]) < 1e-3, "the lens rises the same both ways");
  assert.ok(Math.abs(r[0] + l[0] - 2200) < 1e-3, "mirror image about the bike's centre");
  assert.ok(Math.abs(r[2] + 0.35) < 1e-6 && Math.abs(l[2] - 0.35) < 1e-6, "player.render's rotation sign");
  assert.deepEqual([...bikePoint(bike({ wheelieRotation: 0.35 }), 49, 174, out)].slice(0, 2), [1049, 674]); // the pivot stays
});

test("V7 fireflies: seeded by index, wrapped around the view, still under reduced motion, green chapters only", () => {
  assert.deepEqual([375, 667, 1440, 1920, 3000].map(flyCount), [3, 5, 10, 12, FLY_MAX]);
  assert.equal(FLY_END_X, 5050);
  for (let x = 0; x < FLY_END_X; x += 50) assert.equal(CHAPTERS[chapterAt(x)].biome, "normal");
  const a = new Float32Array(3), b = new Float32Array(3);
  const W = 375, cam = 3000, ground = 587, n = flyCount(W);
  for (let i = 0; i < n; i++) {
    for (const t of [0, 1234, 99999]) {
      fly(i, n, t, cam, W, ground, false, a);
      assert.ok(a[0] >= cam - 20 && a[0] < cam + W + 20, `x ${i} ${t}`);
      assert.ok(a[1] < ground && a[1] > ground - 150, `y ${i} ${t}`);
      assert.ok(a[2] >= 0.2 && a[2] <= 1, `glow ${i} ${t}`);
    }
    assert.deepEqual([...fly(i, n, 0, cam, W, ground, true, a)], [...fly(i, n, 5000, cam, W, ground, true, b)]);
    assert.equal(a[2], 1);
    fly(i, n, 5000, cam, W, ground, false, b);
    assert.notEqual(a[0], b[0]);
  }
  // World-anchored: a 1 px camera move leaves a fly where it was (away from the wrap edge).
  fly(1, n, 0, cam, W, ground, true, a);
  fly(1, n, 0, cam + 1, W, ground, true, b);
  assert.equal(a[0], b[0]);
});

test("V10 tier: two 2 s windows in a row at a mean over 12 ms trip it; 11 ms, a 30 Hz phone, a spike or one heavy window do not", () => {
  const run = (frames, interval, work, steps, paused = false) => {
    const t = createTier();
    for (let i = 0; i < frames; i++) if (tierStep(t, interval, work, steps, paused)) return i + 1;
    return 0;
  };
  assert.equal(run(300, STEP, 25, 1), 240); // trips on the frame that completes the second 2 s window
  assert.equal(run(600, STEP, 11, 1), 0);
  assert.equal(run(300, 1000 / 30, 11, 2), 0); // 30 Hz cap: interval 33 ms, work fine
  assert.equal(run(600, STEP, 100, 0, true), 0); // paused frames never count
  const t = createTier();
  assert.equal(tierStep(t, STEP, 200, 1, false), false); // one 200 ms spike...
  let tripped = false;
  for (let i = 0; i < 119; i++) tripped = tierStep(t, STEP, 10, 1, false) || tripped;
  assert.equal(tripped, false); // ...in a 10 ms window: mean 11.6 ms
  assert.equal(run(1, 5000, 25, 3), 0); // a frame after a hidden tab is capped at 50 ms
  // One heavy window (a start-up, a chapter arrival), then a normal one: the run starts over.
  const one = createTier();
  let heavy = false;
  for (const w of [25, 6, 25]) for (let i = 0; i < 120; i++) heavy = tierStep(one, STEP, w, 1, false) || heavy;
  assert.equal(heavy, false);
  // 144 Hz: every other frame runs a step; 2 s of wall time, averaged over the step frames.
  const h = createTier();
  let at = 0;
  for (let i = 0; i < 800 && !at; i++) if (tierStep(h, 1000 / 144, i % 2 ? 25 : 4, i % 2, false)) at = i + 1;
  assert.equal(at, 578); // 288 frames are 1999.99 ms: frame 289 completes the first window, 578 the second
});

test("V10 tier: Bengkel.record latches effects.low once, never while paused, and never unsets it", () => {
  const g = { effects: { low: false }, paused: true, _splashCameraActive: false, player: { lockBacktrack: true } };
  const b = Object.assign(Object.create(Bengkel.prototype), {
    game: g, work: new Float32Array(120), interval: new Float32Array(120), steps: new Uint8Array(120), n: 0,
    pendingCheat: null, tier: createTier(),
  });
  for (let i = 0; i < 300; i++) b.record(STEP, 40, 0);
  assert.equal(g.effects.low, false);
  g.paused = false;
  for (let i = 0; i < 239; i++) b.record(STEP, 25, 1);
  assert.equal(g.effects.low, false);
  b.record(STEP, 25, 1);
  assert.equal(g.effects.low, true);
  for (let i = 0; i < 600; i++) b.record(STEP, 2, 1);
  assert.equal(g.effects.low, true); // sticky for the page load
});

test("V10 tier: the low tier halves every particle colour, like reduced motion", () => {
  const f = Object.assign(Object.create(EffectsManager.prototype), {
    particles: [], _pool: [], _halve: {}, shakeSteps: 0, _rm: { matches: false }, low: true,
  });
  for (let i = 0; i < 10; i++) f.emit("smoke", 0, 0, 1);
  for (let i = 0; i < 10; i++) f.emit("spark", 0, 0, 1);
  assert.equal(f.particles.length, 10);
  f.low = false;
  f.emit("smoke", 0, 0, 1, 4);
  assert.equal(f.particles.length, 14);
});

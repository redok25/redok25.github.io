// Run: node --test
import test from "node:test";
import assert from "node:assert/strict";
import { Bengkel, SLOW } from "../js/bengkel.js";
import { makeJOR } from "../js/helpers.js";
import { KOPI_SIZE, KOPI_RADIUS } from "../js/kopi.js";

const JOR = makeJOR({});
const STEP = 1000 / 60;

// A Bengkel without its constructor (no location, no DOM), as lighting.test.js builds one.
const bengkel = (game) =>
  Object.assign(Object.create(Bengkel.prototype), {
    game, on: true, hitbox: false, light: false, slow: false, pendingCheat: null, n: 0,
    work: new Float32Array(120), sim: new Float32Array(120), draw: new Float32Array(120),
    interval: new Float32Array(120), steps: new Uint8Array(120), sorted: new Float32Array(120),
    tier: { ms: 0, work: 0, n: 0, over: 0 },
  });

test("R4: 0.25x feeds the accumulator a quarter of the time; a course or its start modal forces 1x", () => {
  const mg = { activeMinigame: null, pendingMinigame: null };
  const b = bengkel({ minigames: mg });
  assert.equal(b.simScale(), 1);
  b.slow = true;
  assert.equal(b.simScale(), SLOW);
  // 4 s of 60 Hz frames at 0.25x = the steps of 1 s at 1x (update still gets STEP_MS); 144 Hz too.
  for (const hz of [60, 144]) {
    let acc = 0, steps = 0;
    for (let i = 0; i < 4 * hz; i++) {
      const r = JOR.fixedSteps(acc, (1000 / hz) * b.simScale());
      acc = r.acc;
      steps += r.steps;
    }
    assert.equal(steps, 60, `${hz} Hz`);
  }
  mg.pendingMinigame = "drag_race";
  assert.equal(b.simScale(), 1);
  mg.pendingMinigame = null;
  mg.activeMinigame = {};
  assert.equal(b.simScale(), 1);
});

test("R2: record splits work into sim and draw; the p95 of each ring goes through the one scratch", () => {
  const b = bengkel({ effects: { low: true }, paused: false, player: { lockBacktrack: true } });
  assert.equal(b.p95(), 0);
  for (let i = 0; i < 100; i++) b.record(STEP, i + 1, 1, (i + 1) / 4);
  assert.equal(b.p95(), 96); // 100 frames: index 95 of 1..100
  assert.equal(b.p95(b.sim), 24);
  assert.equal(b.p95(b.draw), 72);
  // The ring wraps at 120 frames and keeps the newest; the scratch never shows through.
  for (let i = 0; i < 120; i++) b.record(STEP, 5, 1, 1);
  assert.deepEqual([b.p95(), b.p95(b.sim), b.p95(b.draw)], [5, 1, 4]);
});

test("R3-R6: closing the panel turns every view off, the layer mask included; opening keeps them off", () => {
  const g = { world: { hideLayers: 0b101010 }, minigames: { activeMinigame: null, pendingMinigame: null } };
  const b = Object.assign(bengkel(g), { hitbox: true, light: true, slow: true, compact: true });
  b.toggle();
  assert.equal(b.on, false);
  assert.deepEqual([b.hitbox, b.light, b.slow, g.world.hideLayers, b.simScale()], [false, false, false, 0, 1]);
  b.toggle();
  assert.equal(b.on, true);
  // Ringkas is set again on every open from the screen (no matchMedia in node: not a phone).
  assert.deepEqual([b.hitbox, b.light, b.slow, g.world.hideLayers, b.compact], [false, false, false, 0, false]);
});

test("R5/R9: the hitbox pass uses the drawn camera; Kopi #5 shows there only after the ride, outside a course", () => {
  const calls = [];
  const ctx = {
    save() {}, restore() {}, beginPath() {}, stroke() {}, moveTo() {}, lineTo() {},
    rect: (...a) => calls.push(["rect", ...a]),
    drawImage: (img, ...a) => calls.push(["img", ...a]),
    translate: (...a) => calls.push(["shake", ...a]),
  };
  const box = (x) => ({ x, y: 100, width: 50, height: 60 });
  const g = {
    canvas: { width: 1440 },
    world: {
      groundY: () => 600, objects: [box(4200)], billboards: [], gauges: [box(4264)], specialNPCs: [box(3920)],
      npcs: [box(9000)], cupSprite: "cup", // the NPC at 9000 is off-screen: culled
    },
    player: { y: 450, width: 200, height: 200, lockBacktrack: true },
    drawnPlayerX: 4150, drawnCameraX: 3800, cameraX: 3810, // the sim camera is a step ahead
    effects: { currentTimeState: { a: 0 }, rainIntensity: 0 },
    minigames: { activeMinigame: null },
    kopi: ["wheelie"],
  };
  const b = bengkel(g);
  const run = () => {
    calls.length = 0;
    b.renderHitboxes(ctx, g, g.drawnCameraX);
    return calls;
  };
  const rects = run().filter((c) => c[0] === "rect").map((c) => c.slice(1));
  assert.deepEqual(rects.slice(0, 4), [[400, 100, 50, 60], [464, 100, 50, 60], [120, 100, 50, 60], [350, 450, 200, 200]]);
  assert.deepEqual(calls.find((c) => c[0] === "shake"), ["shake", 0, 0]); // no landing thump this frame
  // Cups showing now at noon: #4 (always) and #5 (this view); #1 (night) and #3 (rain) are hidden, #2 found.
  const cup5 = [4300 - 3800 - KOPI_RADIUS, 600 - 20 - KOPI_SIZE, 2 * KOPI_RADIUS, 20 + KOPI_SIZE];
  assert.deepEqual(rects.slice(4), [[7300 - 3800 - KOPI_RADIUS, 600 - 4 - KOPI_SIZE, 2 * KOPI_RADIUS, 4 + KOPI_SIZE], cup5]);
  assert.deepEqual(calls.filter((c) => c[0] === "img"), [["img", 4300 - 3800 - KOPI_SIZE / 2, 600 - 20 - KOPI_SIZE, KOPI_SIZE, KOPI_SIZE]]);
  g.drawnShakeY = -2; // the boxes follow the thump the sprites got (render() saves it)
  assert.deepEqual(run().find((c) => c[0] === "shake"), ["shake", 0, -2]);
  g.kopi = ["bengkel"];
  assert.equal(run().filter((c) => c[0] === "img").length, 0); // found: gone
  g.kopi = [];
  g.minigames.activeMinigame = {};
  assert.equal(run().filter((c) => c[0] === "img").length, 0); // a course
  g.minigames.activeMinigame = null;
  g.player.lockBacktrack = false;
  assert.equal(run().filter((c) => c[0] === "img").length, 0); // the opening ride
});

// Run: node --test
import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAPTERS,
  HYSTERESIS,
  BIOME_FADE_MS,
  chapterAt,
  nextChapter,
  arrivalX,
  stripPos,
  Journey,
  createBiomeFade,
  stepBiomeFade,
  biomeWeight,
} from "../js/journey.js";

const close = (a, b) => Math.abs(a - b) < 1e-9;

test("CHAPTERS: the spec's zones, biomes and Bab 4 snow", () => {
  assert.deepEqual(CHAPTERS.map((c) => [c.id, c.startX, c.endX, c.biome, c.snow]), [
    [0, 0, 2771, "normal", 0],
    [1, 2771, 3900, "normal", 0],
    [2, 3900, 5050, "normal", 0],
    [3, 5050, 6500, "autumn", 0],
    [4, 6500, 7400, "winter", 0.3],
  ]);
  assert.deepEqual(CHAPTERS.map((c) => c.title), ["Berangkat", "Asal-Usul", "Bengkel Skill", "Kota Proyek", "Cakrawala"]);
  assert.equal(HYSTERESIS, 150);
  assert.equal(BIOME_FADE_MS, 1000);
});

test("chapterAt: a boundary belongs to the chapter that starts there; off-road clamps", () => {
  const cases = [[-500, 0], [0, 0], [2770, 0], [2771, 1], [3899, 1], [3900, 2], [5049, 2], [5050, 3], [6499, 3], [6500, 4], [7400, 4], [9000, 4]];
  for (const [x, id] of cases) assert.equal(chapterAt(x), id, `x ${x}`);
});

test("nextChapter: changes only more than 150 px inside the next chapter", () => {
  assert.equal(nextChapter(2, 5200), 2); // exactly 150 px in: not yet
  assert.equal(nextChapter(2, 5200.01), 3);
  assert.equal(nextChapter(3, 4900), 3); // 150 px back into Bab 2: not yet
  assert.equal(nextChapter(3, 4899.99), 2);
  assert.equal(nextChapter(3, 6650), 3);
  assert.equal(nextChapter(3, 6650.01), 4);
  // The opening ride ends with the bike's center at 2871: only 100 px into Bab 1.
  assert.equal(nextChapter(0, 2871), 0);
  assert.equal(nextChapter(0, 2921.01), 1);
});

test("nextChapter: a teleport lands in the chapter under x at once", () => {
  assert.equal(nextChapter(3, 2871), 1); // minigame exit back to the ride end
  assert.equal(nextChapter(1, 5100), 3); // 50 px into Bab 3, far outside Bab 1's band
  assert.equal(nextChapter(4, 4950), 2);
});

test("Journey: riding back and forth over a boundary never flips; first entries once", () => {
  const j = new Journey(300); // the bike starts at x 200, center 300
  const log = [];
  const ride = (from, to, step = 10) => {
    const dir = Math.sign(to - from);
    for (let x = from; dir > 0 ? x <= to : x >= to; x += dir * step) {
      const id = j.update(x);
      if (id >= 0) log.push([id, j.firstEntry(id)]);
    }
  };
  assert.equal(j.current, 0);
  assert.equal(j.firstEntry(0), false); // the Prolog never gets a title card
  ride(2871, 4400); // ride end -> through Bab 1 into Bab 2
  for (let k = 0; k < 25; k++) {
    ride(4910, 5190); // jitter over 5050, never more than 150 px into Bab 3
    ride(5190, 4910);
  }
  assert.equal(j.current, 2);
  ride(4910, 5300); // one real crossing
  for (let k = 0; k < 25; k++) {
    ride(5190, 4910);
    ride(4910, 5190);
  }
  assert.equal(j.current, 3);
  ride(5190, 4800); // back into Bab 2 for real: no second title card
  assert.deepEqual(log, [[1, true], [2, true], [3, true], [2, false]]);
});

test("Journey: a teleport switches at once; a card still shows only on the first entry", () => {
  const j = new Journey(300);
  assert.equal(j.update(5600), 3);
  assert.equal(j.firstEntry(3), true);
  assert.equal(j.update(2871), 1); // minigame exit: back at the ride end
  assert.equal(j.firstEntry(1), true);
  assert.equal(j.update(5600), 3);
  assert.equal(j.firstEntry(3), false);
});

test("stepBiomeFade: 1000 ms of real time; waits for a biome that is still loading", () => {
  const loaded = new Set(["normal", "autumn"]);
  const ready = (b) => loaded.has(b);
  const f = createBiomeFade("normal");
  stepBiomeFade(f, "normal", ready, 0);
  assert.deepEqual([f.from, f.to, f.t], ["normal", null, 0]);
  stepBiomeFade(f, "winter", ready, 100); // winter images not loaded: keep normal
  assert.deepEqual([f.from, f.to], ["normal", null]);
  loaded.add("winter");
  stepBiomeFade(f, "winter", ready, 200); // loaded now: the fade starts
  assert.deepEqual([f.from, f.to, f.t], ["normal", "winter", 0]);
  stepBiomeFade(f, "winter", ready, 700);
  assert.ok(close(f.t, 0.5));
  assert.ok(close(biomeWeight(f, "winter"), 0.5));
  assert.ok(close(biomeWeight(f, "normal"), 0.5));
  stepBiomeFade(f, "winter", ready, 1199);
  assert.equal(f.to, "winter");
  stepBiomeFade(f, "winter", ready, 1200); // exactly 1000 ms: done, one biome drawn
  assert.deepEqual([f.from, f.to, f.t], ["winter", null, 0]);
  assert.equal(biomeWeight(f, "winter"), 1);
});

test("stepBiomeFade: a clock reading older than the fade start never gives t < 0", () => {
  const f = createBiomeFade("normal");
  stepBiomeFade(f, "autumn", () => true, 500);
  stepBiomeFade(f, "autumn", () => true, 499.5);
  assert.equal(f.t, 0);
  assert.equal(biomeWeight(f, "normal"), 1);
});

test("stepBiomeFade: turning back mid-fade mirrors it, so the picture never jumps", () => {
  const ready = () => true;
  const f = createBiomeFade("normal");
  stepBiomeFade(f, "autumn", ready, 1000);
  stepBiomeFade(f, "autumn", ready, 1700); // 70% autumn on screen
  const before = biomeWeight(f, "autumn");
  stepBiomeFade(f, "normal", ready, 1700); // the bike rode back over the boundary
  assert.deepEqual([f.from, f.to], ["autumn", "normal"]);
  assert.ok(close(biomeWeight(f, "autumn"), before));
  stepBiomeFade(f, "normal", ready, 2400); // the remaining 70% of the way back
  assert.deepEqual([f.from, f.to, f.t], ["normal", null, 0]);
});

test("stepBiomeFade: a third biome mid-fade starts from the biome that dominates", () => {
  const ready = () => true;
  const f = createBiomeFade("normal");
  stepBiomeFade(f, "autumn", ready, 0);
  stepBiomeFade(f, "winter", ready, 600); // 60% autumn: fade autumn -> winter
  assert.deepEqual([f.from, f.to, f.t], ["autumn", "winter", 0]);
  const g = createBiomeFade("normal");
  stepBiomeFade(g, "autumn", ready, 0);
  stepBiomeFade(g, "winter", ready, 300); // 30% autumn: fade normal -> winter
  assert.deepEqual([g.from, g.to, g.t], ["normal", "winter", 0]);
});

test("Journey.jumpTo: a teleport takes the chapter under x at once, no hysteresis (R12)", () => {
  const j = new Journey(300);
  assert.equal(j.update(2871), -1); // ride end: still Prolog by hysteresis
  assert.equal(j.jumpTo(3910), 2); // RLGL return (R15): 10 px into Bab 2
  assert.equal(j.jumpTo(5060), 3); // Drag return: 10 px into Bab 3
  assert.equal(j.jumpTo(5060), -1); // same chapter: nothing entered
  assert.equal(j.jumpTo(3610), 1); // Wheelie return
  assert.equal(j.firstEntry(2), true); // jumpTo never uses up a first entry
});

test("arrivalX: fast travel lands 100 px in; the centre clears every band (R14)", () => {
  assert.deepEqual([1, 2, 3, 4].map(arrivalX), [2871, 4000, 5150, 6600]);
  for (const id of [1, 2, 3, 4]) {
    for (const from of [0, 1, 2, 3, 4]) assert.equal(nextChapter(from, arrivalX(id) + 100), id, `${from} -> ${id}`);
  }
});

test("stripPos: one equal cell per chapter, node centre = chapter middle", () => {
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  assert.equal(stripPos(-50), 0);
  assert.equal(stripPos(0), 0);
  assert.ok(close(stripPos(2771), 0.2));
  assert.ok(close(stripPos((3900 + 5050) / 2), 0.5));
  assert.equal(stripPos(7400), 1);
  assert.equal(stripPos(9000), 1);
});

test("Journey: the epilog road past the playable end (7400) stays Bab 4 (R-E7)", () => {
  const j = new Journey(300);
  assert.equal(j.update(6700), 4);
  assert.equal(j.firstEntry(4), true); // the Bab 4 card, once
  for (let x = 7100; x <= 8100; x += 3) assert.equal(j.update(x), -1, `x ${x}`); // the ride: no change
  assert.equal(j.jumpTo(7150), -1); // the card closes: the bike is put back at the old road end
  assert.equal(j.current, 4);
  assert.equal(j.firstEntry(4), false); // no second title card
  for (const x of [7400, 7401, 8000, 9200]) assert.equal(stripPos(x), 1); // the dot waits at the end
});

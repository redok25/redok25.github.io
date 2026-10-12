// Run: node --test
import test from "node:test";
import assert from "node:assert/strict";
import { KIND_RANK, beats, nextDestination } from "../js/interactions.js";

test("E rank: station > special > billboard > npc, then distance; a tie keeps the first", () => {
  const order = Object.entries(KIND_RANK).sort((a, b) => a[1] - b[1]).map((e) => e[0]);
  assert.deepEqual(order, ["station", "special", "billboard", "npc"]);
  assert.ok(beats(KIND_RANK.station, 140, KIND_RANK.special, 10));
  assert.ok(!beats(KIND_RANK.npc, 1, KIND_RANK.billboard, 149));
  assert.ok(beats(KIND_RANK.special, 20, KIND_RANK.special, 30));
  assert.ok(!beats(KIND_RANK.special, 30, KIND_RANK.special, 30));
  assert.ok(beats(KIND_RANK.npc, 149, Infinity, Infinity));
});

test("nextDestination: the nearest unstamped station; null once all four are stamped (W4)", () => {
  const st = [
    { id: "about", x: 3271, width: 238 },
    { id: "skills", x: 4771, width: 128 },
    { id: "projects", x: 5771, width: 341 },
    { id: "contact", x: 6771, width: 100 },
  ];
  assert.equal(nextDestination(st, [], 2871).id, "about");
  assert.equal(nextDestination(st, ["about"], 2871).id, "skills");
  assert.equal(nextDestination(st, ["about", "skills"], 6900).id, "contact");
  assert.equal(nextDestination(st, ["about", "skills", "projects", "contact"], 4000), null);
  // A station whose sprite has not loaded yet (no width) still counts, at the 64 px fallback.
  assert.equal(nextDestination([{ id: "about", x: 3271 }], [], 2871).id, "about");
});

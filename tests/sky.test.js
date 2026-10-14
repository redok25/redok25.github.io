// Run: node --test
// The sky slot (V3): when the night pieces draw, and where the sun and moon sit.
import test from "node:test";
import assert from "node:assert/strict";
import { nightness, sunRow, moonRow, SUN_X } from "../js/sky.js";
import { TIME_TARGETS } from "../js/effects.js";

test("sky: no night sky or stars in a day bucket or up to a 0.3; complete 2 s into a night", () => {
  for (const mode of ["morning", "noon", "afternoon"]) assert.equal(nightness(TIME_TARGETS[mode][3]), 0, mode);
  assert.equal(nightness(0.3), 0);
  assert.ok(nightness(0.31) > 0);
  // 120 steps (1/30 each) from noon toward the night target: complete, so no sun, no biome sky.
  assert.equal(nightness(0.5 - 0.5 * (1 - 1 / 30) ** 120), 1);
});

test("sky: the sun is high at noon, level morning/afternoon, and sets behind the hills", () => {
  const [morning, noon, afternoon] = [SUN_X.morning, SUN_X.noon, SUN_X.afternoon].map((x) => sunRow(x, 1));
  assert.ok(noon < morning && morning === afternoon);
  // Art rows: the tallest tips reach row 58, layer 4 is solid from row 148. The epilog (night,
  // then morning) has a top letterbox bar down to row 31: the moon and the morning sun clear it.
  assert.ok(noon + 10 < 58); // a noon sun clears the tips
  for (const row of [morning, moonRow(1)]) assert.ok(row - 10 > 31 && row <= 58, `row ${row}`);
  assert.ok(sunRow(SUN_X.noon, 0) > 120 && moonRow(0) > 120);
});

// Run: node --test
import test from "node:test";
import assert from "node:assert/strict";
import { COPY } from "../js/copy.js";
import { makeJOR } from "../js/helpers.js";

const JOR = makeJOR({});
const TOKENS = ["projectCount", "firstYear", "lastYear"]; // what JOR.contentTokens provides

test("copy: chapter cards use the spec's titles and fit a 375 px phone", () => {
  assert.deepEqual(COPY.chapters.map((c) => `${c.label} · ${c.title}`), [
    "Prolog · Berangkat",
    "Bab 1 · Asal-Usul",
    "Bab 2 · Bengkel Skill",
    "Bab 3 · Kota Proyek",
    "Bab 4 · Cakrawala",
  ]);
  const tokens = { projectCount: 15, firstYear: 2021, lastYear: 2025 };
  for (const c of COPY.chapters) {
    assert.ok(`${c.label} · ${c.title}`.length <= 24, c.title);
    assert.ok(JOR.fillTokens(c.subtitle, tokens).length <= 40, c.subtitle);
  }
});

test("copy: numbers only through Quick View tokens (D498)", () => {
  for (const c of COPY.chapters) {
    for (const [, key] of c.subtitle.matchAll(/\{(\w+)\}/g)) assert.ok(TOKENS.includes(key), key);
    assert.ok(!/\d/.test(c.subtitle.replace(/\{\w+\}/g, "")), c.subtitle);
  }
  const bab3 = JOR.fillTokens(COPY.chapters[3].subtitle, { projectCount: 15, firstYear: 2021, lastYear: 2025 });
  assert.equal(bab3, "15 proyek · 2021 → 2025");
});

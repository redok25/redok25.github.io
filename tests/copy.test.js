// Run: node --test
import test from "node:test";
import assert from "node:assert/strict";
import { COPY } from "../js/copy.js";
import { makeJOR } from "../js/helpers.js";
import { BEST_IDS, ACHIEVEMENT_IDS } from "../js/save.js";

const JOR = makeJOR({});
const TOKENS = Object.keys(JOR.projectStats([])); // the keys JOR.contentTokens provides

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

test("copy 2b: digits only through tokens, and only the tokens each key may use (D498)", () => {
  const allowed = {
    stations: [],
    billboard: ["count"],
    strip: ["label", "title"],
    credits: TOKENS,
  };
  const walk = (v, fn) => (typeof v === "string" ? fn(v) : Object.values(v).forEach((x) => walk(x, fn)));
  for (const [key, ok] of Object.entries(allowed)) {
    walk(COPY[key], (s) => {
      for (const [, t] of s.matchAll(/\{(\w+)\}/g)) assert.ok(ok.includes(t), `${key}: {${t}}`);
      assert.ok(!/\d/.test(s.replace(/\{\w+\}/g, "")), `${key}: ${s}`);
    });
  }
});

test("copy 2b: credits stats fill to the Quick View numbers; every station has a name", () => {
  const filled = JOR.fillTokens(COPY.credits.stats, { projectCount: 15, firstYear: 2021, lastYear: 2025 });
  assert.equal(filled, "15 proyek · 2021 → 2025");
  assert.deepEqual(Object.keys(COPY.stations), JOR.QV_SECTIONS);
  assert.deepEqual(Object.keys(COPY.credits.contacts), ["email", "whatsapp", "linkedin", "github"]);
  for (const k of ["banner", "gotoBad", "gotoBusy", "gotoOk", "timeBad", "timeOk", "weatherOk"]) {
    assert.equal(typeof COPY.console[k], "string", k);
  }
  assert.ok(Array.isArray(COPY.console.help) && COPY.console.help.length === 3);
});

test("copy 3a: result lines only use {time}, no typed digits, and fit a 375 px card (P6)", () => {
  assert.deepEqual(Object.keys(COPY.minigame.time), ["wheelie_challenge", "red_light_green_light", "drag_race"]);
  for (const s of [...Object.values(COPY.minigame.time), COPY.minigame.best, COPY.minigame.newBest]) {
    for (const [, t] of s.matchAll(/\{(\w+)\}/g)) assert.equal(t, "time", s);
    assert.ok(!/\d/.test(s.replace(/\{\w+\}/g, "")), s);
    assert.ok(JOR.fillTokens(s, { time: "99,99" }).length <= 36, s);
  }
  assert.equal(JOR.fillTokens(COPY.minigame.best, { time: "5,15" }), "Rekor: 5,15 detik");
});

test("copy 3b: achievements match the save ids, plain text, no digits, fit a 375 px toast (P5)", () => {
  assert.deepEqual(Object.keys(COPY.achievements.list), ACHIEVEMENT_IDS);
  assert.deepEqual([...COPY.achievements.toast.matchAll(/\{(\w+)\}/g)].map((m) => m[1]), ["name"]);
  for (const { name, desc } of Object.values(COPY.achievements.list)) {
    for (const s of [name, desc]) assert.ok(!/[\d{}<>*]/.test(s), s); // D498, no tokens, no markup or **bold**
    assert.ok(name.length <= 22 && desc.length <= 36, name);
    assert.ok(JOR.fillTokens(COPY.achievements.toast, { name }).length <= 40, name);
  }
  assert.equal(JOR.fillTokens(COPY.achievements.toast, { name: COPY.achievements.list.drag.name }), "🏆 Pencapaian: Raja Drag");
});

test("copy 3b: journal copy uses only its tokens, no typed digits, and fits a 375 px phone (P1)", () => {
  const allowed = ["got", "total", "words"];
  const walk = (v, fn) => (typeof v === "string" ? fn(v) : Object.values(v).forEach((x) => walk(x, fn)));
  walk(COPY.journal, (s) => {
    for (const [, t] of s.matchAll(/\{(\w+)\}/g)) assert.ok(allowed.includes(t), `{${t}}`);
    assert.ok(!/\d/.test(s.replace(/\{\w+\}/g, "")), s);
    assert.ok(s.length <= 72, s);
  });
  for (const k of ["stamps", "seen", "kopi", "secrets", "bests", "achievements"]) {
    assert.ok(COPY.journal[k].length <= 18, k); // a heading shares its row with "15/15"
  }
  assert.deepEqual(Object.keys(COPY.journal.courses), BEST_IDS);
  assert.equal(JOR.fillTokens(COPY.journal.count, { got: 0, total: 15 }), "0/15");
});

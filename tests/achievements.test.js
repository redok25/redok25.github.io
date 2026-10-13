// Run: node --test
import test from "node:test";
import assert from "node:assert/strict";
import { makeJOR } from "../js/helpers.js";
import { createSave, SAVE_KEY, getIds, recordBest, ACHIEVEMENT_IDS } from "../js/save.js";
import { unlock, unlockMinigame, catchUpAchievements } from "../js/achievements.js";

const getAchievements = (s) => getIds(s, "achievements", ACHIEVEMENT_IDS);

// A save over an in-memory localStorage, optionally holding a stored record.
const saveOf = (record) => {
  const data = record ? { [SAVE_KEY]: JSON.stringify(record) } : {};
  const storage = {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
  return createSave(makeJOR({ localStorage: storage }).createStore(storage));
};

test("unlock (P5): true once per id; unknown ids are ignored", () => {
  const s = saveOf();
  assert.equal(unlock("cuaca", s), true);
  assert.equal(unlock("cuaca", s), false);
  assert.equal(unlock("fotografer", s), false);
  assert.deepEqual(getAchievements(s), ["cuaca"]);
});

test("unlockMinigame (P5): a win per course, and a beaten record only when one existed", () => {
  const s = saveOf();
  const run = (type, steps) => unlockMinigame({ type, success: steps !== null, ...recordBest(s, type, steps) }, s);
  run("drag_race", null); // a loss
  assert.deepEqual(getAchievements(s), []);
  run("drag_race", 320); // first win: a record, but nothing beaten
  assert.deepEqual(getAchievements(s), ["drag"]);
  run("drag_race", 330); // slower
  run("drag_race", 320); // a tie is no record
  assert.deepEqual(getAchievements(s), ["drag"]);
  run("drag_race", 309); // beats 320
  assert.deepEqual(getAchievements(s), ["drag", "rekor"]);
  run("wheelie_challenge", 320);
  run("red_light_green_light", 548);
  unlockMinigame({ type: "nope", success: true, isNewBest: false, prevBest: null }, s);
  assert.deepEqual(getAchievements(s), ["wheelie", "lampu", "drag", "rekor"]);
});

test("catchUpAchievements (P5): 2b stamps and 3a bests count once; junk earns nothing", () => {
  const s = saveOf({ v: 1, stamps: ["contact", "about", "skills", "projects"], bests: { red_light_green_light: 548, drag_race: "309" } });
  catchUpAchievements(s);
  assert.deepEqual(getAchievements(s), ["tur", "lampu"]);
  assert.equal(unlock("tur", s), false); // already earned: no toast later either
  const partial = saveOf({ v: 1, stamps: ["about", "skills", "projects", "about"], bests: "x" });
  catchUpAchievements(partial);
  assert.deepEqual(getAchievements(partial), []);
});

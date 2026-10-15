// Run: node --test
import test from "node:test";
import assert from "node:assert/strict";
import { makeJOR } from "../js/helpers.js";
import { createSave, SAVE_KEY, getStamps, addStamp, getBest, recordBest, formatSteps, getAudio, getIds, addId, SECRETS } from "../js/save.js";

const memoryStorage = (init = {}) => {
  const data = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
};
const storeOf = (storage) => makeJOR({ localStorage: storage }).createStore(storage);

test("save: migrates legacy keys once, then drops them", () => {
  const visits = { count: 3, first: "2026-01-01T00:00:00.000Z", last: "2026-02-01T00:00:00.000Z" };
  const storage = memoryStorage({ "jor.visits": JSON.stringify(visits), "jor.weatherOptIn": "true" });
  const s = createSave(storeOf(storage));
  assert.deepEqual(s.get("visits"), visits);
  assert.equal(s.get("weatherOptIn"), true);
  assert.equal(JSON.parse(storage.data[SAVE_KEY]).v, 1);
  assert.ok(!("jor.visits" in storage.data) && !("jor.weatherOptIn" in storage.data));
});

test("save: fresh browser gets defaults; set persists", () => {
  const storage = memoryStorage();
  const s = createSave(storeOf(storage));
  assert.equal(s.get("visits"), null);
  assert.equal(s.get("weatherOptIn"), false);
  s.set("weatherOptIn", true);
  assert.equal(createSave(storeOf(storage)).get("weatherOptIn"), true);
});

test("save: corrupt JSON and a newer version are never overwritten on load", () => {
  const corrupt = memoryStorage({ [SAVE_KEY]: "{not json" });
  assert.equal(createSave(storeOf(corrupt)).get("weatherOptIn"), false);
  assert.equal(corrupt.data[SAVE_KEY], "{not json");
  const newer = memoryStorage({ [SAVE_KEY]: JSON.stringify({ v: 2, weatherOptIn: true }) });
  createSave(storeOf(newer));
  assert.equal(JSON.parse(newer.data[SAVE_KEY]).v, 2);
});

test("save: throwing storage still works in memory", () => {
  const boom = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } };
  const s = createSave(makeJOR({}).createStore(boom));
  s.set("weatherOptIn", true);
  assert.equal(s.get("weatherOptIn"), true);
});

test("save: a failed write keeps the legacy keys (no history loss on a full quota)", () => {
  const storage = memoryStorage({ "jor.visits": JSON.stringify({ count: 2, first: "x", last: "y" }) });
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  const s = createSave(storeOf(storage));
  assert.equal(s.get("visits").count, 2);
  assert.ok("jor.visits" in storage.data);
});

test("stamps: default empty, added once, persisted, ordered like QV_SECTIONS (R24)", () => {
  const storage = memoryStorage();
  const s = createSave(storeOf(storage));
  assert.deepEqual(getStamps(s), []);
  assert.equal(addStamp(s, "projects"), true);
  assert.equal(addStamp(s, "about"), true);
  assert.equal(addStamp(s, "projects"), false);
  assert.equal(addStamp(s, "nope"), false);
  assert.deepEqual(getStamps(s), ["about", "projects"]);
  assert.deepEqual(getStamps(createSave(storeOf(storage))), ["about", "projects"]);
});

test("stamps: an untrusted stored value never throws and never leaks across saves", () => {
  const asString = memoryStorage({ [SAVE_KEY]: JSON.stringify({ v: 1, stamps: "about" }) });
  assert.deepEqual(getStamps(createSave(storeOf(asString))), []);
  const junk = memoryStorage({ [SAVE_KEY]: JSON.stringify({ v: 1, stamps: ["contact", 7, "x", "contact"] }) });
  assert.deepEqual(getStamps(createSave(storeOf(junk))), ["contact"]);
  const noKey = memoryStorage({ [SAVE_KEY]: JSON.stringify({ v: 1, visits: null, weatherOptIn: false }) });
  const a = createSave(storeOf(noKey));
  addStamp(a, "skills");
  // DEFAULTS.stamps is shared by every load: a second fresh save must still start empty.
  assert.deepEqual(getStamps(createSave(storeOf(memoryStorage()))), []);
});

test("audio (P8): defaults, persisted, 0 stays 0, untrusted values normalised", () => {
  const storage = memoryStorage();
  const s = createSave(storeOf(storage));
  assert.deepEqual(getAudio(s), { volume: 0.6, muted: false });
  s.set("audio", { volume: 0, muted: true });
  assert.deepEqual(getAudio(createSave(storeOf(storage))), { volume: 0, muted: true });
  const stored = (audio) =>
    getAudio(createSave(storeOf(memoryStorage({ [SAVE_KEY]: JSON.stringify({ v: 1, audio }) }))));
  assert.deepEqual(stored("loud"), { volume: 0.6, muted: false });
  assert.deepEqual(stored(null), { volume: 0.6, muted: false });
  assert.deepEqual(stored([0.2]), { volume: 0.6, muted: false });
  assert.deepEqual(stored({ volume: "0.3", muted: "true" }), { volume: 0.6, muted: false });
  assert.deepEqual(stored({ volume: 7 }), { volume: 1, muted: false });
  assert.deepEqual(stored({ volume: -1, muted: true }), { volume: 0, muted: true });
  assert.deepEqual(stored({ volume: 0.35 }), { volume: 0.35, muted: false });
});

test("bests (P6): a lower time is a record, a tie or a loss is not, and it persists", () => {
  const storage = memoryStorage();
  const s = createSave(storeOf(storage));
  assert.equal(getBest(s, "drag_race"), null);
  assert.deepEqual(recordBest(s, "drag_race", null), { steps: null, best: null, prevBest: null, isNewBest: false });
  assert.deepEqual(JSON.parse(storage.data[SAVE_KEY]).bests, {}); // a loss writes nothing
  assert.deepEqual(recordBest(s, "drag_race", 320), { steps: 320, best: 320, prevBest: null, isNewBest: true });
  assert.deepEqual(recordBest(s, "drag_race", 330), { steps: 330, best: 320, prevBest: 320, isNewBest: false });
  assert.deepEqual(recordBest(s, "drag_race", 320), { steps: 320, best: 320, prevBest: 320, isNewBest: false });
  assert.deepEqual(recordBest(s, "drag_race", 311), { steps: 311, best: 311, prevBest: 320, isNewBest: true });
  assert.deepEqual(recordBest(s, "nope", 10), { steps: null, best: null, prevBest: null, isNewBest: false });
  assert.equal(getBest(s, "wheelie_challenge"), null);
  assert.equal(getBest(createSave(storeOf(storage)), "drag_race"), 311);
  assert.deepEqual(JSON.parse(storage.data[SAVE_KEY]).bests, { drag_race: 311 });
});

test("bests (P6): untrusted stored values never throw, never show, and are dropped on write", () => {
  const withBests = (bests) => createSave(storeOf(memoryStorage({ [SAVE_KEY]: JSON.stringify({ v: 1, bests }) })));
  for (const junk of ["x", null, 7, [309], { drag_race: "309" }, { drag_race: 309.5 }, { drag_race: 0 }, { drag_race: -5 }, { drag_race: 1e9 }]) {
    const s = withBests(junk);
    assert.equal(getBest(s, "drag_race"), null, JSON.stringify(junk));
    assert.equal(recordBest(s, "drag_race", 400).isNewBest, true, JSON.stringify(junk));
  }
  const s = withBests({ wheelie_challenge: 330, red_light_green_light: "x", evil: 1 });
  recordBest(s, "drag_race", 315);
  assert.deepEqual(s.get("bests"), { wheelie_challenge: 330, drag_race: 315 });
  // A Phase 2b record has no bests key at all.
  const old = createSave(storeOf(memoryStorage({ [SAVE_KEY]: JSON.stringify({ v: 1, visits: null, weatherOptIn: false, stamps: [] }) })));
  assert.equal(getBest(old, "wheelie_challenge"), null);
  assert.equal(recordBest(old, "wheelie_challenge", 320).isNewBest, true);
  // DEFAULTS.bests is shared by every load: a fresh save must still start empty.
  assert.equal(getBest(createSave(storeOf(memoryStorage())), "wheelie_challenge"), null);
});

test("formatSteps (P6): sim steps as seconds with a decimal comma", () => {
  assert.equal(formatSteps(60), "1,00");
  assert.equal(formatSteps(309), "5,15");
  assert.equal(formatSteps(320), "5,33");
  assert.equal(formatSteps(548), "9,13");
});

test("ids (P2, P4): a stored list is untrusted and reads as the valid ids it holds, in their order", () => {
  const valid = ["p-a", "p-b", "p-c"];
  const withSeen = (seen) => createSave(storeOf(memoryStorage({ [SAVE_KEY]: JSON.stringify({ v: 1, seen }) })));
  for (const junk of ["p-a", null, 7, true, { 0: "p-a", length: 1 }]) {
    assert.deepEqual(getIds(withSeen(junk), "seen", valid), [], JSON.stringify(junk));
  }
  assert.deepEqual(getIds(withSeen(["p-c", 1, null, {}, ["p-b"], "p-evil", "p-a", "p-a"]), "seen", valid), ["p-a", "p-c"]);
  // A Phase 3a record has no seen key at all.
  const old = createSave(storeOf(memoryStorage({ [SAVE_KEY]: JSON.stringify({ v: 1, stamps: ["about"] }) })));
  assert.deepEqual(getIds(old, "seen", valid), []);
});

test("ids (P2, P4): addId stores a valid new id once, as a new array, and drops junk on write", () => {
  const valid = ["p-a", "p-b", "p-c"];
  const storage = memoryStorage({ [SAVE_KEY]: JSON.stringify({ v: 1, seen: ["p-evil", "p-b", 3] }) });
  const s = createSave(storeOf(storage));
  assert.equal(addId(s, "seen", "p-evil", valid), false); // not a card in the list
  assert.equal(addId(s, "seen", undefined, valid), false); // a qv:seen without a detail
  assert.equal(addId(s, "seen", "p-b", valid), false); // seen before
  assert.equal(addId(s, "seen", "p-a", valid), true);
  assert.equal(addId(s, "seen", "p-a", valid), false);
  assert.deepEqual(JSON.parse(storage.data[SAVE_KEY]).seen, ["p-b", "p-a"]);
  assert.deepEqual(getIds(createSave(storeOf(storage)), "seen", valid), ["p-a", "p-b"]);
  // The list must be complete: a write keeps only the ids it names.
  addId(s, "seen", "p-c", ["p-c"]);
  assert.deepEqual(s.get("seen"), ["p-c"]);
  // DEFAULTS' arrays are shared by every load: a fresh save still starts empty.
  addId(createSave(storeOf(memoryStorage())), "seen", "p-c", valid);
  assert.deepEqual(getIds(createSave(storeOf(memoryStorage())), "seen", valid), []);
});

test("secrets (P4): the cheat table's words plus the visitor egg, each counted once", () => {
  assert.deepEqual(SECRETS, ["rain", "morning", "afternoon", "noon", "night", "reset", "wheeliegame", "lightgame", "racegame", "glitch", "visitor"]);
  const s = createSave(storeOf(memoryStorage()));
  assert.equal(addId(s, "secrets", "visitor", SECRETS), true);
  assert.equal(addId(s, "secrets", "rain", SECRETS), true);
  assert.equal(addId(s, "secrets", "rain", SECRETS), false);
  assert.equal(addId(s, "secrets", "hujan", SECRETS), false);
  assert.deepEqual(getIds(s, "secrets", SECRETS), ["rain", "visitor"]);
});

test("save json (T1, R2): a read-only text snapshot; rev moves on every set, never on a read", () => {
  const s = createSave(storeOf(memoryStorage()));
  const r0 = s.rev;
  const text = s.json();
  assert.equal(JSON.parse(text).v, 1);
  assert.equal(s.rev, r0); // get and json never move it
  s.get("kopi");
  assert.equal(s.rev, r0);
  s.set("kopi", ["pagar"]);
  assert.equal(s.rev, r0 + 1);
  assert.deepEqual(JSON.parse(s.json()).kopi, ["pagar"]);
  // The snapshot is a string: changing what was parsed from it never reaches the save.
  const copy = JSON.parse(s.json());
  copy.kopi.push("ujung");
  assert.deepEqual(s.get("kopi"), ["pagar"]);
  assert.equal(JSON.parse(text).kopi.length, 0); // the earlier snapshot is still the earlier state
});

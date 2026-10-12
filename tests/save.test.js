// Run: node --test
import test from "node:test";
import assert from "node:assert/strict";
import { makeJOR } from "../js/helpers.js";
import { createSave, SAVE_KEY, getStamps, addStamp } from "../js/save.js";

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

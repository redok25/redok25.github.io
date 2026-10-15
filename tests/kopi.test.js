// Run: node --test
import test from "node:test";
import assert from "node:assert/strict";
import { KOPI, KOPI_IDS, KOPI_SIZE, KOPI_RADIUS, kopiShown, kopiReach, isEmas, kopiNotice, goldPixel } from "../js/kopi.js";
import { arrivalX, chapterAt } from "../js/journey.js";
import { CREDITS_X } from "../js/credits.js";
import { GAUGE_X } from "../js/world.js";
import { createSave, SAVE_KEY, getIds, addId } from "../js/save.js";
import { makeJOR } from "../js/helpers.js";
import { COPY } from "../js/copy.js";

const memoryStorage = (init = {}) => {
  const data = { ...init };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
};
const storeOf = (storage) => makeJOR({ localStorage: storage }).createStore(storage);
const saveOf = (record) => createSave(storeOf(memoryStorage(record ? { [SAVE_KEY]: JSON.stringify({ v: 1, ...record }) } : {})));
const getKopi = (s) => getIds(s, "kopi", KOPI_IDS);
const addKopi = (s, id) => addId(s, "kopi", id, KOPI_IDS);
const cup = (id) => KOPI.find((c) => c.id === id);

test("kopi: five cups (#5 appended), each with a journal hint, all on the road after the ride", () => {
  assert.deepEqual(KOPI.map((c) => c.id), ["pagar", "wheelie", "warung", "ujung", "bengkel"]);
  assert.deepEqual(Object.keys(COPY.kopi.hints), KOPI.map((c) => c.id));
  // The camera never returns left of the ride's end (Prolog), and the playable road ends at 7400.
  for (const c of KOPI) assert.ok(chapterAt(c.x) >= 1 && c.x + KOPI_SIZE / 2 < 7400, c.id);
});

// Every teleport puts the bike's CENTRE here: the opening ride's end and a course start
// (minX 2771 + 100), fast travel, redok.goto and the credits replay (arrivalX + 100), and the
// course returns (special NPC centre 3650 / 3950 / 5100 minus RETURN_GAP 40).
const LANDINGS = [2871, ...[1, 2, 3, 4].map((id) => arrivalX(id) + 100), 3610, 3910, 5060];

test("kopi: no cup near a teleport landing or another cup; #4 past the credits trigger; #5 on a gauge", () => {
  assert.deepEqual(LANDINGS, [2871, 2971, 4100, 5250, 6700, 3610, 3910, 5060]);
  // 150 px: the 200 px bike standing on a landing neither covers a cup nor reaches it.
  for (const c of KOPI) for (const x of LANDINGS) assert.ok(Math.abs(c.x - x) >= 150, `${c.id} vs ${x}`);
  for (const a of KOPI) for (const b of KOPI) if (a !== b) assert.ok(Math.abs(a.x - b.x) >= 150, `${a.id} vs ${b.id}`);
  assert.ok(cup("ujung").x - KOPI_RADIUS > CREDITS_X);
  assert.ok(cup("ujung").x + KOPI_SIZE / 2 < 7400);
  // R9: Kopi #5 sits inside a gauge's hitbox (on its post, 20 px over the road line).
  assert.ok(GAUGE_X.includes(cup("bengkel").x));
});

test("kopi: the night cup fades in with the dark, the rain cup with the rain", () => {
  // effects.currentTimeState.a: noon 0, morning 0.1, afternoon 0.15, night 0.5
  const night = [0, 0.1, 0.15, 0.25, 0.35, 0.45, 0.5].map((a) => +kopiShown(cup("pagar"), a, 1).toFixed(9));
  assert.deepEqual(night, [0, 0, 0, 0, 0.5, 1, 1]);
  assert.deepEqual([0, 0.4, 1].map((r) => kopiShown(cup("warung"), 0.5, r)), [0, 0.4, 1]);
  assert.equal(kopiShown(cup("wheelie"), 0, 0), 1);
  assert.equal(kopiShown(cup("ujung"), 0, 0), 1);
  // R9: #5 only while the hitbox view is on (world.renderKopi passes no xray: never drawn there).
  assert.equal(kopiShown(cup("bengkel"), 0.5, 1), 0);
  assert.equal(kopiShown(cup("bengkel"), 0, 0, true), 1);
  assert.equal(kopiReach(cup("bengkel"), 4300, kopiShown(cup("bengkel"), 0, 0, false), false), false);
  assert.equal(kopiReach(cup("bengkel"), 4300, kopiShown(cup("bengkel"), 0, 0, true), false), true);
  assert.equal(kopiShown(cup("pagar"), 0, 0, true), 0); // xray reveals #5 only
});

test("kopi: taken in range and half shown; the floating cup only at full wheelie", () => {
  const f = cup("wheelie");
  assert.equal(kopiReach(f, f.x, 1, false), false);
  assert.equal(kopiReach(f, f.x + KOPI_RADIUS, 1, true), true);
  assert.equal(kopiReach(f, f.x - KOPI_RADIUS - 1, 1, true), false);
  const n = cup("pagar");
  assert.equal(kopiReach(n, n.x, 0.5, false), true);
  assert.equal(kopiReach(n, n.x, 0.49, true), false);
  // At top speed (10 px/step) a pass from any phase spends at least 6 steps in range.
  for (let s = 0; s < 10; s++) {
    let steps = 0;
    for (let x = n.x - 200 + s; x < n.x + 200; x += 10) if (kopiReach(n, x, 1, false)) steps++;
    assert.ok(steps >= 6, `phase ${s}: ${steps}`);
  }
});

test("kopi save: empty, added once, KOPI order, persisted, junk ignored, blocked storage ok", () => {
  const storage = memoryStorage();
  const s = createSave(storeOf(storage));
  assert.deepEqual(getKopi(s), []);
  assert.equal(addKopi(s, "ujung"), true);
  assert.equal(addKopi(s, "pagar"), true);
  assert.equal(addKopi(s, "ujung"), false);
  assert.equal(addKopi(s, "kopi5"), false);
  assert.deepEqual(getKopi(s), ["pagar", "ujung"]);
  assert.deepEqual(getKopi(createSave(storeOf(storage))), ["pagar", "ujung"]);
  for (const raw of ["ujung", 7, null, { ujung: true }]) assert.deepEqual(getKopi(saveOf({ kopi: raw })), [], String(raw));
  assert.deepEqual(getKopi(saveOf({ kopi: ["ujung", 7, "x", "ujung", "warung"] })), ["warung", "ujung"]);
  // DEFAULTS.kopi is shared by every load: a fresh save still starts empty.
  assert.deepEqual(getKopi(saveOf()), []);
  const boom = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } };
  const blocked = createSave(makeJOR({}).createStore(boom));
  assert.equal(addKopi(blocked, "warung"), true);
  assert.deepEqual(getKopi(blocked), ["warung"]);
  // Motor Emas = every cup in KOPI.
  assert.equal(isEmas(getKopi(s)), false);
  for (const c of KOPI) addKopi(s, c.id);
  assert.equal(isEmas(getKopi(s)), true);
});

test("R10: Motor Emas needs all five; a 4/4 hunter from before #5 is told once, nobody else", () => {
  const old4 = ["pagar", "wheelie", "warung", "ujung"];
  assert.equal(isEmas(old4), false);
  assert.equal(isEmas(KOPI_IDS), true);
  // A pre-Phase-5 profile: 4/4 and Pemburu Kopi earned. Told once, then the save flag holds.
  assert.equal(kopiNotice(old4, ["berangkat", "kopi"], false), true);
  assert.equal(kopiNotice(old4, ["berangkat", "kopi"], true), false);
  // A new visitor at 4/5 (Pemburu Kopi needs all five): nothing to tell, before or after a reload.
  assert.equal(kopiNotice(["pagar", "wheelie", "warung", "bengkel"], ["berangkat"], false), false);
  assert.equal(kopiNotice(old4, [], false), false);
  // All five found: nothing missing.
  assert.equal(kopiNotice(KOPI_IDS, ["kopi"], false), false);
});

test("Motor Emas: the gold ramp keeps dark dark and light light, always gold-hued", () => {
  const px = new Uint8ClampedArray(4 * 256);
  for (let v = 0; v < 256; v++) px.set([v, v, v, 255], 4 * v);
  for (let i = 0; i < px.length; i += 4) goldPixel(px, i);
  assert.deepEqual([...px.slice(0, 4)], [30, 16, 2, 255]);
  assert.deepEqual([...px.slice(1020)], [255, 250, 220, 255]);
  for (let v = 1; v < 256; v++) {
    const [r, g, b] = px.slice(4 * v, 4 * v + 3);
    const [r0, g0, b0] = px.slice(4 * v - 4, 4 * v - 1);
    assert.ok(r >= g && g >= b, `hue at ${v}`);
    assert.ok(r >= r0 && g >= g0 && b >= b0, `order at ${v}`);
  }
  // The navy tank (sprite colour ~30,40,90) turns gold, not bronze: that is GOLD_GAMMA's job.
  const tank = new Uint8ClampedArray([30, 40, 90, 255]);
  goldPixel(tank, 0);
  assert.deepEqual([...tank], [152, 107, 19, 255]);
});

test("copy kopi: numbers only through {found}/{total}, plain text, short (D498, D509)", () => {
  const JOR = makeJOR({});
  assert.equal(JOR.fillTokens(COPY.kopi.found, { found: 2, total: KOPI.length }), "☕ Kopi rahasia ketemu! 2/5");
  for (const s of [COPY.kopi.found, COPY.kopi.emas, COPY.kopi.newCup, ...Object.values(COPY.kopi.hints)]) {
    assert.ok(!/\d/.test(s.replace(/\{(found|total)\}/g, "")), s);
    assert.ok(!s.includes("**"), s); // a toast shows its text as is
    assert.ok(s.length <= 60, s);
  }
});

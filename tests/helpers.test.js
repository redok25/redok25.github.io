// Run: node --test tests/helpers.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { makeJOR } from "../js/helpers.js";

// A fresh JOR per call, built against a fake window (e.g. one whose localStorage throws).
function loadJOR(setupWindow) {
  const window = {};
  if (setupWindow) setupWindow(window);
  return makeJOR(window);
}

const JOR = loadJOR();
const docWith = (blocking) => ({ querySelector: () => (blocking ? {} : null) });

test("isTypingTarget: form fields and contenteditable count as typing", () => {
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
    assert.equal(JOR.isTypingTarget({ tagName }), true, tagName);
  }
  assert.equal(JOR.isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(JOR.isTypingTarget({ tagName: "CANVAS" }), false);
  assert.equal(JOR.isTypingTarget(null), false);
});

test("shouldIgnoreGameKey: typing or an open dialog/modal blocks game keys", () => {
  const body = { tagName: "BODY" };
  assert.equal(JOR.shouldIgnoreGameKey({ target: { tagName: "INPUT" } }, docWith(false)), true);
  assert.equal(JOR.shouldIgnoreGameKey({ target: body }, docWith(false)), false);
  assert.equal(JOR.shouldIgnoreGameKey({ target: body }, docWith(true)), true);
});

test("parseQuickHash: deep links map to sections, junk never throws", () => {
  assert.equal(JOR.parseQuickHash("#quick"), "about");
  assert.equal(JOR.parseQuickHash("#quick/"), "about");
  assert.equal(JOR.parseQuickHash("#quick/projects"), "projects");
  assert.equal(JOR.parseQuickHash("#quick/contact"), "contact");
  assert.equal(JOR.parseQuickHash("#quick/foo"), "about");
  assert.equal(JOR.parseQuickHash("#quickly"), null);
  assert.equal(JOR.parseQuickHash("#about"), null);
  assert.equal(JOR.parseQuickHash(""), null);
  assert.equal(JOR.parseQuickHash(undefined), null);
});

test("buildWhatsAppUrl: message survives &, # and ? intact", () => {
  const url = JOR.buildWhatsAppUrl("6285156264959", {
    name: "Budi",
    email: "b@x.id",
    message: "A & B #1?",
  });
  const [base, query] = url.split("?text=");
  assert.equal(base, "https://wa.me/6285156264959");
  assert.equal(query.includes("&"), false);
  assert.equal(query.includes("#"), false);
  assert.equal(decodeURIComponent(query), "Halo, saya Budi (b@x.id).\n\nA & B #1?");
});

test("roundCoord: one decimal", () => {
  assert.equal(JOR.roundCoord(-6.21462), -6.2);
  assert.equal(JOR.roundCoord(106.84513), 106.8);
});

test("projectStats and contentTokens: count and year range from data", () => {
  assert.deepEqual(JOR.projectStats(["2025", "2021", "2024"]), {
    projectCount: 3,
    firstYear: 2021,
    lastYear: 2025,
  });
  assert.deepEqual(JOR.projectStats([]), { projectCount: 0, firstYear: null, lastYear: null });
  const doc = {
    querySelectorAll: (sel) => {
      assert.equal(sel, "#qv [data-year]");
      return ["2025", "2022"].map((y) => ({ getAttribute: () => y }));
    },
  };
  assert.deepEqual(JOR.contentTokens(doc), { projectCount: 2, firstYear: 2022, lastYear: 2025 });
});

test("fillTokens: known tokens filled, unknown kept", () => {
  assert.equal(JOR.fillTokens("Sudah {projectCount} proyek", { projectCount: 15 }), "Sudah 15 proyek");
  assert.equal(JOR.fillTokens("Halo {x}", {}), "Halo {x}");
});

test("recordVisit: one count per day, returning after any earlier load", () => {
  const first = JOR.recordVisit(null, "2026-10-12T10:00:00");
  assert.deepEqual(first, {
    record: { count: 1, first: "2026-10-12T10:00:00", last: "2026-10-12T10:00:00" },
    returning: false,
  });
  const sameDay = JOR.recordVisit(first.record, "2026-10-12T18:00:00");
  assert.equal(sameDay.record.count, 1);
  assert.equal(sameDay.returning, true);
  const nextDay = JOR.recordVisit(sameDay.record, "2026-10-13T09:00:00");
  assert.equal(nextDay.record.count, 2);
  assert.equal(nextDay.record.first, "2026-10-12T10:00:00");
  assert.equal(nextDay.record.last, "2026-10-13T09:00:00");
});

test("pause ownership: paused while any owner holds; owners never release each other", () => {
  const g = {};
  assert.equal(JOR.isPauseHeld(g), false);
  JOR.holdPause(g, "splash");
  JOR.holdPause(g, "blur");
  JOR.releasePause(g, "blur");
  assert.equal(JOR.isPauseHeld(g), true, "splash still holds");
  assert.equal(JOR.isPauseHeld(g, "splash"), true);
  assert.equal(JOR.isPauseHeld(g, "blur"), false);
  JOR.releasePause(g, "nobody");
  assert.equal(JOR.isPauseHeld(g), true, "releasing an unknown owner is a no-op");
  JOR.holdPause(g, "splash");
  JOR.releasePause(g, "splash");
  assert.equal(JOR.isPauseHeld(g), false, "double hold by one owner needs one release");
});

test("createStore: JSON round trip, memory fallback when storage throws", () => {
  const data = {};
  const ok = JOR.createStore({
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => (data[k] = v),
  });
  ok.set("jor.visits", { count: 2 });
  assert.equal(data["jor.visits"], '{"count":2}');
  assert.deepEqual(
    JOR.createStore({ getItem: (k) => data[k] ?? null, setItem() {} }).get("jor.visits", null),
    { count: 2 }
  );

  const broken = JOR.createStore({
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("QuotaExceeded"); },
  });
  assert.equal(broken.get("jor.weatherOptIn", false), false);
  broken.set("jor.weatherOptIn", true);
  assert.equal(broken.get("jor.weatherOptIn", false), true);
});

test("JOR.store works when window.localStorage access throws", () => {
  const J = loadJOR((w) =>
    Object.defineProperty(w, "localStorage", {
      get() { throw new Error("SecurityError"); },
    })
  );
  assert.equal(J.store.get("jor.visits", null), null);
  J.store.set("jor.visits", { count: 1 });
  assert.deepEqual(J.store.get("jor.visits", null), { count: 1 });
});

test("createWordBuffer: printable keys only, longest word fits, order wins", () => {
  const next = JOR.createWordBuffer(["afternoon", "noon", "wheeliegame"]);
  const type = (s) => [...s].map((k) => next(k)).filter(Boolean);
  assert.deepEqual(type("wheeliegame"), ["wheeliegame"], "11 letters fit");
  assert.deepEqual(type("afternoon"), ["afternoon"], "afternoon beats its noon suffix");
  assert.deepEqual(type("noon"), ["noon"]);
  assert.equal(next("Shift"), null, "multi-char key names are ignored");
  assert.deepEqual(type("NOON"), ["noon"], "case-insensitive");
});

test("fixedSteps: 3 s of frames gives the same step count at 30/60/144 Hz", () => {
  const stepsFor = (hz) => {
    let acc = 0, total = 0;
    for (let i = 0; i < 3 * hz; i++) {
      const r = JOR.fixedSteps(acc, 1000 / hz);
      acc = r.acc;
      total += r.steps;
    }
    return total;
  };
  for (const hz of [30, 60, 144]) {
    assert.ok(Math.abs(stepsFor(hz) - 180) <= 1, `${hz} Hz -> ${stepsFor(hz)} steps`);
  }
});

test("fixedSteps: negative dt is 0, huge dt is clamped to 3 steps", () => {
  assert.deepEqual(JOR.fixedSteps(0, -5), { steps: 0, acc: 0 });
  const r = JOR.fixedSteps(0, 5000);
  assert.equal(r.steps, 3);
  assert.ok(r.acc < JOR.STEP_MS);
});

test("createStore.remove/has: memory and storage, and a throwing storage", () => {
  const data = { a: "1" };
  const storage = {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
  const store = makeJOR({}).createStore(storage);
  assert.equal(store.has("a"), true);
  store.remove("a");
  assert.equal(store.has("a"), false);
  assert.equal(store.get("a", "fb"), "fb");
  assert.ok(!("a" in data));
  const boom = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } };
  const s2 = makeJOR({}).createStore(boom);
  s2.set("b", 2);
  assert.equal(s2.has("b"), true);
  s2.remove("b");
  assert.equal(s2.has("b"), false);
});

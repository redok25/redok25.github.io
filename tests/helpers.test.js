// Run: node --test tests/helpers.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "js", "helpers.js"), "utf8");

// Run helpers.js in this realm (not node:vm): deepStrictEqual compares prototypes,
// and objects from another realm would never match.
function loadJOR(setupWindow) {
  const window = {};
  if (setupWindow) setupWindow(window);
  new Function("window", SRC)(window);
  return window.JOR;
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

test("pause ownership: resume only if running before the first hold", () => {
  const running = { paused: false };
  JOR.holdPause(running, "quickview");
  assert.equal(running.paused, true);
  assert.equal(JOR.isPauseHeld(running), true);
  JOR.holdPause(running, "blur");
  JOR.releasePause(running, "blur");
  assert.equal(running.paused, true, "quickview still holds");
  JOR.releasePause(running, "quickview");
  assert.equal(running.paused, false);
  assert.equal(JOR.isPauseHeld(running), false);

  const splash = { paused: true };
  JOR.holdPause(splash, "blur");
  JOR.releasePause(splash, "blur");
  assert.equal(splash.paused, true, "never unpause a game that was already paused");

  const g = { paused: false };
  JOR.releasePause(g, "nobody");
  assert.equal(g.paused, false, "releasing an unknown owner is a no-op");
  JOR.holdPause(g, "blur");
  JOR.holdPause(g, "blur");
  JOR.releasePause(g, "blur");
  assert.equal(g.paused, false, "double hold by one owner needs one release");
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

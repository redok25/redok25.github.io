// Run: node --test
// Kartu Pos (T3, R11-R17): the pure postcard helpers, the paused-frame tick (pan, chapter,
// effects-only steps) on a fake game with the real Camera, and redok.photo's answers.
import test from "node:test";
import assert from "node:assert/strict";
import { Photo, PAN_SPEED, TIMES, WEATHERS, outputScale, frameUnit, nextOf, isPhotoKey, postcardLines, postcardName } from "../js/photo.js";
import { Camera } from "../js/camera.js";
import { SECRETS } from "../js/save.js";
import { COPY } from "../js/copy.js";
import { createRedok } from "../js/redok.js";
import { EffectsManager } from "../js/effects.js";
import { KOPI, kopiShown, kopiReach } from "../js/kopi.js";
import { JOR } from "../js/helpers.js";

test("photo: P is free (no cheat word has a p) and only a bare, fresh P toggles (R11)", () => {
  assert.ok(SECRETS.every((w) => !w.includes("p")), "a cheat word with a p would be typed into photo mode");
  const key = (o) => ({ code: "KeyP", repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...o });
  assert.equal(isPhotoKey(key({})), true);
  assert.equal(isPhotoKey(key({ shiftKey: true })), true);
  for (const o of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }, { code: "KeyO" }]) {
    assert.equal(isPhotoKey(key(o)), false, JSON.stringify(o)); // Ctrl/Cmd+P stays the browser's print
  }
});

test("photo: integer upscale to a ~1000 px short edge, long edge capped at 2400 (R15)", () => {
  const cases = [
    [375, 667, 3], [667, 375, 3], [1440, 900, 1], [1920, 1080, 1], [1366, 768, 1], [390, 844, 2], [800, 600, 2], [3840, 2160, 1],
  ];
  for (const [w, h, k] of cases) {
    assert.equal(outputScale(w, h), k, `${w}x${h}`);
    assert.ok(Math.max(w, h) * k <= 2400 || k === 1, `${w}x${h} long edge`);
  }
  assert.deepEqual([frameUnit(375, 667), frameUnit(1440, 900), frameUnit(200, 100)], [1, 3, 1]);
});

test("photo: frame texts, file name and toolbar copy (R15, R16, D498, D511)", () => {
  assert.deepEqual(postcardLines(3, new Date(2026, 9, 15)), { chapter: "Bab 3 · Kota Proyek", date: "15 Oktober 2026", site: "redok.me" });
  assert.equal(postcardLines(4, new Date(2027, 0, 1)).chapter, "Bab 4 · Cakrawala");
  assert.equal(postcardLines(4, new Date(2027, 0, 1)).date, "1 Januari 2027");
  assert.equal(postcardName(3), "kartu-pos-redok-bab-3.png");
  assert.equal(postcardName(0), "kartu-pos-redok-prolog.png");
  const p = COPY.photo;
  assert.deepEqual(Object.keys(p.time), TIMES);
  assert.deepEqual(Object.keys(p.weather), WEATHERS);
  const walk = (v, fn) => (typeof v === "string" ? fn(v) : Object.values(v).forEach((x) => walk(x, fn)));
  walk(p, (s) => {
    for (const [, t] of s.matchAll(/\{(\w+)\}/g)) assert.ok(s === p.chapter && ["label", "title"].includes(t), `{${t}}`);
    assert.ok(!/\d/.test(s), s);
    assert.ok(s === p.chapter || s.length <= 14, s); // one toolbar cell on a 375 px phone
  });
  assert.equal(COPY.credits.photo, "Simpan Kartu Pos");
  assert.equal(nextOf(TIMES, "night"), "morning");
  assert.equal(nextOf(WEATHERS, "clear"), "rain");
});

test("photo: a paused frame pans inside the camera bounds, follows the chapter, and ticks effects only while photo owns the pause alone (R13, R14)", () => {
  const n = { fx: 0, light: 0, chapters: [] };
  const game = {
    keys: {},
    canvas: { width: 1440 },
    player: { lockBacktrack: true, minX: 2771 },
    world: { worldWidth: 7400, sceneryWidth: 9200 },
    credits: { epilog: { running: false }, isOpen: () => false },
    _pauseOwners: new Set(["photo"]),
    effects: { update: () => n.fx++ },
    lighting: { step: () => n.light++ },
    enterChapter: (id) => n.chapters.push(id),
    get cameraX() {
      return this.camera.x;
    },
  };
  game.camera = new Camera(game);
  game.camera.x = 5000; // centre 5720: Bab 3
  const ph = Object.assign(Object.create(Photo.prototype), { game, acc: 0, chapter: 3 });

  ph.frame(50);
  assert.equal(game.camera.x, 5000, "no key, no pan");
  assert.deepEqual([n.fx, n.light], [3, 3], "50 ms = 3 fixed steps of rain, snow and sky");
  game.keys.ArrowRight = true;
  ph.frame(100); // dt is clamped to 50 ms like the sim
  assert.equal(game.camera.x, 5000 + PAN_SPEED * 50);
  assert.deepEqual(n.chapters, []);
  game.camera.x = 5800; // centre 6520: Bab 4
  ph.frame(16);
  assert.deepEqual(n.chapters, [4], "the biome and the snow follow the camera centre");
  for (let i = 0; i < 200; i++) ph.frame(50);
  assert.equal(game.camera.x, 7400 - 1440, "the playable end");
  game.keys = { KeyA: true };
  for (let i = 0; i < 400; i++) ph.frame(50);
  assert.equal(game.camera.x, 2771 - 1440 / 3, "the backtrack lock: the Prolog stays out of reach");
  assert.deepEqual(n.chapters, [4, 3, 2, 1]);

  game.keys = {};
  game._pauseOwners.add("blur"); // DevTools focus: still ticking
  const fx = n.fx;
  ph.frame(50);
  assert.equal(n.fx, fx + 3);
  game._pauseOwners.add("quickview"); // Quick View over the photo freezes the weather too
  ph.frame(50);
  assert.equal(n.fx, fx + 3);
});

// The first unpaused steps after exit run checkKopi on whatever sky and rain exit left: a night
// or rain still easing back from the mode's Malam or Hujan handed out that cup at noon in the dry.
test("photo: exit snaps the sky and the rain to the restored settings, so no night or rain cup is taken on the way out (R13)", () => {
  const doc = globalThis.document;
  globalThis.document = { querySelector: () => null, activeElement: null, body: { classList: { add() {}, remove() {} } } };
  try {
    for (const prev of [null, "rain"]) {
      const fx = Object.assign(Object.create(EffectsManager.prototype), {
        _rm: { matches: false }, // full motion: the sky eases
        forcedTime: "noon", clockMode: "noon", _clockMs: 1000, currentTimeState: null,
        cheatWeather: prev, realWeather: null, rainIntensity: prev ? 1 : 0, ambientSnow: 0, snowIntensity: 0, low: false,
        tracks: { cut() {} },
      });
      fx.snapTime();
      const game = {
        effects: fx, keys: {}, canvas: { width: 1440 }, journey: { current: 1 }, player: { x: 0, width: 200 },
        world: { hideLayers: 0, biomeWanted: "normal", snapBiome() {} },
        camera: { x: 0, jumpTo(x) { this.x = x; } },
        canTravel: () => true, releaseInput() {}, enterChapter() {},
      };
      const bar = { open: false, show() { this.open = true; }, close() { this.open = false; }, focus() {}, contains: () => false };
      const ph = Object.assign(Object.create(Photo.prototype), { game, bar, on: false, acc: 0, chapter: 0, timeBtn: {}, weatherBtn: {} });
      assert.equal(ph.enter(), true);
      ph.setTime("night");
      ph.setWeather("rain");
      for (let i = 0; i < 90; i++) fx.updateTimeOfDay(JOR.STEP_MS); // 1.5 s of the effects tick
      fx.rainIntensity = 1; // the rain has faded in (1 s)
      assert.ok(fx.currentTimeState.a > 0.45, "Malam is on in the mode");
      ph.exit();
      assert.equal(fx.currentTimeState.a, 0, "noon at once, not ~10 steps of fading night");
      assert.equal(fx.rainIntensity, prev ? 1 : 0, "the restored weather's rain at once, not ~30 steps of fading rain");
      if (prev) continue;
      for (const cup of KOPI.filter((c) => c.when === "night" || c.when === "rain")) {
        const shown = kopiShown(cup, fx.currentTimeState.a, fx.rainIntensity);
        assert.equal(kopiReach(cup, cup.x, shown, false), false, `${cup.id} stays hidden on the first step after exit`);
      }
    }
  } finally {
    globalThis.document = doc;
  }
});

test("redok.photo: the shot or busy, one help line (R16)", () => {
  let ok = true;
  const redok = createRedok({ photo: { shoot: () => ok } });
  assert.equal(redok.photo(), COPY.console.photoOk);
  ok = false;
  assert.equal(redok.photo(), COPY.console.gotoBusy);
  assert.match(COPY.console.help.join("\n"), /redok\.photo\(\)\s+simpan kartu pos/);
});

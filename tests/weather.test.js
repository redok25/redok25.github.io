// Run: node --test
// Phase 4 weather (V8, W8, W9, W10): js/weather.js is pure; the EffectsManager getters are
// read on a prototype instance (its constructor needs the DOM), and redok on a fake game.
import test from "node:test";
import assert from "node:assert/strict";
import {
  wmoKind, snowTarget, SNOW_GLOBAL, NO_WIND, windFrom, WIND_FULL_KMH, weatherUrl, WEATHER_FETCH,
  Tracks, TRACK_SLOTS, TRACK_SEG, TRACK_STEPS,
} from "../js/weather.js";
import { EffectsManager } from "../js/effects.js";
import { createRedok } from "../js/redok.js";
import { COPY } from "../js/copy.js";

const fx = (cheatWeather = null, realWeather = null, ambientSnow = 0) =>
  Object.assign(Object.create(EffectsManager.prototype), { cheatWeather, realWeather, ambientSnow });

test("V8 WMO: rain incl. freezing and thunder, snow, fog; anything else is clear (R10)", () => {
  const kinds = { rain: [], snow: [], fog: [], clear: [] };
  for (let code = -1; code <= 100; code++) kinds[wmoKind(code)].push(code);
  const span = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  assert.deepEqual(kinds.rain, [...span(51, 67), 80, 81, 82, 95, 96, 97, 98, 99]);
  assert.deepEqual(kinds.snow, [...span(71, 77), 85, 86]);
  assert.deepEqual(kinds.fog, [45, 48]);
  for (const code of [0, 1, 2, 3, 100]) assert.equal(wmoKind(code), "clear");
  assert.equal(wmoKind(undefined), "clear");
});

test("V8 precedence: cheat beats real beats the chapter; only rain is rainActive (kopi #3, NPC lines)", () => {
  assert.equal(fx().weatherKind, null);
  assert.equal(fx(null, "snow").weatherKind, "snow");
  assert.equal(fx("clear", "rain").weatherKind, "clear");
  assert.equal(fx("rain", "snow").weatherKind, "rain");
  assert.equal(fx("rain").rainActive, true);
  for (const k of ["snow", "fog", "clear", null]) assert.equal(fx(k, k).rainActive, false, String(k));
  // Bab 4's own snow is a floor under every kind but rain (Phase 2 acceptance 8).
  assert.equal(snowTarget(null, 0.3), 0.3);
  assert.equal(snowTarget("clear", 0.3), 0.3);
  assert.equal(snowTarget("fog", 0.3), 0.3);
  assert.equal(snowTarget("rain", 0.3), 0);
  assert.equal(snowTarget("snow", 0), SNOW_GLOBAL);
  assert.equal(snowTarget("snow", 0.9), 0.9);
  assert.equal(fx("snow", null, 0).snowWanted(), SNOW_GLOBAL); // every chapter
  assert.equal(fx(null, "rain", 0.3).snowWanted(), 0);
});

test("W8 wind: no real wind = today's look; km/h from a direction, east = +x, clamped", () => {
  // Today: rain -200 px/s (slant -5 = -200 * 0.025), snow -20 px/s, clouds x1 to the right,
  // every tree sin(t) * 3 at 1 rad/s in step.
  assert.deepEqual({ ...NO_WIND }, { rainVx: -200, snowVx: -20, cloudK: 1, swayAmp: 3, swayRate: 1, gust: 0 });
  assert.equal(windFrom(undefined, 90), NO_WIND);
  assert.equal(windFrom(20, null), NO_WIND);
  const east = windFrom(20, 90); // half strength from the east: today's rain and snow drift
  assert.ok(Math.abs(east.rainVx + 200) < 1e-9 && Math.abs(east.snowVx + 20) < 1e-9 && east.cloudK < 0);
  const west = windFrom(WIND_FULL_KMH, 270);
  assert.ok(west.rainVx > 0 && west.snowVx > 0 && west.cloudK > 0 && west.gust < 0); // pushed right
  for (const deg of [0, 180]) assert.ok(Math.abs(windFrom(30, deg).rainVx) < 1e-9, `${deg}`); // depth only
  const gale = windFrom(500, 270);
  assert.deepEqual(gale, windFrom(WIND_FULL_KMH, 270)); // clamped
  assert.ok(gale.rainVx <= 400 && gale.snowVx <= 40 && gale.cloudK <= 2 && gale.swayAmp <= 8);
  const calm = windFrom(0, 270);
  assert.ok(calm.swayAmp < NO_WIND.swayAmp && gale.swayAmp > NO_WIND.swayAmp && calm.rainVx === 0);
  assert.ok(windFrom(-5, 90).swayAmp === calm.swayAmp);
  // Per tree: the phase moves with x under real wind, never without it.
  const f = Object.assign(Object.create(EffectsManager.prototype), { windOffset: 1, wind: NO_WIND, swayAmp: 3 });
  assert.equal(f.getWindSway(0), f.getWindSway(5000));
  assert.equal(f.getWindSway(0), Math.sin(1) * 3);
  f.wind = west;
  f.swayAmp = west.swayAmp;
  assert.notEqual(f.getWindSway(0), f.getWindSway(400));
});

test("W10 request: one decimal coordinates, current weather only, no Referer (R13)", () => {
  assert.equal(
    weatherUrl(-6.208763, 106.845599),
    "https://api.open-meteo.com/v1/forecast?latitude=-6.2&longitude=106.8&current_weather=true"
  );
  assert.equal(new URL(weatherUrl(51.50735, -0.12776)).searchParams.get("longitude"), "-0.1");
  assert.deepEqual({ ...WEATHER_FETCH }, { referrerPolicy: "no-referrer" });
  assert.ok(Object.isFrozen(WEATHER_FETCH));
});

test("W9 tracks: segments by distance, a jump or a dry step breaks the line, 200-slot ring", () => {
  const t = new Tracks();
  const arrays = [t.x0, t.x1, t.at];
  t.step(100, true); // the first marking step only starts the line
  for (let x = 110; x <= 400; x += 10) t.step(x, true);
  const segs = [];
  for (let i = 0; i < TRACK_SLOTS; i++) if (t.alpha(i) > 0) segs.push([t.x0[i], t.x1[i]]);
  assert.equal(segs[0][0], 100);
  assert.equal(segs.at(-1)[1], 400);
  for (let i = 0; i < segs.length; i++) {
    assert.ok(segs[i][1] - segs[i][0] <= TRACK_SEG + 10, `segment ${i}`);
    if (i) assert.equal(segs[i][0], segs[i - 1][1]); // one unbroken line
  }
  // A teleport (a jump) or a step that does not mark breaks it; riding on starts a new one.
  const before = t.next;
  t.step(3000, true);
  t.step(3010, true);
  assert.equal(t.next, before + 1);
  assert.deepEqual([t.x0[before], t.x1[before]], [3000, 3010]);
  t.step(3020, false);
  t.step(3030, true);
  assert.equal(t.next, before + 1, "no segment across the dry step");
  t.cut(); // game.syncChapterAt
  t.step(3040, true);
  assert.equal(t.next, before + 1);
  // Back over its own track: the segment grows to cover, it never shrinks.
  t.step(3050, true);
  t.step(3045, true);
  assert.ok(t.x0[before + 1] === 3040 && t.x1[before + 1] === 3050);
  // The ring: the 201st segment takes the oldest slot, and nothing is reallocated.
  for (let x = 3050; x < 3050 + 64 * 400; x += 8) t.step(x, true);
  assert.ok(t.next >= 0 && t.next < TRACK_SLOTS);
  assert.deepEqual([t.x0, t.x1, t.at], arrays);
});

test("W9 tracks: fade over 1200 sim steps (20 s), frozen while no step runs", () => {
  const t = new Tracks();
  t.step(0, true);
  t.step(10, true);
  assert.equal(t.alpha(0), 1);
  for (let i = 0; i < TRACK_STEPS / 2; i++) t.step(10, true); // standing still
  assert.equal(t.alpha(0), 0.5);
  for (let i = 0; i < TRACK_STEPS / 2; i++) t.step(10, false);
  assert.equal(t.alpha(0), 0);
  t.step(10, true);
  t.step(20, true); // riding on after a stop: a new segment, the old one stays gone
  assert.ok(t.alpha(0) < 0);
  assert.equal(t.alpha(1), 1);
  assert.ok(new Tracks().alpha(TRACK_SLOTS - 1) <= 0, "unused slots are never drawn");
});

test("redok.weather: hujan/salju/kabut/cerah, rain/snow/fog/clear and the old true/false (R9)", () => {
  const game = { effects: { cheatWeather: null } };
  const redok = createRedok(game);
  const cases = [
    ["snow", "snow", "snow"], ["SALJU", "snow", "salju"], ["kabut", "fog", "kabut"], ["fog", "fog", "fog"],
    ["cerah", "clear", "cerah"], ["rain", "rain", "rain"], [true, "rain", "hujan"], [false, "clear", "cerah"],
    [undefined, "rain", "hujan"],
  ];
  for (const [arg, kind, word] of cases) {
    game.effects.cheatWeather = null;
    assert.equal(redok.weather(arg), `Cuaca: ${word}.`, String(arg));
    assert.equal(game.effects.cheatWeather, kind, String(arg));
  }
  game.effects.cheatWeather = "fog";
  for (const bad of ["badai", "", null, 1, "auto"]) assert.equal(redok.weather(bad), COPY.console.weatherBad, String(bad));
  assert.equal(game.effects.cheatWeather, "fog", "a bad word changes nothing");
  assert.match(COPY.console.help.join("\n"), /redok\.weather\(k\)\s+hujan \| salju \| kabut \| cerah/);
});

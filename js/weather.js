// ===================================
// WEATHER.JS - Weather as data (V8, W8, W9, W10): the WMO table, the one precedence rule,
// real wind, the Open-Meteo request and the tyre-track ring. Pure (no DOM): node tests
// import it. effects.js holds the state, game.js feeds it, world.js draws the ground side.
// ===================================
import { JOR } from "./helpers.js";

// Open-Meteo current_weather.weathercode (WMO) -> kind (R10). Anything else is clear.
export function wmoKind(code) {
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  return "clear";
}

// The one precedence (R10): a cheat (cheat word, redok, ?bengkel=) beats real weather, which
// beats the chapter. Each is null | "rain" | "snow" | "fog" | "clear"; null = not set.
export const weatherKind = (cheat, real) => cheat ?? real ?? null;

export const SNOW_GLOBAL = 0.6; // snow everywhere (WMO 71-77/85-86, redok.weather("snow"))

// Snow intensity wanted. The chapter's own snow (Bab 4 = 0.3) is a floor under every kind
// except rain, which replaces it (as before Phase 4): "clear" and "fog" keep Bab 4 snowy
// (Phase 2 acceptance 8), "snow" raises it to SNOW_GLOBAL in every chapter.
export function snowTarget(kind, ambient) {
  if (kind === "rain") return 0;
  return kind === "snow" ? Math.max(ambient, SNOW_GLOBAL) : ambient;
}

// v moved toward target by at most step (the eased weather amounts).
export function approach(v, target, step) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

// Real wind (W8, R11). Without it, today's look: rain and snow drift left, clouds right, every
// tree sways in step (sin * 3 at 1 rad/s).
export const NO_WIND = Object.freeze({ rainVx: -200, snowVx: -20, cloudK: 1, swayAmp: 3, swayRate: 1, gust: 0 });
export const WIND_FULL_KMH = 40; // at or above this the wind blows at full strength
const RAIN_DRIFT = 400; // px/s along the road at full wind (a 20 km/h east wind = today's -200)
const SNOW_DRIFT = 40; // px/s (20 km/h east = today's -20)
const CLOUD_K = 2; // x each cloud's own speed (20 km/h west = today's drift)
const SWAY = [0.5, 8]; // tree sway amplitude, calm .. full (world.js rotates by sway * 0.005 rad)
const SWAY_RATE = [0.6, 1.8]; // rad/s
const GUST = 0.004; // rad of sway phase per px of x: one gust every ~1570 px

// km/h and the direction it blows FROM (degrees, meteorological) -> the look. East = +x, so a
// wind from 270 (west) pushes everything right. A wind along the screen's depth (from 0 or 180)
// still shakes the trees but slants nothing. A response without wind keeps today's look.
export function windFrom(kmh, fromDeg) {
  if (!Number.isFinite(kmh) || !Number.isFinite(fromDeg)) return NO_WIND;
  const s = Math.min(1, Math.max(0, kmh / WIND_FULL_KMH));
  const x = -Math.sin((fromDeg * Math.PI) / 180) * s;
  return {
    rainVx: RAIN_DRIFT * x,
    snowVx: SNOW_DRIFT * x,
    cloudK: CLOUD_K * x,
    swayAmp: SWAY[0] + (SWAY[1] - SWAY[0]) * s,
    swayRate: SWAY_RATE[0] + (SWAY_RATE[1] - SWAY_RATE[0]) * s,
    gust: x > 0 ? -GUST : GUST, // phase per px: gusts roll downwind through the trees
  };
}

// The Open-Meteo request (W10, R13): coordinates rounded to one decimal (~11 km), no Referer.
export function weatherUrl(lat, lon) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${JOR.roundCoord(lat)}&longitude=${JOR.roundCoord(lon)}&current_weather=true`;
}
export const WEATHER_FETCH = Object.freeze({ referrerPolicy: "no-referrer" });

// Tyre tracks (W9, R12): a fixed ring of segments in world x, extended by distance, faded by
// sim steps (a pause freezes them). y is not stored: world.js draws them on the current road.
export const TRACK_SLOTS = 200;
export const TRACK_SEG = 64; // px of road per segment: 200 x 64 px = 20 s at top speed (600 px/s)
export const TRACK_STEPS = 1200; // fade-out: 20 s of sim steps at 60 Hz
export const TRACK_BREAK = 40; // px in one step is no ride (top speed 10 px/step): a jump

export class Tracks {
  constructor() {
    this.x0 = new Float32Array(TRACK_SLOTS); // segment's left end (world x)
    this.x1 = new Float32Array(TRACK_SLOTS); // right end
    this.at = new Float64Array(TRACK_SLOTS).fill(-TRACK_STEPS); // step it was last extended
    this.now = 0; // sim steps
    this.head = -1; // the slot being extended; -1 = the line is broken
    this.next = 0; // the slot the next segment takes (the oldest)
    this.lastX = NaN;
  }

  // One sim step: the tyre at world x marks the road (marks) or not. A step that does not
  // mark, or a jump (teleport, the opening-ride skip), breaks the line; a stop starts a new
  // segment so an old one never brightens again.
  step(x, marks) {
    this.now++;
    const last = this.lastX;
    this.lastX = marks ? x : NaN;
    if (!marks || !(Math.abs(x - last) <= TRACK_BREAK)) {
      this.head = -1;
      return;
    }
    if (x === last) return;
    let i = this.head;
    if (i < 0 || this.at[i] !== this.now - 1 || this.x1[i] - this.x0[i] >= TRACK_SEG) {
      i = this.head = this.next;
      this.next = (i + 1) % TRACK_SLOTS;
      this.x0[i] = this.x1[i] = last;
    }
    if (x < this.x0[i]) this.x0[i] = x;
    if (x > this.x1[i]) this.x1[i] = x;
    this.at[i] = this.now;
  }

  // A teleport (game.syncChapterAt): the next step starts a new line wherever the bike is.
  cut() {
    this.head = -1;
    this.lastX = NaN;
  }

  // 1 fresh .. <= 0 gone.
  alpha(i) {
    return 1 - (this.now - this.at[i]) / TRACK_STEPS;
  }
}

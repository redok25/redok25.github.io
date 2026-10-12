// ===================================
// JOURNEY.JS - The road as chapters (V1): Prolog + Bab 1-4 over the 7400 px world, the
// current chapter with 150 px hysteresis (R4), and the biome crossfade state (V2, R5).
// Pure logic (no DOM): node tests import it. Titles come from copy.js.
// ===================================
import { COPY } from "./copy.js";

export const HYSTERESIS = 150; // px past a boundary before the chapter changes (R4)
export const BIOME_FADE_MS = 1000; // crossfade length in real time, not sim steps (R5)

// startX/endX exactly as the spec table; snow = ambient snow intensity (V8, Bab 4 only).
export const CHAPTERS = [
  { id: 0, startX: 0, endX: 2771, biome: "normal", snow: 0, ...COPY.chapters[0] },
  { id: 1, startX: 2771, endX: 3900, biome: "normal", snow: 0, ...COPY.chapters[1] },
  { id: 2, startX: 3900, endX: 5050, biome: "normal", snow: 0, ...COPY.chapters[2] },
  { id: 3, startX: 5050, endX: 6500, biome: "autumn", snow: 0, ...COPY.chapters[3] },
  { id: 4, startX: 6500, endX: 7400, biome: "winter", snow: 0.3, ...COPY.chapters[4] },
];

// Chapter id at a world x, without memory. Left of the road = Prolog, right of it = Bab 4.
export function chapterAt(x) {
  for (let i = CHAPTERS.length - 1; i > 0; i--) if (x >= CHAPTERS[i].startX) return i;
  return 0;
}

// The current chapter reaches HYSTERESIS px past both of its edges, so riding back and
// forth over a boundary never flips it. Outside that band (a ride or a teleport) the
// chapter under x takes over. x is the bike's CENTER (player.x + width / 2).
export function nextChapter(current, x) {
  const c = CHAPTERS[current];
  if (x >= c.startX - HYSTERESIS && x <= c.endX + HYSTERESIS) return current;
  return chapterAt(x);
}

// Fast travel lands the bike's left edge 100 px into the chapter (R6, R14): its centre is
// startX + 200, past every hysteresis band, so the chapter switches on arrival.
export function arrivalX(id) {
  return CHAPTERS[id].startX + 100;
}

// Journey strip dot (W5): 0..1 over five equal cells, one per chapter, so the dot sits on
// node i (its cell centre) while the bike is in the middle of chapter i.
export function stripPos(centerX) {
  const id = chapterAt(centerX);
  const c = CHAPTERS[id];
  const t = Math.min(1, Math.max(0, (centerX - c.startX) / (c.endX - c.startX)));
  return (id + t) / CHAPTERS.length;
}

export class Journey {
  constructor(centerX) {
    this.current = chapterAt(centerX);
    // The start chapter (Prolog) never gets a title card: the opening ride is its cinematic.
    this.seen = new Set([this.current]);
  }

  // Feed the bike's center x once per sim step. Returns the chapter just entered, or -1.
  update(centerX) {
    const next = nextChapter(this.current, centerX);
    if (next === this.current) return -1;
    this.current = next;
    return next;
  }

  // A teleport (fast travel, minigame start or return, redok.goto) is not a ride over a
  // boundary: the chapter under the new centre takes over at once, no hysteresis (R12).
  // Like update(), it never uses up a first entry.
  jumpTo(centerX) {
    const next = chapterAt(centerX);
    if (next === this.current) return -1;
    this.current = next;
    return next;
  }

  // True only the first time a chapter is entered on this page load (title card, R4).
  firstEntry(id) {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    return true;
  }
}

// Biome crossfade (R5): `from` is drawn at full alpha and `to` over it at alpha t, with t
// going 0 -> 1 over BIOME_FADE_MS of real time. to === null means no fade is running.
export function createBiomeFade(biome) {
  return { from: biome, to: null, t: 0, start: 0 };
}

// Advance the fade to `now` (ms) and react to the wanted biome. A biome whose images are
// not loaded yet (ready(biome) false) is not faded in: the old one stays on screen.
export function stepBiomeFade(fade, wanted, ready, now) {
  if (fade.to !== null) {
    // Clamped both ways: a frame timestamp can be a hair older than the fade start.
    fade.t = Math.max(0, Math.min(1, (now - fade.start) / BIOME_FADE_MS));
    if (fade.t >= 1) {
      fade.from = fade.to;
      fade.to = null;
      fade.t = 0;
    }
  }
  if (wanted === (fade.to ?? fade.from) || !ready(wanted)) return;
  if (fade.to !== null && wanted === fade.from) {
    // Turned back mid-fade: swap the ends so the picture does not jump.
    [fade.from, fade.to] = [fade.to, fade.from];
    fade.t = 1 - fade.t;
    fade.start = now - fade.t * BIOME_FADE_MS;
    return;
  }
  // A third biome mid-fade (a teleport) starts from whichever biome dominates now.
  if (fade.to !== null && fade.t >= 0.5) fade.from = fade.to;
  fade.to = wanted;
  fade.t = 0;
  fade.start = now;
}

// Share (0..1) of `biome` in the picture: drives the winter ground tint.
export function biomeWeight(fade, biome) {
  if (fade.to === null) return fade.from === biome ? 1 : 0;
  return (fade.from === biome ? 1 - fade.t : 0) + (fade.to === biome ? fade.t : 0);
}

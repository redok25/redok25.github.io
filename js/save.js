// ===================================
// SAVE.JS - One versioned save record ("jor.save.v1") on top of JOR.store (F15).
// Later phases add fields to DEFAULTS; additive fields need no version bump.
// load() never overwrites a record it does not understand (corrupt, or a newer v): the page
// runs on defaults in memory. The first set() does overwrite it, and the visitor counter
// sets on every load, so there is no real downgrade protection (accepted: old builds only
// live in a stale cache for minutes). A later schema bump must not rely on it.
// ===================================
import { JOR } from "./helpers.js";

export const SAVE_KEY = "jor.save.v1";
const DEFAULTS = { v: 1, visits: null, weatherOptIn: false, stamps: [], bests: {}, audio: null, seen: [], secrets: [], kopi: [] };

export function createSave(store) {
  let data = load();

  function load() {
    if (store.has(SAVE_KEY)) {
      const raw = store.get(SAVE_KEY, null);
      if (raw && typeof raw === "object" && raw.v === 1) return { ...DEFAULTS, ...raw };
      return { ...DEFAULTS }; // corrupt or newer: leave it alone
    }
    // First run on this schema: migrate the pre-1b keys once.
    const migrated = {
      ...DEFAULTS,
      visits: store.get("jor.visits", null),
      weatherOptIn: store.get("jor.weatherOptIn", false) === true,
    };
    // Drop the legacy keys only once the new record is really stored (full quota keeps them).
    if (store.set(SAVE_KEY, migrated)) {
      store.remove("jor.visits");
      store.remove("jor.weatherOptIn");
    }
    return migrated;
  }

  return {
    get: (key) => data[key],
    set(key, value) {
      data = { ...data, [key]: value, v: DEFAULTS.v };
      store.set(SAVE_KEY, data);
    },
  };
}

export const save = createSave(JOR.store);

// Id lists (stamps, seen projects P2, secrets P4, and any later list of ids): an array kept
// in the order of `valid`, the COMPLETE list of ids that key may hold. A stored value is
// untrusted (any JSON), so it is normalised on every read; a write always stores a new array,
// because DEFAULTS' arrays are shared by every load and must never be mutated. A write keeps
// only ids in `valid`, so a caller passing a partial list would erase the others.
export function getIds(s, key, valid) {
  const raw = s.get(key);
  return Array.isArray(raw) ? valid.filter((id) => raw.includes(id)) : [];
}

// True only when id is valid and new: the caller's "first time" moment.
export function addId(s, key, id, valid) {
  if (!valid.includes(id)) return false;
  const ids = getIds(s, key, valid);
  if (ids.includes(id)) return false;
  s.set(key, [...ids, id]);
  return true;
}

// Chapter stamps (W4, R10, R24): the station ids opened by E or a tap, in Quick View order.
export function getStamps(s) {
  return getIds(s, "stamps", JOR.QV_SECTIONS);
}

export function addStamp(s, id) {
  return addId(s, "stamps", id, JOR.QV_SECTIONS);
}

// Secrets (P4): every word of game.js's cheat table, in its order, plus the visitor egg. A
// word counts the first time it really runs (typed, ?bengkel=<word>, or the egg opening).
export const SECRETS = ["rain", "morning", "afternoon", "noon", "night", "reset", "wheeliegame", "lightgame", "racegame", "glitch", "visitor"];

// Audio settings (P8): { volume 0..1, muted }. Untrusted like every stored value: a volume
// that is not a finite number falls back to the default, others are clamped to 0..1, and 0
// stays 0 (a real choice, not "unset"). Only a literal true mutes. A write stores a new object.
export function getAudio(s) {
  const raw = s.get("audio");
  const volume = raw && typeof raw === "object" ? raw.volume : null;
  return {
    volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.6,
    muted: !!raw && raw.muted === true,
  };
}

// Minigame personal bests (P6): sim steps per course id, lower is better. Wheelie: course
// start to the end of the 5 s hold; Drag: GO to the finish; RLGL: steps outside red lights.
// Untrusted on read like stamps; a write builds a new object (DEFAULTS.bests is shared).
const BEST_IDS = ["wheelie_challenge", "red_light_green_light", "drag_race"];
const MAX_BEST_STEPS = 1e7; // ~46 h: keeps a junk stored number off the result card

const validSteps = (n) => Number.isInteger(n) && n > 0 && n < MAX_BEST_STEPS;

export function getBest(s, id) {
  const all = s.get("bests");
  if (!BEST_IDS.includes(id) || !all || typeof all !== "object") return null;
  return validSteps(all[id]) ? all[id] : null;
}

// Judges one finished run. steps = a win's time, null for a loss (nothing to time). Only a
// strictly lower time is written. Returns { steps, best, prevBest, isNewBest }: prevBest is
// the record before this run (null on the first win, which counts as a new record).
export function recordBest(s, id, steps) {
  const prevBest = getBest(s, id);
  const run = BEST_IDS.includes(id) && validSteps(steps) ? steps : null;
  if (run === null || (prevBest !== null && run >= prevBest)) {
    return { steps: run, best: prevBest, prevBest, isNewBest: false };
  }
  const bests = {};
  for (const k of BEST_IDS) {
    const b = getBest(s, k);
    if (b !== null) bests[k] = b;
  }
  bests[id] = run;
  s.set("bests", bests);
  return { steps: run, best: run, prevBest, isNewBest: true };
}

// Sim steps as seconds for the player: 320 -> "5,33" (Indonesian decimal comma).
export function formatSteps(steps) {
  return ((steps * JOR.STEP_MS) / 1000).toFixed(2).replace(".", ",");
}

// ===================================
// SAVE.JS - One versioned save record ("jor.save.v1") on top of JOR.store (F15).
// Later phases add fields to DEFAULTS; additive fields need no version bump.
// A record this code does not understand (corrupt, or a newer v) is never overwritten
// on load: the page runs on defaults in memory until something is explicitly saved.
// ===================================
import { JOR } from "./helpers.js";

export const SAVE_KEY = "jor.save.v1";
const DEFAULTS = { v: 1, visits: null, weatherOptIn: false };

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
    store.set(SAVE_KEY, migrated);
    store.remove("jor.visits");
    store.remove("jor.weatherOptIn");
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

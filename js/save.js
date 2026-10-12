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
const DEFAULTS = { v: 1, visits: null, weatherOptIn: false, stamps: [] };

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

// Chapter stamps (W4, R10, R24): the station ids opened by E or a tap. A stored value is
// untrusted (any JSON), so it is normalised on every read; a write always stores a new
// array, because DEFAULTS.stamps is shared by every load and must never be mutated.
export function getStamps(s) {
  const raw = s.get("stamps");
  if (!Array.isArray(raw)) return [];
  return JOR.QV_SECTIONS.filter((id) => raw.includes(id));
}

export function addStamp(s, id) {
  if (!JOR.QV_SECTIONS.includes(id)) return false;
  const stamps = getStamps(s);
  if (stamps.includes(id)) return false;
  s.set("stamps", [...stamps, id]);
  return true;
}

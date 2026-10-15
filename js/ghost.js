// ===================================
// GHOST.JS - Ghost runs and challenge links (T4, R19-R27). Pure: no DOM, no audio, no imports,
// so node tests and tests/check.html use it as is. A run is recorded in sim steps (every 6 steps
// = 100 ms one sample: how far the bike got since the last one, 0..60 px), and travels as
// "#ghost=<dr|rl>.1.<seed>.<data>", one base64url character per sample. A link and a stored
// ghost are untrusted: decodeGhost checks everything before any of it is used, and nothing from
// it is ever text on the page (only numbers for drawing).
// ===================================

export const GHOST_STEP = 6; // sim steps per sample (100 ms at 60 steps/s)
export const GHOST_MAX = 600; // samples (60 s); a longer run gets no ghost (R20)
export const GHOST_DMAX = 60; // px per sample: the bike's 10 px/step clamp x 6
export const GHOST_HASH = "#ghost=";
// Link game id -> course id. Drag has no RNG, so its seed is always 0 (R21).
export const GHOST_TYPES = { rl: "red_light_green_light", dr: "drag_race" };
export const GHOST_IDS = ["red_light_green_light", "drag_race"]; // the save's `ghosts` keys

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const SEED_MAX = 0xffffffff;
// "rl.1." + a 10-digit seed + "." + 600 samples: anything longer is refused before the regex.
const PAYLOAD_MAX = 616;
const PAYLOAD = /^(dr|rl)\.1\.(\d{1,10})\.([A-Za-z0-9_-]{1,600})$/;

const validSeed = (kind, seed) =>
  Number.isInteger(seed) && seed >= 0 && seed <= SEED_MAX && (kind === "rl" || seed === 0);

// The classic mulberry32 (integer math only, so every engine draws the same numbers).
export function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A fresh uint32 seed for a normal RLGL run (the lights stay random, R22).
export const newSeed = () => (Math.random() * 0x100000000) >>> 0;

// samples[0..n) (each 0..60) -> "rl.1.<seed>.<data>", or null when anything is out of range.
export function encodeGhost(kind, seed, samples, n) {
  if (!Object.hasOwn(GHOST_TYPES, kind) || !validSeed(kind, seed) || !Number.isInteger(n) || n < 1 || n > GHOST_MAX) return null;
  let data = "";
  for (let i = 0; i < n; i++) {
    const v = samples[i];
    if (!Number.isInteger(v) || v < 0 || v > GHOST_DMAX) return null;
    data += B64[v];
  }
  return `${kind}.1.${seed}.${data}`;
}

// Untrusted payload (a link or the save) -> { kind, type, seed, n, prefix, payload } or null.
// prefix[k] = px covered after k samples (prefix[0] = 0), the only thing drawing needs.
export function decodeGhost(str) {
  if (typeof str !== "string" || str.length > PAYLOAD_MAX) return null;
  const m = PAYLOAD.exec(str);
  if (!m) return null;
  const kind = m[1];
  const seed = Number(m[2]);
  if (!validSeed(kind, seed)) return null;
  const data = m[3];
  const n = data.length;
  const prefix = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const v = B64.indexOf(data[i]);
    if (v > GHOST_DMAX) return null; // "9", "-", "_" are base64url but not a sample
    prefix[i + 1] = prefix[i] + v;
  }
  return { kind, type: GHOST_TYPES[kind], seed, n, prefix, payload: str };
}

// location.hash -> null (not a challenge link), false (a broken one) or the ghost. The length
// is checked before anything else (R21).
export function parseGhostHash(hash) {
  if (typeof hash !== "string" || !hash.startsWith(GHOST_HASH)) return null;
  if (hash.length > GHOST_HASH.length + PAYLOAD_MAX) return false;
  return decodeGhost(hash.slice(GHOST_HASH.length)) || false;
}

// The link a friend opens (R21): built from location.origin + location.pathname by the caller.
export const ghostLink = (base, payload) => base + GHOST_HASH + payload;

// One course run (R20). step(x) once per course step with the bike's x after that step; a
// sample every GHOST_STEP steps keeps the progress past x0 as a running max, quantised to whole
// px, so a step back never goes negative and rounding never drifts. finish(x) adds the last,
// partial sample and returns the sample count, or 0 when the run went past GHOST_MAX samples.
// One Uint8Array per course start; nothing allocated per step.
export class GhostRecorder {
  constructor(x0) {
    this.data = new Uint8Array(GHOST_MAX);
    this.x0 = x0;
    this.q = 0; // the furthest whole px reached so far
    this.steps = 0; // course steps recorded: the course clock the ghost replays on
    this.n = 0;
    this.over = false;
  }

  step(x) {
    if (++this.steps % GHOST_STEP === 0) this.sample(x);
  }

  sample(x) {
    if (this.n === GHOST_MAX) {
      this.over = true;
      return;
    }
    const d = Math.round(x - this.x0) - this.q;
    this.data[this.n++] = d > 0 ? d : 0;
    if (d > 0) this.q += d;
  }

  finish(x) {
    if (this.steps % GHOST_STEP) this.sample(x);
    return this.over ? 0 : this.n;
  }
}

// The ghost's distance from its start after t course steps (a float: the drawn frame sits
// between two steps). Samples land every GHOST_STEP steps; linear in between; it waits at the end.
export function ghostX(ghost, t) {
  const s = t / GHOST_STEP;
  if (!(s > 0)) return 0;
  if (s >= ghost.n) return ghost.prefix[ghost.n];
  const k = Math.floor(s);
  const p = ghost.prefix;
  return p[k] + (p[k + 1] - p[k]) * (s - k);
}

// A challenge run against the friend's ghost at 100 ms resolution (R23). runSteps = every course
// step of a win (RLGL red lights included), null for a loss. A ghost "finishes" on its last sample.
export function ghostVs(runSteps, ghost) {
  if (!runSteps) return "notYet";
  const n = Math.ceil(runSteps / GHOST_STEP);
  return n < ghost.n ? "beat" : n === ghost.n ? "tie" : "notYet";
}

// The stored PB ghost per course (save field `ghosts`, R24): normalised on read with the link
// validator; a write keeps only valid ghosts (the stored object is untrusted JSON). `s` is the
// save (save.js stays a leaf: this module does not import it).
export function getGhost(s, type) {
  const all = s.get("ghosts");
  const g = all && typeof all === "object" && GHOST_IDS.includes(type) ? decodeGhost(all[type]) : null;
  return g && g.type === type ? g : null;
}

export function setGhost(s, type, payload) {
  const g = decodeGhost(payload);
  if (!g || g.type !== type) return false;
  const ghosts = {};
  for (const id of GHOST_IDS) {
    const old = getGhost(s, id);
    if (old) ghosts[id] = old.payload;
  }
  ghosts[type] = payload;
  s.set("ghosts", ghosts);
  return true;
}

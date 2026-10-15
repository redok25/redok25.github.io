// Run: node --test "tests/*.test.js"
// T4 ghost + challenge link (R19-R27): the codec, the validator, mulberry32, the recorder, the
// position lookup, the challenge comparison and the stored PB ghost. Pure: no DOM.
import test from "node:test";
import assert from "node:assert/strict";
import { makeJOR } from "../js/helpers.js";
import { createSave, SAVE_KEY } from "../js/save.js";
import { createRedok } from "../js/redok.js";
import { COPY } from "../js/copy.js";
import {
  GHOST_STEP, GHOST_MAX, GHOST_DMAX, GHOST_IDS, mulberry32, encodeGhost, decodeGhost, parseGhostHash, ghostLink,
  GhostRecorder, ghostX, ghostVs, getGhost, setGhost,
} from "../js/ghost.js";

const memorySave = (init = {}) => {
  const data = { ...init };
  const storage = { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
  return { s: createSave(makeJOR({ localStorage: storage }).createStore(storage)), data };
};
const samples = (n, f) => Uint8Array.from({ length: n }, (_, i) => f(i));

test("ghost: mulberry32 is the classic generator (pinned outputs, integer math)", () => {
  const first4 = (seed) => { const r = mulberry32(seed); return [r(), r(), r(), r()].map((v) => v * 4294967296); };
  // From the canonical one-liner (bryc): t = a += 0x6D2B79F5; ... ((t ^ t >>> 14) >>> 0) / 2^32.
  assert.deepEqual(first4(0), [1144304738, 1416247, 958946056, 627933444]);
  assert.deepEqual(first4(1), [2693262067, 11749833, 2265367787, 4213581821]);
  assert.deepEqual(first4(42), [2581720956, 1925393290, 3661312704, 2876485805]);
  assert.deepEqual(first4(4294967295), [3850105811, 813802916, 3073704848, 4054706436]);
  function reference(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  for (const seed of [7, 123456789, 4000000000]) {
    const a = mulberry32(seed), b = reference(seed);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      assert.equal(v, b());
      assert.ok(v >= 0 && v < 1);
    }
  }
});

test("ghost: a run round-trips through the link format (R21)", () => {
  assert.equal(GHOST_STEP, 6);
  assert.equal(GHOST_MAX, 600);
  assert.equal(GHOST_DMAX, 60);
  const data = samples(GHOST_MAX, (i) => (i * 7) % 61);
  const payload = encodeGhost("rl", 4294967295, data, GHOST_MAX);
  assert.match(payload, /^rl\.1\.4294967295\.[A-Za-z0-8]{600}$/);
  const g = decodeGhost(payload);
  assert.equal(g.kind, "rl");
  assert.equal(g.type, "red_light_green_light");
  assert.equal(g.seed, 4294967295);
  assert.equal(g.n, 600);
  assert.equal(g.payload, payload);
  let sum = 0;
  for (let i = 0; i < 600; i++) {
    assert.equal(g.prefix[i], sum);
    sum += data[i];
  }
  assert.equal(g.prefix[600], sum);
  // Edges: one sample, the values 0 and 60, Drag's seed 0.
  assert.equal(encodeGhost("dr", 0, [60], 1), "dr.1.0.8");
  assert.equal(encodeGhost("rl", 5, [0, 60], 2), "rl.1.5.A8");
  assert.deepEqual([...decodeGhost("rl.1.5.A8").prefix], [0, 0, 60]);
  // The link: origin + pathname + "#ghost=" + payload, and back again.
  const link = ghostLink("https://redok.me/", "dr.1.0.8");
  assert.equal(link, "https://redok.me/#ghost=dr.1.0.8");
  assert.equal(parseGhostHash(new URL(link).hash).payload, "dr.1.0.8");
  assert.equal(parseGhostHash("#ghost=" + payload).n, 600);
});

test("ghost: every broken link is refused before use (R21, acceptance 4)", () => {
  const ok = "A".repeat(10);
  const bad = {
    "5000 chars": "rl.1.1." + "A".repeat(4993),
    "a value of 61": `rl.1.1.AAA9`,
    "62 and 63": `rl.1.1.AA-_`,
    "bad game id": `xx.1.0.${ok}`,
    "wheelie is not a ghost": `wh.1.0.${ok}`,
    "version 2": `rl.2.1.${ok}`,
    "version 01": `rl.01.1.${ok}`,
    "non-zero Drag seed": `dr.1.5.${ok}`,
    "11-digit seed": `rl.1.12345678901.${ok}`,
    "seed 2^32": `rl.1.4294967296.${ok}`,
    "negative seed": `rl.1.-1.${ok}`,
    "601 samples": "rl.1.1." + "A".repeat(601),
    "empty data": "rl.1.1.",
    "a space": `rl.1.1.AA AA`,
    "percent-encoded": `rl.1.1.AA%41`,
    "a padding =": `rl.1.1.AAA=`,
    "a trailing dot": `rl.1.1.${ok}.`,
    "upper-case id": `RL.1.1.${ok}`,
    "missing seed": `rl.1.${ok}`,
    "a newline": `rl.1.1.${ok}\n`,
    "unicode digit": `rl.1.١.${ok}`,
  };
  for (const [name, p] of Object.entries(bad)) {
    assert.equal(decodeGhost(p), null, name);
    assert.equal(parseGhostHash("#ghost=" + p), false, name);
  }
  for (const v of [undefined, null, 5, {}, ["rl.1.1.A"]]) assert.equal(decodeGhost(v), null, String(v));
  // Not a challenge link at all: no toast, nothing.
  for (const h of ["", "#", "#quick", "#quick/projects", "#ghost", "#ghostrl.1.1.A", "#Ghost=rl.1.1.A", undefined]) {
    assert.equal(parseGhostHash(h), null, String(h));
  }
  // The encoder never writes a link the decoder would refuse.
  assert.equal(encodeGhost("rl", 1, [61], 1), null);
  assert.equal(encodeGhost("rl", 1, [-1], 1), null);
  assert.equal(encodeGhost("rl", 1, [1.5], 1), null);
  assert.equal(encodeGhost("rl", 1, [], 0), null);
  assert.equal(encodeGhost("rl", 1, new Uint8Array(601), 601), null);
  assert.equal(encodeGhost("dr", 5, [1], 1), null);
  assert.equal(encodeGhost("rl", 4294967296, [1], 1), null);
  assert.equal(encodeGhost("rl", 1.5, [1], 1), null);
  assert.equal(encodeGhost("xx", 0, [1], 1), null);
  for (const k of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) assert.equal(encodeGhost(k, 0, [1], 1), null, k);
});

test("ghost: the recorder samples every 6 steps as a running max and flushes the last partial sample (R20)", () => {
  const r = new GhostRecorder(2771);
  let x = 2771;
  for (let i = 0; i < 30; i++) r.step((x += 10)); // top speed: 60 px per sample
  for (let i = 0; i < 12; i++) r.step((x -= 10)); // backing up: nothing, never negative
  for (let i = 0; i < 18; i++) r.step((x += 10)); // back to the old best after 12, then 60 more
  r.step((x += 0.4)); // a partial sample: rounding only
  assert.equal(r.steps, 61);
  assert.equal(r.finish(x), 11);
  assert.deepEqual([...r.data.subarray(0, 11)], [60, 60, 60, 60, 60, 0, 0, 0, 0, 60, 0]);
  // A rider at any speed (<= 10 px/step), braking and reversing: every sample 0..60, and the
  // samples add up to the furthest sampled point, rounded once (no drift).
  const rand = mulberry32(9);
  const r2 = new GhostRecorder(100.25);
  let v = 0, x2 = 100.25, best = 100.25;
  for (let i = 1; i <= 3000; i++) {
    v = Math.max(-10, Math.min(10, v + (rand() < 0.7 ? 0.6 : -1.2)));
    r2.step((x2 += v));
    if (i % GHOST_STEP === 0) best = Math.max(best, x2);
  }
  const n = r2.finish(x2);
  assert.equal(n, 500);
  let sum = 0, top = 0;
  for (let i = 0; i < n; i++) {
    assert.ok(r2.data[i] <= GHOST_DMAX, `sample ${i}`);
    sum += r2.data[i];
    top = Math.max(top, r2.data[i]);
  }
  assert.equal(sum, Math.round(best - 100.25));
  assert.equal(top, 60); // the bound is tight
  assert.ok(encodeGhost("rl", 9, r2.data, n));
  // 60 s exactly is still a ghost; one step more is not (no ghost, no share button).
  const full = new GhostRecorder(0);
  for (let i = 0; i < GHOST_MAX * GHOST_STEP; i++) full.step(i);
  assert.equal(full.finish(GHOST_MAX * GHOST_STEP), GHOST_MAX);
  const over = new GhostRecorder(0);
  for (let i = 0; i <= GHOST_MAX * GHOST_STEP; i++) over.step(i);
  assert.equal(over.finish(GHOST_MAX * GHOST_STEP), 0);
});

test("ghost: the position lookup interpolates between samples and waits at the end", () => {
  const g = decodeGhost(encodeGhost("dr", 0, [60, 30], 2)); // prefix 0, 60, 90
  assert.equal(ghostX(g, -1), 0); // before GO / the first step
  assert.equal(ghostX(g, 0), 0);
  assert.equal(ghostX(g, 3), 30);
  assert.equal(ghostX(g, 6), 60);
  assert.equal(ghostX(g, 7.5), 67.5); // a drawn frame between two steps
  assert.equal(ghostX(g, 12), 90);
  assert.equal(ghostX(g, 1000), 90); // the ghost finished and waits
});

test("ghost: a challenge run is judged at 100 ms resolution, a loss is 'not yet' (R23)", () => {
  const g = decodeGhost("rl.1.1." + "8".repeat(50)); // 50 samples = steps 295..300
  assert.equal(ghostVs(294, g), "beat");
  assert.equal(ghostVs(295, g), "tie");
  assert.equal(ghostVs(300, g), "tie");
  assert.equal(ghostVs(301, g), "notYet");
  assert.equal(ghostVs(null, g), "notYet"); // caught at a red, a false start, the rival won
  assert.equal(ghostVs(4000, g), "notYet"); // past 60 s
});

test("ghost: the stored PB ghost is normalised on read and rebuilt on write (R24)", () => {
  const rl = encodeGhost("rl", 77, [10, 20], 2);
  const dr = encodeGhost("dr", 0, [60], 1);
  const { s, data } = memorySave();
  assert.deepEqual(s.get("ghosts"), {}); // the additive default
  assert.deepEqual(GHOST_IDS, ["red_light_green_light", "drag_race"]);
  assert.equal(getGhost(s, "drag_race"), null);
  assert.equal(setGhost(s, "drag_race", dr), true);
  assert.equal(getGhost(s, "drag_race").payload, dr);
  assert.equal(setGhost(s, "red_light_green_light", dr), false, "a Drag ghost is not an RLGL ghost");
  assert.equal(setGhost(s, "wheelie_challenge", rl), false);
  assert.equal(setGhost(s, "red_light_green_light", "junk"), false);
  assert.equal(setGhost(s, "red_light_green_light", rl), true);
  assert.deepEqual(JSON.parse(data[SAVE_KEY]).ghosts, { red_light_green_light: rl, drag_race: dr });
  // Untrusted stored JSON: junk reads as no ghost and is dropped by the next write.
  for (const junk of [null, 5, "x", [rl], { drag_race: 5 }, { drag_race: rl }, { drag_race: "dr.1.0.9" }]) {
    const { s: t } = memorySave({ [SAVE_KEY]: JSON.stringify({ v: 1, ghosts: junk }) });
    assert.equal(getGhost(t, "drag_race"), null, JSON.stringify(junk));
  }
  const { s: u, data: ud } = memorySave({ [SAVE_KEY]: JSON.stringify({ v: 1, ghosts: { drag_race: "x", red_light_green_light: rl, foo: 1 } }) });
  assert.equal(getGhost(u, "red_light_green_light").seed, 77);
  setGhost(u, "drag_race", dr);
  assert.deepEqual(JSON.parse(ud[SAVE_KEY]).ghosts, { red_light_green_light: rl, drag_race: dr });
});

test("redok.ghost: a frozen nested object; export() says so when there is no ghost yet (R26)", () => {
  const redok = createRedok({ effects: {} });
  assert.ok(Object.isFrozen(redok) && Object.isFrozen(redok.ghost));
  assert.equal(typeof redok.ghost.export, "function");
  assert.equal(redok.ghost.export(), COPY.console.ghostNone); // node's save is empty memory
});

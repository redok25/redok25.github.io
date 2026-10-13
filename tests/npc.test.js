// Run: node --test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { CHAT_TAGS, DRY, NPC, normaliseChats, drawLine, memoryLine, splitLine } from "../js/npc.js";
import { COPY } from "../js/copy.js";
import { makeJOR, JOR as SHARED } from "../js/helpers.js";

const JOR = makeJOR({});
const chats = JSON.parse(readFileSync(new URL("../assets/data/npc_chats.json", import.meta.url), "utf8"));
const all = Object.values(chats).flat();

test("npc_chats.json: the same 60 lines as the old flat array, only re-tagged (W7)", () => {
  assert.deepEqual(Object.keys(chats), CHAT_TAGS);
  assert.deepEqual(CHAT_TAGS.map((t) => chats[t].length), [7, 9, 9, 17, 7, 11]);
  assert.equal(all.length, 60);
  assert.equal(new Set(all).size, 60);
  // sha256 of the 60 strings at 554217c, sorted and joined by "\n": a changed text fails here.
  const hash = createHash("sha256").update([...all].sort().join("\n")).digest("hex");
  assert.equal(hash, "24fbcc6193736a8fbab51b87b1273e9fb33f1bcc1de5d8323a8f74ccbf333733");
  // Every hint names a live cheat word; the dry filter catches exactly the two sky lines.
  for (const s of chats.hintCheat) assert.match(s, /'(rain|night|morning|afternoon|reset|noon)'/, s);
  assert.deepEqual(all.filter((s) => DRY.test(s)), [
    "Cuaca hari ini cukup cerah ya?",
    "Hmm, sepertinya akan hujan pixel nanti sore.",
  ]);
});

test("normaliseChats: tagged object, old flat array, junk; hints only with a keyboard", () => {
  const n = normaliseChats(chats);
  assert.equal(n.greeting.length, 7);
  assert.equal(n.talk.length, 53);
  assert.ok(!n.talk.includes("Halo traveler!"), "greetings are not talk");
  assert.equal(normaliseChats(chats, false).talk.length, 46, "no typing hints on touch");
  const old = normaliseChats(all);
  assert.deepEqual(old, { greeting: [], talk: all }, "a cached old array still talks");
  for (const junk of [null, undefined, 5, "x", true, {}, { greeting: "x", joke: [1, "", null, "ok"] }]) {
    const r = normaliseChats(junk);
    assert.ok(Array.isArray(r.greeting) && Array.isArray(r.talk));
    assert.ok([...r.greeting, ...r.talk].every((s) => typeof s === "string" && s !== ""));
  }
  assert.deepEqual(normaliseChats({ joke: [1, "", null, "ok"] }).talk, ["ok"]);
});

test("drawLine: one NPC's bag says every line once, never twice in a row, dry lines wait", () => {
  const lines = ["a", "b", "c", "cerah", "e"];
  const bag = [];
  let last = -1;
  const first = [];
  for (let k = 0; k < 5; k++) first.push((last = drawLine(bag, lines, last, false)));
  assert.deepEqual([...first].sort(), [0, 1, 2, 3, 4], "the first round is a permutation");
  for (let k = 0; k < 2000; k++) {
    const i = drawLine(bag, lines, last, k % 2 === 0);
    assert.notEqual(i, last, "no immediate repeat, refills included");
    if (k % 2 === 0) assert.notEqual(lines[i], "cerah", "dry line while wet");
    last = i;
  }
  assert.equal(drawLine([], [], -1, false), -1, "no lines, no chat");
  assert.equal(drawLine([], ["hujan"], -1, true), -1, "only dry lines while wet: silence, no hang");
  const shared = ["x", "y"];
  drawLine([], shared, -1, false);
  assert.deepEqual(shared, ["x", "y"], "the shared lines are never touched");
});

test("memoryLine: first visit, a new day (kunjungan ke-N), a same-day reload (D537)", () => {
  const v1 = JOR.recordVisit(null, "2026-10-12T10:00:00");
  assert.equal(memoryLine(v1), "Wah, muka baru! Selamat jalan-jalan ya.");
  const again = JOR.recordVisit(v1.record, "2026-10-12T18:00:00");
  assert.equal(memoryLine(again), "Lho, balik lagi? Tadi kan udah mampir.");
  const v2 = JOR.recordVisit(again.record, "2026-10-13T09:00:00");
  assert.equal(memoryLine(v2), "Kunjungan ke-2! Makin betah nih?");
  assert.equal(memoryLine(undefined), null, "no visitor counter: no memory line");
  assert.equal(memoryLine({}), null);
});

test("splitLine: two rows at the space nearest the middle", () => {
  const long = "Hewan apa yang paling hening? Semut, karena nggak kedengaran langkah kakinya.";
  const rows = splitLine(long);
  assert.equal(rows.length, 2);
  assert.equal(rows.join(" "), long);
  assert.ok(Math.max(...rows.map((r) => r.length)) <= 40, rows.join(" | "));
  assert.deepEqual(splitLine("tanpaspasi"), ["tanpaspasi"]);
});

test("NPC.update: memory once per load beats rain, then greeting or rain; looks, waits, '!' hold; NaN = inert", () => {
  globalThis.document = { querySelectorAll: () => [], getElementById: () => null }; // say() fills {tokens}; a stub, not a DOM
  SHARED.visit = SHARED.recordVisit(null, "2026-10-13T09:00:00"); // what visitor-counter sets
  const STEP = SHARED.STEP_MS;
  const RAIN = { rainActive: true, ambientSnow: 0 };
  // No constructor: it loads sprites (Image) and the chat JSON (fetch). Centre = x + 30.
  const make = (x) =>
    Object.assign(Object.create(NPC.prototype), {
      loaded: true, x, y: 0, width: 60, height: 87, direction: 1, facing: 1, homeX: x, patrolRadius: 200,
      speed: 0.5, moveTimer: 0, isMoving: true, waitTime: 0, frameTimer: 0, currentFrame: 0, animationSpeed: 200,
      near: false, alertTimer: 0, greeted: false, lines: { greeting: ["Halo traveler!"], talk: ["a", "b"] },
      bag: [], lastLine: -1, rainNext: 0, chatBubble: null,
    });
  const a = make(1000);
  const b = make(2000);
  const c = make(3000);

  // The phone gesture sheet covers the canvas after the ride: an NPC met under it only greets.
  const sheet = { classList: { contains: () => false } }; // showing (no .hidden)
  globalThis.document.getElementById = () => sheet;
  const z = make(500);
  z.update(STEP, 530, false, null);
  assert.equal(z.chatBubble.text, "Halo traveler!", "no memory under the gesture sheet");
  globalThis.document.getElementById = () => null;

  a.update(STEP, 1030 - 50, false, RAIN); // first NPC met, even in the rain: the memory
  assert.equal(a.chatBubble.text, COPY.npc.first);
  assert.equal(a.facing, -1, "looks left at the bike");
  assert.equal(a.isMoving, false, "stops to look");
  a.update(STEP, 1030 + 5, false, null);
  assert.equal(a.facing, -1, "dead zone: no flip at dx = 5");
  a.update(STEP, 1030 + 20, false, null);
  assert.equal(a.facing, 1);

  b.update(STEP, 2030 - 100, false, null);
  assert.equal(b.chatBubble.text, "Halo traveler!", "later NPCs greet once");
  c.update(STEP, 3030 + 150, false, RAIN);
  assert.equal(c.chatBubble.text, COPY.npc.rain[0], "or say a rain line while it rains");
  b.chatBubble = null;
  b.update(STEP, 5000, false, null);
  b.update(STEP, 2030, false, null);
  assert.equal(b.chatBubble, null, "a dry second visit: no new line");

  a.update(STEP, 1030 + 100, true, null);
  assert.equal(a.alertTimer, 1200, "wheelie within 150 px");
  a.update(STEP, 1030 + 160, true, null);
  assert.ok(Math.abs(a.alertTimer - (1200 - STEP)) < 1e-9, "out of 150 px: the hold runs down");

  let steps = 0;
  while (!a.isMoving && steps < 100) {
    a.update(STEP, 5000, false, null);
    steps++;
  }
  assert.ok(steps >= 48 && steps <= 49, `looked ${steps} steps after the bike left`);
  assert.equal(a.facing, a.direction, "walks where it looks");

  const d = make(4000);
  for (let k = 0; k < 30; k++) d.update(STEP, NaN, true, RAIN);
  assert.equal(d.chatBubble, null);
  assert.equal(d.alertTimer, 0);
  assert.equal(d.near, false);
  assert.notEqual(d.x, 4000, "the patrol still runs while inert");
});

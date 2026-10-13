// ===================================
// ACHIEVEMENTS.JS - Pencapaian (P5): each one is unlocked once, kept in the save (ids and
// normaliser in save.js, names in copy.js) and announced by one toast. Toasts show one at a
// time and wait while something covers the toast layer (z 9999) or its top band: any
// <dialog> (top layer: Quick View, the journal), the splash, the opening subtitle, the phone
// gesture sheet, the glitch screen, a minigame HUD, a hidden tab, or (phones) a chapter card.
// Game graph only; no DOM work at load, so node tests import it.
// ===================================
import { JOR } from "./helpers.js";
import { COPY } from "./copy.js";
import { showCustomAlert } from "./content.js";
import { save, getStamps, getBest, addId, ACHIEVEMENT_IDS } from "./save.js";

const addAchievement = (s, id) => addId(s, "achievements", id, ACHIEVEMENT_IDS);

// What covers the toasts' band: an open <dialog> (Quick View, journal), or one of these while it
// is not .hidden.
const COVER_IDS = ["splash-screen", "opening-story", "gesture-info", "disaster-modal", "minigame-hud"];
// Phones, either way up (as ui.css): the chapter title card sits in the toasts' top band.
const PHONE = "(max-width: 500px), (max-height: 500px)";
const TOAST_MS = 4000; // one toast's life
const TOAST_GAP_MS = TOAST_MS + 250; // + its 180 ms fade-out: the next one takes the same row

// A course win earns that course's achievement (3a stopMinigame result .type -> id).
const WIN = { wheelie_challenge: "wheelie", red_light_green_light: "lampu", drag_race: "drag" };

const pending = []; // [text, type] toasts not shown yet: achievements, and kopi finds (queueToast)
let nextAt = 0;
let phone = null;
let covers = null; // the COVER_IDS elements, resolved on the first flush
let dialogs = null; // live: every <dialog>
let card = null; // the chapter title card

// One toast through the same queue (it waits for dialogs and, on phones, the title card).
export function queueToast(text, type = "achievement") {
  pending.push([text, type]);
}

// True only the first time: unknown ids and repeats are ignored, so callers just call it.
export function unlock(id, s = save) {
  if (!addAchievement(s, id)) return false;
  queueToast(JOR.fillTokens(COPY.achievements.toast, { name: COPY.achievements.list[id].name }));
  return true;
}

// The 3a stopMinigame result: a win per course, and a beaten earlier record (a first win is
// a record too, but it beats nothing).
export function unlockMinigame({ type, success, isNewBest, prevBest }, s = save) {
  if (success && WIN[type]) unlock(WIN[type], s);
  if (isNewBest && prevBest !== null) unlock("rekor", s);
}

// Earned before achievements existed (2b stamps, 3a bests): stored at load, no toast.
export function catchUpAchievements(s = save) {
  if (getStamps(s).length === JOR.QV_SECTIONS.length) addAchievement(s, "tur");
  for (const type in WIN) if (getBest(s, type) !== null) addAchievement(s, WIN[type]);
}

// Direct element checks, no allocation: a selector list over the whole DOM cost ~0.5 ms per
// frame at 4x CPU throttle while a toast waited (T6).
function covered() {
  covers ??= COVER_IDS.map((id) => document.getElementById(id)).filter(Boolean);
  dialogs ??= document.getElementsByTagName("dialog");
  for (let i = 0; i < dialogs.length; i++) if (dialogs[i].open) return true;
  for (let i = 0; i < covers.length; i++) if (!covers[i].classList.contains("hidden")) return true;
  card ??= document.getElementById("title-card");
  return !!card && card.classList.contains("is-on") && (phone ??= matchMedia(PHONE)).matches;
}

// Once per drawn frame (Game.syncUi); a length check while nothing waits. Achievements take
// turns in one row, TOAST_GAP_MS apart; any other toast (a kopi find) goes ahead of them as soon
// as nothing covers the band, and does not move their gap.
export function flushAchievementToasts() {
  if (!pending.length || document.hidden) return;
  const now = performance.now();
  let i = 0;
  if (now < nextAt) {
    while (i < pending.length && pending[i][1] === "achievement") i++;
    if (i === pending.length) return;
  }
  if (covered()) return;
  const [text, type] = pending.splice(i, 1)[0];
  showCustomAlert(text, { type, duration: TOAST_MS });
  if (type === "achievement") nextAt = now + TOAST_GAP_MS;
}

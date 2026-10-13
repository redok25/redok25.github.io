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

const COVERS =
  "dialog[open], #splash-screen:not(.hidden), #opening-story:not(.hidden), #gesture-info:not(.hidden), " +
  "#disaster-modal:not(.hidden), #minigame-hud:not(.hidden)";
// Phones, either way up (as ui.css): the chapter title card sits in the toasts' top band.
const PHONE = "(max-width: 500px), (max-height: 500px)";
const TOAST_MS = 4000; // one toast's life
const TOAST_GAP_MS = TOAST_MS + 250; // + its 180 ms fade-out: the next one takes the same row

// A course win earns that course's achievement (3a stopMinigame result .type -> id).
const WIN = { wheelie_challenge: "wheelie", red_light_green_light: "lampu", drag_race: "drag" };

const pending = []; // unlocked this load, toast not shown yet
let nextAt = 0;
let phone = null;

// True only the first time: unknown ids and repeats are ignored, so callers just call it.
export function unlock(id, s = save) {
  if (!addAchievement(s, id)) return false;
  pending.push(id);
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

// Once per drawn frame (Game.syncUi); a length check while nothing waits.
export function flushAchievementToasts() {
  if (!pending.length) return;
  const now = performance.now();
  if (now < nextAt || document.hidden || document.querySelector(COVERS)) return;
  if ((phone ??= matchMedia(PHONE)).matches && document.querySelector(".title-card.is-on")) return;
  const { name } = COPY.achievements.list[pending.shift()];
  showCustomAlert(JOR.fillTokens(COPY.achievements.toast, { name }), { type: "achievement", duration: TOAST_MS });
  nextAt = now + TOAST_GAP_MS;
}

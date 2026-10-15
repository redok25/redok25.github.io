// ===================================
// PHOTO.JS - Kartu Pos (T3, R11-R17). P, the 📷 button (or redok.photo, the credits card)
// lead here. Photo mode is a non-modal <dialog> toolbar (so every game key, cheat and queued
// toast waits) plus the pause owner "photo": the bike and NPCs freeze, the camera pans over
// the road, and time and weather toggle while an effects-only tick keeps rain, snow and the
// sky alive. A capture renders the scene clean (no ▼ marker, no Mode Bengkel: see `clean`),
// copies it into an offscreen postcard with a frame (chapter, date, redok.me) and saves a
// PNG: the share sheet on touch phones, a download everywhere else.
// The pure helpers are up top (node tests import them); the Photo class touches the DOM in
// its constructor and handlers only. Game graph only.
// ===================================
import { JOR } from "./helpers.js";
import { COPY } from "./copy.js";
import { CHAPTERS, chapterAt } from "./journey.js";

const OWNER = "photo";
export const PAN_SPEED = 0.6; // px per ms of real time: the bike's top speed (10 px/step)
const MIN_SHORT = 1000; // the PNG's short edge reaches this by an integer upscale...
const MAX_LONG = 2400; // ...unless the long edge would pass this (the cap wins)
export const TIMES = ["morning", "noon", "afternoon", "night"];
export const WEATHERS = ["clear", "rain", "snow", "fog"];
const PAN_KEYS = ["ArrowLeft", "ArrowRight", "KeyA", "KeyD"];
const CREAM = "#f4e4c1"; // the strip and credits palette (journey.css)
const BROWN = "#3b2414";
const DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" });

// Nearest-neighbour scale of the postcard: an integer, at least 1.
export const outputScale = (w, h) =>
  Math.max(1, Math.min(Math.ceil(MIN_SHORT / Math.min(w, h)), Math.floor(MAX_LONG / Math.max(w, h))));

// The frame's unit in screen px, ~1/300 of the short edge: a phone postcard and a desktop one
// get the same proportions.
export const frameUnit = (w, h) => Math.max(1, Math.round(Math.min(w, h) / 300));

export const nextOf = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];

// P toggles photo mode. Ctrl/Cmd/Alt+P stay the browser's (print); a held P does nothing.
export const isPhotoKey = (e) => e.code === "KeyP" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey;

// The frame's three texts. The date is the visitor's local day in Indonesian ("15 Oktober
// 2026"): its digits come from Intl, never typed (D498).
export function postcardLines(id, date) {
  return { chapter: JOR.fillTokens(COPY.photo.chapter, CHAPTERS[id]), date: DATE.format(date), site: COPY.photo.site };
}

export const postcardName = (id) => `kartu-pos-redok-${id ? "bab-" + id : "prolog"}.png`;

// The postcard (R15): the scene upscaled by an integer (pixels stay square) in a cream frame
// with a brown hairline; the chapter and the site on the first footer line, the date under it.
export function drawPostcard(src, lines) {
  const W = src.width;
  const H = src.height;
  const k = outputScale(W, H);
  const f = frameUnit(W, H) * k; // output px per frame unit
  const b = 4 * f;
  const out = document.createElement("canvas");
  out.width = W * k + 2 * b;
  out.height = H * k + b + 26 * f;
  const c = out.getContext("2d");
  c.imageSmoothingEnabled = false;
  c.fillStyle = CREAM;
  c.fillRect(0, 0, out.width, out.height);
  c.fillStyle = BROWN;
  c.fillRect(b - f, b - f, W * k + 2 * f, H * k + 2 * f);
  c.drawImage(src, b, b, W * k, H * k);
  const y = b + H * k + f; // the footer's top
  c.font = `${12 * f}px "VT323", monospace`;
  c.fillText(lines.chapter, b, y + 12 * f);
  c.textAlign = "right";
  c.fillText(lines.site, out.width - b, y + 12 * f);
  c.textAlign = "left";
  c.font = `${9 * f}px "VT323", monospace`;
  c.fillText(lines.date, b, y + 22 * f);
  return out;
}

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000); // the download holds its bytes by then
}

export class Photo {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.capturing = false; // the clean render of a capture is being drawn
    this.busy = false; // a PNG is being encoded
    this.acc = 0; // the effects tick's own fixed-step accumulator (R13)
    this.chapter = 0; // the chapter under the camera centre, while on (R14)
    const bar = (this.bar = document.getElementById("photo-bar"));
    if (!bar || typeof bar.show !== "function") return;
    const t = COPY.photo;
    const q = (sel) => bar.querySelector(sel);
    bar.setAttribute("aria-label", t.title);
    this.timeBtn = q(".photo-time");
    this.weatherBtn = q(".photo-weather");
    this.timeBtn.addEventListener("click", () => this.setTime(nextOf(TIMES, this.time)));
    this.weatherBtn.addEventListener("click", () => this.setWeather(nextOf(WEATHERS, this.weather)));
    q(".photo-save").textContent = t.save;
    q(".photo-save").addEventListener("click", () => this.capture(true));
    q(".photo-close").textContent = t.close;
    q(".photo-close").addEventListener("click", () => this.exit());
    // ◀ ▶ pan while held. They write the keys the keyboard and a swipe write (one source).
    for (const [sel, code, label] of [[".photo-left", "ArrowLeft", t.left], [".photo-right", "ArrowRight", t.right]]) {
      const btn = q(sel);
      btn.setAttribute("aria-label", label);
      const hold = (on) => () => (game.keys[code] = on);
      btn.addEventListener("pointerdown", hold(true));
      for (const type of ["pointerup", "pointercancel", "pointerleave"]) btn.addEventListener(type, hold(false));
    }
    // A held Space/Enter never presses a toolbar button again and again (R29).
    bar.addEventListener("keydown", (e) => {
      if (e.repeat && (e.key === " " || e.key === "Enter")) e.preventDefault();
    });
    // Whatever closes the bar ends the mode. The event is queued: a mode entered again in the
    // same task (bar open again by then) is not ended by the old close (critique K-6).
    bar.addEventListener("close", () => {
      if (!bar.open) this.exit();
    });
    window.addEventListener("keydown", (e) => this.onKey(e));
    const open = document.getElementById("photo-open");
    if (open) {
      open.setAttribute("aria-label", t.button);
      open.title = t.button;
      open.addEventListener("click", () => this.enter());
      // Closing the bar gives the focus back to 📷 when it opened it: a held Enter or Space
      // (auto-repeat) must not press it again and bounce back into the mode (R29, critique K-2).
      open.addEventListener("keydown", (e) => {
        if (e.repeat && (e.key === " " || e.key === "Enter")) e.preventDefault();
      });
      open.classList.remove("hidden"); // shown only once it works
    }
    // The credits card's "Simpan Kartu Pos" (R17): the scene behind the card, no mode. The card
    // stays clickable for its 0.4 s fade-out: a tap then (e.g. on a modal opening under it) saves
    // nothing (R29, merge X-9).
    const card = document.querySelector("#credits .credits-photo");
    if (card) {
      card.textContent = COPY.credits.photo;
      card.addEventListener("click", () => {
        if (game.credits.isOpen()) this.capture(true);
      });
    }
  }

  // The capture and the live preview skip every UI and debug draw on the canvas (R15): the ▼
  // marker, the Mode Bengkel panel and any Bengkel overlay.
  get clean() {
    return this.on || this.capturing;
  }

  // R11: the travel gate (a lone "blur" tolerated) and no open dialog, modal or card.
  canEnter() {
    return !!this.bar && !this.on && this.game.canTravel() && !JOR.isUiBlocking(document);
  }

  onKey(e) {
    if (!this.on) {
      if (isPhotoKey(e) && !JOR.isTypingTarget(e.target)) this.enter();
      return;
    }
    // Quick View over the toolbar owns the keyboard: Esc closes only the topmost dialog (R12).
    if (document.querySelector("dialog[open]:not(#photo-bar)")) return;
    // game.js's Space guard (a focused #qv-open must not re-open Quick View) does not run while
    // the bar is open: the same guard here, outside the toolbar's own buttons (critique K-5).
    if (e.code === "Space" && !this.bar.contains(e.target)) e.preventDefault();
    if (isPhotoKey(e) || (e.key === "Escape" && !e.repeat)) this.exit();
    else if (PAN_KEYS.includes(e.code)) {
      this.game.keys[e.code] = true; // the toolbar is a dialog: game.js no longer writes keys
      e.preventDefault();
    }
  }

  enter() {
    if (!this.canEnter()) return false;
    const g = this.game;
    const fx = g.effects;
    g.releaseInput();
    JOR.holdPause(g, OWNER);
    this.on = true;
    this.acc = 0;
    this.chapter = g.journey.current;
    // R13: given back on exit. The low tier's flat tint would hide the lights a night toggle is for.
    this.prevTime = fx.forcedTime;
    this.prevWeather = fx.cheatWeather;
    this.prevLow = fx.low;
    fx.low = false;
    // The preview is the clean render (R15): Mode Bengkel's hidden layers show again until exit.
    this.prevHide = g.world.hideLayers;
    g.world.hideLayers = 0;
    this.time = fx.timeMode || "noon";
    this.weather = fx.weatherKind || "clear";
    this.syncLabels();
    document.body.classList.add("is-photo");
    this.bar.show();
    this.bar.focus(); // not a button: a key held through the open presses nothing (R29)
    return true;
  }

  exit() {
    if (!this.on) return;
    this.on = false;
    const g = this.game;
    const fx = g.effects;
    const p = g.player;
    document.body.classList.remove("is-photo");
    if (this.bar.open) this.bar.close();
    fx.cheatWeather = this.prevWeather;
    fx.low = this.prevLow;
    g.world.hideLayers = this.prevHide;
    fx.setTimeOfDay(this.prevTime);
    if (fx.reducedMotion) fx.snapTime();
    g.releaseInput();
    // R14, the credits returnBike pattern: back to the bike's framing and chapter, no sweep, no
    // tyre track across the jump, no "Bahaya!" modal. Photo mode never changes journey.current,
    // so its biome and snow come back as they are: no chapterAt jump, which has no hysteresis
    // and would show the next chapter's card early near a boundary (critique K-3, amends R14).
    g.camera.jumpTo(p.x - g.canvas.width / 3);
    g.enterChapter(g.journey.current);
    g.world.snapBiome(g.world.biomeWanted);
    fx.snowIntensity = fx.snowWanted();
    fx.tracks.cut();
    g.prevCameraX = g.camera.x;
    g.prevPlayerX = p.x;
    JOR.releasePause(g, OWNER);
  }

  setTime(mode) {
    const fx = this.game.effects;
    this.time = mode;
    fx.setTimeOfDay(mode);
    if (fx.reducedMotion) fx.snapTime(); // no eased sky under reduced motion (R12)
    this.syncLabels();
  }

  // Straight into cheatWeather, never the cheats: no secret word, no achievement (R13).
  setWeather(kind) {
    this.weather = kind;
    this.game.effects.cheatWeather = kind;
    this.syncLabels();
  }

  syncLabels() {
    this.timeBtn.textContent = COPY.photo.time[this.time];
    this.weatherBtn.textContent = COPY.photo.weather[this.weather];
  }

  // Every paused frame while on (gameLoop, before the prev snap): the pan, the chapter under the
  // camera centre (biome and ambient snow follow it, R14) and, while "photo" is the only owner
  // (a lone "blur" tolerated), the effects-only tick on its own fixed steps (R13).
  frame(dt) {
    const g = this.game;
    const k = g.keys;
    const dir = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
    if (dir) g.camera.jumpTo(g.camera.x + dir * PAN_SPEED * Math.min(dt, 50));
    const id = chapterAt(g.camera.x + g.canvas.width / 2);
    if (id !== this.chapter) {
      this.chapter = id;
      g.enterChapter(id);
    }
    const owners = g._pauseOwners;
    if (owners.size !== (owners.has("blur") ? 2 : 1)) return;
    const r = JOR.fixedSteps(this.acc, dt);
    this.acc = r.acc;
    for (let i = 0; i < r.steps; i++) {
      g.effects.update(JOR.STEP_MS, g.cameraX);
      g.lighting.step(JOR.STEP_MS);
    }
  }

  // R15/R16: a clean render, framed on an offscreen copy, then a PNG. `share` = may open the
  // share sheet (touch phones that can share files); false = a download (redok.photo). One at a
  // time: false while the last one is still being encoded.
  capture(share) {
    if (this.busy) return false;
    const g = this.game;
    this.busy = true;
    try {
      // Clean (R15): no ▼, no Mode Bengkel draw, and its hidden layers drawn (mask 0 for the shot).
      const hide = g.world.hideLayers;
      this.capturing = true;
      g.world.hideLayers = 0;
      try {
        g.render(); // paused: the sim camera, no lerp, no shake
      } finally {
        this.capturing = false;
        g.world.hideLayers = hide;
      }
      const id = chapterAt(g.cameraX + g.canvas.width / 2);
      const out = drawPostcard(g.canvas, postcardLines(id, new Date()));
      out.toBlob((blob) => {
        out.width = out.height = 0; // free the copy (~9 MB on a phone) now, not at the next GC
        this.busy = false;
        if (blob) this.deliver(blob, postcardName(id), share);
      }, "image/png");
    } catch (e) {
      this.busy = false; // a throw before toBlob took over must not lock captures (critique K-4)
      throw e;
    }
    return true;
  }

  // R16: the share sheet only on a touch phone that can share files (desktop Chrome can too, but
  // acceptance 2 wants a PNG in Downloads); a cancelled sheet is an answer, any other failure
  // (no activation left, an in-app browser) still downloads.
  deliver(blob, name, share) {
    if (share && matchMedia("(pointer: coarse)").matches && navigator.canShare) {
      const files = [new File([blob], name, { type: "image/png" })];
      if (navigator.canShare({ files })) {
        navigator.share({ files }).catch((err) => {
          if (!err || err.name !== "AbortError") download(blob, name);
        });
        return;
      }
    }
    download(blob, name);
  }

  // redok.photo (R16): the view as it is, straight to a download (the console has no user
  // activation for a share sheet). The same gate as P.
  shoot() {
    return this.game.canTravel() && !JOR.isUiBlocking(document) && this.capture(false);
  }
}

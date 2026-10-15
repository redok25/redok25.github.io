// ===================================
// CREDITS.JS - The end of the road (R9, R23, V9): once per page load when the bike's centre
// passes x 7100, after the opening ride and outside a minigame course, the epilog plays: the
// bike rides on by itself past the playable end into the night (T300), stops, the sun rises,
// and then the card opens. The epilog holds no pause owner (Phase 4 R1); the card holds
// "credits" while open. Contact links are read from Quick View markup (never duplicated);
// every text goes in through textContent. Game graph only.
// ===================================
import { JOR } from "./helpers.js";
import { COPY } from "./copy.js";
import { unlock } from "./achievements.js";

export const CREDITS_X = 7100;
export const RIDE_END_X = 8000; // bike centre where the epilog ride stops (world.sceneryWidth road)
export const RETURN_X = 7150; // bike centre after the card: back on the playable road (R-E6)
const OWNER = "credits";

// The epilog ride's speed profile (R-E3), px per sim step. Cruise slower than the rider (a
// closing scene), ease toward it from the entry speed, then a constant brake that rolls the bike
// to a stop on the target: ~4.6 s from top speed, ~5.7 s from a standstill.
const RIDE_CRUISE = 3;
const RIDE_EASE = 0.05; // share of the gap to the cruise speed closed per step
const RIDE_BRAKE = 0.06; // px/step²; sqrt(2 * brake * 900) > 10, so top speed never brakes at once

// Next step's speed from this step's speed `v` and the distance left. Pure: player.update calls
// it once per step of the scripted move (moveTo's `ease`).
export function rideSpeed(v, remaining) {
  const s = Math.max(0, v);
  return Math.min(s + (RIDE_CRUISE - s) * RIDE_EASE, Math.sqrt(2 * RIDE_BRAKE * Math.max(0, remaining)));
}

// Sunrise length in sim steps (60 per second; the sim never runs paused).
export const EPILOG_DAWN_STEPS = 120; // 2 s of the morning lerp: a ~0.107 when the card opens

// The epilog's clock and sky (V9, R1, R-E4). Pure, no DOM: Credits steps it once per unpaused
// sim step from Game.update, so every pause owner (blur, Quick View, the journal) freezes it
// with the sky lerp. Phase "ride" (forced night from the trigger) until the bike stops, then
// "dawn" (morning) for EPILOG_DAWN_STEPS. It drives the time of day only, through setTimeOfDay,
// never the cheats (no secret, no achievement).
export class Epilog {
  constructor(fx) {
    this.fx = fx;
    this.n = -1; // sim steps since the trigger; -1 when not running
    this.dawn = -1; // sim steps since the bike stopped; -1 while it rides
    this.prev = undefined; // forcedTime before the epilog (null = the clock); undefined = nothing to give back
  }

  get running() {
    return this.n >= 0;
  }

  get riding() {
    return this.n >= 0 && this.dawn < 0;
  }

  start() {
    this.prev = this.fx.forcedTime;
    this.n = 0;
    this.dawn = -1;
    this.fx.setTimeOfDay("night");
  }

  // One sim step; `stopped` = the scripted ride is over. True once the sunrise has run (the card
  // is due). The sky is asserted every step, so a console redok.time() cannot steer the scene.
  step(stopped) {
    this.n++;
    if (this.dawn >= 0) this.dawn++;
    else if (stopped) this.dawn = 0;
    const sky = this.dawn < 0 ? "night" : "morning";
    if (this.fx.forcedTime !== sky) this.fx.setTimeOfDay(sky);
    return this.dawn >= EPILOG_DAWN_STEPS;
  }

  // The scene is over. A skip lands the sky (tint and sun) on the morning target at once: the
  // card holds the pause owner "credits", which freezes the lerp, so it must not open on a
  // half-lit sky (R1).
  end(skipped) {
    this.n = -1;
    this.dawn = -1;
    if (!skipped) return;
    this.fx.setTimeOfDay("morning");
    this.fx.snapTime();
  }

  // The card closed: the visitor's own time comes back (the clock bucket or a cheat). Once.
  restore() {
    if (this.prev === undefined) return;
    this.fx.setTimeOfDay(this.prev);
    this.prev = undefined;
  }
}

export class Credits {
  constructor(game) {
    this.game = game;
    this.epilog = new Epilog(game.effects);
    this.el = document.getElementById("credits");
    this.skipBtn = document.getElementById("skip-intro"); // "Lewati", free after the opening ride
    this.shown = false; // once per page load
    if (!this.el) return;
    // A key still held from the ride (Space for a wheelie) must not press the button that
    // takes focus when the card opens: auto-repeat Space/Enter is ignored inside the card (R29);
    // held arrows still scroll it.
    this.el.addEventListener("keydown", (e) => {
      if (e.repeat && (e.key === " " || e.key === "Enter")) e.preventDefault();
    });
    const q = (sel) => this.el.querySelector(sel);
    q(".credits-title").textContent = COPY.credits.title;
    this.el.querySelectorAll(".credits-line").forEach((p, i) => {
      p.textContent = COPY.credits.lines[i] || "";
    });
    q(".credits-replay").textContent = COPY.credits.replay;
    q(".credits-qv").textContent = COPY.credits.quickView;
    q(".credits-close").textContent = COPY.credits.close;
    q(".credits-close").addEventListener("click", () => this.close());
    q(".credits-replay").addEventListener("click", () => {
      // Release "credits" first: the travel rule (R22) refuses while it is held.
      this.close();
      game.travelTo(1);
    });
    // The one Esc handler (R1): during the epilog it skips to the card, otherwise it closes the
    // card, so one press never does both; a held Esc (auto-repeat) does nothing. A dialog
    // (Quick View, the journal) or a legacy modal over the scene owns its own Esc.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || e.repeat) return;
      if (this.epilog.running) this.skip();
      else if (this.isOpen() && !document.querySelector("dialog[open]")) this.close();
    });
  }

  isOpen() {
    return !!this.el && this.el.classList.contains("is-on");
  }

  // Every unpaused step from Game.update, after the ride and outside a course.
  update(centerX) {
    const ep = this.epilog;
    const p = this.game.player;
    if (ep.running) {
      const due = ep.step(!p.splashMoving);
      if (!ep.riding) this.game.cinema.showEpilog(false); // the bike stopped: off before the sunrise
      if (due) this.finish(false);
      return;
    }
    if (this.shown || !this.el || centerX < CREDITS_X) return;
    this.shown = true;
    // The bike rides on by itself (R-E3): keysForPlayer ignores the rider until the card, and
    // the scripted move eases on from the speed it had (no dead stop, no stride restart).
    p.wheelieActive = false;
    p.moveTo(RIDE_END_X - p.width / 2, RIDE_CRUISE, null, rideSpeed);
    ep.start();
    this.game.cinema.hold(true);
    this.game.cinema.showEpilog(true);
    if (this.skipBtn) {
      this.skipBtn.onclick = () => this.skip();
      this.skipBtn.classList.remove("hidden");
    }
  }

  // Esc or "Lewati": straight to the card, unless a dialog or legacy modal is up (Lewati sits
  // at z 10003, above them, so the click must be refused here, not only the key).
  skip() {
    if (this.epilog.running && !JOR.isUiBlocking(document)) this.finish(true);
  }

  finish(skipped) {
    this.epilog.end(skipped);
    if (skipped) this.game.player.splashMoving = false; // a skipped ride never resumes under the card
    this.game.cinema.showEpilog(false);
    this.game.cinema.hold(false);
    if (this.skipBtn) this.skipBtn.classList.add("hidden"); // z 10003 would sit over the card
    this.open();
  }

  open() {
    const stats = this.el.querySelector(".credits-stats");
    stats.textContent = JOR.fillTokens(COPY.credits.stats, JOR.contentTokens(document));
    const links = JOR.contactLinks(document);
    for (const a of this.el.querySelectorAll("[data-contact]")) {
      const key = a.dataset.contact;
      a.textContent = COPY.credits.contacts[key];
      if (links[key]) a.href = links[key];
      a.hidden = !links[key];
    }
    this.game.releaseInput();
    JOR.holdPause(this.game, OWNER);
    this.el.classList.add("is-on");
    this.el.setAttribute("aria-hidden", "false");
    // preventScroll: on a short phone the card scrolls, and focus must not skip its title.
    this.el.querySelector(".credits-card").scrollTop = 0;
    this.el.querySelector(".credits-replay").focus({ preventScroll: true });
    unlock("tamat"); // P5: the toast shows over the card and never takes its focus or taps
  }

  close() {
    if (!this.isOpen()) return;
    this.el.classList.remove("is-on");
    this.el.setAttribute("aria-hidden", "true");
    if (this.el.contains(document.activeElement)) document.activeElement.blur();
    this.game.releaseInput();
    this.returnBike();
    JOR.releasePause(this.game, OWNER);
    this.epilog.restore(); // V9: the clock bucket or the earlier cheat, also before a replay
  }

  // R-E6: the epilog road is not playable. The bike goes back to the old road end facing right,
  // like a teleport: the camera jumps (normal bounds again), no interpolated sweep, no tyre track
  // across the jump. Also before "Ulangi perjalanan" travels to Bab 1. A skip before the bike got
  // past RETURN_X leaves it where it is, but the camera still comes back inside the playable end.
  returnBike() {
    const g = this.game;
    const p = g.player;
    if (p.x + p.width / 2 > RETURN_X) {
      p.x = RETURN_X - p.width / 2;
      p.facingRight = true;
      g.effects.tracks.cut();
    }
    g.camera.jumpTo(p.x - g.canvas.width / 3);
    g.prevPlayerX = p.x;
    g.prevCameraX = g.camera.x;
  }
}

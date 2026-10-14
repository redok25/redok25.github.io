// ===================================
// CREDITS.JS - The end of the road (R9, R23, V9): once per page load when the bike's centre
// passes x 7100, after the opening ride and outside a minigame course, the epilog plays
// (forced night, the sunrise) and then the card opens. The epilog holds no pause owner
// (Phase 4 R1); the card holds "credits" while open. Contact links are read from Quick View
// markup (never duplicated); every text goes in through textContent. Game graph only.
// ===================================
import { JOR } from "./helpers.js";
import { COPY } from "./copy.js";
import { unlock } from "./achievements.js";

export const CREDITS_X = 7100;
const OWNER = "credits";

// Epilog length in sim steps (60 per second; the sim never runs paused).
export const EPILOG_NIGHT_STEPS = 270; // 4.5 s of forced night; the lerp passes a 0.45 at ~1.1 s
export const EPILOG_DAWN_STEPS = 120; // 2 s of the morning lerp: a ~0.107 when the card opens

// The epilog's clock and sky (V9, R1). Pure, no DOM: Credits steps it once per unpaused sim
// step from Game.update, so every pause owner (blur, Quick View, the journal) freezes it with
// the sky lerp. It drives the time of day only, through setTimeOfDay, never the cheats (no
// secret, no achievement).
export class Epilog {
  constructor(fx) {
    this.fx = fx;
    this.n = -1; // sim steps since the trigger; -1 when not running
    this.prev = undefined; // forcedTime before the epilog (null = the clock); undefined = nothing to give back
  }

  get running() {
    return this.n >= 0;
  }

  start() {
    this.prev = this.fx.forcedTime;
    this.n = 0;
    this.fx.setTimeOfDay("night");
  }

  // One sim step; true once the sunrise has run (the card is due). The sky is asserted every
  // step, so a console redok.time() cannot steer the scene.
  step() {
    this.n++;
    const sky = this.n < EPILOG_NIGHT_STEPS ? "night" : "morning";
    if (this.fx.forcedTime !== sky) this.fx.setTimeOfDay(sky);
    return this.n >= EPILOG_NIGHT_STEPS + EPILOG_DAWN_STEPS;
  }

  // The scene is over. A skip lands the sky (tint and sun) on the morning target at once: the
  // card holds the pause owner "credits", which freezes the lerp, so it must not open on a
  // half-lit sky (R1).
  end(skipped) {
    this.n = -1;
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
      if (this.epilog.running) {
        if (!JOR.isUiBlocking(document)) this.skip();
      } else if (this.isOpen() && !document.querySelector("dialog[open]")) this.close();
    });
  }

  isOpen() {
    return !!this.el && this.el.classList.contains("is-on");
  }

  // Every unpaused step from Game.update, after the ride and outside a course.
  update(centerX) {
    if (this.epilog.running) {
      if (this.epilog.step()) this.finish(false);
      return;
    }
    if (this.shown || !this.el || centerX < CREDITS_X) return;
    this.shown = true;
    this.game.releaseInput(); // the bike stops here; keysForPlayer keeps it stopped (R1)
    this.epilog.start();
    this.game.cinema.hold(true);
    if (this.skipBtn) {
      this.skipBtn.onclick = () => this.skip();
      this.skipBtn.classList.remove("hidden");
    }
  }

  // Esc or "Lewati": straight to the card.
  skip() {
    if (this.epilog.running) this.finish(true);
  }

  finish(skipped) {
    this.epilog.end(skipped);
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
    JOR.releasePause(this.game, OWNER);
    this.epilog.restore(); // V9: the clock bucket or the earlier cheat, also before a replay
  }
}

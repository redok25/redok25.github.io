// ===================================
// CREDITS.JS - The end-of-road card (R9, R23): once per page load when the bike's centre
// passes x 7100, after the opening ride and outside a minigame course. It holds the pause
// owner "credits" while open. Contact links are read from Quick View markup (never
// duplicated); every text goes in through textContent. Game graph only.
// ===================================
import { JOR } from "./helpers.js";
import { COPY } from "./copy.js";

export const CREDITS_X = 7100;
const OWNER = "credits";

export class Credits {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById("credits");
    this.shown = false; // once per page load
    if (!this.el) return;
    // A key still held from the ride (Space for a wheelie) must not press the button that
    // takes focus when the card opens: auto-repeat keydowns are ignored inside the card (R29).
    this.el.addEventListener("keydown", (e) => {
      if (e.repeat) e.preventDefault();
    });
    const q =(sel) => this.el.querySelector(sel);
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
    document.addEventListener("keydown", (e) => {
      // Esc closes the card, unless Quick View is open over it (that Esc is the dialog's).
      if (e.key === "Escape" && this.isOpen() && !document.querySelector("dialog[open]")) this.close();
    });
  }

  isOpen() {
    return !!this.el && this.el.classList.contains("is-on");
  }

  // Every unpaused step from Game.update, after the ride and outside a course.
  check(centerX) {
    if (this.shown || !this.el || centerX < CREDITS_X) return;
    this.shown = true;
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
  }

  close() {
    if (!this.isOpen()) return;
    this.el.classList.remove("is-on");
    this.el.setAttribute("aria-hidden", "true");
    if (this.el.contains(document.activeElement)) document.activeElement.blur();
    this.game.releaseInput();
    JOR.releasePause(this.game, OWNER);
  }
}

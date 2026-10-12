// ===================================
// STRIP.JS - The journey strip (W5): Prolog-1-2-3-4, a stamp on each chapter whose station
// is stamped (R10), the bike's dot, and fast travel on a click (R6, R14, R22). Prolog is
// display-only (the backtrack lock). Game graph only; DOM writes only on change.
// ===================================
import { CHAPTERS, stripPos } from "./journey.js";
import { COPY } from "./copy.js";
import { JOR } from "./helpers.js";

// Chapter id -> the station whose stamp it shows (R10).
const CHAPTER_STATION = [null, "about", "skills", "projects", "contact"];

export class Strip {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById("journey-strip");
    this.dot = this.el ? this.el.querySelector(".journey-dot") : null;
    this.nodes = this.el ? Array.from(this.el.querySelectorAll(".journey-node")) : [];
    this._off = null;
    this._busy = null;
    this._left = null;
    this._current = -1;
    this._stampCount = -1;
    for (const node of this.nodes) {
      const id = Number(node.dataset.chapter);
      const title = id === 0 ? COPY.strip.prolog : JOR.fillTokens(COPY.strip.node, CHAPTERS[id]);
      node.title = title;
      node.setAttribute("aria-label", title);
      if (id === 0) continue;
      node.addEventListener("click", () => {
        node.blur(); // a later Enter must not travel again (R21)
        game.travelTo(id);
      });
    }
  }

  // Once per drawn frame (Game.syncUi) with the drawn bike's centre.
  sync(centerX) {
    if (!this.el) return;
    const g = this.game;
    const off = !!g.minigames.activeMinigame;
    if (off !== this._off) {
      this.el.classList.toggle("is-off", off);
      this._off = off;
    }
    const busy = !off && !g.canTravel();
    if (busy !== this._busy) {
      this.el.classList.toggle("is-busy", busy);
      for (let i = 1; i < this.nodes.length; i++) this.nodes[i].disabled = busy;
      this._busy = busy;
    }
    const left = (stripPos(centerX) * 100).toFixed(1) + "%";
    if (left !== this._left && this.dot) {
      this.dot.style.left = left;
      this._left = left;
    }
    const current = g.journey.current;
    if (current !== this._current) {
      this.nodes.forEach((node, i) => {
        node.classList.toggle("is-current", i === current);
        if (i === current) node.setAttribute("aria-current", "step");
        else node.removeAttribute("aria-current");
      });
      this._current = current;
    }
    const stamps = g.interactions.stamps; // only ever grows
    if (stamps.length !== this._stampCount) {
      this.nodes.forEach((node, i) => node.classList.toggle("is-stamped", stamps.includes(CHAPTER_STATION[i])));
      this._stampCount = stamps.length;
    }
  }
}

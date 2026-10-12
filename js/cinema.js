// ===================================
// CINEMA.JS - Cinematic DOM layer: letterbox bars and the chapter title card (V5).
// Body-level, pointer-events none. Never .modal (that would block game keys) and never
// .hidden (the global .hidden rule is display:none and kills the transitions): .is-on
// toggles them. Text goes in through textContent only.
// ===================================
import { JOR } from "./helpers.js";
import { AudioManager } from "./audio.js";

const TITLE_MS = 3000; // the card's time on screen, its 0.5 s fades included

export class Cinema {
  constructor() {
    this.letterbox = document.getElementById("letterbox");
    this.card = document.getElementById("title-card");
    this.cardName = document.getElementById("title-card-name");
    this.cardSub = document.getElementById("title-card-sub");
    this._titleTimer = null;
  }

  setLetterbox(on) {
    if (this.letterbox) this.letterbox.classList.toggle("is-on", on);
  }

  // "Bab N · Judul" over a fact line whose numbers come from Quick View markup (D498).
  // Non-blocking: no pause owner, the ride goes on underneath. At top speed chapters come
  // ~1.9 s apart, so a card can arrive while the previous one shows: the bars stay, the
  // new text fades in, and the 3 s restart from the newest card.
  showTitle(chapter) {
    if (!this.card || !this.cardName || !this.cardSub) return;
    const replacing = this.card.classList.contains("is-on");
    this.cardName.textContent = `${chapter.label} · ${chapter.title}`;
    this.cardSub.textContent = JOR.fillTokens(chapter.subtitle, JOR.contentTokens(document));
    this.card.classList.add("is-on");
    if (replacing) this.card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
    this.setLetterbox(true);
    AudioManager.playChime();
    clearTimeout(this._titleTimer);
    this._titleTimer = setTimeout(() => {
      this.card.classList.remove("is-on");
      this.setLetterbox(false);
    }, TITLE_MS);
  }
}

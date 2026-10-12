// ===================================
// CINEMA.JS - Cinematic DOM layer: letterbox bars, the chapter title card (V5) and the
// opening ride's subtitle beats (V6). Body-level, pointer-events none. Never .modal (that
// would block game keys) and never .hidden (the global .hidden rule is display:none and
// kills the transitions): .is-on toggles them. Text goes in through textContent and DOM
// nodes only, never innerHTML.
// ===================================
import { JOR } from "./helpers.js";
import { AudioManager } from "./audio.js";
import { COPY } from "./copy.js";

const TITLE_MS = 3000; // the card is on for this long, then fades out over 0.5 s (~3.5 s visible)
// Beat i starts at this share of the opening ride (85 / 150 / 26 characters to read in
// ~7.3 s): about 2.2 s, 3.6 s and 1.5 s on screen.
const BEAT_AT = [0, 0.3, 0.8];

// "a **b** c" -> text, <strong>b</strong>, text.
function setRich(el, text) {
  el.replaceChildren(
    ...String(text)
      .split("**")
      .map((part, i) => {
        if (i % 2 === 0) return document.createTextNode(part);
        const strong = document.createElement("strong");
        strong.textContent = part;
        return strong;
      })
  );
}

export class Cinema {
  constructor() {
    this.letterbox = document.getElementById("letterbox");
    this.card = document.getElementById("title-card");
    this.cardName = document.getElementById("title-card-name");
    this.cardSub = document.getElementById("title-card-sub");
    this.beatEl = document.getElementById("story-beat");
    this._titleTimer = null;
    this._beat = 0;
    // The subtitle panel can appear before the first ride frame: give it beat 1 now.
    if (this.beatEl) setRich(this.beatEl, COPY.prologue[0]);
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

  // Opening ride subtitle (V6): the beat follows the ride's progress (0..1), not a timer,
  // so a paused ride (Quick View, blur) holds its beat. Writes the DOM only on a change.
  syncBeat(progress) {
    let i = 0;
    while (i + 1 < BEAT_AT.length && progress >= BEAT_AT[i + 1]) i++;
    if (i === this._beat || !this.beatEl) return;
    this._beat = i;
    setRich(this.beatEl, COPY.prologue[i]);
    this.beatEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  }
}

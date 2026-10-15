// ===================================
// CINEMA.JS - Cinematic DOM layer: letterbox bars, the chapter title card (V5) and the
// subtitle beats of the opening ride (V6) and the epilog ride (R-E5). Body-level, pointer-events
// none. The bars and the card are never .modal (that would block game keys) and never .hidden
// (the global .hidden rule is display:none and kills the transitions): .is-on toggles them.
// The two subtitle panels do use .hidden: minigame.css exempts them from that rule. Text goes
// in through textContent and DOM nodes only, never innerHTML.
// ===================================
import { JOR } from "./helpers.js";
import { AudioManager } from "./audio.js";
import { COPY } from "./copy.js";

const TITLE_MS = 3000; // the card is on for this long, then fades out over 0.5 s (~3.5 s visible)
// Beat i starts at this share of the opening ride (~7.25 s). The panel shows up ~0.85 s in
// (500 ms delay + 0.35 s fade), so the 85 / 157 / 26 characters get about 1.8 s, 3.4 s and
// 1.2 s (plus the 0.42 s fade-out).
const BEAT_AT = [0, 0.37, 0.84];
// The epilog ride's two beats (R-E5, ~4.6-5.7 s): the second from just past half the distance.
const EPILOG_AT = [0, 0.55];

// The beat for a ride's progress (0..1): the last one whose start it has reached.
function beatAt(at, progress) {
  let i = 0;
  while (i + 1 < at.length && progress >= at[i + 1]) i++;
  return i;
}

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
    this.epilogEl = document.getElementById("epilog-story");
    this.epilogBeatEl = document.getElementById("epilog-beat");
    this._rm = matchMedia("(prefers-reduced-motion: reduce)");
    this._titleTimer = null;
    this._hold = false; // the epilog (V9) keeps the bars up
    this._beat = 0;
    this._epilogOn = false;
    this._epilogBeat = -1;
    // The subtitle panel can appear before the first ride frame: give it beat 1 now.
    if (this.beatEl) setRich(this.beatEl, COPY.prologue[0]);
  }

  setLetterbox(on) {
    if (this.letterbox) this.letterbox.classList.toggle("is-on", on);
  }

  // The epilog's bars (R1): while held, a title card's timer cannot drop them. Reduced motion
  // hides the bars in CSS (splash.css), so there is nothing to branch on here.
  hold(on) {
    this._hold = on;
    this.setLetterbox(on);
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
      this.setLetterbox(this._hold);
    }, TITLE_MS);
  }

  // Opening ride subtitle (V6): the beat follows the ride's progress (0..1), not a timer,
  // so a paused ride (Quick View, blur) holds its beat. Writes the DOM only on a change.
  syncBeat(progress) {
    const i = beatAt(BEAT_AT, progress);
    if (i === this._beat || !this.beatEl) return;
    this._beat = i;
    setRich(this.beatEl, COPY.prologue[i]);
    this.beatEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  }

  // Epilog ride subtitle (R-E5), #epilog-story: on at the trigger with beat 1, off once the bike
  // stops or on a skip, before the card. Called every epilog step: writes only on a change.
  showEpilog(on) {
    if (on === this._epilogOn || !this.epilogEl) return;
    this._epilogOn = on;
    if (on) this.syncEpilog(0);
    this.epilogEl.classList.toggle("hidden", !on);
  }

  // The epilog beat follows the ride's progress (0..1) like syncBeat; reduced motion: no fade.
  syncEpilog(progress) {
    const i = beatAt(EPILOG_AT, progress);
    if (i === this._epilogBeat || !this.epilogBeatEl) return;
    const first = this._epilogBeat < 0;
    this._epilogBeat = i;
    setRich(this.epilogBeatEl, COPY.epilog.beats[i]);
    if (!first && !this._rm.matches) this.epilogBeatEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  }
}

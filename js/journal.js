// ===================================
// JOURNAL.JS - Jurnal Perjalanan (P1): a modal <dialog> opened with J or the 📔 button. It
// opens only outside a course, and never while typing, paused, in the opening ride or under
// another dialog or modal (R28). While open it holds the pause owner "journal". It is rebuilt
// from the save on every open: stamps, projects seen in Quick View (P2), kopi (P3), secrets
// (P4), minigame records (P6) and achievements (P5). Text goes in through textContent only.
// Game graph only.
// ===================================
import { JOR } from "./helpers.js";
import { COPY } from "./copy.js";
import { save, getIds, getStamps, getBest, formatSteps, BEST_IDS, SECRETS, ACHIEVEMENT_IDS } from "./save.js";
import { KOPI_IDS } from "./kopi.js";

const OWNER = "journal";

// One element with an optional class and text (never innerHTML).
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

// A heading with its "got/total" count (none when total is null), then the content.
function section(key, title, got, total, ...content) {
  const sec = el("section", "journal-sec");
  sec.dataset.sec = key;
  const h = el("h3", "journal-h", title);
  if (total != null) h.append(el("span", "journal-count", JOR.fillTokens(COPY.journal.count, { got, total })));
  sec.append(h, ...content);
  return sec;
}

// Rows of [name, on, second line?]; the list kind picks the row mark in CSS.
function list(kind, rows) {
  const ul = el("ul", "journal-list journal-list--" + kind);
  for (const [name, on, sub] of rows) {
    const li = el("li", on ? "journal-item is-on" : "journal-item");
    li.append(el("span", "journal-name", name));
    if (sub) li.append(el("span", "journal-sub", sub));
    ul.append(li);
  }
  return ul;
}

export class Journal {
  constructor(game) {
    this.game = game;
    const d = (this.dialog = document.getElementById("journal"));
    this.button = document.getElementById("journal-open");
    if (!d || typeof d.showModal !== "function" || !this.button) return;
    this.title = d.querySelector(".journal-title");
    this.body = d.querySelector(".journal-body");
    this.title.textContent = COPY.journal.title;
    const close = d.querySelector(".journal-close");
    close.setAttribute("aria-label", COPY.journal.close);
    close.addEventListener("click", () => d.close());
    this.button.setAttribute("aria-label", COPY.journal.button);
    this.button.title = COPY.journal.button;
    this.button.addEventListener("click", () => this.open());
    this.button.classList.remove("hidden"); // shown only once it works

    // A key still held (Space from a wheelie, Enter from the close button) must not press a
    // button that just took the focus: auto-repeat Space/Enter is ignored in the journal and
    // on its button. Closing returns the focus to where it was (the button when it opened it).
    const ignoreHeld = (e) => {
      if (e.repeat && (e.key === " " || e.key === "Enter")) e.preventDefault();
    };
    d.addEventListener("keydown", ignoreHeld);
    this.button.addEventListener("keydown", ignoreHeld);

    // J toggles. The open journal makes every game key "blocked", so closing is checked first.
    document.addEventListener("keydown", (e) => {
      if ((e.key !== "j" && e.key !== "J") || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (d.open) d.close();
      else if (!JOR.isTypingTarget(e.target)) this.open();
    });

    // The backdrop closes it as in Quick View: only when the press also started there.
    // "Buka daftar proyek" carries data-qv-open: the journal closes, then qv.js opens Quick View.
    let downOnBackdrop = false;
    d.addEventListener("pointerdown", (e) => {
      downOnBackdrop = e.target === d;
    });
    d.addEventListener("click", (e) => {
      if ((e.target === d && downOnBackdrop) || e.target.closest("[data-qv-open]")) d.close();
    });
    // Esc, ×, J, the backdrop and the Quick View button all end here.
    d.addEventListener("close", () => JOR.releasePause(game, OWNER));
  }

  // Outside a course (R28), and never under another dialog or modal, a pause, the ride or the
  // epilog (V9).
  canOpen() {
    const g = this.game;
    return (
      !this.dialog.open &&
      !g.paused &&
      !g._splashCameraActive &&
      !g.minigames.activeMinigame &&
      !g.credits.epilog.running &&
      !JOR.isUiBlocking(document)
    );
  }

  open() {
    if (!this.canOpen()) return false;
    this.render();
    this.game.releaseInput();
    JOR.holdPause(this.game, OWNER);
    this.dialog.showModal();
    this.dialog.scrollTop = 0;
    this.title.focus(); // not a button: a key held through the open presses nothing
    return true;
  }

  // Rebuilt on every open: a few dozen nodes, never per frame.
  render() {
    const t = COPY.journal;
    const stamps = getStamps(save);
    const ids = this.game.projectIds;
    const seen = getIds(save, "seen", ids).length;
    const secrets = getIds(save, "secrets", SECRETS);
    const kopi = getIds(save, "kopi", KOPI_IDS);
    const done = getIds(save, "achievements", ACHIEVEMENT_IDS);

    const go = el("button", "splash-btn splash-btn--ghost", t.seenOpen);
    go.type = "button";
    go.dataset.qvOpen = "projects";
    const found = secrets.length ? [el("p", "journal-found", JOR.fillTokens(t.secretsFound, { words: secrets.join(", ") }))] : [];
    const bests = BEST_IDS.map((id) => {
      const best = getBest(save, id);
      const line = best === null ? t.noBest : JOR.fillTokens(COPY.minigame.time[id], { time: formatSteps(best) });
      return [t.courses[id], best !== null, line];
    });

    this.body.replaceChildren(
      section("stamps", t.stamps, stamps.length, JOR.QV_SECTIONS.length,
        list("stamp", JOR.QV_SECTIONS.map((id) => [COPY.stations[id], stamps.includes(id)]))),
      section("seen", t.seen, seen, ids.length, el("p", "journal-hint", t.seenHint), go),
      section("kopi", t.kopi, kopi.length, KOPI_IDS.length,
        list("kopi", KOPI_IDS.map((id) => [COPY.kopi.hints[id], kopi.includes(id), kopi.includes(id) ? t.kopiFound : null]))),
      section("secrets", t.secrets, secrets.length, SECRETS.length, el("p", "journal-hint", t.secretsHint), ...found),
      section("bests", t.bests, 0, null, list("best", bests)),
      section("achievements", t.achievements, done.length, ACHIEVEMENT_IDS.length,
        list("ach", ACHIEVEMENT_IDS.map((id) => [COPY.achievements.list[id].name, done.includes(id), COPY.achievements.list[id].desc])))
    );
  }
}

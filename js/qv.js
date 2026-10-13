// ===================================
// QV.JS - Quick View dialog.
// Standalone on purpose: it never reads window.game, so recruiters still get the
// content when the game fails to load. The game listens for "qv:open" / "qv:close".
// ===================================
import { JOR } from "./helpers.js";
import { handleContactSubmit } from "./content.js";
import { onAction } from "./actions.js";

// The contact form lives in Quick View, so it must work even when the game entry fails.
onAction("contact-submit", handleContactSubmit);

(function () {
  const dialog = document.getElementById("qv");
  if (!dialog || typeof dialog.showModal !== "function") return;

  // The hash is cosmetic and the History API is rate-limited (Safari and Firefox throw,
  // Chrome drops calls): write only when the section changes, and never let a failed
  // write break open/close or the qv:* events.
  let hashSection = null; // section currently in the URL, null = no Quick View hash
  function setHash(section) {
    if (section === hashSection) return;
    hashSection = section;
    try {
      history.replaceState(null, "", section ? "#quick/" + section : location.pathname + location.search);
    } catch (e) {
      // Throttled: the URL stays stale until the next section change.
    }
  }

  // Billboard target (W1): that year's cards get .is-highlight until the next open or close.
  function clearHighlight() {
    dialog.querySelectorAll(".project-card.is-highlight").forEach((el) => el.classList.remove("is-highlight"));
  }

  // opts.year (projects only) scrolls to that year's heading and highlights its cards. The
  // hash stays #quick/projects (parseQuickHash has no year).
  function open(section, opts = {}) {
    const target = JOR.QV_SECTIONS.includes(section) ? section : "about";
    clearHighlight();
    if (!dialog.open) {
      dialog.showModal();
      document.dispatchEvent(new CustomEvent("qv:open", { detail: { section: target } }));
    }
    let el = document.getElementById("qv-" + target);
    const year = target === "projects" ? Number(opts && opts.year) : NaN;
    if (Number.isInteger(year)) {
      const cards = dialog.querySelectorAll(`#qv-projects .project-card[data-year="${year}"]`);
      if (cards.length) {
        cards.forEach((card) => card.classList.add("is-highlight"));
        const heading = cards[0].previousElementSibling;
        el = heading && heading.classList.contains("qv-year") ? heading : cards[0];
      }
    }
    if (el) el.scrollIntoView({ block: "start" });
    setHash(target);
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  // Fires for the close button, Esc and backdrop clicks alike. The event goes out first
  // so the game can resume no matter what the History API does.
  dialog.addEventListener("close", () => {
    clearHighlight();
    document.dispatchEvent(new CustomEvent("qv:close"));
    setHash(null);
  });

  // .qv-inner fills the dialog, so a click landing on the <dialog> itself is the backdrop.
  // Close only when the press also started there (a text drag-select ends on the backdrop too).
  let downOnBackdrop = false;
  dialog.addEventListener("pointerdown", (e) => {
    downOnBackdrop = e.target === dialog;
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog && downOnBackdrop) close();
  });

  // A key still held from whatever opened Quick View (Enter on the journal's or the credits'
  // button) must not press the button that just took the focus (R29): auto-repeat Space/Enter
  // on a button or link is ignored. Typing and held-Space scrolling are untouched.
  dialog.addEventListener("keydown", (e) => {
    if (e.repeat && (e.key === " " || e.key === "Enter") && e.target.closest("button, a, summary")) e.preventDefault();
  });

  // Keep #quick/<section> in sync while scrolling (S8): the section at the top of the
  // dialog wins; at the very bottom the last section wins. Computed from geometry on
  // every scroll, so jumps and reflows cannot leave a stale hash behind.
  // (An IntersectionObserver only reports changed entries, which went stale on jumps
  // and picked the previous section right after a scrollIntoView.)
  const sections = Array.from(dialog.querySelectorAll(".qv-section"));
  dialog.addEventListener(
    "scroll",
    () => {
      if (!dialog.open) return;
      const atBottom = dialog.scrollTop + dialog.clientHeight >= dialog.scrollHeight - 2;
      // +8px: a section scrolled to the top leaves the previous one's last 4px (scroll-margin-top) visible.
      const topEdge = dialog.getBoundingClientRect().top + 8;
      const hit = atBottom
        ? sections[sections.length - 1]
        : sections.find((el) => el.getBoundingClientRect().bottom > topEdge);
      if (hit) setHash(hit.dataset.section);
    },
    { passive: true }
  );

  if ("IntersectionObserver" in window) {
    // Skill bars animate when Skills scrolls into view (S9), not merely when the dialog opens.
    const skills = document.getElementById("qv-skills");
    if (skills) {
      new IntersectionObserver(
        (entries) => entries.forEach((en) => en.target.classList.toggle("is-visible", en.isIntersecting)),
        { threshold: 0.3 }
      ).observe(skills);
    }

    // Honest "seen" (P2): a project card counts once at least SEEN_RATIO of it is visible inside
    // the open dialog, which is the scroll container (a closed dialog shows nothing, and a
    // billboard ridden past never opens it). The bottom margin keeps the phone sticky contact
    // bar (< 48 px) out of the view. qv.js never imports the game: it marks the card
    // (data-seen, which the game catches up on when it starts after a #quick deep link) and
    // fires "qv:seen"; the game keeps it in the save.
    // ponytail: the ratio is of the card's own box, so a card taller than 1/SEEN_RATIO of the
    // view (a long <details> opened on a short phone) cannot count while open; it counted
    // before it was opened. Add an intersectionRect-height rule if a probe ever finds one.
    const SEEN_RATIO = 0.6;
    const seenIO = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const card = en.target;
          if (en.intersectionRatio < SEEN_RATIO || card.hasAttribute("data-seen")) continue;
          card.setAttribute("data-seen", "");
          seenIO.unobserve(card);
          document.dispatchEvent(new CustomEvent("qv:seen", { detail: { id: card.id } }));
        }
      },
      { root: dialog, rootMargin: "0px 0px -48px 0px", threshold: SEEN_RATIO }
    );
    dialog.querySelectorAll(JOR.PROJECT_CARDS).forEach((card) => seenIO.observe(card));
  }

  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-qv-open]");
    if (opener) {
      e.preventDefault();
      open(opener.getAttribute("data-qv-open"));
      return;
    }
    if (e.target.closest("[data-qv-close]")) {
      close();
      return;
    }
    const copyBtn = e.target.closest("[data-copy]");
    if (copyBtn) copyText(copyBtn);
  });

  function copyText(btn) {
    const text = btn.getAttribute("data-copy");
    const label = btn.dataset.label || (btn.dataset.label = btn.textContent);
    const done = () => {
      btn.textContent = "✅ Tersalin";
      setTimeout(() => (btn.textContent = label), 2000);
    };
    // ponytail: prompt() fallback (spec S11). A toast would render under the modal's
    // top layer, so the button label itself is the success feedback.
    const fallback = () => window.prompt("Salin email ini:", text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  // Q opens Quick View from anywhere except while typing or another dialog/modal is up.
  document.addEventListener("keydown", (e) => {
    // KeyA is "move left" by physical key (AZERTY types q there).
    if ((e.key !== "q" && e.key !== "Q") || e.code === "KeyA") return;
    if (e.ctrlKey || e.metaKey || e.altKey || dialog.open) return;
    if (JOR.shouldIgnoreGameKey(e, document)) return;
    open("about");
  });

  window.addEventListener("hashchange", () => {
    const section = JOR.parseQuickHash(location.hash);
    if (section) open(section);
  });

  // Stats come from the project list itself (D498).
  const stats = JOR.contentTokens(document);
  if (stats.projectCount) {
    dialog.querySelectorAll('[data-stat="projects"]').forEach((el) => {
      el.textContent = stats.projectCount;
    });
    dialog.querySelectorAll('[data-stat="years"]').forEach((el) => {
      el.textContent = stats.firstYear + "–" + stats.lastYear;
    });
  }

  window.QV = { open, close };

  // Deep links (#quick, #quick/contact, ...) open right away, without waiting for the game.
  const initial = JOR.parseQuickHash(location.hash);
  if (initial) {
    open(initial);
    // The web font swaps in after first layout and reflows the dialog (fallback text is
    // taller), which would leave the target scrolled past: land on it again once fonts are in.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        const el = document.getElementById("qv-" + initial);
        if (dialog.open && el) el.scrollIntoView({ block: "start" });
      });
    }
  }
})();

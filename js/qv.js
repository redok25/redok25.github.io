// ===================================
// QV.JS - Quick View dialog.
// Standalone on purpose: it never reads window.game, so recruiters still get the
// content when the game fails to load. The game listens for "qv:open" / "qv:close".
// ===================================
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

  function open(section) {
    const target = JOR.QV_SECTIONS.includes(section) ? section : "about";
    if (!dialog.open) {
      dialog.showModal();
      document.dispatchEvent(new CustomEvent("qv:open", { detail: { section: target } }));
    }
    const el = document.getElementById("qv-" + target);
    if (el) el.scrollIntoView({ block: "start" });
    setHash(target);
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  // Fires for the close button, Esc and backdrop clicks alike. The event goes out first
  // so the game can resume no matter what the History API does.
  dialog.addEventListener("close", () => {
    document.dispatchEvent(new CustomEvent("qv:close"));
    setHash(null);
  });

  // .qv-inner fills the dialog, so a click landing on the <dialog> itself is the backdrop.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
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
    if (e.key !== "q" && e.key !== "Q") return;
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

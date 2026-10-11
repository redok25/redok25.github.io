// ===================================
// HELPERS.JS - Pure helpers shared by Quick View and the game.
// Loaded first as a classic script in <head>; does no DOM work at load time.
// ===================================
(function (root) {
  const TYPING_TAGS = ["INPUT", "TEXTAREA", "SELECT"];
  const QV_SECTIONS = ["about", "skills", "projects", "contact"];

  function isTypingTarget(target) {
    return (
      !!target &&
      (TYPING_TAGS.includes(target.tagName) || target.isContentEditable === true)
    );
  }

  // Any open <dialog> or visible legacy .modal owns the keyboard.
  function isUiBlocking(doc) {
    return !!doc.querySelector("dialog[open], .modal:not(.hidden)");
  }

  function shouldIgnoreGameKey(e, doc) {
    return isTypingTarget(e.target) || isUiBlocking(doc);
  }

  // "#quick" -> "about", "#quick/projects" -> "projects", unknown -> "about", other hashes -> null
  function parseQuickHash(hash) {
    const match = /^#quick(?:\/([\w-]*))?$/.exec(hash || "");
    if (!match) return null;
    return QV_SECTIONS.includes(match[1]) ? match[1] : "about";
  }

  function buildWhatsAppUrl(phone, form) {
    const text = `Halo, saya ${form.name} (${form.email}).\n\n${form.message}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  // ~11 km precision: enough for weather, avoids sending an exact location.
  function roundCoord(n) {
    return Math.round(n * 10) / 10;
  }

  function projectStats(years) {
    const ys = years.map(Number).filter(Number.isFinite);
    if (!ys.length) return { projectCount: 0, firstYear: null, lastYear: null };
    return {
      projectCount: ys.length,
      firstYear: Math.min(...ys),
      lastYear: Math.max(...ys),
    };
  }

  // Quick View markup is the single source of truth for content numbers.
  function contentTokens(doc) {
    const years = Array.from(doc.querySelectorAll("#qv [data-year]"), (el) =>
      el.getAttribute("data-year")
    );
    return projectStats(years);
  }

  function fillTokens(text, tokens) {
    return String(text).replace(/\{(\w+)\}/g, (match, key) =>
      tokens && tokens[key] != null ? String(tokens[key]) : match
    );
  }

  // One count per calendar day, like the old counter; "returning" = any earlier load.
  function recordVisit(prev, nowIso) {
    if (!prev || !prev.first || !prev.last) {
      return { record: { count: 1, first: nowIso, last: nowIso }, returning: false };
    }
    const count = prev.count || 1;
    const sameDay =
      new Date(prev.last).toDateString() === new Date(nowIso).toDateString();
    return {
      record: { count: sameDay ? count : count + 1, first: prev.first, last: nowIso },
      returning: true,
    };
  }

  // Pause ownership: the game resumes only when the last owner lets go AND it was
  // running when the first owner took hold. Owners never unpause each other.
  // ponytail: owner Set on the game object; Phase 1b moves every game.paused writer onto it.
  function holdPause(game, owner) {
    if (!game._pauseOwners) game._pauseOwners = new Set();
    if (game._pauseOwners.size === 0) game._resumeAfterHold = !game.paused;
    game._pauseOwners.add(owner);
    game.paused = true;
  }

  function releasePause(game, owner) {
    const owners = game._pauseOwners;
    if (!owners || !owners.delete(owner)) return;
    if (owners.size === 0 && game._resumeAfterHold) game.paused = false;
  }

  function isPauseHeld(game) {
    return !!game._pauseOwners && game._pauseOwners.size > 0;
  }

  function createStore(storage) {
    const memory = {};
    return {
      get(key, fallback) {
        if (key in memory) return memory[key];
        try {
          const raw = storage.getItem(key);
          return raw == null ? fallback : JSON.parse(raw);
        } catch (e) {
          return fallback;
        }
      },
      set(key, value) {
        memory[key] = value;
        try {
          storage.setItem(key, JSON.stringify(value));
        } catch (e) {
          // Storage blocked or full: the memory copy keeps this page load working.
        }
      },
    };
  }

  let storage = null;
  try {
    storage = root.localStorage;
  } catch (e) {
    // SecurityError when site data is blocked.
  }

  root.JOR = {
    QV_SECTIONS,
    isTypingTarget,
    isUiBlocking,
    shouldIgnoreGameKey,
    parseQuickHash,
    buildWhatsAppUrl,
    roundCoord,
    projectStats,
    contentTokens,
    fillTokens,
    recordVisit,
    holdPause,
    releasePause,
    isPauseHeld,
    createStore,
    store: createStore(storage),
  };
})(window);

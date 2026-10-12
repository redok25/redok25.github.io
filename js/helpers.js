// ===================================
// HELPERS.JS - Pure helpers shared by Quick View and the game.
// ES module shared by Quick View (qv.js) and the game (main.js); does no DOM work at load time.
// ===================================
export function makeJOR(root) {
  const TYPING_TAGS = ["INPUT", "TEXTAREA", "SELECT"];
  const QV_SECTIONS = ["about", "skills", "projects", "contact"];

  function isTypingTarget(target) {
    return (
      !!target &&
      (TYPING_TAGS.includes(target.tagName) || target.isContentEditable === true)
    );
  }

  // Any open <dialog>, visible legacy .modal or the credits card owns the keyboard.
  function isUiBlocking(doc) {
    return !!doc.querySelector("dialog[open], .modal:not(.hidden), .credits.is-on");
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

  // Billboards (W1): projects per year from the Quick View list, oldest year first. Year
  // headings carry no data-year on purpose: contentTokens counts every #qv [data-year].
  function yearGroups(doc) {
    const byYear = new Map();
    for (const card of doc.querySelectorAll("#qv-projects .project-card[data-year]")) {
      const year = Number(card.getAttribute("data-year"));
      if (!Number.isFinite(year)) continue;
      const group = byYear.get(year) || { year, count: 0, icons: [] };
      group.count++;
      const icon = card.querySelector(".pixel-icon");
      const text = icon ? icon.textContent.trim() : "";
      if (text) group.icons.push(text);
      byYear.set(year, group);
    }
    return [...byYear.values()].sort((a, b) => a.year - b.year);
  }

  // Gauges (W2): the six skills as Quick View lists them. The name is the h4's first text
  // node ("PHP "): the number sits inside the same h4 (<span class="skill-num">).
  function skillLevels(doc) {
    const out = [];
    for (const card of doc.querySelectorAll("#qv-skills .skill-card[data-level]")) {
      const level = Number(card.getAttribute("data-level"));
      const h4 = card.querySelector("h4");
      const name = h4 && h4.firstChild ? h4.firstChild.textContent.trim() : "";
      if (name && Number.isFinite(level)) out.push({ name, level });
    }
    return out;
  }

  // Credits (R9): the four contact channels, read from Quick View links, never duplicated.
  // WhatsApp lives only in the phone sticky bar; it is in the DOM on desktop too.
  const CONTACT_SELECTORS = {
    email: '#qv a[href^="mailto:"]',
    whatsapp: '#qv a[href^="https://wa.me/"]',
    linkedin: '#qv a[href*="linkedin.com/"]',
    github: '#qv a[href*="github.com/"]',
  };
  function contactLinks(doc) {
    const out = {};
    for (const [key, sel] of Object.entries(CONTACT_SELECTORS)) {
      const a = doc.querySelector(sel);
      out[key] = a ? a.getAttribute("href") : null;
    }
    return out;
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

  // Pause ownership (F3): the game is paused while ANY owner holds it. Owners never
  // release each other (blur cannot unpause a modal, a timer cannot unpause blur).
  function holdPause(game, owner) {
    if (!game._pauseOwners) game._pauseOwners = new Set();
    game._pauseOwners.add(owner);
  }

  function releasePause(game, owner) {
    if (game._pauseOwners) game._pauseOwners.delete(owner);
  }

  function isPauseHeld(game, owner) {
    const owners = game._pauseOwners;
    if (!owners) return false;
    return owner ? owners.has(owner) : owners.size > 0;
  }

  // Typed-word cheats (F8): only printable single characters count (so Shift/arrows never
  // break a word), and the buffer is as long as the longest word. Earlier words win.
  function createWordBuffer(words) {
    const max = Math.max(...words.map((w) => w.length));
    let buffer = "";
    return (key) => {
      if (typeof key !== "string" || key.length !== 1) return null;
      buffer = (buffer + key.toLowerCase()).slice(-max);
      const hit = words.find((w) => buffer.endsWith(w)) || null;
      if (hit) buffer = "";
      return hit;
    };
  }

  // Fixed timestep (F6): the sim always advances in STEP_MS steps, so px/step constants
  // mean the same speed at 30, 60 or 144 Hz. dt is clamped to [0, 50] ms (tab switches,
  // stalls) and at most 3 steps run per frame, so a slow frame never snowballs.
  const STEP_MS = 1000 / 60;

  function fixedSteps(acc, dt) {
    acc += Math.min(Math.max(dt, 0), 50);
    let steps = 0;
    // 1e-9 ms of slack: float error would otherwise turn a clamped 50 ms (3 * STEP_MS) into 2 steps.
    while (acc >= STEP_MS - 1e-9 && steps < 3) {
      acc -= STEP_MS;
      steps++;
    }
    return { steps, acc: Math.max(acc, 0) };
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
      // Returns true when the value reached storage (false: memory only).
      set(key, value) {
        memory[key] = value;
        try {
          storage.setItem(key, JSON.stringify(value));
          return true;
        } catch (e) {
          // Storage blocked or full: the memory copy keeps this page load working.
          return false;
        }
      },
      // True when the key exists at all (even if its JSON is corrupt).
      has(key) {
        if (key in memory) return true;
        try {
          return storage.getItem(key) != null;
        } catch (e) {
          return false;
        }
      },
      remove(key) {
        delete memory[key];
        try {
          storage.removeItem(key);
        } catch (e) {
          // Storage blocked: nothing persisted to remove.
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

  return {
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
    yearGroups,
    skillLevels,
    contactLinks,
    recordVisit,
    holdPause,
    releasePause,
    isPauseHeld,
    createWordBuffer,
    STEP_MS,
    fixedSteps,
    createStore,
    store: createStore(storage),
  };
}

// One instance per page: qv.js and the game graph import the same module, so they share it.
export const JOR = makeJOR(globalThis);

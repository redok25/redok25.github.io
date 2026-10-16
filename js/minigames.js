// ===================================
// MINIGAMES.JS - Minigame System
// ===================================
import { AudioManager } from "./audio.js";
import { JOR } from "./helpers.js";
import { fadeTeleport } from "./travel.js";
import { COPY } from "./copy.js";
import { save, recordBest, formatSteps } from "./save.js";
import { unlockMinigame, queueToast } from "./achievements.js";
import { tintCopy } from "./world.js";
import { CHAPTERS } from "./journey.js";
import {
  GhostRecorder, mulberry32, newSeed, encodeGhost, parseGhostHash, ghostLink, ghostX, ghostVs, getGhost, setGhost,
} from "./ghost.js";

// Return to the NPC (W6, R15): the bike's centre lands this far left of the NPC's home
// centre, facing it. 40 px keeps the NPC the strict best E target and keeps every NPC's
// return inside its own R3 chapter (RLGL 3910 in Bab 2, Drag 5060 in Bab 3).
const RETURN_GAP = 40;
const CONFETTI_PIECES = 24; // P7; CSS hides every other one under reduced motion
const RIVAL_FILTER = "hue-rotate(90deg) brightness(0.8) sepia(1) saturate(5) hue-rotate(-50deg)"; // the red rival
const RIVAL_DUST = Object.freeze({ count: 2, spreadX: 12, spreadY: 6 }); // the bike's own wheel dust (game.js)

// T4 ghost bike (R23): the bike's idle sprite tinted blue once per page (a translucent tint keeps
// the shading), drawn at half alpha through the rival's path. No ctx.filter for it.
const GHOST_TINT = "rgba(70, 150, 255, 0.7)";
const GHOST_ALPHA = 0.5;
const GHOST_TAG_LIFT = 20; // px: its name tag sits over the rival's when they ride together
const CHALLENGE_GUARD_MS = 600; // a challenge's start modal ignores activation this long (review T3-F1)
let ghostSprite = null; // null = not baked yet (retried), false = the bake failed

function ghostSpriteOf(game) {
  if (ghostSprite === null) {
    const img = game.player.sprites.idle;
    if (!img || !img.complete || !img.naturalWidth) return null;
    try {
      ghostSprite = tintCopy(img, GHOST_TINT);
    } catch (e) {
      ghostSprite = false;
    }
  }
  return ghostSprite || null;
}

// One rider on the road at world x (the Drag rival, a ghost): a name tag over a bike sprite,
// culled 200 px off-screen. The rival keeps its per-frame filter tint; a ghost brings a baked
// sprite, its alpha and a higher tag instead. A `rider` (the rival) also gets the bike's own
// spinning wheels and exhaust part, drawn untinted (a filter per spoke stroke would be costly).
function drawRider(ctx, game, x, sprite, label, alpha = 1, filter = null, lift = 0, rider = null) {
  const p = game.player;
  const sx = x - game.cameraX;
  if (!(sx > -200 && sx < game.canvas.width + 200)) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 16px 'VT323', monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, sx + p.width * 0.4, p.y - 15 - lift);
  if (sprite) {
    if (filter) ctx.filter = filter; // restore() puts it back
    ctx.drawImage(sprite, sx, p.y, p.width, p.height);
    if (rider) {
      ctx.filter = "none";
      rider.drawWheels(ctx, sx);
      rider.drawExhaust(ctx, sx);
    }
  } else {
    ctx.fillStyle = "#e74c3c"; // fallback box
    ctx.fillRect(sx, p.y, p.width, p.height);
  }
  ctx.restore();
}

// A course's ghost (T4): where its run was after as many course steps, drawn between the last
// two steps like the bike (renderAlpha; 1 while paused, so a pause holds it in place).
function drawGhost(ctx, course) {
  const sprite = ghostSpriteOf(course.game);
  if (!sprite) return;
  const t = course.rec.steps - 1 + (course.game.renderAlpha ?? 1);
  drawRider(ctx, course.game, course.startX + ghostX(course.ghost, t), sprite, course.ghostTag, GHOST_ALPHA, null, GHOST_TAG_LIFT);
}

// Minigame metadata for modals
const MINIGAME_INFO = {
  wheelie_challenge: {
    title: "🏍️ Wheelie Challenge",
    icon: "🏍️",
    description:
      "Buktikan skill jengat Anda! Tahan wheelie selama 5 detik tanpa jatuh.",
    rules: [
      "Tekan SPASI untuk memulai wheelie",
      "Motor harus bergerak (min. kecepatan penuh)",
      "Tahan selama 5 detik tanpa melepas",
      "Jika roda turun, timer reset!",
    ],
    introLines: [
      "🏍️ WHEELIE CHALLENGE 🏍️",
      '"Kamu pikir bisa jengat?"',
      "Buktikan di jalanan ini!",
      "Tahan 5 detik... kalau bisa!",
    ],
  },
  red_light_green_light: {
    title: "🚦 Lampu Merah Lampu Hijau",
    icon: "🚦",
    description: "Ala Squid Game! Gerak saat hijau, berhenti total saat merah.",
    rules: [
      "HIJAU = Gas pol ke garis finish!",
      "KUNING = Siap-siap rem...",
      "MERAH = BERHENTI TOTAL (kecepatan = 0)",
      "Ketahuan gerak saat merah = GAME OVER",
    ],
    introLines: [
      "🚦 LAMPU MERAH LAMPU HIJAU 🚦",
      '"Mugunghwa kkoci pieot seumnida..."',
      "Gerak saat hijau, mati saat merah!",
      "Satu kesalahan = tamat.",
    ],
  },
  drag_race: {
    title: "🏁 Drag Race",
    icon: "🏁",
    description: "Balapan lurus 3000px lawan NPC! Siapa yang sampai duluan?",
    rules: [
      "Tunggu hitungan mundur 3...2...1...",
      "FALSE START = Diskualifikasi!",
      "Gas pol setelah GO! muncul",
      "Kecepatan maksimal = kemenangan",
    ],
    introLines: [
      "🏁 DRAG RACE 🏁",
      '"Berani lawan aku?"',
      "Balapan 3000px!",
      "Siapa cepat, dia menang!",
    ],
  },
};

export class MinigameManager {
  constructor(game) {
    this.game = game;
    this.activeMinigame = null;
    this.pendingMinigame = null; // Store pending game type when showing modal
    this.lastType = null; // the course that ran last: where its result and exit return to

    // Challenge link (T4, R25): read once here (never at module load), then the hash goes; no
    // hashchange listener. A broken link is one queued toast and nothing else.
    const link = parseGhostHash(location.hash);
    this.challenge = link || null; // the link's ghost, until its course is started (R25)
    this.lastChallenge = null; // the challenge the last course ran: "Main Lagi?" keeps it (R22)
    this.offer = !!link; // its start modal opens once, on the first free step (offerChallenge)
    this.challengeShownAt = -Infinity; // performance.now() when a challenge's start modal opened
    this.lastRun = null; // the last win's ghost payload: "Tantang teman"
    this.sharing = false; // a share sheet or clipboard write is in flight (shareRun)
    if (link !== null) {
      try {
        history.replaceState(null, "", location.pathname + location.search);
      } catch (e) {
        // A sandboxed frame: the hash stays, it is read only here anyway.
      }
      if (!link) queueToast(COPY.ghost.invalid, "info");
    }
    this.gestureInfo = document.getElementById("gesture-info");
    this.titleCard = document.getElementById("title-card");

    // HUD Elements
    this.hudElement = document.getElementById("minigame-hud");
    this.messageElement = document.getElementById("minigame-message");
    this.timerElement = document.getElementById("minigame-timer");
    this.scoreElement = document.getElementById("minigame-score");

    // Modal Elements
    this.modalElement = document.getElementById("minigame-start-modal");
    this.modalTitle = document.getElementById("minigame-start-title");
    this.modalIcon = document.getElementById("minigame-start-icon");
    this.modalDesc = document.getElementById("minigame-start-desc");
    this.modalRules = document.getElementById("minigame-start-rules");
    this.btnStart = document.getElementById("btn-start-minigame");
    this.btnCancel = document.getElementById("btn-cancel-minigame");

    // Intro Elements
    this.introElement = document.getElementById("minigame-intro");
    this.introLines = [
      document.getElementById("intro-line-1"),
      document.getElementById("intro-line-2"),
      document.getElementById("intro-line-3"),
      document.getElementById("intro-line-4"),
    ];

    // Result Modal Elements
    this.resultModal = document.getElementById("minigame-result-modal");
    this.resultTitle = document.getElementById("result-title");
    this.resultIcon = document.getElementById("result-icon");
    this.resultMessage = document.getElementById("result-message");
    this.btnResultClose = document.getElementById("btn-result-close");
    this.btnResultReplay = document.getElementById("btn-result-replay");
    this.resultTime = document.getElementById("result-time");
    this.resultBest = document.getElementById("result-best");
    this.resultVs = document.getElementById("result-vs");
    this.btnResultShare = document.getElementById("btn-result-share");
    this.resultLink = document.getElementById("result-link");
    if (this.btnResultShare) this.btnResultShare.textContent = COPY.ghost.share;
    if (this.resultLink) this.resultLink.setAttribute("aria-label", COPY.ghost.link);

    // Exit Button
    this.btnExitMinigame = document.getElementById("btn-exit-minigame");

    this.setupModalListeners();
  }

  setupModalListeners() {
    // A key still held from the ride (Space for a wheelie, a held Enter) must not press the
    // button that just took focus or is one Tab away: auto-repeat keydowns are ignored on
    // every button of the start and result modals (R29, P6).
    const ignoreRepeat = (e) => {
      if (e.repeat) e.preventDefault();
    };
    if (this.btnStart) this.btnStart.addEventListener("keydown", ignoreRepeat);
    if (this.btnCancel) this.btnCancel.addEventListener("keydown", ignoreRepeat);
    if (this.btnResultClose) this.btnResultClose.addEventListener("keydown", ignoreRepeat);
    if (this.btnResultReplay) this.btnResultReplay.addEventListener("keydown", ignoreRepeat);
    if (this.btnResultShare) this.btnResultShare.addEventListener("keydown", ignoreRepeat);

    // A hidden .modal keeps its buttons visible for its 0.3 s fade: every handler ignores a
    // second activation (stray Enter, double click) once its modal is hidden (R29).
    // A challenge's modal opens under the visitor's pointer, right after the tap that hid the
    // phone sheet or skipped the ride: the second half of a double tap, double click or "Esc,
    // Esc" is ignored for CHALLENGE_GUARD_MS, so the challenge is read first (review T3-F1).
    const justShown = () => performance.now() - this.challengeShownAt < CHALLENGE_GUARD_MS;
    if (this.btnStart) {
      this.btnStart.addEventListener("click", () => {
        if (this.modalElement.classList.contains("hidden") || justShown()) return;
        this.hideModal(true); // keep the "minigame" owner: the start fade and intro follow
        const type = this.pendingMinigame;
        if (!type) return;
        const ch = this.challengeFor(type);
        if (ch) this.challenge = null; // R25: started, so used up ("Nanti Saja" kept it)
        this.actuallyStartMinigame(type, ch);
      });
    }

    if (this.btnCancel) {
      this.btnCancel.addEventListener("click", () => {
        if (this.modalElement.classList.contains("hidden") || justShown()) return;
        this.hideModal();
        this.pendingMinigame = null;
      });
    }

    // Esc = "Nanti Saja" while the start modal is open (keyboard-only players, R29). A held Esc
    // (auto-repeat, e.g. from skipping the ride into a challenge's modal) does nothing (G-4).
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || e.repeat || !this.pendingMinigame || document.querySelector("dialog[open]")) return;
      if (!this.modalElement || this.modalElement.classList.contains("hidden") || justShown()) return;
      this.hideModal();
      this.pendingMinigame = null;
    });

    // The result card takes one activation (R29): false once it is hidden (a stray Enter, a
    // double click, or OK and "Main Lagi?" pressed together during its 0.3 s fade).
    const dismissResult = () => {
      if (!this.resultModal || this.resultModal.classList.contains("hidden")) return false;
      this.resultModal.classList.add("hidden");
      if (this.resultModal.contains(document.activeElement)) document.activeElement.blur();
      return true;
    };

    if (this.btnResultClose) {
      this.btnResultClose.addEventListener("click", () => {
        if (!dismissResult()) return;
        // Back to the NPC (W6, R7). The travel owner is taken BEFORE the result's owner goes,
        // so no step runs at the finish line (it would show that chapter's title card).
        const { x, npc } = this.returnSpot(this.lastType);
        fadeTeleport(this.game, { x, onBlack: () => npc && npc.goHome() });
        JOR.releasePause(this.game, "mg-result");
        if (AudioManager && AudioManager.stopEngine) AudioManager.stopEngine();
      });
    }

    // "Main Lagi?" (P6): the same course again through the start path (fade to the ride end,
    // intro, course) without the start modal. fadeTeleport takes "travel" synchronously, so
    // "mg-result" can go at once; playIntro takes "minigame" in the task that drops "travel".
    // The fade cannot be refused here: every other travel waits while "mg-result" is held.
    if (this.btnResultReplay) {
      this.btnResultReplay.addEventListener("click", () => {
        if (!dismissResult()) return;
        this.actuallyStartMinigame(this.lastType, this.lastChallenge);
        JOR.releasePause(this.game, "mg-result");
      });
    }

    // "Tantang teman" (T4, R24): shares the run just won; the card stays open.
    if (this.btnResultShare) {
      this.btnResultShare.addEventListener("click", () => {
        if (!this.lastRun || this.resultModal.classList.contains("hidden")) return;
        this.shareRun(ghostLink(location.origin + location.pathname, this.lastRun));
      });
    }

    if (this.btnExitMinigame) {
      this.btnExitMinigame.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.exitMinigame();
      });
    } else {
      console.warn("Exit button not found!");
    }
  }

  showModal(type) {
    const info = MINIGAME_INFO[type];
    if (!info || !this.modalElement) return;
    // A pending challenge for this course frames the modal (R25); the rules stay the course's.
    const ch = this.challengeFor(type);
    if (ch) {
      this.offer = false;
      this.challengeShownAt = performance.now();
    }

    // Populate modal
    if (this.modalTitle) {
      this.modalTitle.textContent = ch ? JOR.fillTokens(COPY.ghost.title, { course: COPY.journal.courses[type] }) : info.title;
    }
    if (this.modalIcon) this.modalIcon.textContent = info.icon;
    if (this.modalDesc) this.modalDesc.textContent = ch ? COPY.ghost.desc : info.description;
    this.modalElement.classList.toggle("is-challenge", !!ch); // landscape phones: title first (G-3)
    if (this.modalRules) {
      this.modalRules.innerHTML = info.rules
        .map((r) => `<li>${r}</li>`)
        .join("");
    }

    this.modalElement.classList.remove("hidden");
    // Keyboard-only players (acceptance 5): Enter or Space starts, Esc cancels (R29).
    if (this.btnStart) this.btnStart.focus();
    this.pendingMinigame = type;

    // Pause game while modal is open
    if (this.game) JOR.holdPause(this.game, "minigame");

    // Stop engine sound during modal
    if (AudioManager && AudioManager.stopEngine) {
      AudioManager.stopEngine();
    }
  }

  hideModal(keepPaused = false) {
    if (this.modalElement) {
      this.modalElement.classList.add("hidden");
      // Drop focus so a later Enter cannot re-press a button of the fading modal (R29).
      if (this.modalElement.contains(document.activeElement)) document.activeElement.blur();
    }
    // Only unpause if not starting a minigame
    if (!keepPaused && this.game) JOR.releasePause(this.game, "minigame");
  }

  startMinigame(type) {
    // No re-entry while a game runs or ANY owner holds the pause (modal, fade, intro,
    // travel, credits...): a tap under a black fade must not open a modal (R18).
    if (this.activeMinigame || this.game.paused) return;
    this.showModal(type);
  }

  // The pending challenge when it is for this course (T4), else null.
  challengeFor(type) {
    return this.challenge && this.challenge.type === type ? this.challenge : null;
  }

  // A challenge link's start modal (R25): once, on the first free step after the opening ride,
  // not under the phone gesture sheet and not under a chapter title card (z 3300 over the
  // modal's 1000). Courses start at the ride end, so there is no travel to the NPC first.
  // "Free" is the travel rule (canTravel): not in the epilog (its NO_KEYS would hold the course
  // still), a travel, the offscreen return, a course or any pause owner (critique G-1).
  offerChallenge() {
    const g = this.game;
    if (!g.canTravel() || g._splashCameraActive) return;
    if (this.gestureInfo && !this.gestureInfo.classList.contains("hidden")) return;
    if (this.titleCard && this.titleCard.classList.contains("is-on")) return;
    this.startMinigame(this.challenge.type); // showModal clears `offer` once it opens
  }

  playIntro(type, onComplete) {
    const info = MINIGAME_INFO[type];
    // If no intro info or element, skip
    if (!info || !this.introElement || !info.introLines) {
      // this.showMessage("🚀 Bersiap di garis start...", 1500);
      // Don't show toast if we are doing animation separately
      if (this.game) JOR.releasePause(this.game, "minigame");
      if (onComplete) onComplete();
      return;
    }

    // Pause game during intro so player can't move
    if (this.game) JOR.holdPause(this.game, "minigame");

    // Stop engine sound during intro
    if (AudioManager && AudioManager.stopEngine) {
      AudioManager.stopEngine();
    }

    // populate text...
    this.introLines.forEach((el, index) => {
      if (el) {
        el.textContent = info.introLines[index] || "";
        el.style.animation = "none";
        el.offsetHeight;
        el.style.animation = "";
      }
    });

    this.introElement.classList.remove("hidden");
    setTimeout(() => {
      this.introElement.classList.add("hidden");
      // Unpause game after intro
      if (this.game) JOR.releasePause(this.game, "minigame");
      if (onComplete) onComplete();
    }, 4000);
  }

  // challenge: the link's ghost this run races (R22-R25), or null for a normal run.
  actuallyStartMinigame(type, challenge = null) {
    console.log(`Starting minigame: ${type}`);
    this.pendingMinigame = null;
    this.lastType = type;
    this.lastChallenge = challenge;
    const p = this.game.player;
    // Courses keep their lengths from the ride end (R7). The chapter (Bab 1) syncs at the
    // black frame. The caller's owner ("minigame" from the start modal, or "mg-result" from
    // "Main Lagi?") covers this call; "travel" then holds until playIntro takes "minigame".
    const started = fadeTeleport(this.game, {
      x: p.minX || 200,
      onDone: () =>
        this.playIntro(type, () => {
          // A challenge brings its seed and ghost; otherwise Drag shows the local PB ghost and
          // RLGL draws a fresh seed with no ghost (another seed's ghost would run the reds, R22).
          const opts = challenge
            ? { seed: challenge.seed, ghost: challenge, tag: COPY.ghost.tagFriend }
            : { ghost: type === "drag_race" ? getGhost(save, type) : null, tag: COPY.ghost.tagBest };
          switch (type) {
            case "wheelie_challenge":
              this.activeMinigame = new WheelieChallenge(this.game, this);
              break;
            case "red_light_green_light":
              this.activeMinigame = new RedLightGreenLight(this.game, this, opts);
              break;
            case "drag_race":
              this.activeMinigame = new DragRace(this.game, this, opts);
              break;
          }
          if (this.activeMinigame) {
            this.showHUD();
            this.activeMinigame.start();
          }
        }),
    });
    // Refused (another travel or the opening ride runs): nothing starts, give the game back.
    if (!started) JOR.releasePause(this.game, "minigame");
  }

  // The one place a finished run is judged (P6). A course passes its steps only on a win;
  // the exit button never comes here, so a quit records nothing. The outcome
  // { type, success, steps, best, prevBest, isNewBest } fills the result card and is also
  // returned.
  stopMinigame(success = false, message = "", steps = null) {
    if (!this.activeMinigame) return null;

    console.log(`Minigame ended. Success: ${success}`);
    const course = this.activeMinigame;
    course.end();
    this.activeMinigame = null;
    this.hideHUD();

    const result = { type: this.lastType, success, ...recordBest(save, this.lastType, success ? steps : null) };
    // T4: a win under 60 s leaves a ghost: "Tantang teman" shares it, and it becomes the course's
    // PB ghost on a new best or when there is none yet (R20, R24). A challenge run gets one line
    // against the friend: every course step of a win (RLGL reds too) vs the ghost's samples (R23).
    const rec = course.rec;
    this.lastRun = success && rec ? encodeGhost(course.kind, course.seed, rec.data, rec.finish(this.game.player.x)) : null;
    if (this.lastRun && (result.isNewBest || !getGhost(save, result.type))) setGhost(save, result.type, this.lastRun);
    result.vs = this.lastChallenge && rec ? ghostVs(success ? rec.steps : null, this.lastChallenge) : null;
    this.showResultModal(result, message);
    unlockMinigame(result); // P5: wins and a beaten record; their toasts land above the card
    return result;
  }

  showResultModal({ type, success, steps, best, isNewBest, vs }, message) {
    if (!this.resultModal) return;

    this.resultTitle.textContent = success ? "🎉 VICTORY! 🎉" : "💀 GAME OVER";
    this.resultTitle.style.color = success ? "#FFE135" : "#FF4444"; // Gold or Red

    this.resultIcon.textContent = success ? "🏆" : "❌";
    this.resultMessage.textContent = message;

    // P6: this run's time (a win only) and the course record; a new record says so instead.
    // An empty line is hidden and keeps no stale text (aria-describedby reads these).
    const line = (el, text) => {
      if (!el) return;
      el.textContent = text;
      el.classList.toggle("hidden", !text);
    };
    const t = (n) => ({ time: formatSteps(n) });
    line(this.resultTime, steps ? JOR.fillTokens(COPY.minigame.time[type] || "", t(steps)) : "");
    line(this.resultBest, isNewBest ? COPY.minigame.newBest : best ? JOR.fillTokens(COPY.minigame.best, t(best)) : "");
    if (this.resultBest) this.resultBest.classList.toggle("is-new", !!isNewBest);
    line(this.resultVs, vs ? COPY.ghost.vs[vs] : ""); // T4: a challenge run only
    if (this.btnResultShare) this.btnResultShare.classList.toggle("hidden", !this.lastRun);
    if (this.resultLink) this.resultLink.classList.add("hidden");

    this.playConfetti(success); // P7: DOM confetti, the "mg-result" pause freezes the canvas
    this.resultModal.classList.remove("hidden");
    JOR.holdPause(this.game, "mg-result"); // Pause game while result shows
    // OK keeps the focus (R29): Enter or Space goes back to the NPC; "Main Lagi?" is one Tab away.
    this.btnResultClose.focus();

    // Stop engine sound during result modal
    if (AudioManager && AudioManager.stopEngine) {
      AudioManager.stopEngine();
    }
  }

  // P7: VICTORY confetti. DOM + CSS, because the "mg-result" pause freezes the canvas under
  // the 0.8 backdrop. Built once inside the result modal, before its panel (so it falls
  // behind the text and never takes a click), and replayed per win; a loss clears it.
  playConfetti(on) {
    let box = this._confetti;
    if (!box) {
      box = this._confetti = document.createElement("div");
      box.className = "confetti";
      box.setAttribute("aria-hidden", "true");
      for (let i = 0; i < CONFETTI_PIECES; i++) {
        const bit = document.createElement("i");
        bit.style.setProperty("--x", `${(((i + Math.random()) * 100) / CONFETTI_PIECES).toFixed(1)}%`);
        bit.style.setProperty("--dx", `${Math.round(Math.random() * 120 - 60)}px`);
        bit.style.setProperty("--d", `${Math.round(Math.random() * 600)}ms`);
        bit.style.setProperty("--t", `${1600 + Math.round(Math.random() * 900)}ms`);
        box.append(bit);
      }
      this.resultModal.prepend(box);
    }
    box.classList.remove("is-on");
    if (!on) return;
    void box.offsetWidth; // restart the one-shot animation
    box.classList.add("is-on");
  }

  // R24: the share sheet on phones; else the clipboard and a toast (z 9999, over the card);
  // if both fail, the link in a read-only field on the card to copy by hand. A cancelled
  // share sheet (AbortError) does nothing.
  // One share at a time: a second tap while the sheet (or the clipboard) is still busy does
  // nothing (Chrome rejects a second share() with InvalidStateError, critique G-5).
  async shareRun(url) {
    if (this.sharing) return;
    this.sharing = true;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        try {
          await navigator.share({ url });
          return;
        } catch (e) {
          if (e && e.name === "AbortError") return;
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        queueToast(COPY.ghost.copied, "success");
      } catch (e) {
        if (!this.resultLink) return;
        this.resultLink.value = url; // a property, never markup
        this.resultLink.classList.remove("hidden");
        this.resultLink.focus();
        this.resultLink.select();
      }
    } finally {
      this.sharing = false;
    }
  }

  // Where a course hands the bike back (W6, R15): left of the NPC that offers it. Cheat or
  // console starts have that NPC too; without one (a broken spawn) the ride end is used.
  returnSpot(type) {
    const p = this.game.player;
    const npc = this.game.world.specialNPCs.find((n) => n.minigameId === type) || null;
    const rideEnd = p.minX || 200;
    if (!npc || npc.centerX === null) return { x: rideEnd, npc: null };
    return { x: Math.max(rideEnd, npc.centerX - RETURN_GAP - p.width / 2), npc };
  }

  exitMinigame() {
    if (!this.activeMinigame) return;
    const { x, npc } = this.returnSpot(this.lastType);
    // fadeTeleport pauses at once (R13): the course cannot win or fail under the black, and
    // a second click is refused while the first travel runs.
    fadeTeleport(this.game, {
      x,
      onBlack: () => {
        if (this.activeMinigame) {
          this.activeMinigame.end();
          this.activeMinigame = null;
        }
        this.hideHUD();
        if (npc) npc.goHome();
      },
    });
  }

  update(deltaTime) {
    if (this.activeMinigame) {
      this.activeMinigame.update(deltaTime);
    } else if (this.offer) {
      this.offerChallenge(); // T4: a challenge link waits for a free step
    }
  }

  render(ctx) {
    if (this.activeMinigame) {
      this.activeMinigame.render(ctx);
    }
  }

  showHUD() {
    // RLGL colours the timer every step; a later Wheelie or Drag starts neutral (W6).
    if (this.timerElement) this.timerElement.style.color = "";
    if (this.hudElement) this.hudElement.classList.remove("hidden");
    // Show exit button separately
    if (this.btnExitMinigame) {
      this.btnExitMinigame.classList.remove("hidden");
    }
  }

  hideHUD() {
    if (this.timerElement) this.timerElement.style.color = "";
    if (this.hudElement) this.hudElement.classList.add("hidden");
    // Hide exit button separately
    if (this.btnExitMinigame) {
      this.btnExitMinigame.classList.add("hidden");
    }
  }

  showMessage(text, duration = 2000) {
    if (this.messageElement) {
      this.messageElement.textContent = text;
      this.messageElement.classList.remove("hidden");
      this.messageElement.style.opacity = 1;

      if (this.msgTimeout) clearTimeout(this.msgTimeout);
      this.msgTimeout = setTimeout(() => {
        this.messageElement.style.opacity = 0;
        setTimeout(() => {
          this.messageElement.classList.add("hidden");
        }, 500);
      }, duration);
    }
  }

  updateTimer(text) {
    if (this.timerElement) this.timerElement.textContent = text;
  }

  updateScore(text) {
    if (this.scoreElement) this.scoreElement.textContent = text;
  }
}

// Base Minigame Class
class Minigame {
  constructor(game, manager) {
    this.game = game;
    this.manager = manager;
  }
  start() {}
  end() {}
  update(dt) {}
  render(ctx) {}
}

// 1. Wheelie Challenge
class WheelieChallenge extends Minigame {
  constructor(game, manager) {
    super(game, manager);
    this.duration = 0;
    this.isWheelieing = false;
    this.steps = 0; // sim steps since start (P6): the run's time; a pause never counts
    this.targetTime = 5.0; // 5 seconds target
  }

  start() {
    this.manager.showMessage(
      "WHEELIE CHALLENGE! Tahan SPASI selama 5 detik!",
      3000
    );
    this.manager.updateScore("Time: 0.0s");
    this.manager.updateTimer("Target: 5.0s");
  }

  update(dt) {
    this.steps++;
    const player = this.game.player;

    if (player.wheelieActive && Math.abs(player.velocityX) > 1) {
      if (!this.isWheelieing) {
        this.isWheelieing = true;
      }
      this.duration += dt / 1000;
      this.manager.updateScore(`Time: ${this.duration.toFixed(1)}s`);

      if (this.duration >= this.targetTime) {
        this.manager.stopMinigame(true, "🏆 HEBAT! Anda Penjengat Handal! 🏆", this.steps);
      }
    } else {
      if (this.isWheelieing) {
        // Wheelie dropped
        if (this.duration > 0.5) {
          // meaningful attempt
          this.manager.showMessage("❌ Yahh... roda turun!", 1000);
        }
        this.duration = 0;
        this.isWheelieing = false;
        this.manager.updateScore("Time: 0.0s");
      }
    }
  }
}

// 2. Red Light, Green Light. Exported for tests/check.html (seeded lights, T4).
export class RedLightGreenLight extends Minigame {
  // T4 (R22): the lights are a pure function of (seed, course step): mulberry32(seed) replaces
  // the three Math.random calls, in the same order. ghost/tag: the challenge ghost, if any.
  constructor(game, manager, { seed = newSeed(), ghost = null, tag = "" } = {}) {
    super(game, manager);
    this.state = "GREEN"; // GREEN, YELLOW, RED
    this.timer = 0;
    this.nextSwitch = 3000;
    this.targetX = game.player.x + 3500; // Finish line 3500px away (harder)
    this.startX = game.player.x;
    this.steps = 0; // sim steps outside RED since start (P6): the run's time
    this.kind = "rl";
    this.seed = seed;
    this.rand = mulberry32(seed);
    this.rec = new GhostRecorder(this.startX); // every course step, reds included (R20)
    this.ghost = ghost;
    this.ghostTag = tag;
  }

  start() {
    this.manager.showMessage("🟢 LAMPU HIJAU - GAS!", 2000);
    this.state = "GREEN";
    this.nextSwitch = 1500 + this.rand() * 1500; // Shorter green phase (1.5-3s)
  }

  update(dt) {
    this.rec.step(this.game.player.x); // T4: the bike after this step, before the win check
    // P6: count the step when the light the rider saw for this step's input was not RED
    // (state before this step's switch). ponytail: red length is luck and never counts; the
    // number of red cycles still does (~0.5 s each at perfect play); a challenge shares the seed.
    if (this.state !== "RED") this.steps++;
    this.timer += dt;

    // Logic switch lampu
    if (this.timer >= this.nextSwitch) {
      this.timer = 0;
      if (this.state === "GREEN") {
        this.state = "YELLOW";
        this.nextSwitch = 1000; // Yellow lebih singkat
        this.manager.showMessage("🟡 HATI-HATI...", 800);
      } else if (this.state === "YELLOW") {
        this.state = "RED";
        this.nextSwitch = 2500 + this.rand() * 2500; // Red lebih lama (2.5-5s)
        this.manager.showMessage("🔴 BERHENTI!!", 1500);
      } else if (this.state === "RED") {
        this.state = "GREEN";
        this.nextSwitch = 1500 + this.rand() * 1500; // Green lebih pendek (1.5-3s)
        this.manager.showMessage("🟢 GAS!", 1000);
      }
    }

    // Check fail condition
    if (this.state === "RED") {
      if (Math.abs(this.game.player.velocityX) > 0.1) {
        this.manager.stopMinigame(
          false,
          "💀 TERTANGKAP! Anda Bergerak Saat Merah!"
        );
        return;
      }
    }

    // Check win condition
    if (this.game.player.x >= this.targetX) {
      this.manager.stopMinigame(true, "🎉 SELAMAT! Anda Berhasil Lolos!", this.steps);
    }

    // Update UI
    const dist = Math.max(0, Math.floor(this.targetX - this.game.player.x));
    this.manager.updateScore(`Jarak: ${dist}px`);
    this.manager.updateTimer(`Lampu: ${this.state}`);

    // Color update hack
    if (this.manager.timerElement) {
      this.manager.timerElement.style.color =
        this.state === "RED"
          ? "#ff4444"
          : this.state === "GREEN"
          ? "#44ff44"
          : "#ffff44";
    }
  }

  render(ctx) {
    // Draw Finish Line
    const screenX = this.targetX - this.game.cameraX;
    if (screenX > -100 && screenX < this.game.canvas.width + 100) {
      ctx.save();
      ctx.fillStyle = "#fff";
      ctx.fillRect(screenX, 0, 10, this.game.canvas.height);

      // Checkerboard pattern
      for (let y = 0; y < this.game.canvas.height; y += 40) {
        ctx.fillStyle = "#000";
        ctx.fillRect(screenX, y, 10, 20);
      }
      ctx.restore();
    }

    if (this.ghost) drawGhost(ctx, this); // T4: under the red tint, like the road

    // Draw Light Overlay (optional, full screen tint)
    if (this.state === "RED") {
      ctx.save();
      ctx.fillStyle = "rgba(255, 0, 0, 0.15)";
      ctx.fillRect(0, 0, this.game.canvas.width, this.game.canvas.height);
      ctx.restore();
    }
  }
}

// 4. Drag Race
export class DragRace extends Minigame {
  // T4: ghost/tag = the PB or challenge ghost, drawn only (the red rival still decides, R23).
  constructor(game, manager, { ghost = null, tag = "" } = {}) {
    super(game, manager);
    this.kind = "dr";
    this.seed = 0; // no RNG in a drag race (R21)
    this.rec = new GhostRecorder(game.player.x); // RACING steps only: the race time since GO
    this.ghost = ghost;
    this.ghostTag = tag;
    this.state = "WAITING"; // WAITING, COUNTDOWN, RACING, FINISHED
    this.npcX = game.player.x;
    this.targetDist = 3000; // Increased from 2000 to 3000px
    // px per sim step (60/s). 9.2 = 552 px/s: a 250 ms reaction wins, 400 ms loses (F6).
    this.npcSpeed = 9.2;
    this.countdown = 3;
    this.countTimer = 0;
    this.startX = null;
    this.steps = 0; // sim steps since GO (P6): the race time
    // The red rival as a bike of its own, made once: it inherits the player's size, wheel and
    // exhaust offsets and drawing methods, and keeps its own x, speed, wheel spin and pose, so
    // drawWheels/drawExhaust and effects.juice (smoke, Bab 3 leaf wake) read it like the bike.
    this.rival = Object.assign(Object.create(game.player), {
      x: game.player.x, velocityX: 0, wheelAngle: 0, currentAnimation: "idle", facingRight: true,
      braking: false, wheelieActive: false, wheelieRotation: 0,
    });
  }

  start() {
    this.manager.showMessage("🏁 DRAG RACE! Siap-siap...", 2000);
    this.state = "COUNTDOWN";
    this.npcX = this.game.player.x; // Align NPC
    this.startX = this.game.player.x;
    this.rival.x = this.npcX;
  }

  update(dt) {
    this.prevNpcX = this.npcX; // for render interpolation
    if (this.state === "COUNTDOWN") {
      this.countTimer += dt;
      if (this.countTimer >= 1000) {
        this.countTimer = 0;
        this.countdown--;
        if (this.countdown > 0) {
          this.manager.showMessage(this.countdown.toString(), 800);
        } else {
          this.state = "RACING";
          this.manager.showMessage("🚀 GO!!!", 1000);
        }
      }

      // False start check
      if (Math.abs(this.game.player.velocityX) > 0.1) {
        this.manager.stopMinigame(false, "⛔ FALSE START! Sabar Dong!");
        return;
      }

      this.manager.updateScore("Tunggu...");
      this.manager.updateTimer(`${this.countdown}...`);
    } else if (this.state === "RACING") {
      this.steps++;
      this.rec.step(this.game.player.x); // T4: x stood still at startX until GO (false start)
      // Move NPC
      this.npcX += this.npcSpeed; // one fixed step
      this.rideRival();

      const finishX = this.startX + this.targetDist;

      // Checks
      if (this.game.player.x >= finishX) {
        this.manager.stopMinigame(true, "🏆 MENANG! Anda Raja Jalanan!", this.steps);
      } else if (this.npcX >= finishX) {
        this.manager.stopMinigame(false, "😢 KALAH! Disalip Rival!");
      }

      // UI
      const pDist = Math.max(0, Math.floor(finishX - this.game.player.x));
      const nDist = Math.max(0, Math.floor(finishX - this.npcX));
      this.manager.updateScore(`Anda: ${pDist}m`);
      this.manager.updateTimer(`Rival: ${nDist}m`);
    }
  }

  // One race step of the rival's bike (T330): the move pose, wheels spun by its speed like the
  // bike's (player.update), the bike's dust from both wheels (game.update) and its juice.
  // Runs after the bike's own particles each step, so a full pool never starves the bike.
  rideRival() {
    const r = this.rival;
    const fx = this.game.effects;
    const wheelY = r.y + r.height - 10;
    r.x = this.npcX;
    r.velocityX = this.npcSpeed;
    r.currentAnimation = "move";
    r.wheelAngle += this.npcSpeed * r.wheelSpinMultiplier;
    fx.createDustParticles(r.x + 40, wheelY, RIVAL_DUST);
    fx.createDustParticles(r.x + r.width - 40, wheelY, RIVAL_DUST);
    fx.juice(r, 0, CHAPTERS[this.game.journey.current].biome === "autumn");
  }

  render(ctx) {
    const camX = this.game.cameraX;

    // The ghost (T4, under the rival), then the rival lerped between the last two sim steps:
    // the bike's sprite for its pose with a red filter tint, and its own wheels and exhaust.
    if (this.state === "RACING" || this.state === "COUNTDOWN") {
      if (this.ghost) drawGhost(ctx, this);
      const npcX = this.prevNpcX === undefined ? this.npcX : this.prevNpcX + (this.npcX - this.prevNpcX) * (this.game.renderAlpha ?? 1);
      drawRider(ctx, this.game, npcX, this.game.player.sprites[this.rival.currentAnimation], "🏍️ RIVAL", 1, RIVAL_FILTER, 0, this.rival);
    }

    // Draw Finish Line
    if (this.startX) {
      const finishX = this.startX + this.targetDist;
      const screenX = finishX - camX;
      if (screenX > -100 && screenX < this.game.canvas.width + 100) {
        ctx.save();
        // Checkerboard finish line
        for (let y = 0; y < this.game.canvas.height; y += 20) {
          ctx.fillStyle = Math.floor(y / 20) % 2 === 0 ? "#fff" : "#000";
          ctx.fillRect(screenX, y, 20, 20);
          ctx.fillStyle = Math.floor(y / 20) % 2 === 0 ? "#000" : "#fff";
          ctx.fillRect(screenX + 20, y, 20, 20);
        }

        // FINISH text
        ctx.fillStyle = "#ffcc00";
        ctx.font = "bold 24px 'VT323', monospace";
        ctx.textAlign = "center";
        ctx.save();
        ctx.translate(screenX + 20, 100);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText("FINISH", 0, 0);
        ctx.restore();

        ctx.restore();
      }
    }
  }
}

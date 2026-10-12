// ===================================
// MINIGAMES.JS - Minigame System
// ===================================
import { AudioManager } from "./audio.js";
import { JOR } from "./helpers.js";
import { fadeTeleport } from "./travel.js";

// Return to the NPC (W6, R15): the bike's centre lands this far left of the NPC's home
// centre, facing it. 40 px keeps the NPC the strict best E target and keeps every NPC's
// return inside its own R3 chapter (RLGL 3910 in Bab 2, Drag 5060 in Bab 3).
const RETURN_GAP = 40;

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

    // Exit Button
    this.btnExitMinigame = document.getElementById("btn-exit-minigame");

    this.setupModalListeners();
  }

  setupModalListeners() {
    // A key still held from the ride (Space for a wheelie, a held Enter) must not press the
    // button that just took focus: auto-repeat keydowns are ignored on both (R29).
    const ignoreRepeat = (e) => {
      if (e.repeat) e.preventDefault();
    };
    if (this.btnStart) this.btnStart.addEventListener("keydown", ignoreRepeat);
    if (this.btnResultClose) this.btnResultClose.addEventListener("keydown", ignoreRepeat);

    // A hidden .modal keeps its buttons visible for its 0.3 s fade: every handler ignores a
    // second activation (stray Enter, double click) once its modal is hidden (R29).
    if (this.btnStart) {
      this.btnStart.addEventListener("click", () => {
        if (this.modalElement.classList.contains("hidden")) return;
        this.hideModal(true); // keep the "minigame" owner: the start fade and intro follow
        if (this.pendingMinigame) this.actuallyStartMinigame(this.pendingMinigame);
      });
    }

    if (this.btnCancel) {
      this.btnCancel.addEventListener("click", () => {
        if (this.modalElement.classList.contains("hidden")) return;
        this.hideModal();
        this.pendingMinigame = null;
      });
    }

    // Esc = "Nanti Saja" while the start modal is open (keyboard-only players, R29).
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !this.pendingMinigame) return;
      if (!this.modalElement || this.modalElement.classList.contains("hidden")) return;
      this.hideModal();
      this.pendingMinigame = null;
    });

    if (this.btnResultClose) {
      this.btnResultClose.addEventListener("click", () => {
        if (!this.resultModal || this.resultModal.classList.contains("hidden")) return;
        this.resultModal.classList.add("hidden");
        this.btnResultClose.blur();
        // Back to the NPC (W6, R7). The travel owner is taken BEFORE the result's owner goes,
        // so no step runs at the finish line (it would show that chapter's title card).
        const { x, npc } = this.returnSpot(this.lastType);
        fadeTeleport(this.game, { x, onBlack: () => npc && npc.goHome() });
        JOR.releasePause(this.game, "mg-result");
        if (AudioManager && AudioManager.stopEngine) AudioManager.stopEngine();
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

    // Populate modal
    if (this.modalTitle) this.modalTitle.textContent = info.title;
    if (this.modalIcon) this.modalIcon.textContent = info.icon;
    if (this.modalDesc) this.modalDesc.textContent = info.description;
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

  actuallyStartMinigame(type) {
    console.log(`Starting minigame: ${type}`);
    this.pendingMinigame = null;
    this.lastType = type;
    const p = this.game.player;
    // Courses keep their lengths from the ride end (R7). The chapter (Bab 1) syncs at the
    // black frame; the "minigame" owner from the modal stays held through the intro.
    const started = fadeTeleport(this.game, {
      x: p.minX || 200,
      onDone: () =>
        this.playIntro(type, () => {
          switch (type) {
            case "wheelie_challenge":
              this.activeMinigame = new WheelieChallenge(this.game, this);
              break;
            case "red_light_green_light":
              this.activeMinigame = new RedLightGreenLight(this.game, this);
              break;
            case "drag_race":
              this.activeMinigame = new DragRace(this.game, this);
              break;
          }
          if (this.activeMinigame) {
            this.showHUD();
            this.activeMinigame.start();
          }
        }),
    });
    // Refused (a scripted move owns the bike): nothing starts, give the game back.
    if (!started) JOR.releasePause(this.game, "minigame");
  }

  stopMinigame(success = false, message = "") {
    if (!this.activeMinigame) return;

    console.log(`Minigame ended. Success: ${success}`);
    this.activeMinigame.end();
    this.activeMinigame = null;
    this.hideHUD();

    // Show Result Modal instead of toast
    this.showResultModal(success, message);
  }

  showResultModal(success, message) {
    if (!this.resultModal) return;

    this.resultTitle.textContent = success ? "🎉 VICTORY! 🎉" : "💀 GAME OVER";
    this.resultTitle.style.color = success ? "#FFE135" : "#FF4444"; // Gold or Red

    this.resultIcon.textContent = success ? "🏆" : "❌";
    this.resultMessage.textContent = message;

    this.btnResultClose.textContent = "OK";

    this.resultModal.classList.remove("hidden");
    JOR.holdPause(this.game, "mg-result"); // Pause game while result shows
    this.btnResultClose.focus(); // Enter or Space closes it without a mouse (R29)

    // Stop engine sound during result modal
    if (AudioManager && AudioManager.stopEngine) {
      AudioManager.stopEngine();
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
    this.bestScore = 0;
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
    const player = this.game.player;

    if (player.wheelieActive && Math.abs(player.velocityX) > 1) {
      if (!this.isWheelieing) {
        this.isWheelieing = true;
      }
      this.duration += dt / 1000;
      this.manager.updateScore(`Time: ${this.duration.toFixed(1)}s`);

      if (this.duration >= this.targetTime) {
        this.manager.stopMinigame(true, "🏆 HEBAT! Anda Penjengat Handal! 🏆");
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

// 2. Red Light, Green Light
class RedLightGreenLight extends Minigame {
  constructor(game, manager) {
    super(game, manager);
    this.state = "GREEN"; // GREEN, YELLOW, RED
    this.timer = 0;
    this.nextSwitch = 3000;
    this.targetX = game.player.x + 3500; // Finish line 3500px away (harder)
    this.startX = game.player.x;
  }

  start() {
    this.manager.showMessage("🟢 LAMPU HIJAU - GAS!", 2000);
    this.state = "GREEN";
    this.nextSwitch = 1500 + Math.random() * 1500; // Shorter green phase (1.5-3s)
  }

  update(dt) {
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
        this.nextSwitch = 2500 + Math.random() * 2500; // Red lebih lama (2.5-5s)
        this.manager.showMessage("🔴 BERHENTI!!", 1500);
      } else if (this.state === "RED") {
        this.state = "GREEN";
        this.nextSwitch = 1500 + Math.random() * 1500; // Green lebih pendek (1.5-3s)
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
      this.manager.stopMinigame(true, "🎉 SELAMAT! Anda Berhasil Lolos!");
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
  constructor(game, manager) {
    super(game, manager);
    this.state = "WAITING"; // WAITING, COUNTDOWN, RACING, FINISHED
    this.npcX = game.player.x;
    this.targetDist = 3000; // Increased from 2000 to 3000px
    // px per sim step (60/s). 9.2 = 552 px/s: a 250 ms reaction wins, 400 ms loses (F6).
    this.npcSpeed = 9.2;
    this.countdown = 3;
    this.countTimer = 0;
    this.startX = null;
  }

  start() {
    this.manager.showMessage("🏁 DRAG RACE! Siap-siap...", 2000);
    this.state = "COUNTDOWN";
    this.npcX = this.game.player.x; // Align NPC
    this.startX = this.game.player.x;
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
      // Move NPC
      this.npcX += this.npcSpeed; // one fixed step

      const finishX = this.startX + this.targetDist;

      // Checks
      if (this.game.player.x >= finishX) {
        this.manager.stopMinigame(true, "🏆 MENANG! Anda Raja Jalanan!");
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

  render(ctx) {
    const camX = this.game.cameraX;

    // Draw NPC (Ghost Rider), lerped between the last two sim steps
    if (this.state === "RACING" || this.state === "COUNTDOWN") {
      const npcX = this.prevNpcX === undefined ? this.npcX : this.prevNpcX + (this.npcX - this.prevNpcX) * (this.game.renderAlpha ?? 1);
      const sx = npcX - camX;
      if (sx > -200 && sx < this.game.canvas.width + 200) {
        ctx.save();

        // Draw name tag
        ctx.fillStyle = "#fff";
        ctx.font = "bold 16px 'VT323', monospace";
        ctx.textAlign = "center";
        ctx.fillText(
          "🏍️ RIVAL",
          sx + this.game.player.width * 0.4,
          this.game.player.y - 15
        );

        // Draw Rival Sprite (Clone of player sprite but with filter)
        // Assuming idle sprite for now, or maybe moving if racing?
        // Let's use idle for simple implementation or existing animation frames if possible
        const sprite = this.game.player.sprites.idle;

        if (sprite) {
          // Apply red overlay/filter
          // Option 1: filter (easiest but performance heavy?)
          // Option 2: globalCompositeOperation

          // Let's use filter if supported (modern browsers)
          ctx.filter =
            "hue-rotate(90deg) brightness(0.8) sepia(1) saturate(5) hue-rotate(-50deg)";
          // Just a red tint hack: sepia 1 + saturate high + hue rotate to red region

          const width = this.game.player.width;
          const height = this.game.player.height;

          ctx.drawImage(sprite, sx, this.game.player.y, width, height);
          ctx.filter = "none"; // reset
        } else {
          // Fallback box
          ctx.fillStyle = "#e74c3c";
          ctx.fillRect(
            sx,
            this.game.player.y,
            this.game.player.width,
            this.game.player.height
          );
        }

        ctx.restore();
      }
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

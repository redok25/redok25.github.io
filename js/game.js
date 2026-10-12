// ===================================
// GAME.JS - Main Game Engine
// ===================================
import { JOR } from "./helpers.js";
import { Player } from "./player.js";
import { World } from "./world.js";
import { EffectsManager } from "./effects.js";
import { InteractionManager } from "./interactions.js";
import { MinigameManager } from "./minigames.js";
import { Camera } from "./camera.js";
import { showCustomAlert } from "./content.js";
import { AudioManager } from "./audio.js";
import { app } from "./state.js";
import { save } from "./save.js";
import { Bengkel } from "./bengkel.js";

class Game {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d");

    // Set canvas size
    this.resizeCanvas();

    // Resize/rotation re-lays the world out in place (F10, D510): no reload, no modal.
    window.addEventListener("resize", () => {
      if (this._layoutQueued) return;
      this._layoutQueued = true;
      requestAnimationFrame(() => {
        this._layoutQueued = false;
        this.layout();
      });
    });

    // Game state. `paused` is derived from pause owners (see the getter); the splash
    // owner holds until the visitor presses Start (splash.js releases it).
    JOR.holdPause(this, "splash");
    this.lastTime = 0;
    this.simAcc = 0;
    this.keys = {};

    // Offscreen modal state: true when modal is visible and blocking player input
    this.offscreenModalActive = false;

    // Camera (js/camera.js); cameraX stays as an accessor for existing readers.
    this.camera = new Camera(this);
    this.cameraSmoothing = 0.1;
    // While the opening ride runs, the camera tracks it more tightly and input is ignored.
    this._splashCameraActive = false;

    // Initialize game components
    this.player = new Player(200, this.canvas.height - 230);
    this.world = new World(this.canvas, this.ctx);
    // pass world to effects so clouds can be world-space and parallax correctly
    this.effects = new EffectsManager(this.canvas, this.ctx, this.world);
    // Make clouds fixed to the screen (do not follow camera)
    this.effects.setCloudFollowMode("parallax");
    this.interactions = new InteractionManager(this.player, this.world);
    this.minigames = new MinigameManager(this);
    this.bengkel = new Bengkel(this);

    // Setup input
    this.setupInput();
    this.setupWindowFocusHandling();
    this.setupQuickViewHandling();
    this.setupWeatherToggle();
    this.setupOffscreenModal();

    // Record when page/game construction started so we can ensure the
    // loading screen remains visible for a short minimum duration to
    // avoid a quick flash when assets load extremely fast.
    this._loadStartTime = performance.now();
    // Minimum time (ms) the loading screen should stay visible
    this.minimumLoadingMs = 2571;

    // Start a loader that waits until all assets are ready before starting
    this.waitForAssetsThenStart();

    // Make game accessible globally
    app.game = this;
    window.game = this; // Debug handle for the console/devtools only; modules read app.game.
  }

  // Read-only: paused while any owner holds (splash, blur, quickview, visitor, minigame...).
  get paused() {
    return JOR.isPauseHeld(this);
  }

  get cameraX() {
    return this.camera.x;
  }

  set cameraX(x) {
    this.camera.x = x;
  }

  // Poll components until everything is loaded, then hide loading screen and start loop
  waitForAssetsThenStart() {
    const check = () => {
      const playerReady = this.player.spritesLoaded === true;
      const worldReady = this.world.isLoaded && this.world.isLoaded();
      const effectsReady =
        this.effects &&
        this.effects.cloudSprites &&
        this.effects.cloudSprites.length > 0
          ? this.effects.cloudSprites.every((img) => img && img.complete)
          : true;

      if (playerReady && worldReady && effectsReady) {
        this.world.streamBiomes();
        // All assets loaded — but keep loading screen visible for at least
        // `this.minimumLoadingMs` to avoid a quick flash for very fast loads.
        const ensureStart = () => {
          const loading = document.getElementById("loading-screen");
          if (loading) loading.classList.add("hidden");
          // Show splash screen and start loop in paused state so canvas renders
          const splash = document.getElementById("splash-screen");
          if (splash) splash.classList.remove("hidden");
          this.lastTime = performance.now();
          this.gameLoop(this.lastTime);
        };

        const elapsed = performance.now() - (this._loadStartTime || 0);
        const remaining = Math.max(0, (this.minimumLoadingMs || 0) - elapsed);
        if (remaining > 0) {
          setTimeout(ensureStart, remaining);
        } else {
          ensureStart();
        }
      } else {
        // continue waiting
        requestAnimationFrame(check);
      }
    };

    requestAnimationFrame(check);
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  setupInput() {
    // Keyboard input by physical key (e.code): no Shift/layout desync, no stuck throttle.
    const SCROLL_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"];
    window.addEventListener("keydown", (e) => {
      // Typing in a form or reading a dialog must not drive the bike.
      if (JOR.shouldIgnoreGameKey(e, document)) return;
      if (e.code === "Backquote" && !e.repeat) this.bengkel.toggle();
      // preventDefault on Space also stops a focused button (e.g. #qv-open after a
      // dialog closes) from re-activating while the visitor wheelies. Keep it.
      this.keys[e.code] = true;
      if (SCROLL_KEYS.includes(e.code)) e.preventDefault();
    });

    window.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
    });

    // Cheat words (typed text, so e.key). Order matters: "afternoon" before "noon".
    const timeCheat = (mode, text, type = "success") => () => {
      this.effects.setTimeOfDay(mode);
      showCustomAlert(text, { type });
    };
    const cheats = {
      rain: () => {
        this.effects.toggleRain();
        showCustomAlert(this.effects.rainActive ? "Hujan telah datang!" : "Hujan telah hilang!", {
          type: "success",
          duration: 3000,
        });
      },
      morning: timeCheat("morning", "Selamat pagi!"),
      afternoon: timeCheat("afternoon", "Selamat sore!"),
      noon: timeCheat("noon", "Selamat siang!"),
      night: timeCheat("night", "Selamat malam!"),
      reset: timeCheat(null, "Kembali ke realita!", "info"),
      wheeliegame: () => this.minigames.startMinigame("wheelie_challenge"),
      lightgame: () => this.minigames.startMinigame("red_light_green_light"),
      racegame: () => this.minigames.startMinigame("drag_race"),
      glitch: () => this.showGlitch(),
    };
    this.cheats = cheats;
    const nextWord = JOR.createWordBuffer(Object.keys(cheats));
    window.addEventListener("keydown", (e) => {
      if (JOR.shouldIgnoreGameKey(e, document)) return;
      const word = nextWord(e.key);
      // Cheats sleep while paused (splash, modals, minigame transitions) and during the opening ride.
      if (word && !this.paused && !this._splashCameraActive) cheats[word]();
    });

    // Click handler for NPC interaction (touch taps arrive as clicks too)
    this.canvas.addEventListener("click", (e) => {
      // Mouse position in bitmap pixels (the CSS box can differ from the bitmap)
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) * this.canvas.width) / rect.width;
      const mouseY = ((e.clientY - rect.top) * this.canvas.height) / rect.height;

      // Check NPC clicks
      if (this.world.npcs) {
        this.world.npcs.forEach((npc) => {
          npc.handleClick(mouseX, mouseY, this.cameraX);
        });
      }

      // Check Special NPC clicks
      if (this.world.specialNPCs) {
        this.world.specialNPCs.forEach((specialNpc) => {
          specialNpc.handleClick(mouseX, mouseY, this.cameraX);
        });
      }
    });
  }

  // Clear held keys and stop the bike + engine sound.
  releaseInput() {
    this.keys = {};
    if (this.player) {
      this.player.velocityX = 0;
      this.player.currentAnimation = "idle";
      this.player.animationTimer = 0;
      this.player.wheelieActive = false;
    }
    try {
      if (AudioManager && AudioManager.stopEngine) {
        AudioManager.stopEngine();
      }
    } catch (e) {}
  }

  // Blur owns its own pause: coming back never unpauses a dialog, splash or minigame.
  setupWindowFocusHandling() {
    const pauseNow = () => {
      this.releaseInput();
      JOR.holdPause(this, "blur");
    };
    const resumeNow = () => {
      // rAF stops while hidden: reset the clock so the first frame back has no huge dt
      // (a Drag Race rival would otherwise "finish" instantly).
      this.lastTime = performance.now();
      JOR.releasePause(this, "blur");
    };

    document.addEventListener("visibilitychange", () =>
      document.hidden ? pauseNow() : resumeNow()
    );
    window.addEventListener("blur", pauseNow);
    window.addEventListener("focus", resumeNow);
  }

  // Quick View (qv.js) is standalone; the game only reacts to its events.
  setupQuickViewHandling() {
    document.addEventListener("qv:open", () => {
      this.releaseInput();
      JOR.holdPause(this, "quickview");
    });
    document.addEventListener("qv:close", () => JOR.releasePause(this, "quickview"));
    // A #quick deep link opens Quick View before the game exists; its qv:open already fired.
    if (document.getElementById("qv")?.open) JOR.holdPause(this, "quickview");
  }

  // Real weather is opt-in (D499): off by default, remembered, revocable.
  setupWeatherToggle() {
    this.weatherReq = 0;
    this.weatherToggle = document.getElementById("weather-optin");
    if (!this.weatherToggle) return;
    this.weatherToggle.checked = save.get("weatherOptIn") === true;
    if (this.weatherToggle.checked) this.checkRealWeather();
    this.weatherToggle.addEventListener("change", () => {
      // Hand focus back to the page so Space/arrows drive the bike, not the checkbox.
      this.weatherToggle.blur();
      save.set("weatherOptIn", this.weatherToggle.checked);
      if (this.weatherToggle.checked) this.checkRealWeather();
      else {
        this.weatherReq++;
        this.effects.toggleRain(false);
      }
    });
  }

  disableRealWeather(message) {
    if (this.weatherToggle) this.weatherToggle.checked = false;
    save.set("weatherOptIn", false);
    if (typeof showCustomAlert === "function") showCustomAlert(message, { type: "info" });
  }

  checkRealWeather() {
    // Each lookup gets a token; unchecking or a newer lookup makes older callbacks no-ops.
    const req = ++this.weatherReq;
    if (!("geolocation" in navigator)) {
      this.disableRealWeather("Browser ini tidak mendukung lokasi.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (req === this.weatherReq) this.fetchWeather(position.coords.latitude, position.coords.longitude, req);
      },
      () => {
        if (req === this.weatherReq) this.disableRealWeather("Izin lokasi diperlukan untuk fitur cuaca otomatis!");
      }
    );
  }

  fetchWeather(lat, lon, req) {
    // Rounded coordinates: the weather API never gets the exact location.
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${JOR.roundCoord(lat)}&longitude=${JOR.roundCoord(lon)}&current_weather=true`;

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then((data) => {
        if (req !== this.weatherReq) return;
        if (!data.current_weather) throw new Error("no current_weather");
        // WMO codes: drizzle/rain/showers 51-82, thunderstorm 95-99
        const rainCodes = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99];
        const raining = rainCodes.includes(data.current_weather.weathercode);
        this.effects.toggleRain(raining);
        if (raining && typeof showCustomAlert === "function") {
          showCustomAlert("Hujan telah datang!", { type: "success" });
        }
      })
      .catch(() => {
        if (req === this.weatherReq) this.disableRealWeather("Cuaca asli gagal dimuat, coba lagi nanti.");
      });
  }

  // Setup offscreen modal button and DOM references
  setupOffscreenModal() {
    const btn = document.getElementById("offscreen-return-btn");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        this.handleOffscreenReturn();
      });
    }
  }

  showOffscreenModal() {
    const modal = document.getElementById("offscreen-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    this.offscreenModalActive = true;
    // keep game running but block player input (handled by keysForPlayer)
  }

  hideOffscreenModal() {
    const modal = document.getElementById("offscreen-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    this.offscreenModalActive = false;
  }

  // Called when user presses the single 'Kembali' button in the modal.
  // Computes a sensible target X (in world coords) and instructs the
  // player to move there using the scripted movement. The modal remains
  // visible until the move completes.
  handleOffscreenReturn() {
    // Prevent double-clicks: if the button is already disabled, do nothing.
    const btn = document.getElementById("offscreen-return-btn");
    let originalText = null;
    if (btn) {
      if (btn.disabled) return;
      originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Tunggu sebentar..";
    }

    try {
      // prefer to place player near 1/3 of the screen from the left (camera follow target)
      const desiredScreenX = this.canvas.width / 3;
      let target = Math.round(this.cameraX + desiredScreenX + 16);

      // clamp to world bounds so we don't move outside the world
      const maxPlayerX = Math.max(
        0,
        this.world.worldWidth - this.player.width - 8
      );
      target = Math.max(0, Math.min(maxPlayerX, target));

      // Start scripted move toward target (speed tuned for a snappy return)
      this.player.moveTo(target, 8, () => {
        // when player arrives, ensure modal hides and resume normal input
        this.hideOffscreenModal();
        setTimeout(() => {
          if (btn) {
            btn.disabled = false;
            if (originalText !== null) btn.textContent = originalText;
          }
        }, 1000);
      });
    } catch (e) {
      console.error("Failed to handle offscreen return:", e);
      this.hideOffscreenModal();
      setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          if (originalText !== null) btn.textContent = originalText;
        }
      }, 1000);
    }
  }

  // Fit the bitmap to the window and re-bake every height-derived y (F10).
  layout() {
    if (this.canvas.width === window.innerWidth && this.canvas.height === window.innerHeight) return;
    const oldWidth = this.canvas.width;
    this.resizeCanvas();
    this.world.layout();
    this.effects.layout(oldWidth, this.cameraX);
    this.player.y = this.world.groundY() - 150; // 200 px bike, wheels on the road
    // Snap the view to the bike so a rotation never strands it off-screen ("Kembali" modal).
    this.camera.jumpTo(this.player.x - this.canvas.width / 3);
    this.prevCameraX = this.cameraX;
    this.prevPlayerX = this.player.x;
    // Resizing cleared the bitmap and the loop may be skipping frames (Quick View): draw now.
    if (this.lastTime) this.render();
  }

  // "glitch" cheat (D510): the old resize 404 screen, now a harmless easter egg.
  showGlitch() {
    const modal = document.getElementById("disaster-modal");
    const close = document.getElementById("glitch-close-btn");
    if (!modal || !close) return; // never hold a pause nothing can release
    this.releaseInput(); // stop the bike and the looping engine sound under the modal
    JOR.holdPause(this, "glitch");
    modal.classList.remove("hidden");
    close.onclick = () => {
      modal.classList.add("hidden");
      JOR.releasePause(this, "glitch");
    };
    close.focus();
  }

  update(deltaTime) {
    if (this.paused) return;
    // Update player. When a scripted splash/camera scene is active or the
    // offscreen modal is visible, pass an empty keys object so player input
    // is ignored while scripted movement or modal interaction runs.
    const keysForPlayer =
      this._splashCameraActive || this.offscreenModalActive ? {} : this.keys;
    this.player.update(deltaTime, keysForPlayer);

    // Camera: normal follow, or a tighter follow (0.4) while the scripted opening ride runs.
    this.camera.follow(this._splashCameraActive ? 0.4 : this.cameraSmoothing);

    // Detect if player is fully off-screen (left or right). If so, show
    // the offscreen modal which offers a single action to return the player
    // to the visible area. Do this after camera update so detection is accurate.
    try {
      const screenX = this.player.x - this.cameraX;
      const offLeft = screenX + this.player.width < 0;
      const offRight = screenX > this.canvas.width;
      const fullyOff = offLeft || offRight;

      if (fullyOff && !this.offscreenModalActive) {
        this.showOffscreenModal();
      }
      // Note: do NOT auto-hide the modal here if it's active; it should be
      // hidden only when the scripted move completes and the player is back
      // in view (the callback will hide it). However if the player somehow
      // re-enters view without modal active, ensure modal is hidden.
    } catch (e) {
      // ignore detection errors
    }

    // Update effects (pass cameraX so clouds can wrap relative to viewport)
    this.effects.update(deltaTime, this.cameraX);

    // Create dust particles when moving: spawn for both rear and front wheels
    if (Math.abs(this.player.velocityX) > 1) {
      const wheelY = this.player.y + this.player.height - 10;

      // Determine wheel positions based on facing direction
      // Default (facing right): Rear is low X (40), Front is high X (width - 40)
      // Facing Left: Rear is high X (width - 40), Front is low X (40)
      let rearX, frontX;

      if (this.player.facingRight) {
        rearX = this.player.x + 40;
        frontX = this.player.x + this.player.width - 40;
      } else {
        rearX = this.player.x + this.player.width - 40;
        frontX = this.player.x + 40;
      }

      // rear wheel (always spawns dust)
      this.effects.createDustParticles(rearX, wheelY, {
        count: 2,
        spreadX: 12,
        spreadY: 6,
      });

      // front wheel - only if not doing a wheelie
      if (!this.player.wheelieActive) {
        this.effects.createDustParticles(frontX, wheelY, {
          count: 2,
          spreadX: 12,
          spreadY: 6,
        });
      }
    }

    // Ambient leaf spawn near nearby trees (probabilistic, scaled by proximity)
    if (
      this.world &&
      Array.isArray(this.world.trees) &&
      this.world.trees.length
    ) {
      const playerCenter = this.player.x + this.player.width / 2;
      const cfg = (this.world && this.world.leafConfig) || {};
      const ambientRange =
        typeof cfg.ambientRange === "number" ? cfg.ambientRange : 500;
      const ratePerSecond =
        typeof cfg.ratePerSecond === "number" ? cfg.ratePerSecond : 0.25;
      const spreadX = typeof cfg.spreadX === "number" ? cfg.spreadX : 20;
      const spreadY = typeof cfg.spreadY === "number" ? cfg.spreadY : 12;
      const maxPerTick =
        typeof cfg.maxPerTick === "number" ? cfg.maxPerTick : 1;

      for (let i = 0; i < this.world.trees.length; i++) {
        const tree = this.world.trees[i];
        const dist = Math.abs(tree.x - playerCenter);
        if (dist > ambientRange) continue;

        // chance scales down as tree is farther from player
        const proximity = 1 - dist / ambientRange; // 0..1
        const p = ratePerSecond * (deltaTime / 1000) * proximity;

        if (Math.random() < p) {
          // spawn from canopy area (approx top quarter of tree)
          const spawnX = tree.x + (tree.width || 0) / 2;
          const spawnY = tree.y + Math.floor((tree.height || 0) * 0.25);
          // spawn up to configured max per tick
          const count = Math.max(1, Math.min(maxPerTick, 1));
          this.effects.createLeafParticles(spawnX, spawnY, {
            count: count,
            spreadX: spreadX,
            spreadY: spreadY,
            force: true,
          });
        }
      }
    }

    // Update interactions (pass cameraX so interaction system can compute screen positions)
    this.interactions.update(this.cameraX);

    // Update NPCs
    if (this.world.npcs) {
      this.world.npcs.forEach((npc) => npc.update(deltaTime));
    }

    // Update Special NPCs
    if (this.world.specialNPCs) {
      this.world.specialNPCs.forEach((specialNpc) =>
        specialNpc.update(deltaTime)
      );
    }

    // Update minigames
    if (this.minigames) this.minigames.update(deltaTime);
  }

  // DOM overlays follow the drawn (interpolated) bike once per frame; writes only on change.
  syncUi() {
    const tip = this._wheelieTip ??= document.getElementById("wheelie-tooltip");
    if (tip) {
      const show = !!this.player.canWheelie;
      if (show !== this._wheelieShown) {
        tip.classList.toggle("hidden", !show);
        this._wheelieShown = show;
      }
      if (show) {
        this._coarse ??= matchMedia("(pointer: coarse)");
        const text = this._coarse.matches || window.innerWidth <= 900 ? "SWIPE UP untuk Wheelie!" : "SPACE untuk Wheelie!";
        const span = tip.querySelector("span");
        if (span && span.textContent !== text) span.textContent = text;
        const left = `${Math.round(this.player.x - this.cameraX + this.player.width / 2)}px`;
        const top = `${Math.round(this.player.y + 40)}px`;
        if (tip.style.left !== left) tip.style.left = left;
        if (tip.style.top !== top) tip.style.top = top;
      }
    }
    this.interactions.syncTooltip(this.cameraX);
  }

  render() {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Render world with parallax. Pass `effects` so clouds can be drawn
    // between background layers (behind the nearest bg layer).
    const windSway = this.effects.getWindSway();
    this.world.render(this.cameraX, windSway, this.effects);

    // Render player (before overlays so it gets tinted)
    this.player.render(this.ctx, this.cameraX);

    // Render particles (dust, leaves)
    this.effects.renderParticles(this.cameraX);

    // Time Overlay (Day/Night cycle)
    if (this.effects.renderTimeOverlay) {
      this.effects.renderTimeOverlay();
    }

    // Rain (on top of everything)
    this.effects.renderRain(this.cameraX);

    // Ambient snow (V8), on top like rain
    this.effects.renderSnow(this.cameraX);

    // Render interaction indicators (UI stays on top and bright)
    this.interactions.render(this.ctx, this.cameraX);

    // Render minigames (overlays)
    if (this.minigames) this.minigames.render(this.ctx);

    // Mode Bengkel perf panel (toggled with backtick or ?bengkel)
    if (this.bengkel.on) this.bengkel.render(this.ctx);
  }

  gameLoop(currentTime) {
    const t0 = performance.now();
    const dt = currentTime - this.lastTime;
    this.lastTime = currentTime;
    try {
      let steps = 0;
      if (this.paused) {
        this.simAcc = 0; // a pause never banks time
        // Nothing to lerp across a pause (minigame start teleports while paused).
        this.prevCameraX = this.cameraX;
        this.prevPlayerX = this.player.x;
        const race = this.minigames && this.minigames.activeMinigame;
        if (race && "prevNpcX" in race) race.prevNpcX = race.npcX;
      } else {
        const r = JOR.fixedSteps(this.simAcc || 0, dt);
        this.simAcc = r.acc;
        // Re-check every step: a step can open a modal (minigame result) and pause.
        for (; steps < r.steps && !this.paused; steps++) {
          this.prevCameraX = this.cameraX;
          this.prevPlayerX = this.player.x;
          this.update(JOR.STEP_MS);
        }
        if (this.paused) this.simAcc = 0;
      }
      this.stepsLastFrame = steps;
      // Quick View covers the game: skip drawing it underneath.
      if (!JOR.isPauseHeld(this, "quickview")) this.renderInterpolated();
    } catch (e) {
      // Keep the loop alive; log the first failure only.
      if (!this._loopErrorLogged) console.error("Game loop error:", e);
      this._loopErrorLogged = true;
    }
    this.bengkel.record(dt, performance.now() - t0, this.stepsLastFrame || 0);
    requestAnimationFrame((time) => this.gameLoop(time));
  }

  // Draw between the last two sim steps (camera and player here; the Drag rival lerps
  // itself via game.renderAlpha). ponytail: add other movers if they visibly judder.
  renderInterpolated() {
    const camX = this.cameraX;
    const playerX = this.player.x;
    let alpha = this.paused ? 1 : (this.simAcc || 0) / JOR.STEP_MS;
    const prevCam = this.prevCameraX ?? camX;
    const prevX = this.prevPlayerX ?? playerX;
    // Unpaused teleports (minigame exit, intro skip) must not sweep across the screen.
    const half = this.canvas.width / 2;
    if (Math.abs(camX - prevCam) > half || Math.abs(playerX - prevX) > half) alpha = 1;
    this.cameraX = prevCam + (camX - prevCam) * alpha;
    this.player.x = prevX + (playerX - prevX) * alpha;
    this.renderAlpha = alpha;
    try {
      this.render();
      this.syncUi();
    } finally {
      this.cameraX = camX;
      this.player.x = playerX;
      this.renderAlpha = 1;
    }
  }
}

// Start game when page loads
window.addEventListener("load", () => {
  new Game();
});

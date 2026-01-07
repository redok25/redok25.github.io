// ===================================
// GAME.JS - Main Game Engine
// ===================================

class Game {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d");

    // Set canvas size
    // Set canvas size
    this.lastWidth = window.innerWidth;
    this.resizeCanvas();

    // Listen for resize but trigger disaster if width changes significantly
    // (Handles the mobile-to-desktop glitch issue)
    window.addEventListener("resize", () => {
      const newWidth = window.innerWidth;
      // Ignore small changes (address bar on mobile)
      if (Math.abs(newWidth - this.lastWidth) > 50) {
        this.handleDisaster();
      } else {
        this.resizeCanvas();
      }
      this.lastWidth = newWidth;
    });

    // Game state
    this.paused = false;
    this.lastTime = 0;
    this.keys = {};

    // Offscreen modal state: true when modal is visible and blocking player input
    this.offscreenModalActive = false;

    // Camera
    this.cameraX = 0;
    this.cameraSmoothing = 0.1;
    // When true, a scripted splash/scene controls cameraX and the
    // normal follow logic should be suspended.
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

    // Setup input
    this.setupInput();
    this.setupWindowFocusHandling();
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
    window.game = this;
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
        // All assets loaded — but keep loading screen visible for at least
        // `this.minimumLoadingMs` to avoid a quick flash for very fast loads.
        const ensureStart = () => {
          const loading = document.getElementById("loading-screen");
          if (loading) loading.classList.add("hidden");
          // Show splash screen and start loop in paused state so canvas renders
          const splash = document.getElementById("splash-screen");
          if (splash) splash.classList.remove("hidden");
          // keep game paused until user starts exploration
          this.paused = true;
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
    // Keyboard input
    window.addEventListener("keydown", (e) => {
      this.keys[e.key] = true;

      // Prevent arrow key scrolling
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)
      ) {
        e.preventDefault();
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keys[e.key] = false;
    });

    // Cheat Codes
    this.keyHistory = [];
    window.addEventListener("keydown", (e) => {
      // Store last 10 keys (enough for short words)
      this.keyHistory.push(e.key.toLowerCase());
      if (this.keyHistory.length > 10) {
        this.keyHistory.shift();
      }

      const sequence = this.keyHistory.join("");

      // Check for "rain"
      if (sequence.endsWith("rain")) {
        console.log("Cheat activated: RAIN");
        if (this.effects && typeof this.effects.toggleRain === "function") {
          this.effects.toggleRain();
          const isActive = this.effects.rainActive;
          if (typeof showCustomAlert === "function") {
            showCustomAlert(
              isActive ? "Hujan telah datang!" : "Hujan telah hilang!",
              { type: "success", duration: 3000 }
            );
          }
        }
        // Reset history to avoid double triggers if typing "rainstorm" etc.
        this.keyHistory = [];
      } else if (sequence.endsWith("morning")) {
        console.log("Cheat activated: MORNING");
        if (this.effects && typeof this.effects.setTimeOfDay === "function") {
          this.effects.setTimeOfDay("morning");
          if (typeof showCustomAlert === "function")
            showCustomAlert("Selamat pagi!", { type: "success" });
        }
        this.keyHistory = [];
      } else if (sequence.endsWith("afternoon")) {
        console.log("Cheat activated: AFTERNOON");
        if (this.effects && typeof this.effects.setTimeOfDay === "function") {
          this.effects.setTimeOfDay("afternoon");
          if (typeof showCustomAlert === "function")
            showCustomAlert("Selamat sore!", { type: "success" });
        }
        this.keyHistory = [];
      } else if (sequence.endsWith("noon")) {
        console.log("Cheat activated: NOON");
        if (this.effects && typeof this.effects.setTimeOfDay === "function") {
          this.effects.setTimeOfDay("noon");
          if (typeof showCustomAlert === "function")
            showCustomAlert("Selamat siang!", { type: "success" });
        }
        this.keyHistory = [];
      } else if (sequence.endsWith("night")) {
        console.log("Cheat activated: NIGHT");
        if (this.effects && typeof this.effects.setTimeOfDay === "function") {
          this.effects.setTimeOfDay("night");
          if (typeof showCustomAlert === "function")
            showCustomAlert("Selamat malam!", { type: "success" });
        }
        this.keyHistory = [];
      } else if (sequence.endsWith("reset")) {
        console.log("Cheat activated: RESET TIME");
        if (this.effects && typeof this.effects.setTimeOfDay === "function") {
          this.effects.setTimeOfDay(null);
          if (typeof showCustomAlert === "function")
            showCustomAlert("Kembali ke realita!", { type: "info" });
        }
        this.keyHistory = [];
      } else if (sequence.endsWith("wheeliegame")) {
        console.log("Cheat: Start Wheelie Game");
        this.minigames.startMinigame("wheelie_challenge");
        this.keyHistory = [];
      } else if (sequence.endsWith("lightgame")) {
        console.log("Cheat: Start Traffic Light Game");
        this.minigames.startMinigame("red_light_green_light");
        this.keyHistory = [];
      } else if (sequence.endsWith("racegame")) {
        console.log("Cheat: Start Drag Race");
        this.minigames.startMinigame("drag_race");
        this.keyHistory = [];
      }
    });

    // Touch controls for mobile (optional)
    let touchStartX = 0;

    this.canvas.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
    });

    this.canvas.addEventListener("touchmove", (e) => {
      const touchX = e.touches[0].clientX;
      const diff = touchX - touchStartX;

      if (diff > 10) {
        this.keys["ArrowRight"] = true;
        this.keys["ArrowLeft"] = false;
      } else if (diff < -10) {
        this.keys["ArrowLeft"] = true;
        this.keys["ArrowRight"] = false;
      }
    });

    this.canvas.addEventListener("touchend", () => {
      this.keys["ArrowRight"] = false;
      this.keys["ArrowLeft"] = false;
    });

    // Click handler for NPC interaction
    this.canvas.addEventListener("click", (e) => {
      // Calculate mouse position relative to canvas
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

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

    // Double tap support or similar for touch if needed,
    // but click usually fires on tap on mobile.

    // Automatically check real weather on start
    // this.checkRealWeather(); // Disabled: Now triggered via Modal in splash.js
  }

  // Ensure game pauses and input resets when tab loses focus or is hidden
  setupWindowFocusHandling() {
    const releaseAll = () => {
      try {
        // Clear all input states
        this.keys = {};
      } catch (e) {}
      try {
        // Stop player movement immediately
        if (this.player) {
          this.player.velocityX = 0;
          this.player.currentAnimation = "idle";
          this.player.animationTimer = 0;
          this.player.wheelieActive = false;
        }
      } catch (e) {}
      try {
        if (window.AudioManager && window.AudioManager.stopEngine) {
          window.AudioManager.stopEngine();
        }
      } catch (e) {}
    };

    const pauseNow = () => {
      releaseAll();
      this.paused = true;
    };

    const resumeNow = () => {
      // Keep inputs released; resume loop timing cleanly
      this.lastTime = performance.now();
      this.paused = false;
    };

    // Page visibility
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) pauseNow();
      else resumeNow();
    });

    // Window focus/blur
    window.addEventListener("blur", () => {
      pauseNow();
    });
    window.addEventListener("focus", () => {
      resumeNow();
    });
  }

  // Weather Permission Modal
  showWeatherModal() {
    const modal = document.getElementById("weather-modal");
    const btnAllow = document.getElementById("btn-allow-weather");
    const btnDeny = document.getElementById("btn-deny-weather");

    if (!modal || !btnAllow || !btnDeny) return;

    // Show modal
    modal.classList.remove("hidden");

    // Setup one-time listeners
    const cleanup = () => {
      modal.classList.add("hidden");
      btnAllow.onclick = null;
      btnDeny.onclick = null;
      // Restore focus to game or unpause if needed
    };

    btnAllow.onclick = () => {
      cleanup();
      this.checkRealWeather();
    };

    btnDeny.onclick = () => {
      cleanup();
      console.log("Weather sync skipped by user.");
    };
  }

  // Real-time Weather Sync
  checkRealWeather() {
    if ("geolocation" in navigator) {
      console.log("Requesting location for weather sync...");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          this.fetchWeather(lat, lon);
        },
        (error) => {
          console.log(
            "Location access denied or error. Weather sync disabled.",
            error
          );
          if (typeof showCustomAlert === "function") {
            showCustomAlert(
              "Izin lokasi diperlukan untuk fitur cuaca otomatis!",
              { type: "info" }
            );
          }
        }
      );
    } else {
      console.log("Geolocation not supported.");
    }
  }

  fetchWeather(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;

    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        if (data.current_weather) {
          const code = data.current_weather.weathercode;
          console.log(`Real-time Weather Code: ${code}`);

          // WMO Weather interpretation codes
          // Rain: 51, 53, 55, 61, 63, 65, 80, 81, 82
          // Thunderstorm: 95, 96, 99
          const rainCodes = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99];

          if (rainCodes.includes(code)) {
            console.log("Weather is RAINY. Enabling effect.");
            this.effects.toggleRain(true);
            if (typeof showCustomAlert === "function")
              showCustomAlert(" Hujan telah datang!", { type: "success" });
          } else {
            console.log("Weather is CLEAR/CLOUDY. Disabling rain.");
            this.effects.toggleRain(false);
          }
        }
      })
      .catch((err) => console.error("Error fetching weather:", err));
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

  // Handle "Disaster" on resize
  handleDisaster() {
    this.paused = true;
    const modal = document.getElementById("disaster-modal");
    const reloadBtn = document.getElementById("reload-btn");

    if (modal) {
      modal.classList.remove("hidden");
      // Ensure it stays top
      modal.style.display = "flex";
    }

    if (reloadBtn) {
      reloadBtn.onclick = () => window.location.reload();
    }
  }

  update(deltaTime) {
    if (this.paused) return;
    // Update player. When a scripted splash/camera scene is active or the
    // offscreen modal is visible, pass an empty keys object so player input
    // is ignored while scripted movement or modal interaction runs.
    const keysForPlayer =
      this._splashCameraActive || this.offscreenModalActive ? {} : this.keys;
    this.player.update(deltaTime, keysForPlayer);

    // Update camera to follow player when not overridden by scripted scenes
    if (!this._splashCameraActive) {
      const targetCameraX = this.player.x - this.canvas.width / 3;
      this.cameraX += (targetCameraX - this.cameraX) * this.cameraSmoothing;

      // Determine minimum camera X. When the player has completed the splash
      // and `player.lockBacktrack` is set, don't allow the camera to move
      // left of the splash end position. The player's world X is allowed to
      // move left, but the camera will remain clamped so the screen doesn't
      // reveal the world behind the splash.
      let minCameraX = 0;
      try {
        if (
          this.player &&
          this.player.lockBacktrack &&
          typeof this.player.minX === "number"
        ) {
          minCameraX = Math.max(0, this.player.minX - this.canvas.width / 3);
        }
      } catch (e) {
        minCameraX = 0;
      }

      // Clamp camera between minCameraX and world max
      const maxCameraX = Math.max(0, this.world.worldWidth - this.canvas.width);
      this.cameraX = Math.max(minCameraX, Math.min(this.cameraX, maxCameraX));
    } else {
      // While a scripted splash/camera scene is active, smoothly track the player's scripted movement
      // This keeps the player on-screen during the splash sequence.
      const targetCameraX = this.player.x - this.canvas.width / 3;
      // Use a slightly stronger smoothing for scripted camera motion so it feels snappy but still smooth
      // Use a more responsive smoothing for scripted camera motion so the
      // camera tracks the player's scripted splash more closely and feels
      // less like it's lagging behind. Clamp to a sensible range so it
      // remains smooth across different user-configured `cameraSmoothing`.
      const splashSmoothing = Math.min(
        0.8,
        Math.max(0.25, this.cameraSmoothing * 4)
      );
      this.cameraX += (targetCameraX - this.cameraX) * splashSmoothing;

      // While scripted camera is active, also respect the same minimum camera bound
      let minCameraX = 0;
      try {
        if (
          this.player &&
          this.player.lockBacktrack &&
          typeof this.player.minX === "number"
        ) {
          minCameraX = Math.max(0, this.player.minX - this.canvas.width / 3);
        }
      } catch (e) {
        minCameraX = 0;
      }

      const maxCameraX = Math.max(0, this.world.worldWidth - this.canvas.width);
      this.cameraX = Math.max(minCameraX, Math.min(this.cameraX, maxCameraX));
    }

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

    // Update wheelie tooltip
    const wheelieTooltip = document.getElementById("wheelie-tooltip");
    if (wheelieTooltip) {
      if (this.player.canWheelie) {
        wheelieTooltip.classList.remove("hidden");

        // Detect mobile/touch to show appropriate hint
        const isMobile =
          matchMedia("(pointer: coarse)").matches || window.innerWidth <= 900;
        const tooltipText = wheelieTooltip.querySelector("span");
        if (tooltipText) {
          tooltipText.textContent = isMobile
            ? "SWIPE UP untuk Wheelie!"
            : "SPACE untuk Wheelie!";
        }

        // Position tooltip above player
        const screenX = this.player.x - this.cameraX + this.player.width / 2;
        const screenY = this.player.y - 40 + 80; // slightly higher than interaction prompt
        wheelieTooltip.style.left = `${screenX}px`;
        wheelieTooltip.style.top = `${screenY}px`;
      } else {
        wheelieTooltip.classList.add("hidden");
      }
    }

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

    // Render interaction indicators (UI stays on top and bright)
    this.interactions.render(this.ctx, this.cameraX);

    // Render minigames (overlays)
    if (this.minigames) this.minigames.render(this.ctx);

    // Render debug info (optional)
    if (this.keys["`"]) {
      this.renderDebug();
    }
  }

  renderDebug() {
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    this.ctx.fillRect(10, 10, 250, 120);

    this.ctx.fillStyle = "#00ff00";
    this.ctx.font = "14px monospace";
    this.ctx.fillText(`Player X: ${Math.round(this.player.x)}`, 20, 30);
    this.ctx.fillText(`Player Y: ${Math.round(this.player.y)}`, 20, 50);
    this.ctx.fillText(`Velocity: ${this.player.velocityX.toFixed(2)}`, 20, 70);
    this.ctx.fillText(`Camera X: ${Math.round(this.cameraX)}`, 20, 90);
    this.ctx.fillText(`Animation: ${this.player.currentAnimation}`, 20, 110);
  }

  gameLoop(currentTime) {
    // Calculate delta time
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // Update and render
    this.update(deltaTime);
    this.render();

    // Continue loop
    requestAnimationFrame((time) => this.gameLoop(time));
  }
}

// Start game when page loads
window.addEventListener("load", () => {
  new Game();
});

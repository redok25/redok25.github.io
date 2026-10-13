// ===================================
// GAME.JS - Main Game Engine
// ===================================
import { JOR } from "./helpers.js";
import { Player } from "./player.js";
import { World, goldCopy } from "./world.js";
import { EffectsManager, LEAF_AUTUMN, shakeOffset } from "./effects.js";
import { InteractionManager } from "./interactions.js";
import { MinigameManager } from "./minigames.js";
import { Camera } from "./camera.js";
import { showCustomAlert } from "./content.js";
import { AudioManager } from "./audio.js";
import { app } from "./state.js";
import { save, getIds, addId, SECRETS } from "./save.js";
import { KOPI, KOPI_IDS, KOPI_SIZE, kopiShown, kopiReach, isEmas } from "./kopi.js";
import { Bengkel } from "./bengkel.js";
import { CHAPTERS, Journey, arrivalX } from "./journey.js";
import { Cinema } from "./cinema.js";
import { fadeTeleport } from "./travel.js";
import { Strip } from "./strip.js";
import { Credits } from "./credits.js";
import { createRedok } from "./redok.js";
import { COPY } from "./copy.js";

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
    this._traveling = false; // a fade-teleport is running (js/travel.js)

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
    // Chapters (V1): Prolog at the start; title card, letterbox and chime live in Cinema (V5).
    this.journey = new Journey(this.player.x + this.player.width / 2);
    this.cinema = new Cinema();
    this.strip = new Strip(this); // journey strip + fast travel (W5)
    this.credits = new Credits(this); // end-of-road card (R9)
    this.kopi = getIds(save, "kopi", KOPI_IDS); // Kopi Rahasia found (P3); changes only in takeKopi

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
    window.redok = createRedok(this); // console API (T2, R8)
    console.log(COPY.console.banner);
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
        if (isEmas(this.kopi)) this.setGold(); // Motor Emas from an earlier visit (P3)
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
    // Secrets (P4): a word counts the first time its cheat really runs: typed here (after the
    // guards below, so a word eaten by a pause never counts) or as ?bengkel=<word>, which runs
    // this same table. It records after the cheat returns: a cheat that throws records nothing.
    // Reassigning existing keys keeps their order, so "afternoon" still beats "noon".
    for (const [word, run] of Object.entries(cheats)) {
      cheats[word] = () => {
        run();
        addId(save, "secrets", word, SECRETS);
      };
    }
    this.cheats = cheats;
    const nextWord = JOR.createWordBuffer(Object.keys(cheats));
    window.addEventListener("keydown", (e) => {
      if (JOR.shouldIgnoreGameKey(e, document)) return;
      const word = nextWord(e.key);
      // Cheats sleep while paused (splash, modals, transitions), during the opening ride and
      // during a minigame course (R28).
      if (word && !this.paused && !this._splashCameraActive && !this.minigames.activeMinigame) cheats[word]();
    });

    // A press during the opening ride also skips it, so the ride is over by the time the
    // click fires on release: remember the ride state at press time.
    this.canvas.addEventListener("pointerdown", () => {
      this._pressInRide = this._splashCameraActive;
    });

    // Canvas tap or click (touch taps arrive as clicks too): one target, the one drawn on
    // top under the point (R19). Paused and minigame guards live in interactions.tapAt.
    this.canvas.addEventListener("click", (e) => {
      // The opening ride owns the screen: a click there must not start anything.
      if (this._splashCameraActive || this._pressInRide) return;
      // Mouse position in bitmap pixels (the CSS box can differ from the bitmap)
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) * this.canvas.width) / rect.width;
      const mouseY = ((e.clientY - rect.top) * this.canvas.height) / rect.height;
      this.interactions.tapAt(mouseX + this.cameraX, mouseY);
    });
  }

  // Clear held keys and stop the bike + engine sound (and a landing thump, P7).
  releaseInput() {
    this.keys = {};
    if (this.player) {
      this.player.velocityX = 0;
      this.player.currentAnimation = "idle";
      this.player.animationTimer = 0;
      this.player.wheelieActive = false;
    }
    if (this.effects) this.effects.shakeSteps = 0;
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
    // Honest "seen" (P2): qv.js marks a project card it saw in the open dialog (data-seen) and
    // fires "qv:seen"; the save keeps it. Cards marked before the game existed (that same deep
    // link) are caught up in this task, right before the listener, so none is missed.
    this.projectIds = Array.from(document.querySelectorAll(JOR.PROJECT_CARDS), (card) => card.id);
    const markSeen = (id) => addId(save, "seen", id, this.projectIds); // true = a new project
    document.querySelectorAll(JOR.PROJECT_CARDS + "[data-seen]").forEach((card) => markSeen(card.id));
    document.addEventListener("qv:seen", (e) => markSeen(e.detail && e.detail.id));
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
  // visible until the move completes (or a fade-teleport ends it at its black frame).
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

  // A new current chapter: its biome (V2) and its ambient snow (V8). The title card (V5)
  // is handled in update() so a minigame course does not use up a first entry.
  enterChapter(id) {
    const chapter = CHAPTERS[id];
    this.world.biomeWanted = chapter.biome;
    this.effects.ambientSnow = chapter.snow;
  }

  // A teleport's chapter (R12, R13): no hysteresis, the biome snaps under the black frame
  // and the snow is at full strength when the fade lifts. No title card here: fast travel
  // shows it itself, and a minigame course must not use up a first entry (R4).
  syncChapterAt(centerX) {
    this.journey.jumpTo(centerX);
    this.enterChapter(this.journey.current);
    this.world.snapBiome(this.world.biomeWanted);
    this.effects.snowIntensity = this.effects.rainActive ? 0 : this.effects.ambientSnow;
  }

  // Fast travel, redok.goto and the credits replay (R22). The "blur" owner alone does not
  // block: DevTools focus blurs the page, and redok.goto must work from the console.
  canTravel() {
    const p = this.player;
    if (!p.lockBacktrack || p.splashMoving || this._traveling) return false;
    if (this.offscreenModalActive || this.minigames.activeMinigame) return false;
    const owners = this._pauseOwners;
    return !owners || owners.size === (owners.has("blur") ? 1 : 0);
  }

  // Fast travel (W5, R6, R14): fade, land 100 px into the chapter, and show its title card
  // as the fade lifts (always, R4). The first entry is used up here so update() does not
  // show the card a second time.
  travelTo(id) {
    if (!Number.isInteger(id) || id < 1 || id >= CHAPTERS.length || !this.canTravel()) return false;
    return fadeTeleport(this, {
      x: arrivalX(id),
      onBlack: () => {
        this.journey.firstEntry(this.journey.current);
        this.cinema.showTitle(CHAPTERS[this.journey.current]);
      },
    });
  }

  // Kopi Rahasia (P3): a cup the bike's centre (sim x) passes within KOPI_RADIUS of while it
  // shows (night, rain), the floating one only at full wheelie. Once per unpaused step.
  checkKopi() {
    const p = this.player;
    const cx = p.x + p.width / 2;
    const e = this.effects;
    const nightA = e.currentTimeState ? e.currentTimeState.a : 0;
    const full = p.wheelieRotation >= p.wheelieMaxRotation;
    for (let i = 0; i < KOPI.length; i++) {
      const cup = KOPI[i];
      if (this.kopi.includes(cup.id)) continue;
      if (kopiReach(cup, cx, kopiShown(cup, nightA, e.rainIntensity), full)) this.takeKopi(cup);
    }
  }

  // One cup found: saved, then the cues (sparks at the cup, the chime, a toast). The last one
  // turns the bike gold (Motor Emas). P5 hooks its "Pemburu Kopi" check here.
  takeKopi(cup) {
    if (!addId(save, "kopi", cup.id, KOPI_IDS)) return;
    this.kopi = getIds(save, "kopi", KOPI_IDS);
    const y = this.world.groundY() - cup.lift - KOPI_SIZE / 2;
    this.effects.emit("spark", cup.x - KOPI_SIZE / 2, y, 1, 4, KOPI_SIZE);
    this.effects.emit("spark", cup.x - KOPI_SIZE / 2, y, -1, 4, KOPI_SIZE);
    AudioManager.playChime();
    const emas = isEmas(this.kopi);
    if (emas) this.setGold();
    const tokens = { found: this.kopi.length, total: KOPI.length };
    showCustomAlert(emas ? COPY.kopi.emas : JOR.fillTokens(COPY.kopi.found, tokens), { type: "success" });
  }

  // Motor Emas (P3): gold copies of the three bike sprites, made once; player.render draws
  // them. player.sprites stays as is: the Drag rival is drawn from it.
  setGold() {
    const p = this.player;
    if (p.goldSprites) return;
    try {
      const gold = {};
      for (const name in p.sprites) gold[name] = goldCopy(p.sprites[name]);
      p.goldSprites = gold;
    } catch (e) {
      // An unreadable canvas keeps the normal bike: this runs in the loader's check, and a
      // throw there would stop the game from ever starting for a 4/4 profile.
    }
  }

  update(deltaTime) {
    if (this.paused) return;
    // Update player. When a scripted splash/camera scene is active or the
    // offscreen modal is visible, pass an empty keys object so player input
    // is ignored while scripted movement or modal interaction runs.
    const keysForPlayer =
      this._splashCameraActive || this.offscreenModalActive ? {} : this.keys;
    const rot0 = this.player.wheelieRotation; // P7: a landing is this step's drop to 0
    this.player.update(deltaTime, keysForPlayer);

    // Camera: normal follow, or a tighter follow (0.4) while the scripted opening ride runs.
    this.camera.follow(this._splashCameraActive ? 0.4 : this.cameraSmoothing);

    // Chapters (V1, R4 amended): fed after the camera with the bike's center. The biome
    // follows the road even during a minigame course; the title card waits for the first
    // real visit (a course through Bab 1-3 is no visit), so it is checked every step.
    const entered = this.journey.update(this.player.x + this.player.width / 2);
    if (entered >= 0) this.enterChapter(entered);
    const here = this.journey.current;
    if (!this.minigames.activeMinigame && this.journey.firstEntry(here)) this.cinema.showTitle(CHAPTERS[here]);

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
      // in view (the callback will hide it; a fade-teleport ends it early). However if the player somehow
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

    // P7 juice: exhaust smoke, hard-brake sparks + skid, the wheelie landing (dust + thump)
    // and leaves in the wake in Bab 3. Spawned here in update, so never while paused.
    const autumn = CHAPTERS[this.journey.current].biome === "autumn";
    this.effects.juice(this.player, rot0, autumn);

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
      // Bab 3 (autumn) drops orange leaves (V2); everywhere else they stay green.
      const leafColor = autumn ? LEAF_AUTUMN : undefined;

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
            color: leafColor,
          });
        }
      }
    }

    // Update interactions (pass cameraX so interaction system can compute screen positions)
    this.interactions.update(this.cameraX);
    // Skill gauges (W2) fill as the bike rides past; inert during a course (R7).
    if (!this.minigames.activeMinigame) this.world.updateGauges(this.player.x + this.player.width / 2);
    // Kopi Rahasia (P3): only the rider's own riding finds a cup: not the opening ride, not a
    // course (R28), not the offscreen "Kembali" return (it can slide back over a cup).
    if (this.player.lockBacktrack && !this.offscreenModalActive && !this.minigames.activeMinigame) this.checkKopi();
    // Credits (R9): the end of the road, once per load, after the ride, never during a course.
    if (this.player.lockBacktrack && !this.minigames.activeMinigame) {
      this.credits.check(this.player.x + this.player.width / 2);
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

  // DOM overlays follow the drawn (interpolated) bike once per frame; writes only on change.
  syncUi(simPlayerX = this.player.x) {
    const tip = this._wheelieTip ??= document.getElementById("wheelie-tooltip");
    if (tip) {
      const show = !!this.player.canWheelie && !this.paused;
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
    // Opening ride subtitle (V6): the beat follows the drawn bike's progress, not a timer;
    // the guard uses the simulation x so a skip never flashes the last beat on an interpolated frame.
    const p = this.player;
    if (p._isOpeningSplash && simPlayerX < p.splashTargetX) {
      this.cinema.syncBeat((p.x - p._splashStartX) / (p.splashTargetX - p._splashStartX));
    }
    this.strip.sync(this.player.x + this.player.width / 2);
    this.interactions.syncTooltip(this.cameraX);
  }

  render() {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // P7 landing thump: a render-time offset (camera state, input and the DOM never move).
    // Everything up to the minigame overlays shifts together, so the ▼ marker, the Drag
    // rival and the finish lines stay on the road; the Bengkel panel stays put. None while
    // paused: a pause never freezes the scene mid-jolt.
    const shakeY = this.paused ? 0 : shakeOffset(this.effects.shakeSteps);
    this.ctx.setTransform(1, 0, 0, 1, 0, shakeY);

    // Render world with parallax. Pass `effects` so clouds can be drawn
    // between background layers (behind the nearest bg layer).
    const windSway = this.effects.getWindSway();
    // A course hides the cups (they are inert there, R28).
    this.world.render(this.cameraX, windSway, this.effects, this.minigames.activeMinigame ? null : this.kopi);

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
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // the Bengkel panel stays put

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
    // Unpaused jumps (the opening-ride skip) must not sweep across the screen; fadeTeleport moves happen while paused.
    const half = this.canvas.width / 2;
    if (Math.abs(camX - prevCam) > half || Math.abs(playerX - prevX) > half) alpha = 1;
    this.cameraX = prevCam + (camX - prevCam) * alpha;
    this.player.x = prevX + (playerX - prevX) * alpha;
    this.renderAlpha = alpha;
    try {
      this.render();
      this.syncUi(playerX);
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

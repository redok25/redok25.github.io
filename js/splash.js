// splash.js - controls the initial splash flow and triggers the player splash move
(function () {
  function isReturningVisitor() {
    return !!(window.JOR && JOR.visit && JOR.visit.returning);
  }

  function init() {
    const splash = document.getElementById("splash-screen");
    const startBtn = document.getElementById("start-explore");
    const uiOverlay = document.getElementById("ui-overlay");

    // timer handle to auto-hide opening subtitle (can be cleared when movement completes)
    let autoHideTimer = null;
    // Set by the ride's completion callback; late timers must not undo its cleanup.
    let introFinished = false;

    if (!splash || !startBtn) return;

    // hide UI overlay until splash finishes
    if (uiOverlay) uiOverlay.style.display = "none";

    function launchGameSequence() {
      startBtn.textContent = "Berangkat...";
      const opening = document.getElementById("opening-story");

      // Set before the ride starts so the ride's completion callback is always the last
      // writer: a skip can finish the ride before the 500ms timeout below fires.
      if (window.game) window.game._splashCameraActive = true;

      setTimeout(() => {
        // Immediately hide the initial splash modal
        splash.classList.add("hidden");
        // Subtitle only while the ride still runs, and never for returning visitors.
        if (opening && opening.isConnected && !introFinished && !isReturningVisitor()) {
          opening.classList.remove("hidden");
        }
      }, 500);

      // Start the game and scripted move immediately while subtitles show
      beginGameAfterStory();
    }

    startBtn.addEventListener("click", () => {
      // Start BGM on user gesture (ensures browsers allow playback)
      try {
        if (
          typeof AudioManager !== "undefined" &&
          AudioManager &&
          typeof AudioManager.playBgm === "function"
        ) {
          AudioManager.playBgm("ambient");
          // play a short start SFX on initial Start press
          if (typeof AudioManager.playStart === "function") {
             // AudioManager.playStart();
          }
        }
      } catch (e) {}
      
      startBtn.disabled = true;

      launchGameSequence();
    });

    async function beginGameAfterStory() {
      // ensure game exists
      if (!window.game || !window.game.player) {
        // fallback: just ensure UI shown and unpause
        if (uiOverlay) uiOverlay.style.display = "";
        if (window.game) window.game.paused = false;
        return;
      }

      // Unpause the game so update/render run
      window.game.paused = false;
      // Wait for player assets (sprites + exhaust) to load so visuals are ready
      const waitForPlayerAssets = (timeoutMs = 3000) => {
        return new Promise((resolve) => {
          const start = Date.now();
          const check = () => {
            const p = window.game && window.game.player;
            if (
              p &&
              p.spritesLoaded &&
              (p.exhaustLoaded === undefined || p.exhaustLoaded === true)
            ) {
              resolve(true);
              return;
            }
            if (Date.now() - start >= timeoutMs) {
              // timeout: resolve anyway to avoid blocking forever
              console.warn(
                "Player assets did not finish loading before timeout"
              );
              resolve(false);
              return;
            }
            setTimeout(check, 100);
          };
          check();
        });
      };

      // Start a scripted player move for splash (distance, speed)
      // Use estimated time to auto-hide the subtitle so it fades when motor stops.
      const splashDistance = 2571;
      const splashSpeed = 6; // px per frame (approx)

      // estimate frames and ms (assume ~60fps). Add small buffer (200ms).
      const estimatedFrames =
        Math.abs(splashDistance) / Math.max(1, Math.abs(splashSpeed));
      const estimatedMs = Math.round(estimatedFrames * (1000 / 60)) + 200;

      // If opening subtitle exists, set an auto-hide timer based on estimate
      try {
        const openingEl = document.getElementById("opening-story");
        if (openingEl) {
          if (autoHideTimer) {
            clearTimeout(autoHideTimer);
            autoHideTimer = null;
          }
          autoHideTimer = setTimeout(() => {
            try {
              openingEl.classList.add("hidden");
              openingEl.remove();
            } catch (e) {}
            autoHideTimer = null;
          }, estimatedMs);
        }
      } catch (e) {
        /* ignore */
      }

      // wait for assets (up to 3s) then start scripted move
      const assetsReady = await waitForPlayerAssets(3000);
      if (!assetsReady) {
        // still start the move but warn in console
        console.warn("Starting splash move before all player assets loaded");
      }

      // Skip: jump the bike to the ride's end; the next player.update() runs the
      // normal completion callback (camera, UI, backtrack lock, subtitle).
      const skipBtn = document.getElementById("skip-intro");
      const introStartedAt = performance.now();
      const skipIntro = () => {
        const p = window.game && window.game.player;
        if (p && p.splashMoving && p._isOpeningSplash) p.x = p.splashTargetX;
      };
      const onSkipKey = (e) => {
        // While Quick View is open, Esc belongs to the dialog.
        if (e.key === "Escape" && !JOR.shouldIgnoreGameKey(e, document)) skipIntro();
      };
      const onSkipTap = (e) => {
        if (performance.now() - introStartedAt < 1000) return;
        if (e.target.closest("#qv, #qv-open, #skip-intro")) return;
        skipIntro();
      };
      const cleanupSkip = () => {
        if (skipBtn) skipBtn.classList.add("hidden");
        document.removeEventListener("keydown", onSkipKey);
        document.removeEventListener("pointerdown", onSkipTap);
      };
      if (skipBtn) {
        skipBtn.classList.remove("hidden");
        skipBtn.onclick = skipIntro;
      }
      document.addEventListener("keydown", onSkipKey);
      document.addEventListener("pointerdown", onSkipTap);

      window.game.player.startSplashMove(
        splashDistance,
        splashSpeed,
        (traveled) => {
          introFinished = true;
          cleanupSkip();
          // scripted splash finished: restore normal camera follow
          try {
            if (window.game) window.game._splashCameraActive = false;
          } catch (e) {}

          // On complete: show UI and tidy up splash + subtitle element
          if (uiOverlay) uiOverlay.style.display = "";


          // Show Gesture Info if available
          if (typeof window.showGestureInfo === "function") {
              window.showGestureInfo();
          }

          // Add traveled distance to world.splashDistance if available
          try {
            if (
              window.game &&
              window.game.world &&
              typeof traveled === "number"
            ) {
              window.game.world.splashDistance =
                (window.game.world.splashDistance || 0) + traveled;
              console.log(
                "Splash traveled:",
                traveled,
                "-> world.splashDistance =",
                window.game.world.splashDistance
              );
            }
          } catch (e) {
            /* ignore */
          }

          // Fade out opening subtitle if still present and clear fallback timer
          try {
            const openingEl = document.getElementById("opening-story");
            if (openingEl) {
              if (autoHideTimer) {
                clearTimeout(autoHideTimer);
                autoHideTimer = null;
              }
              openingEl.classList.add("hidden");
              setTimeout(() => {
                try {
                  openingEl.remove();
                } catch (e) {}
              }, 420);
            }
          } catch (e) {
            /* ignore */
          }

          // remove the original splash if still present
          try {
            splash.remove();
          } catch (e) {}
        }
      );
      if (isReturningVisitor()) skipIntro();
    }
  }

  // Wait for window load and game to be created
  window.addEventListener("load", () => {
    // small poll to ensure `game` instance is available (Game constructor runs on load too)
    let tries = 0;
    const readyCheck = setInterval(() => {
      if (window.game || tries > 30) {
        clearInterval(readyCheck);
        // init now regardless; if game not present fallback behavior handles it
        init();
      }
      tries++;
    }, 100);
  });
})();

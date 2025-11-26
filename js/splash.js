// splash.js - controls the initial splash flow and triggers the player splash move
(function () {
  function init() {
    const splash = document.getElementById("splash-screen");
    const startBtn = document.getElementById("start-explore");
    const uiOverlay = document.getElementById("ui-overlay");

    // timer handle to auto-hide opening subtitle (can be cleared when movement completes)
    let autoHideTimer = null;

    if (!splash || !startBtn) return;

    // hide UI overlay until splash finishes
    if (uiOverlay) uiOverlay.style.display = "none";

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
            try {
              // AudioManager.playStart();
            } catch (e) {}
          }
        }
      } catch (e) {}
      startBtn.disabled = true;
      startBtn.textContent = "Berangkat...";

      const opening = document.getElementById("opening-story");

      setTimeout(() => {
        // Immediately hide the initial splash modal
        splash.classList.add("hidden");

        // Show the short opening story overlay (as subtitle) if exists
        if (opening) {
          opening.classList.remove("hidden");
        }

        // Tell the game we'll run a scripted splash so camera uses the
        // splash-follow behaviour while player moves.
        try {
          if (window.game) window.game._splashCameraActive = true;
        } catch (e) {}
      }, 500);

      // Start the game and scripted move immediately while subtitles show
      beginGameAfterStory();
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

      window.game.player.startSplashMove(
        splashDistance,
        splashSpeed,
        (traveled) => {
          // scripted splash finished: restore normal camera follow
          try {
            if (window.game) window.game._splashCameraActive = false;
          } catch (e) {}

          // On complete: show UI and tidy up splash + subtitle element
          if (uiOverlay) uiOverlay.style.display = "";

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

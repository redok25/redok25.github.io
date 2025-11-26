// Simple AudioManager singleton
// Provides basic BGM playback and lightweight stubs for SFX used by game code.
(function () {
  const bgm = new Audio();
  bgm.loop = true;
  bgm.preload = "auto";

  const AudioManager = {
    _bgm: bgm,
    _currentBgm: null,
    _isMuted: false,
    _prevVolume: 0.6,
    _fadeHandle: null,
    playBgm(nameOrPath) {
      try {
        // allow passing a logical name or a direct path
        const map = {
          menu: "assets/audio/menu.mp3",
          level: "assets/audio/level.mp3",
          ambient: "assets/audio/ambient.mp3",
          click: "assets/audio/click.mp3",
        };
        const src = map[nameOrPath] || nameOrPath;
        if (!src) return;
        if (this._currentBgm === src && !this._bgm.paused) return;
        this._bgm.src = src;
        this._bgm.loop = true;
        // start playback at 0 volume then fade to desired volume for smoothness
        const targetVol = this._prevVolume || 0.6;
        try {
          this._bgm.muted = !!this._isMuted;
          // if muted, don't bother fading — just set volume and play
          if (this._isMuted) {
            this._bgm.volume = targetVol;
            this._bgm.play().catch((e) => {
              console.warn("AudioManager: bgm play blocked", e);
            });
          } else {
            // ensure we start from 0 for fade-in
            this._bgm.volume = 0;
            this._bgm.play().catch((e) => {
              console.warn("AudioManager: bgm play blocked", e);
            });
            // fade to target over 700ms
            this.fadeTo(targetVol, 700);
          }
        } catch (e) {
          console.warn("AudioManager: playBgm error during play", e);
        }
        this._currentBgm = src;
      } catch (e) {
        console.error("AudioManager.playBgm error", e);
      }
    },
    stopBgm() {
      try {
        // fade out smoothly then pause/reset
        const doPause = () => {
          try {
            this._bgm.pause();
            this._bgm.currentTime = 0;
            this._currentBgm = null;
          } catch (e) {}
        };
        if (this._isMuted) {
          doPause();
        } else {
          this.fadeTo(0, 500, doPause);
        }
      } catch (e) {}
    },
    // Convenience: allow playing a file path directly
    playFile(path) {
      return this.playBgm(path);
    },
    // Small SFX stubs so existing code can call them safely.
    setVolume(v) {
      try {
        const vol = Math.max(0, Math.min(1, v));
        this._prevVolume = vol;
        // if a fade is in progress, cancel it so user control takes precedence
        if (this._fadeHandle) {
          cancelAnimationFrame(this._fadeHandle);
          this._fadeHandle = null;
        }
        this._bgm.volume = vol;
      } catch (e) {}
    },

    // Fade helper: ramp volume to `target` over `duration` ms. Optional callback runs when finished.
    fadeTo(target, duration = 500, cb) {
      try {
        if (this._fadeHandle) {
          cancelAnimationFrame(this._fadeHandle);
          this._fadeHandle = null;
        }
        const start = performance.now();
        const from = Number(this._bgm.volume) || 0;
        const diff = target - from;
        if (duration <= 0 || Math.abs(diff) < 0.001) {
          this._bgm.volume = target;
          if (typeof cb === "function") cb();
          return;
        }
        const step = (ts) => {
          const t = Math.min(1, (ts - start) / duration);
          const eased = t; // linear; could use ease
          try {
            this._bgm.volume = Math.max(0, Math.min(1, from + diff * eased));
          } catch (e) {}
          if (t < 1) {
            this._fadeHandle = requestAnimationFrame(step);
          } else {
            this._fadeHandle = null;
            if (typeof cb === "function") cb();
          }
        };
        this._fadeHandle = requestAnimationFrame(step);
      } catch (e) {
        if (typeof cb === "function") cb();
      }
    },
    // Play a short click SFX for UI interactions. Respects mute and current volume.
    playClick() {
      try {
        const src = (function () {
          const local = {
            click: "assets/audio/click.mp3",
          };
          return local.click;
        })();
        if (!src) return;
        if (this._isMuted) return;
        // small, non-looping audio for click
        const s = new Audio(src);
        s.preload = "auto";
        s.volume = Math.max(0, Math.min(1, this._prevVolume || 0.6));
        s.play().catch(() => {});
      } catch (e) {}
    },
    isMuted() {
      return !!this._isMuted;
    },
    mute() {
      try {
        this._isMuted = true;
        this._bgm.muted = true;
      } catch (e) {}
    },
    unmute() {
      try {
        this._isMuted = false;
        this._bgm.muted = false;
        // restore volume if needed
        if (typeof this._prevVolume === "number")
          this._bgm.volume = this._prevVolume;
      } catch (e) {}
    },
    toggleMute() {
      if (this.isMuted()) this.unmute();
      else this.mute();
      // update UI if present
      try {
        const btn = document.getElementById("audio-toggle");
        if (btn) {
          btn.classList.toggle("muted", this.isMuted());
          btn.textContent = this.isMuted() ? "🔇" : "🔊";
        }
      } catch (e) {}
    },
  };

  // expose globally
  window.AudioManager = AudioManager;
  // attach UI handler when page loads: open panel, volume slider, and mute toggle
  try {
    const attach = () => {
      const btn = document.getElementById("audio-toggle");
      const panel = document.getElementById("audio-control-panel");
      const volEl = document.getElementById("audio-volume");
      const muteBtn = document.getElementById("audio-mute-toggle");
      const closeBtn = document.getElementById("audio-panel-close");
      if (!btn || !panel) return;

      const updateUI = () => {
        const muted = AudioManager.isMuted();
        btn.classList.toggle("muted", muted);
        btn.textContent = muted ? "🔇" : "🔊";
        if (muteBtn) {
          muteBtn.textContent = muted ? "🔇" : "🔊";
          muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
        }
        if (volEl) {
          const v = Math.round((AudioManager._prevVolume || 0.6) * 100);
          volEl.value = v;
        }
      };

      // initialize
      updateUI();

      // toggle panel visibility
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const hidden = panel.classList.toggle("hidden");
        panel.setAttribute("aria-hidden", hidden ? "true" : "false");
        if (!hidden && volEl) volEl.focus();
      });

      // mute button inside panel
      if (muteBtn) {
        muteBtn.addEventListener("click", (ev) => {
          ev.preventDefault();
          AudioManager.toggleMute();
          updateUI();
        });
      }

      // volume slider
      if (volEl) {
        volEl.addEventListener("input", (ev) => {
          const val = Number(ev.target.value) / 100;
          AudioManager.setVolume(val);
          // if was muted, unmute when user moves slider
          if (AudioManager.isMuted()) AudioManager.unmute();
          updateUI();
        });
      }

      // close button
      if (closeBtn) {
        closeBtn.addEventListener("click", (ev) => {
          ev.preventDefault();
          panel.classList.add("hidden");
          panel.setAttribute("aria-hidden", "true");
        });
      }

      // clicking outside panel closes it
      document.addEventListener("click", (ev) => {
        if (panel.classList.contains("hidden")) return;
        const inside = panel.contains(ev.target) || btn.contains(ev.target);
        if (!inside) {
          panel.classList.add("hidden");
          panel.setAttribute("aria-hidden", "true");
        }
      });
    };
    if (document.readyState === "complete") attach();
    else window.addEventListener("load", attach);
  } catch (e) {}

  // ESC key handler: close audio panel if open
  try {
    document.addEventListener(
      "keydown",
      (ev) => {
        try {
          if (!ev || !ev.key) return;
          if (ev.key !== "Escape" && ev.key !== "Esc") return;
          const panel = document.getElementById("audio-control-panel");
          const btn = document.getElementById("audio-toggle");
          if (!panel) return;
          if (panel.classList.contains("hidden")) return;
          // close panel
          panel.classList.add("hidden");
          panel.setAttribute("aria-hidden", "true");
          // play click SFX to give feedback (unless muted)
          try {
            AudioManager.playClick();
          } catch (e) {}
          ev.preventDefault();
          ev.stopPropagation();
        } catch (e) {}
      },
      true
    );
  } catch (e) {}

  // Delegated click handler for UI interactions to play click SFX.
  try {
    const clickHandler = (ev) => {
      try {
        // ignore if muted or no click asset
        if (AudioManager.isMuted()) return;
        // ignore clicks inside audio control panel to avoid feedback loops
        const panel = document.getElementById("audio-control-panel");
        const canvas = document.getElementById("gameCanvas");
        const tgt = ev.target;
        if (panel && panel.contains(tgt)) return;
        if (canvas && canvas.contains(tgt)) return;

        // treat common interactive elements as click-worthy
        const interactiveTags = [
          "BUTTON",
          "A",
          "INPUT",
          "SELECT",
          "TEXTAREA",
          "LABEL",
        ];
        const nearest = tgt.closest && tgt.closest("[data-audio-click]");
        if (nearest) {
          AudioManager.playClick();
          return;
        }
        if (tgt.tagName && interactiveTags.indexOf(tgt.tagName) !== -1) {
          AudioManager.playClick();
          return;
        }
        // also play when clicking elements with class 'interactive'
        if (tgt.classList && tgt.classList.contains("interactive")) {
          AudioManager.playClick();
          return;
        }
      } catch (e) {}
    };
    document.addEventListener("click", clickHandler, true);
  } catch (e) {}

  // Keyboard handler: play click SFX when pressing 'E' or 'e' for interactions
  try {
    document.addEventListener(
      "keydown",
      (ev) => {
        try {
          if (!ev || !ev.key) return;
          if (ev.key !== "e" && ev.key !== "E") return;

          // Don't play when typing in input-like elements
          const active = document.activeElement;
          if (!active) return;
          const tag = (active.tagName || "").toUpperCase();
          if (tag === "INPUT" || tag === "TEXTAREA" || active.isContentEditable)
            return;

          // Ignore if focus is inside audio panel
          const panel = document.getElementById("audio-control-panel");
          if (panel && panel.contains(active)) return;

          // If interaction prompt visible (non-hidden), treat as interactive
          const prompt = document.getElementById("interaction-prompt");
          if (prompt && !prompt.classList.contains("hidden")) {
            AudioManager.playClick();
            return;
          }

          // If focused element or its ancestor is marked for audio click, play
          if (active.closest && active.closest("[data-audio-click]")) {
            AudioManager.playClick();
            return;
          }

          // If focused element has interactive class, play
          if (active.classList && active.classList.contains("interactive")) {
            AudioManager.playClick();
            return;
          }

          // Fallback: play click for generic E press (useful for game interaction mappings)
          AudioManager.playClick();
        } catch (e) {}
      },
      true
    );
  } catch (e) {}
})();

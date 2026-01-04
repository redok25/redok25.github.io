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
          click: "assets/audio/click.ogg",
        };
        const src = map[nameOrPath] || nameOrPath;
        if (!src) return;
        if (this._currentBgm === src && !this._bgm.paused) return;
        this._bgm.src = src;
        this._bgm.loop = true;

        // Fallback handler: if initial format fails (e.g. ogg on Safari), try m4a
        const originalSrc = src;
        this._bgm.onerror = () => {
            if (this._bgm.src.endsWith(".m4a")) {
                console.error("AudioManager: Failed to play BGM both formats.");
                return;
            }
            console.warn("AudioManager: Format failed, trying fallback .m4a...");
            // Replace extension with .m4a
            const fallbackSrc = originalSrc.replace(/\.[^/.]+$/, ".m4a");
            this._bgm.src = fallbackSrc;
            this._bgm.play().catch(e => console.warn("Fallback play failed", e));
        };
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

    // Engine SFX management (separate channel so it doesn't interrupt BGM)
    // Engine sound specific (Web Audio API)
    _audioCtx: null,
    _engineBuffer: null,
    _engineSource: null,
    _engineGain: null,
    _engineLoading: false,
    _isStopping: false,

    _initWebAudio() {
        if (!this._audioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) this._audioCtx = new Ctx();
        }
        return this._audioCtx;
    },

    _engineLoopStart: 0,
    _engineLoopEnd: 0,

    _loadEngineBuffer(path) {
         if (this._engineBuffer || this._engineLoading) return;
         this._engineLoading = true;
         const ctx = this._initWebAudio();
         if (!ctx) return;

         fetch(path)
            .then(res => res.arrayBuffer())
            .then(buf => ctx.decodeAudioData(buf))
            .then(decoded => {
                this._engineBuffer = decoded;
                this._calculateLoopPoints(decoded); // Analyze buffer
                this._engineLoading = false;
            })
            .catch(e => {
                // FALLBACK: If .ogg failed, try .m4a
                if (!path.endsWith(".m4a")) {
                    console.warn(`AudioManager: Engine sound ${path} failed, trying .m4a fallback...`);
                    const fallbackPath = path.replace(/\.[^/.]+$/, ".m4a");
                    this._loadEngineBuffer(fallbackPath);
                } else {
                    console.error("AudioManager: Failed to load engine sound (both formats)", e);
                    this._engineLoading = false;
                }
            });
    },

    // Auto-detect silence at start/end to ensure seamless looping (Simple Trim)
    _calculateLoopPoints(buffer) {
        try {
            const data = buffer.getChannelData(0);
            const len = data.length;
            const threshold = 0.005; // Very low threshold just to catch absolute silence

            let start = 0;
            let end = len - 1;

            // Scan from start
            while (start < len && Math.abs(data[start]) < threshold) {
                start++;
            }

            // Scan from end
            while (end > start && Math.abs(data[end]) < threshold) {
                end--;
            }

            // Safety check
            if (end - start < 1000) {
                this._engineLoopStart = 0;
                this._engineLoopEnd = buffer.duration;
            } else {
                this._engineLoopStart = start / buffer.sampleRate;
                this._engineLoopEnd = end / buffer.sampleRate;
            }
            console.log(`AudioManager: Trimmed engine loop. Start: ${this._engineLoopStart.toFixed(3)}s, End: ${this._engineLoopEnd.toFixed(3)}s`);
        } catch(e) {
            this._engineLoopStart = 0;
            this._engineLoopEnd = buffer.duration;
        }
    },

    playEngine(path = "assets/audio/moving.ogg") {
      try {
        const ctx = this._initWebAudio();
        if (!ctx) return; 
        
        // Reset stopping flag because we are playing now
        this._isStopping = false;

        if (!this._engineBuffer) {
            this._loadEngineBuffer(path);
            return; 
        }

        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        if (this._engineSource) {
            const now = ctx.currentTime;
            this._engineGain.gain.cancelScheduledValues(now);
            this._engineGain.gain.setValueAtTime(this._engineGain.gain.value, now);
            
            const targetVol = (this._prevVolume || 0.6) * 0.8;
            // Snappier volume recovery (0.1s)
            this._engineGain.gain.linearRampToValueAtTime(targetVol, now + 0.1);
            return;
        }

        this._engineSource = ctx.createBufferSource();
        this._engineSource.buffer = this._engineBuffer;
        this._engineSource.loop = true;
        
        // Loop points
        if (this._engineLoopEnd > 0) {
            this._engineSource.loopStart = this._engineLoopStart;
            this._engineSource.loopEnd = this._engineLoopEnd;
        }

        this._engineGain = ctx.createGain();
        this._engineGain.gain.value = 0; 

        this._engineSource.connect(this._engineGain);
        this._engineGain.connect(ctx.destination);

        // Start from 0 to capture the natural attack of the sound (Fixes 'start glitch')
        // The loop will still respect loopStart/loopEnd for subsequent repeats
        this._engineSource.start(0, 0);

        // Very fast fade in (0.05s) just to de-click
        const now = ctx.currentTime;
        const targetVol = (this._prevVolume || 0.6) * 0.8;
        if (!this._isMuted) {
             this._engineGain.gain.setValueAtTime(0, now);
             this._engineGain.gain.linearRampToValueAtTime(targetVol, now + 0.05);
        } else {
             this._engineGain.gain.value = 0;
        }

        this._engineSource.onended = () => {
             this._engineSource = null;
             this._engineGain = null;
             this._isStopping = false;
        };

      } catch (e) {
          console.error("AudioManager.playEngine error", e);
      }
    },

    // Modulate volume based on speed (simulates engine effort)
    // ratio: 0.0 (stopped) to 1.0 (max speed)
    setEngineVolumeBySpeed(ratio) {
        try {
            if (!this._engineGain) return;
            if (this._isStopping) return;

            const now = this._audioCtx.currentTime;
            const baseVol = (this._prevVolume || 0.6) * 0.8;
            
            // Quadratic curve: Volume drops faster than speed
            // This simulates "letting off the gas": Engine quiets down (idles) while bike still has momentum
            // Ratio^1.5 or Ratio^2 feels good. Let's try Ratio^1.5 for a balance.
            const curve = Math.pow(ratio, 1.5);
            
            // Map 0..1 to 0.1 .. 1.0
            const dynamicVol = baseVol * (0.1 + (curve * 0.9)); 

            // Smooth update (0.1s ramp)
            this._engineGain.gain.setTargetAtTime(dynamicVol, now, 0.1);
            
        } catch(e) {}
    },

    stopEngine() {
        try {
            if (!this._engineSource || !this._engineGain) return;
            if (this._isStopping) return;

            this._isStopping = true;
            
            const ctx = this._initWebAudio();
            const now = ctx.currentTime;
            
            this._engineGain.gain.cancelScheduledValues(now);
            
            // Get current volume to determine how "heavy" the stop should be
            const currentVol = this._engineGain.gain.value;
            this._engineGain.gain.setValueAtTime(currentVol, now);
            
            // Adaptive Fade:
            // High RPM (High Vol) -> Longer drift (0.5s)
            // Low RPM (Low Vol) -> Quick cut (0.15s)
            // This fixes the "floating" feel at low speeds while keeping high speed smoothness
            const duration = 0.15 + (currentVol * 0.4); 
            
            this._engineGain.gain.linearRampToValueAtTime(0, now + duration);
            
            const src = this._engineSource;
            src.stop(now + duration + 0.05); 
            
        } catch(e) {}
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
        
        // Update engine volume if it's playing (Web Audio)
        if (this._engineGain && this._audioCtx) {
             const now = this._audioCtx.currentTime;
             this._engineGain.gain.cancelScheduledValues(now);
             const target = Math.max(0, vol * 0.8);
             this._engineGain.gain.setValueAtTime(target, now);
        }

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
            click: "assets/audio/click.ogg",
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
        if (this._engineGain) {
             this._engineGain.gain.value = 0;
        }
      } catch (e) {}
    },
    unmute() {
      try {
        this._isMuted = false;
        this._bgm.muted = false;
        // restore volume if needed
        if (typeof this._prevVolume === "number") {
           this._bgm.volume = this._prevVolume;
           if (this._engineGain) {
                // Restore engine volume
                this._engineGain.gain.value = Math.max(0, this._prevVolume * 0.8);
           }
        }
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

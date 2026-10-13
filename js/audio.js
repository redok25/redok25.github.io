// Simple AudioManager singleton
// Provides basic BGM playback and lightweight stubs for SFX used by game code.
import { JOR } from "./helpers.js";
import { save, getAudio } from "./save.js";

  const bgm = new Audio();
  bgm.loop = true;
  bgm.preload = "auto";
  const ENGINE_SRC = "assets/audio/moving.mp3";
  const savedAudio = getAudio(save); // P8: volume and mute survive a reload

  export const AudioManager = {
    _bgm: bgm,
    _currentBgm: null,
    _isMuted: savedAudio.muted,
    _prevVolume: savedAudio.volume, // the master volume 0..1 (0 is a real value)
    _fadeHandle: null,

    playBgm(nameOrPath) {
      try {
        console.log(`AudioManager: Requesting BGM play for '${nameOrPath}'`);
        // allow passing a logical name or a direct path
        const map = {
          ambient: "assets/audio/ambient.mp3",
          click: "assets/audio/click.mp3",
        };
        const src = map[nameOrPath] || nameOrPath;
        if (!src) return;
        if (this._currentBgm === src && !this._bgm.paused) return;
        this._bgm.src = src;
        this._bgm.loop = true;
        // start playback at 0 volume then fade to desired volume for smoothness
        const targetVol = this._prevVolume;
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

    _initWebAudio() {
        if (!this._audioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) this._audioCtx = new Ctx();
        }
        return this._audioCtx;
    },

    _engineLoopStart: 0,
    _engineLoopEnd: 0,

    // Fetch + decode the engine loop once. splash.js calls this at the Start click (P8), so
    // the opening ride is not silent; playEngine() calls it again only after a failed fetch.
    _loadEngineBuffer() {
         if (this._engineBuffer || this._engineLoading) return;
         const ctx = this._initWebAudio();
         if (!ctx) return;
         this._engineLoading = true;

         fetch(ENGINE_SRC)
            .then(res => res.arrayBuffer())
            .then(buf => ctx.decodeAudioData(buf))
            .then(decoded => {
                this._engineBuffer = decoded;
                this._calculateLoopPoints(decoded); // Analyze buffer
                this._engineLoading = false;
            })
            .catch(e => {
                console.error("AudioManager: Failed to load engine sound", e);
                this._engineLoading = false;
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

    // Engine voice (P8). Called on every sim step while the bike moves, with
    // ratio = speed / maxSpeed (0..1). Starts a voice when none runs, then steers its gain
    // and pitch toward this speed. stopEngine() lets go of a voice, so a voice is never reused
    // after its stop was scheduled: a re-throttle starts a fresh one while the old tail fades.
    playEngine(ratio) {
      try {
        const ctx = this._initWebAudio();
        if (!ctx) return;
        if (!this._engineBuffer) {
          this._loadEngineBuffer(); // normally preloaded at Start
          return;
        }
        if (ctx.state === "suspended") ctx.resume().catch(() => {});

        const gain = JOR.engineGain(ratio, this.level());
        const rate = JOR.engineRate(ratio);
        const now = ctx.currentTime;
        if (this._engineSource) {
          // tau 0.1 s: per-step targets glide instead of stepping
          this._engineGain.gain.setTargetAtTime(gain, now, 0.1);
          this._engineSource.playbackRate.setTargetAtTime(rate, now, 0.1);
          return;
        }

        const src = ctx.createBufferSource();
        src.buffer = this._engineBuffer;
        src.loop = true;
        if (this._engineLoopEnd > 0) {
          src.loopStart = this._engineLoopStart;
          src.loopEnd = this._engineLoopEnd;
        }
        src.playbackRate.value = rate; // starts at this speed's pitch, no glide up from 1.0
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now); // silent before it is connected; 0.05 s de-click fade-in
        g.gain.linearRampToValueAtTime(gain, now + 0.05);
        src.connect(g).connect(ctx.destination);
        // Start from 0 to capture the natural attack of the sound (Fixes 'start glitch');
        // the loop still respects loopStart/loopEnd for later repeats.
        src.start(0, 0);
        this._engineSource = src;
        this._engineGain = g;
      } catch (e) {
        console.error("AudioManager.playEngine error", e);
      }
    },

    // Fade the voice out and let it go; its own scheduled stop() ends it.
    stopEngine() {
      try {
        const src = this._engineSource;
        const g = this._engineGain;
        if (!src) return;
        this._engineSource = null;
        this._engineGain = null;
        const now = this._audioCtx.currentTime;
        // Adaptive fade: a loud (fast) engine drifts out over up to 0.55 s, a quiet one in 0.15 s.
        const vol = g.gain.value;
        const duration = 0.15 + vol * 0.4;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(vol, now);
        g.gain.linearRampToValueAtTime(0, now + duration);
        src.stop(now + duration + 0.05);
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
        // A running engine picks the new level up on its next step (playEngine).
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
    // Preload click sound
    _clickAudio: (function() {
        const a = new Audio("assets/audio/click.mp3");
        a.preload = "auto";
        a.volume = 0.6;
        return a;
    })(),

    // Play a short click SFX for UI interactions. Respects mute and current volume.
    playClick() {
      try {
        const level = this.level();
        if (!(level > 0)) return; // muted or volume 0

        // Clone node allows overlapping clicks (rapid fire)
        // If we just used this._clickAudio.play(), rapid clicks would just restart or fail
        const s = this._clickAudio.cloneNode();
        s.volume = level;
        s.play().catch(() => {});
      } catch (e) {}
    },
    // Title card chime (V5): two soft notes on the shared Web Audio context (the engine's).
    // Respects mute and the volume slider. The context exists only after a user gesture
    // (Start); if it is still suspended this chime is skipped, the next one plays.
    playChime() {
      try {
        if (this._isMuted || !(this._prevVolume > 0)) return;
        const ctx = this._initWebAudio();
        if (!ctx) return;
        if (ctx.state !== "running") {
          ctx.resume().catch(() => {});
          return;
        }
        const peak = 0.08 * this._prevVolume;
        const t0 = ctx.currentTime;
        [659.25, 987.77].forEach((freq, i) => {
          // E5 then B5, 120 ms apart
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = t0 + i * 0.12;
          osc.type = "triangle";
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.exponentialRampToValueAtTime(peak, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.65);
        });
      } catch (e) {}
    },
    isMuted() {
      return !!this._isMuted;
    },
    // The level every voice is scaled by (P8): 0 while muted, else the volume (0 included).
    level() {
      return this._isMuted ? 0 : this._prevVolume;
    },
    // Remember volume and mute across visits (P8). Called by mute/unmute and the slider's
    // "change" (never per "input" tick: save.set rewrites the whole record).
    _persist() {
      save.set("audio", { volume: this._prevVolume, muted: this._isMuted });
    },
    mute() {
      try {
        this._isMuted = true;
        this._bgm.muted = true;
        // Silence the running engine now (cancel also drops a fresh voice's fade-in ramp);
        // its per-step target is 0 from here on (level()).
        if (this._engineGain) {
          const now = this._audioCtx.currentTime;
          this._engineGain.gain.cancelScheduledValues(now);
          this._engineGain.gain.setValueAtTime(0, now);
        }
        this._persist();
      } catch (e) {}
    },
    unmute() {
      try {
        this._isMuted = false;
        this._bgm.muted = false;
        this._bgm.volume = this._prevVolume;
        // A running engine fades back in on its next step, at the level its speed asks for.
        this._persist();
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
          const v = Math.round(AudioManager._prevVolume * 100);
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
        // Persist once the value settles (drag released, or one arrow press).
        volEl.addEventListener("change", () => AudioManager._persist());
        // The panel focuses the slider on open: an arrow still held from the ride must not
        // sweep the volume (R29). Deliberate presses and drags still work.
        volEl.addEventListener("keydown", (e) => {
          if (e.repeat) e.preventDefault();
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
          // A modal dialog (Quick View) gets Esc first; the panel can wait.
          if (document.querySelector("dialog[open]")) return;
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
          // Same physical key as interactions.js, no auto-repeat.
          if (!ev || ev.code !== "KeyE" || ev.repeat) return;

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

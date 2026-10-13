// ===================================
// VISITOR-COUNTER.JS - "visitor" easter egg, local-only.
// Counts this browser's visits (one per day) in localStorage. No network, no fingerprint.
// ===================================
import { JOR } from "./helpers.js";
import { app } from "./state.js";
import { onAction } from "./actions.js";
import { save } from "./save.js";
import { AudioManager } from "./audio.js";

class VisitorCounter {
  constructor() {
    this.secretWord = "visitor";
    this.modalId = "visitor-counter-modal";

    // Drop data left by the old cloud counter.
    ["portfolio_visitor_data", "portfolio_visitor_id", "portfolio_jsonbin_id"].forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    });

    const visit = JOR.recordVisit(save.get("visits"), new Date().toISOString());
    save.set("visits", visit.record);
    JOR.visit = visit; // splash.js reads this to auto-skip the intro for returning visitors
    this.visitorData = visit.record;

    this.setupKeyListener();
  }

  setupKeyListener() {
    const nextWord = JOR.createWordBuffer([this.secretWord]);
    document.addEventListener("keydown", (e) => {
      if (JOR.shouldIgnoreGameKey(e, document)) return;
      if (nextWord(e.key)) this.showVisitorCounter();
    });
  }

  showVisitorCounter() {
    const modal = document.getElementById(this.modalId);
    if (!modal) return;
    this.updateCounterDisplay();
    // Hidden faders stay rendered, so replay their entrance animations on every open.
    modal.querySelectorAll(".modal-content, .visitor-stat-card").forEach((el) => {
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "";
    });
    modal.classList.remove("hidden");
    if (app.game) JOR.holdPause(app.game, "visitor");
    this.playDiscoverySound();
  }

  updateCounterDisplay() {
    const countEl = document.getElementById("visitor-count-number");
    const firstEl = document.getElementById("visitor-first-visit");
    const lastEl = document.getElementById("visitor-last-visit");
    if (countEl) this.animateCounter(countEl, this.visitorData.count);
    if (firstEl) firstEl.textContent = this.formatDate(new Date(this.visitorData.first));
    if (lastEl) lastEl.textContent = this.formatDate(new Date(this.visitorData.last));
  }

  animateCounter(element, targetCount) {
    const steps = 30;
    const increment = targetCount / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= targetCount) {
        current = targetCount;
        clearInterval(timer);
      }
      element.textContent = Math.floor(current).toLocaleString();
    }, 1500 / steps);
  }

  formatDate(date) {
    return date.toLocaleDateString("id-ID", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  playDiscoverySound() {
    // Follows the game's mute and volume (P8): 0.05 was its level at the default volume 0.6.
    const peak = 0.08 * AudioManager.level();
    if (!(peak > 0)) return;
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator1 = audioContext.createOscillator();
      const oscillator2 = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator1.frequency.value = 800;
      oscillator2.frequency.value = 1200;
      oscillator1.type = "sine";
      oscillator2.type = "sine";

      gainNode.gain.setValueAtTime(peak, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(peak / 5, audioContext.currentTime + 0.4);

      oscillator1.start(audioContext.currentTime);
      oscillator2.start(audioContext.currentTime + 0.1);
      oscillator1.stop(audioContext.currentTime + 0.4);
      oscillator2.stop(audioContext.currentTime + 0.5);
      setTimeout(() => audioContext.close(), 600);
    } catch (e) {
      // Silent fail
    }
  }

  closeModal() {
    const modal = document.getElementById(this.modalId);
    if (!modal) return;
    modal.classList.add("hidden");
    if (app.game) JOR.releasePause(app.game, "visitor");
  }
}

// Initialize when DOM is ready (a module runs after parsing, so this is usually immediate).
let visitorCounter = null;
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    visitorCounter = new VisitorCounter();
  });
} else {
  visitorCounter = new VisitorCounter();
}

// The modal's close button (data-action="close-visitor-counter" in index.html).
onAction("close-visitor-counter", () => {
  if (visitorCounter) visitorCounter.closeModal();
});

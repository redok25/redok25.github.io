// ===================================
// VISITOR-COUNTER.JS - "visitor" easter egg, local-only.
// Counts this browser's visits (one per day) in localStorage. No network, no fingerprint.
// ===================================

class VisitorCounter {
  constructor() {
    this.secretWord = "visitor";
    this.typedKeys = [];
    this.modalId = "visitor-counter-modal";

    // Drop data left by the old cloud counter.
    ["portfolio_visitor_data", "portfolio_visitor_id", "portfolio_jsonbin_id"].forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    });

    const visit = JOR.recordVisit(JOR.store.get("jor.visits", null), new Date().toISOString());
    JOR.store.set("jor.visits", visit.record);
    JOR.visit = visit; // splash.js reads this to auto-skip the intro for returning visitors
    this.visitorData = visit.record;

    this.setupKeyListener();
  }

  setupKeyListener() {
    document.addEventListener("keydown", (e) => {
      if (JOR.shouldIgnoreGameKey(e, document)) return;
      this.typedKeys.push(e.key.toLowerCase());
      if (this.typedKeys.length > this.secretWord.length) this.typedKeys.shift();
      if (this.typedKeys.join("").endsWith(this.secretWord)) {
        this.typedKeys = [];
        this.showVisitorCounter();
      }
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
    if (window.game) JOR.holdPause(window.game, "visitor");
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

      gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);

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
    if (window.game) JOR.releasePause(window.game, "visitor");
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    window.visitorCounter = new VisitorCounter();
  });
} else {
  window.visitorCounter = new VisitorCounter();
}

// Global function to close modal (inline onclick in index.html)
function closeVisitorCounter() {
  if (window.visitorCounter) {
    window.visitorCounter.closeModal();
  }
}

// Mobile controls: map on-screen buttons to existing keyboard-like `game.keys`.
// This file expects `window.game` to be available (game.js constructs it on load).
(function () {
  function $(sel) {
    return document.getElementById(sel);
  }

  const leftBtn = $("mc-left");
  const rightBtn = $("mc-right");
  const interactBtn = $("mc-interact");
  const mobileControls = $("mobile-controls");

  // Helper to safely set keys on the running game instance
  function setKey(key, value) {
    try {
      if (window.game && window.game.keys) {
        window.game.keys[key] = value;
      }
    } catch (e) {
      // ignore
    }
  }

  // Attach pointer handlers so it works with touch and mouse
  function bindButton(btn, onDown, onUp) {
    if (!btn) return;
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      onDown && onDown(e);
      btn.setPointerCapture(e.pointerId);
    });
    btn.addEventListener("pointerup", (e) => {
      e.preventDefault();
      onUp && onUp(e);
      try {
        btn.releasePointerCapture(e.pointerId);
      } catch (err) {}
    });
    btn.addEventListener("pointercancel", (e) => {
      e.preventDefault();
      onUp && onUp(e);
    });
    // Also treat leaving the element as release so users can slide away
    btn.addEventListener("pointerleave", (e) => {
      e.preventDefault();
      onUp && onUp(e);
    });
  }

  // Left button: hold to move left
  bindButton(
    leftBtn,
    () => {
      setKey("ArrowLeft", true);
      setKey("ArrowRight", false);
    },
    () => {
      setKey("ArrowLeft", false);
    }
  );

  // Right button: hold to move right
  bindButton(
    rightBtn,
    () => {
      setKey("ArrowRight", true);
      setKey("ArrowLeft", false);
    },
    () => {
      setKey("ArrowRight", false);
    }
  );

  // Interact button: trigger interaction on press
  if (interactBtn) {
    interactBtn.addEventListener("click", (e) => {
      e.preventDefault();
      try {
        if (window.game && window.game.interactions) {
          window.game.interactions.tryInteract();
        } else if (window.game && window.game.keys) {
          // fallback: briefly set 'e' key
          window.game.keys["e"] = true;
          setTimeout(() => (window.game.keys["e"] = false), 120);
        }
      } catch (err) {
        console.error("Interact failed:", err);
      }
    });
  }

  // Show controls only on touch-capable or small screens
  function updateVisibility() {
    const isTouch =
      matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    const smallScreen = window.innerWidth <= 900;
    if (isTouch || smallScreen) {
      mobileControls && mobileControls.classList.add("mc-visible");
    } else {
      mobileControls && mobileControls.classList.remove("mc-visible");
    }
  }

  window.addEventListener("resize", updateVisibility);
  updateVisibility();
})();

// Mobile controls: Gesture based (Swipe Left/Right, Swipe Up for Wheelie, Tap for Interact)
(function () {
  const GESTURE_THRESHOLD = 30; // Min px to trigger direction
  const WHEELIE_THRESHOLD = 50; // Min px up to trigger wheelie

  let touchStartX = 0;
  let touchStartY = 0;
  let isMoving = false;
  let activePointerId = null;

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

  // Handle touch start
  document.addEventListener(
    "touchstart",
    (e) => {
      // Ignore if touching a button or modal
      if (e.target.closest("button") || e.target.closest(".modal")) return;

      const touch = e.changedTouches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      activePointerId = touch.identifier;
    },
    { passive: false }
  );

  // Handle touch move
  document.addEventListener(
    "touchmove",
    (e) => {
      if (activePointerId === null) return;
      
      // Find the active touch
      let currentTouch = null;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activePointerId) {
            currentTouch = e.changedTouches[i];
            break;
        }
      }
      if (!currentTouch) return;

      // Prevent default scrolling behavior
      if (e.cancelable) {
         e.preventDefault();
      }

      const deltaX = currentTouch.clientX - touchStartX;
      const deltaY = currentTouch.clientY - touchStartY;

      // Vertical Swipe (Wheelie) - Check this first or independently
      // If swiping UP significantly
      if (deltaY < -WHEELIE_THRESHOLD) {
         setKey(" ", true);
      } else {
         setKey(" ", false);
      }

      // Horizontal Swipe (Movement)
      if (deltaX < -GESTURE_THRESHOLD) {
        // Move Left
        setKey("ArrowLeft", true);
        setKey("ArrowRight", false);
        isMoving = true;
      } else if (deltaX > GESTURE_THRESHOLD) {
        // Move Right
        setKey("ArrowRight", true);
        setKey("ArrowLeft", false);
        isMoving = true;
      } else {
        // Within deadzone, stop if we were moving
        if (isMoving) {
          setKey("ArrowLeft", false);
          setKey("ArrowRight", false);
          isMoving = false;
        }
      }
    },
    { passive: false }
  );

  // Handle touch end/cancel
  const endTouch = (e) => {
     let hasActive = false;
     for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activePointerId) {
            hasActive = true;
            break;
        }
     }
     if (!hasActive) return;

    setKey("ArrowLeft", false);
    setKey("ArrowRight", false);
    setKey(" ", false);
    isMoving = false;
    activePointerId = null;
  };

  document.addEventListener("touchend", endTouch);
  document.addEventListener("touchcancel", endTouch);

  // Handle Instruction Overlay
  const gestureInfo = document.getElementById("gesture-info");
  const closeBtn = document.getElementById("close-gesture-info");

  if (closeBtn && gestureInfo) {
    closeBtn.addEventListener("click", () => {
        gestureInfo.classList.add("hidden");
        // Optional: save preference to localStorage?
    });
  }

  // Expose showGestureInfo for splash.js
  window.showGestureInfo = function() {
      // Check if mobile
      const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
      if (isTouch && gestureInfo) {
          gestureInfo.classList.remove("hidden");
      }
  };

  // Adjust UI Text for Mobile
  function updateMobileText() {
    const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    if (isTouch) {
        // Interaction Prompt
        const interactPrompt = document.querySelector("#interaction-prompt span");
        if (interactPrompt) {
            interactPrompt.innerHTML = "Tap untuk Interaksi";
        }
    }
  }

  // Run on load
  updateMobileText();

})();

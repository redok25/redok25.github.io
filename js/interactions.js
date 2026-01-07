// ===================================
// INTERACTIONS.JS - Interaction System
// ===================================

class InteractionManager {
  constructor(player, world) {
    this.player = player;
    this.world = world;
    this.interactionRange = 150;
    this.currentNearbyObject = null;
    this.nextOffscreenObject = null;
    this.promptElement = document.getElementById("interaction-prompt");
    this.tooltipElement = document.getElementById("interaction-tooltip");
    this.tooltipLabel = document.getElementById("tooltip-label-text");

    // Setup interaction key listener
    this.setupKeyListener();

    // Setup click listener for prompt (Touch support)
    if (this.promptElement) {
      this.promptElement.addEventListener("click", (e) => {
        e.preventDefault();
        this.tryInteract();
      });
    }
  }

  setupKeyListener() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "e" || e.key === "E") {
        this.tryInteract("key");
      }
    });
  }

  update(cameraX) {
    const playerBounds = this.player.getBounds();
    const playerCenterX = playerBounds.x + playerBounds.width / 2;

    // Check for nearby objects (Static Objects + Regular NPCs only)
    let nearestObject = null;
    let nearestDistance = Infinity;

    // Combine static objects and regular NPCs (NOT SpecialNPC)
    const staticObjects = this.world.getObjects() || [];
    const npcs = this.world.npcs || [];
    const allObjects = [...staticObjects, ...npcs];

    // Find nearest object within interaction range (for on-screen prompt)
    allObjects.forEach((obj) => {
      // Skip if obj doesn't have essential props (safety)
      if (typeof obj.x !== "number") return;

      // Skip SpecialNPC instances
      if (obj instanceof SpecialNPC) return;

      const width = obj.width || 64;
      const objCenterX = obj.x + width / 2;
      const distance = Math.abs(playerCenterX - objCenterX);

      if (distance < this.interactionRange && distance < nearestDistance) {
        nearestDistance = distance;
        nearestObject = obj;
      }
    });

    // Find nearest interactable object overall (used to show offscreen tooltip)
    let closestObj = null;
    let closestDist = Infinity;

    // Only track static objects for offscreen tooltip
    this.world.getObjects().forEach((obj) => {
      const objCenterX = obj.x + (obj.width || 64) / 2;
      const distance = Math.abs(playerCenterX - objCenterX);
      if (distance < closestDist) {
        closestDist = distance;
        closestObj = obj;
      }
    });

    // Determine if the closest object is offscreen (not visible in viewport)
    if (
      closestObj &&
      typeof cameraX === "number" &&
      this.world &&
      this.world.canvas
    ) {
      const canvasW = this.world.canvas.width;
      const objLeft = closestObj.x - cameraX;
      const objRight = objLeft + (closestObj.width || 64);
      if (objRight < 0 || objLeft > canvasW) {
        this.nextOffscreenObject = closestObj;
      } else {
        this.nextOffscreenObject = null;
      }
    } else {
      this.nextOffscreenObject = null;
    }

    // Update prompt
    if (nearestObject !== this.currentNearbyObject) {
      this.currentNearbyObject = nearestObject;
      this.updatePrompt();
    }

    // Update tooltip DOM for offscreen object
    this.updateTooltip(cameraX);
  }

  updatePrompt() {
    if (this.currentNearbyObject) {
      // Check if it's a regular NPC (not SpecialNPC)
      const isRegularNPC =
        this.currentNearbyObject instanceof NPC &&
        !(this.currentNearbyObject instanceof SpecialNPC);

      // Show prompt for static objects and regular NPCs
      if (!isRegularNPC) {
        this.promptElement.classList.remove("hidden");
      } else {
        // Regular NPCs only trigger on click, not E key
        this.promptElement.classList.add("hidden");
      }
    } else {
      this.promptElement.classList.add("hidden");
    }
  }

  updateTooltip(cameraX) {
    try {
      if (!this.tooltipElement) return;

      if (this.nextOffscreenObject) {
        // show tooltip and set label
        const obj = this.nextOffscreenObject;
        const label = obj.label || obj.type || "Objek";
        if (this.tooltipLabel) this.tooltipLabel.textContent = label;

        // determine side (left/right) based on object screen position
        const canvasW = this.world.canvas.width;
        const objCenterScreen = obj.x - cameraX + (obj.width || 64) / 2;
        if (objCenterScreen < 0) {
          this.tooltipElement.setAttribute("data-side", "left");
          this.tooltipElement.querySelector(".tooltip-arrow").textContent = "◀";
        } else if (objCenterScreen > canvasW) {
          this.tooltipElement.setAttribute("data-side", "right");
          this.tooltipElement.querySelector(".tooltip-arrow").textContent = "▶";
        }

        this.tooltipElement.classList.remove("hidden");
        this.tooltipElement.setAttribute("aria-hidden", "false");
      } else {
        this.tooltipElement.classList.add("hidden");
        this.tooltipElement.setAttribute("aria-hidden", "true");
      }
    } catch (e) {
      // fail silently if DOM not present
    }
  }

  tryInteract(source = "unknown") {
    if (this.currentNearbyObject && window.game && !window.game.paused) {
      const obj = this.currentNearbyObject;

      // Check if it's a regular NPC
      const isRegularNPC = obj instanceof NPC && !(obj instanceof SpecialNPC);

      // If Interaction triggered by 'E' Key (source === 'key'), ignore regular NPCs
      if (isRegularNPC && source === "key") {
        return;
      }

      // Handle interactions
      if (isRegularNPC) {
        // Regular NPCs only trigger on click
        if (typeof obj.triggerChat === "function") {
          obj.triggerChat();
        }
      } else if (obj.modalId) {
        // Static objects with modals
        openModal(obj.modalId);
      }
    }
  }

  render(ctx, cameraX) {
    // Render interaction indicators above objects
    if (this.currentNearbyObject) {
      const obj = this.currentNearbyObject;

      // Only show indicator for static objects (not NPCs)
      const isNPC = obj instanceof NPC || obj instanceof SpecialNPC;
      if (isNPC) return;

      const screenX = obj.x - cameraX + obj.width / 2;
      const screenY = obj.y - 20;

      // Draw floating indicator
      ctx.save();
      ctx.fillStyle = "#38b764";
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 4;
      ctx.fillText("▼", screenX, screenY + Math.sin(Date.now() * 0.005) * 5);
      ctx.restore();
    }
  }
}

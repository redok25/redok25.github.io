// ===================================
// INTERACTIONS.JS - What E and a tap reach (W3), stamps and "Tujuan:" (W4).
// E picks one target in range by rank: station > special NPC > billboard > regular NPC,
// then distance (R19 for taps: the one drawn on top under the point). Both are inert
// during the opening ride and a minigame course (R20).
// ===================================
import { JOR } from "./helpers.js";
import { openModal, openProjectsYear } from "./content.js";
import { app } from "./state.js";
import { save, getStamps, addStamp } from "./save.js";

// E priority (W3): station > special NPC > billboard > regular NPC, then distance.
export const KIND_RANK = { station: 0, special: 1, billboard: 2, npc: 3 };

// True when a candidate (rank, dist) beats the current best; a tie keeps the first one.
export function beats(rank, dist, bestRank, bestDist) {
  return rank < bestRank || (rank === bestRank && dist < bestDist);
}

// "Tujuan:" (W4): the station nearest to the bike whose id is not stamped yet, or null once
// all four are. Billboards are never stations, so they can never be the destination.
export function nextDestination(stations, stamps, centerX) {
  let best = null;
  let bestDist = Infinity;
  for (const s of stations) {
    if (stamps.includes(s.id)) continue;
    const dist = Math.abs(centerX - (s.x + (s.width || 64) / 2));
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  return best;
}

const RANGE = 150; // px between the bike's centre and a target's centre

// Tap order (R19): front to back as world.render draws them (special NPCs over regular
// NPCs over billboards over stations).
const TAP_ORDER = [
  ["specialNPCs", "special"],
  ["npcs", "npc"],
  ["billboards", "billboard"],
  ["objects", "station"],
];

// A point inside an entity's box (world x, screen y). NaN-safe: a station whose sprite has
// not loaded yet has no width and never hits.
function inBox(o, x, y) {
  return x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height;
}

export class InteractionManager {
  constructor(player, world) {
    this.player = player;
    this.world = world;
    this.currentNearbyObject = null;
    this.currentKind = null;
    this.nextOffscreenObject = null;
    this.stamps = getStamps(save); // cached: changes only through stamp()
    this.promptElement = document.getElementById("interaction-prompt");
    this.tooltipElement = document.getElementById("interaction-tooltip");
    this.tooltipLabel = document.getElementById("tooltip-label-text");

    this.setupKeyListener();

    // Tap on the prompt (touch): the same as E.
    if (this.promptElement) {
      this.promptElement.addEventListener("click", (e) => {
        e.preventDefault();
        this.tryInteract();
      });
    }
  }

  setupKeyListener() {
    document.addEventListener("keydown", (e) => {
      if (JOR.shouldIgnoreGameKey(e, document)) return;
      if (e.code === "KeyE" && !e.repeat) this.tryInteract();
    });
  }

  // No targets before the opening ride ends, during it, or during a minigame course (R20).
  isInert() {
    const game = app.game;
    return !game || !this.player.lockBacktrack || !!game.minigames.activeMinigame;
  }

  // One list, one kind: keeps the best candidate in fields (no array or closure per step).
  scan(list, kind, centerX) {
    if (!list) return;
    const rank = KIND_RANK[kind];
    for (let i = 0; i < list.length; i++) {
      const obj = list[i];
      if (typeof obj.x !== "number") continue;
      const dist = Math.abs(centerX - (obj.x + (obj.width || 64) / 2));
      if (dist < RANGE && beats(rank, dist, this._bestRank, this._bestDist)) {
        this._best = obj;
        this._bestKind = kind;
        this._bestRank = rank;
        this._bestDist = dist;
      }
    }
  }

  // Once per sim step (game.update), with the sim camera.
  update(cameraX) {
    const centerX = this.player.x + this.player.width / 2;
    const inert = this.isInert();
    this._best = null;
    this._bestKind = null;
    this._bestRank = Infinity;
    this._bestDist = Infinity;
    if (!inert) {
      this.scan(this.world.objects, "station", centerX);
      this.scan(this.world.specialNPCs, "special", centerX);
      this.scan(this.world.billboards, "billboard", centerX);
      this.scan(this.world.npcs, "npc", centerX);
    }

    // "Tujuan:" (W4): the nearest unstamped station, shown only while it is fully off-screen
    // and no E target is in range (on phones the tooltip would sit on the prompt).
    const dest = inert || (this._best && this._bestKind !== "npc") ? null : nextDestination(this.world.objects, this.stamps, centerX);
    let off = null;
    if (dest && typeof cameraX === "number") {
      const left = dest.x - cameraX;
      if (left + (dest.width || 64) < 0 || left > this.world.canvas.width) off = dest;
    }
    this.nextOffscreenObject = off;

    if (this._best !== this.currentNearbyObject) {
      this.currentNearbyObject = this._best;
      this.currentKind = this._bestKind;
      this.updatePrompt();
    }
  }

  // The prompt is for E targets; a regular NPC chats on a tap of the NPC itself.
  updatePrompt() {
    if (!this.promptElement) return;
    const show = !!this.currentNearbyObject && this.currentKind !== "npc";
    this.promptElement.classList.toggle("hidden", !show);
  }

  // Called once per frame with the drawn camera; writes to the DOM only when something changed.
  syncTooltip(cameraX) {
    try {
      if (!this.tooltipElement) return;

      const obj = this.nextOffscreenObject;
      if (obj) {
        const label = obj.label || obj.type || "Objek";
        if (this.tooltipLabel && label !== this._tipLabel) {
          this.tooltipLabel.textContent = label;
          this._tipLabel = label;
        }

        // determine side (left/right) based on object screen position
        const canvasW = this.world.canvas.width;
        const objCenterScreen = obj.x - cameraX + (obj.width || 64) / 2;
        const side = objCenterScreen < 0 ? "left" : objCenterScreen > canvasW ? "right" : this._tipSide;
        if (side && side !== this._tipSide) {
          this.tooltipElement.setAttribute("data-side", side);
          this.tooltipElement.querySelector(".tooltip-arrow").textContent = side === "left" ? "◀" : "▶";
          this._tipSide = side;
        }
      }

      const visible = !!obj;
      if (visible !== this._tipVisible) {
        this.tooltipElement.classList.toggle("hidden", !visible);
        this.tooltipElement.setAttribute("aria-hidden", visible ? "false" : "true");
        this._tipVisible = visible;
      }
    } catch (e) {
      // fail silently if DOM not present
    }
  }

  // E or a tap on the prompt.
  tryInteract() {
    const game = app.game;
    if (!game || game.paused || this.isInert() || !this.currentNearbyObject) return;
    if (this.currentKind === "npc") return; // regular NPCs chat on a tap of the NPC itself
    this.activate(this.currentNearbyObject, this.currentKind);
  }

  // A canvas tap (game.js click handler), in world x and screen y: the target drawn on top
  // under the point wins, at any distance from the bike (R19). Returns true on a hit.
  tapAt(worldX, y) {
    const game = app.game;
    if (!game || game.paused || this.isInert()) return false;
    for (const [key, kind] of TAP_ORDER) {
      const list = this.world[key];
      if (!list) continue;
      for (let i = list.length - 1; i >= 0; i--) {
        const o = list[i];
        if (o.loaded === false) continue; // an NPC not drawn yet cannot be tapped
        if (inBox(o, worldX, y)) {
          this.activate(o, kind);
          return true;
        }
      }
    }
    return false;
  }

  // One action per kind; E, the prompt and a canvas tap all end here.
  activate(obj, kind) {
    if (kind === "station") {
      this.stamp(obj.id);
      openModal(obj.modalId);
    } else if (kind === "billboard") {
      this.stamp("projects"); // a billboard is the project list too (R10)
      openProjectsYear(obj.year);
    } else if (kind === "special") {
      app.game.minigames.startMinigame(obj.minigameId);
    } else if (kind === "npc") {
      obj.triggerChat();
    }
  }

  stamp(id) {
    if (addStamp(save, id)) this.stamps = getStamps(save);
  }

  // The ▼ marker over a station or billboard in E range (NPCs have their own badges/bubbles).
  render(ctx, cameraX) {
    const obj = this.currentNearbyObject;
    if (!obj || (this.currentKind !== "station" && this.currentKind !== "billboard")) return;
    const screenX = obj.x - cameraX + (obj.width || 64) / 2;
    const screenY = obj.y - 20;
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

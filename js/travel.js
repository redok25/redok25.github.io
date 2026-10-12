// ===================================
// TRAVEL.JS - The one fade-teleport (R13). Fast travel (W5), the minigame start and the
// return to the NPC (W6), redok.goto (T2) and the credits replay all go black, move the
// bike, sync the chapter at the black frame (R12) and fade back in. Nothing else writes
// #fade-overlay. Game graph only; no DOM work at load (tests/check.html imports minigames).
// ===================================
import { JOR } from "./helpers.js";

export const TRAVEL_OWNER = "travel";
const FADE_MS = 1000; // = the .fade-overlay opacity transition (css/partials/minigame.css)

// Fade to black, put the bike's left edge at x (standing, facing right), fade back in.
// Returns false and does nothing while another travel runs or a scripted move owns the
// bike (the offscreen "Kembali" return would snap it back). The "travel" pause owner is
// taken right here, synchronously, so no sim step runs under the black: a course cannot
// end, a click cannot start a minigame, and no title card fires before the move.
export function fadeTeleport(game, { x, onBlack = null, onDone = null }) {
  const p = game.player;
  if (game._traveling || p.splashMoving || game.offscreenModalActive) return false;
  game._traveling = true;
  JOR.holdPause(game, TRAVEL_OWNER);
  game.releaseInput();
  const overlay = document.getElementById("fade-overlay");
  if (overlay) overlay.style.opacity = "1";
  setTimeout(() => {
    try {
      p.x = x;
      p.velocityX = 0;
      p.wheelieActive = false;
      p.wheelieRotation = 0;
      p.currentAnimation = "idle";
      p.facingRight = true;
      game.camera.jumpTo(x - game.canvas.width / 3);
      game.syncChapterAt(x + p.width / 2);
      if (onBlack) onBlack();
    } finally {
      if (overlay) overlay.style.opacity = "0";
      setTimeout(() => {
        JOR.releasePause(game, TRAVEL_OWNER);
        game._traveling = false;
        if (onDone) onDone();
      }, FADE_MS);
    }
  }, FADE_MS);
  return true;
}

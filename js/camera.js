// ===================================
// CAMERA.JS - The one camera: smooth follow, world clamp and the backtrack lock
// (after the opening ride the view never returns left of the ride's end).
// Scripted scenes and minigame teleports use the same object instead of writing cameraX.
// ===================================
export class Camera {
  constructor(game) {
    this.game = game;
    this.x = 0;
  }

  bounds() {
    const { player, world, canvas } = this.game;
    const locked = player && player.lockBacktrack && typeof player.minX === "number";
    return {
      min: locked ? Math.max(0, player.minX - canvas.width / 3) : 0,
      max: Math.max(0, world.worldWidth - canvas.width),
    };
  }

  clamp(x) {
    const { min, max } = this.bounds();
    return Math.max(min, Math.min(x, max));
  }

  follow(smoothing) {
    const target = this.game.player.x - this.game.canvas.width / 3;
    this.x = this.clamp(this.x + (target - this.x) * smoothing);
  }

  jumpTo(x) {
    this.x = this.clamp(x);
  }
}

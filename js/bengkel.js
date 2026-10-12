// ===================================
// BENGKEL.JS - "Mode Bengkel" v1 (F16): live perf panel drawn on the canvas.
// Backtick toggles it. ?bengkel opens it on load (phones have no backtick), and
// ?bengkel=<cheat> runs that cheat once after the opening ride (no keyboard needed).
// "work" = ms spent inside one gameLoop body (sim steps + render): the 16.7 ms budget.
// FPS comes from the rAF interval and is shown separately.
// ===================================
const SAMPLES = 120;
const BUDGET_MS = 1000 / 60;

export class Bengkel {
  constructor(game) {
    this.game = game;
    const param = new URLSearchParams(location.search).get("bengkel");
    this.on = param !== null;
    // Untrusted input: only a name that exists in the cheat table is ever run.
    this.pendingCheat = param || null;
    this.work = new Float32Array(SAMPLES);
    this.interval = new Float32Array(SAMPLES);
    this.steps = new Uint8Array(SAMPLES);
    this.n = 0;
  }

  toggle() {
    this.on = !this.on;
  }

  record(intervalMs, workMs, steps) {
    const i = this.n % SAMPLES;
    this.work[i] = workMs;
    this.interval[i] = intervalMs;
    this.steps[i] = steps;
    this.n++;
    const g = this.game;
    if (this.pendingCheat && !g.paused && !g._splashCameraActive && g.player.lockBacktrack) {
      const name = this.pendingCheat;
      this.pendingCheat = null;
      if (g.cheats && Object.hasOwn(g.cheats, name)) g.cheats[name]();
    }
  }

  p95() {
    const count = Math.min(this.n, SAMPLES);
    if (!count) return 0;
    const sorted = Array.from(this.work.subarray(0, count)).sort((a, b) => a - b);
    return sorted[Math.min(count - 1, Math.floor(count * 0.95))];
  }

  render(ctx) {
    const count = Math.min(this.n, SAMPLES);
    if (!count) return;
    const g = this.game;
    let intervalSum = 0;
    const hist = [0, 0, 0, 0];
    for (let k = 0; k < count; k++) {
      intervalSum += this.interval[k];
      hist[Math.min(3, this.steps[k])]++;
    }
    const fps = intervalSum > 0 ? (1000 * count) / intervalSum : 0;
    const p95 = this.p95();
    // y = 70: the always-on Quick View button (DOM, fixed top-left, z-index above the canvas) ends near y 64.
    const x = 10, y = 70, w = 300, h = 168, graphH = 40, graphY = y + 118;

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(x, y, w, h);
    ctx.font = "12px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = p95 <= BUDGET_MS ? "#7CFC7C" : "#ff8a65";
    ctx.fillText(`MODE BENGKEL  ${fps.toFixed(0)} fps  work p95 ${p95.toFixed(1)} ms`, x + 8, y + 8);
    ctx.fillStyle = "#e0e0e0";
    ctx.fillText(`steps/frame 0:${hist[0]} 1:${hist[1]} 2:${hist[2]} 3:${hist[3]}`, x + 8, y + 26);
    const fx = g.effects;
    ctx.fillText(
      `awan ${fx.visibleCloudCount(g.cameraX)}/${fx.clouds.length}  partikel ${fx.particles.length}  hujan ${fx.rainParticles.length}`,
      x + 8, y + 44
    );
    ctx.fillText(`x ${Math.round(g.player.x)}  cam ${Math.round(g.cameraX)}  v ${g.player.velocityX.toFixed(2)}`, x + 8, y + 62);
    ctx.fillText(`owners ${[...(g._pauseOwners || [])].join(",") || "-"}`, x + 8, y + 80);

    // Sparkline of work ms, oldest to newest; the line marks the 16.7 ms budget (at 2x budget = top).
    const scaleY = graphH / (BUDGET_MS * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(x + 8, graphY + graphH - BUDGET_MS * scaleY);
    ctx.lineTo(x + w - 8, graphY + graphH - BUDGET_MS * scaleY);
    ctx.stroke();
    ctx.strokeStyle = "#7CFC7C";
    ctx.beginPath();
    const start = this.n - count;
    for (let k = 0; k < count; k++) {
      const v = Math.min(BUDGET_MS * 2, this.work[(start + k) % SAMPLES]);
      const px = x + 8 + (k * (w - 16)) / (SAMPLES - 1);
      const py = graphY + graphH - v * scaleY;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }
}

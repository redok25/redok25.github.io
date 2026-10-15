// ===================================
// BENGKEL.JS - "Mode Bengkel" (F16 v1, T1 v2): the workshop view for curious devs.
// Backtick toggles it. ?bengkel opens it on load (phones have no backtick), and
// ?bengkel=<cheat> runs that cheat once after the opening ride (no keyboard needed).
// Two halves (R1): the canvas panel (numbers, sparkline, the light buffer), drawn by gameLoop
// after the timed block, and the DOM aside #bengkel (toggles, "lihat source", the save JSON),
// written on change only. The views (R3-R6) are off by default, never stored, and all go off
// with the panel: layers 1-5 hidden (world.hideLayers), hitboxes + Kopi #5 (an overlay drawn
// with the drawn camera), the light buffer, and the sim at 0.25x (simScale). "Ringkas"
// (compact, on by default on phones) keeps the scene visible: the panel's first row only, and
// the aside's views row (p5 critique B-2).
// "work" = ms spent inside one gameLoop body (sim steps + render): the 16.7 ms budget; "sim" is
// its share before render. FPS comes from the rAF interval and is shown separately.
// ===================================
import { JOR } from "./helpers.js";
import { COPY } from "./copy.js";
import { unlock } from "./achievements.js";
import { save } from "./save.js";
import { LIGHT_CAP, createTier, tierStep } from "./lighting.js";
import { KOPI, KOPI_SIZE, KOPI_RADIUS, kopiShown } from "./kopi.js";
import { CHAPTERS } from "./journey.js";
import { RANGE } from "./interactions.js";
import { GAUGE_RADIUS } from "./world.js";
import { FACE_RANGE, ALERT_RANGE } from "./npc.js";

const SAMPLES = 120;
const BUDGET_MS = 1000 / 60;
export const SLOW = 0.25; // R4: the sim rate of the slow view
// Panel geometry. w 340: the widest row is ~45 chars of 12 px monospace, and 10 + 340 still
// fits 375 portrait. y 70: under the Quick View button (it ends near y 64); the aside stands to
// its right. At <= 500 px the journey strip has that row (journey.css, y 72-104): the aside
// starts at 112 there (ui.css, fixed) and the panel is drawn under it. So no view toggle ever
// moves an aside button: only the canvas below it grows (p5 critique B-1).
const PANEL_X = 10;
const PANEL_W = 340;
const PANEL_Y = 70;
const ASIDE_TOP_NARROW = 112; // = ui.css .bengkel top at <= 500 px
const NARROW = "(max-width: 500px)";
const COMPACT = "(max-width: 500px), (max-height: 500px)"; // phones open in Ringkas
const ROW = 18; // px per text row
const ROWS = 9;
const GRAPH_H = 40;
const PANEL_H = 8 + ROWS * ROW + 4 + GRAPH_H + 8; // 222
const PANEL_H_COMPACT = 8 + ROW + 8; // 34: row 1 only
const ASIDE_GAP = 6;
const phone = () => typeof matchMedia === "function" && matchMedia(COMPACT).matches;
// Hitbox view colours, in COPY.bengkel.legend order.
const INK = ["#4fc3f7", "#38b764", "#ffd54f", "#ff8a65", "#fff6c8", "#ff80ab"];
const [BOX, REACH, FACE, ALERT, GAUGE, CUP] = INK;

export class Bengkel {
  constructor(game) {
    this.game = game;
    const param = new URLSearchParams(location.search).get("bengkel");
    this.on = param !== null;
    if (this.on) unlock("insinyur"); // P5: ?bengkel opens the workshop too (phones have no backtick)
    // Untrusted input: only a name that exists in the cheat table is ever run.
    this.pendingCheat = param || null;
    this.work = new Float32Array(SAMPLES);
    this.sim = new Float32Array(SAMPLES); // R2: the update share of work
    this.draw = new Float32Array(SAMPLES); // R2: work - sim (render and the UI sync)
    this.interval = new Float32Array(SAMPLES);
    this.steps = new Uint8Array(SAMPLES);
    this.sorted = new Float32Array(SAMPLES); // p95 scratch: no array per frame
    this.n = 0;
    this.tier = createTier(); // V10: the 2 s work window (lighting.js tierStep)
    // Views (R3-R6): off by default, never stored, all off again when the panel closes.
    this.hitbox = false;
    this.light = false;
    this.slow = false;
    this.compact = phone(); // Ringkas: set again on every open, never stored
    this.t = {}; // the panel rows' tokens, refilled per panel frame
    this.asideH = 0; // the aside's height, px (a ResizeObserver writes it: never read per frame)
    this.rev = -1; // the save revision its JSON shows
    this.locked = null; // the slow toggle's last disabled state
    this.el = document.getElementById("bengkel");
    if (this.el) this.bindAside();
  }

  // The DOM half (R1): labels from COPY once, then one click handler. A clicked button hands the
  // keys back to the bike (blur); a held Space/Enter never presses one again (R29).
  bindAside() {
    const el = this.el;
    const C = COPY.bengkel;
    const q = (s) => el.querySelector(s);
    el.setAttribute("aria-label", C.title);
    q(".bengkel-layers").textContent = C.layers;
    for (const b of el.querySelectorAll("[data-view]")) b.textContent = C[b.dataset.view];
    const source = q(".bengkel-source");
    const github = JOR.contactLinks(document).github; // R7: the Quick View link, no new URL
    source.textContent = C.source;
    if (github) source.href = github;
    else source.hidden = true;
    q(".bengkel-close").textContent = C.close;
    q(".bengkel-save summary").textContent = C.save;
    this.pre = q(".bengkel-save pre");
    this.slowBtn = q('[data-view="slow"]');
    el.addEventListener("keydown", (e) => {
      if (e.repeat && (e.key === " " || e.key === "Enter")) e.preventDefault();
    });
    el.addEventListener("click", (e) => {
      // The source link too: it opens its tab and gives the keys back (R1, critique B-5).
      const b = e.target.closest("button, summary, a");
      if (!b) return;
      b.blur();
      if (b.dataset.layer) this.game.world.hideLayers ^= 1 << Number(b.dataset.layer);
      else if (b.dataset.view) this[b.dataset.view] = !this[b.dataset.view];
      else if (b.classList.contains("bengkel-close")) return this.toggle();
      this.sync();
    });
    // The panel is drawn under the aside on phones: its height, on change only (Ringkas, the
    // JSON opened, a rotation re-wrapping the rows).
    if (typeof ResizeObserver === "function") new ResizeObserver(() => (this.asideH = el.offsetHeight)).observe(el);
    this.sync();
  }

  // The aside's shown state and pressed buttons, written on a toggle or a click only.
  sync() {
    if (!this.el) return;
    this.el.hidden = !this.on;
    this.el.classList.toggle("is-compact", this.compact);
    const hide = this.game.world.hideLayers;
    for (const b of this.el.querySelectorAll("[data-layer]")) {
      b.setAttribute("aria-pressed", String(!!(hide & (1 << Number(b.dataset.layer)))));
    }
    for (const b of this.el.querySelectorAll("[data-view]")) b.setAttribute("aria-pressed", String(this[b.dataset.view]));
  }

  toggle() {
    this.on = !this.on;
    if (this.on) {
      unlock("insinyur"); // P5 Insinyur
      this.compact = phone();
    } else {
      // Closing the panel ends every view: nothing stays slow, hidden or x-rayed off-screen.
      this.hitbox = this.light = this.slow = false;
      this.game.world.hideLayers = 0;
    }
    this.rev = -1; // the aside is synced again on the next panel frame
    this.locked = null;
    this.sync();
  }

  // R4: the sim rate, read once per unpaused frame by game.gameLoop (dt * scale into
  // fixedSteps). Exactly 1 unless the slow view is on, and 1 while a minigame course runs or
  // its start modal waits: bests, achievements and ghosts count sim steps.
  simScale() {
    if (!this.slow) return 1;
    const mg = this.game.minigames;
    return mg.activeMinigame || mg.pendingMinigame ? 1 : SLOW;
  }

  record(intervalMs, workMs, steps, simMs = 0) {
    const i = this.n % SAMPLES;
    this.work[i] = workMs;
    this.sim[i] = simMs;
    this.draw[i] = workMs - simMs;
    this.interval[i] = intervalMs;
    this.steps[i] = steps;
    this.n++;
    const g = this.game;
    if (!g.effects.low && tierStep(this.tier, intervalMs, workMs, steps, g.paused)) g.effects.low = true;
    if (this.pendingCheat && !g.paused && !g._splashCameraActive && g.player.lockBacktrack) {
      const name = this.pendingCheat;
      this.pendingCheat = null;
      // record() runs outside the loop's try/catch: a failing cheat must not stop the loop.
      try {
        if (g.cheats && Object.hasOwn(g.cheats, name)) g.cheats[name]();
      } catch (e) {
        console.error("Bengkel cheat failed:", name, e);
      }
    }
  }

  // 95th percentile of a ring's recorded frames, sorted in the preallocated scratch (a typed
  // array sorts numerically in place; the unused tail is +Infinity, so it sorts last).
  p95(ring = this.work) {
    const count = Math.min(this.n, SAMPLES);
    if (!count) return 0;
    const s = this.sorted;
    s.set(ring);
    s.fill(Infinity, count);
    s.sort();
    return s[Math.min(count - 1, Math.floor(count * 0.95))];
  }

  // The overlay pass and the panel; gameLoop calls it after the timed block while the panel is on.
  render(ctx) {
    const g = this.game;
    if (this.hitbox) this.renderHitboxes(ctx, g, g.drawnCameraX);
    const count = Math.min(this.n, SAMPLES);
    if (!count) return;
    let intervalSum = 0;
    const hist = [0, 0, 0, 0];
    for (let k = 0; k < count; k++) {
      intervalSum += this.interval[k];
      hist[Math.min(3, this.steps[k])]++;
    }
    const fps = intervalSum > 0 ? (1000 * count) / intervalSum : 0;
    const p95 = this.p95();
    const C = COPY.bengkel;
    const x = PANEL_X, w = PANEL_W;
    const narrow = (this.narrowMq ??= matchMedia(NARROW)).matches;
    const y = narrow ? ASIDE_TOP_NARROW + this.asideH + ASIDE_GAP : PANEL_Y;
    const rowsH = this.compact ? PANEL_H_COMPACT : PANEL_H;
    // Below the rows: the hitbox legend, then the light buffer (R6) at its own resolution (one
    // buffer px per screen px: no row dropped or doubled, critique B-4), shrunk only when the
    // screen has no room left; or one line of text when nothing is lit this frame.
    const L = g.lighting;
    const legendH = this.hitbox ? ROW : 0;
    const lit = this.light && L.draws > 0;
    const h = rowsH + legendH + (this.light && !lit ? ROW : 0);
    this.syncAside();

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(x, y, w, h);
    ctx.font = "12px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = p95 <= BUDGET_MS ? "#7CFC7C" : "#ff8a65";
    ctx.fillText(`MODE BENGKEL  ${fps.toFixed(0)} fps  work p95 ${p95.toFixed(1)} ms`, x + 8, y + 8);
    if (!this.compact) this.renderRows(ctx, g, x, y, w, count, hist);

    let ly = y + rowsH;
    if (this.hitbox) {
      let lx = x + 8;
      for (let i = 0; i < INK.length; i++) {
        ctx.fillStyle = INK[i];
        ctx.fillText(C.legend[i], lx, ly);
        lx += ctx.measureText(C.legend[i]).width + 14;
      }
      ly += ROW;
    }
    if (lit) {
      // The 1/4-res darkness map as it is (R6): over a light backdrop the cut pools read light.
      const k = Math.max(0.25, Math.min(1, (g.canvas.width - 2 * x - 16) / L.buf.width, (g.canvas.height - ly - 16) / L.buf.height));
      const bw = Math.round(L.buf.width * k);
      const bh = Math.round(L.buf.height * k);
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(x, ly, Math.max(w, bw + 16), bh + 8);
      ctx.fillStyle = "#e0e0e0";
      ctx.fillRect(x + 8, ly, bw, bh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(L.buf, x + 8, ly, bw, bh);
    } else if (this.light) {
      ctx.fillStyle = "#e0e0e0";
      ctx.fillText(C.lightOff, x + 8, ly);
    }
    ctx.restore();
  }

  // Rows 2-9 (R2) and the work sparkline: the full panel only (not in Ringkas).
  renderRows(ctx, g, x, y, w, count, hist) {
    const graphH = GRAPH_H;
    const C = COPY.bengkel;
    const L = g.lighting;
    ctx.fillStyle = "#e0e0e0";
    const t = this.t;
    const fx = g.effects;
    t.sim = this.p95(this.sim).toFixed(1);
    t.draw = this.p95(this.draw).toFixed(1);
    t.scale = this.simScale();
    let ty = y + 8 + ROW;
    ctx.fillText(JOR.fillTokens(C.rows.split, t), x + 8, ty);
    ctx.fillText(`steps/frame 0:${hist[0]} 1:${hist[1]} 2:${hist[2]} 3:${hist[3]}`, x + 8, (ty += ROW));
    ctx.fillText(
      `awan ${fx.visibleCloudCount(g.cameraX)}/${fx.clouds.length}  partikel ${fx.particles.length}  hujan ${fx.rainParticles.length}`,
      x + 8, (ty += ROW)
    );
    t.snow = fx.snowFlakes.length;
    t.npc = g.world.npcs.length;
    t.special = g.world.specialNPCs.length;
    ctx.fillText(JOR.fillTokens(C.rows.count, t), x + 8, (ty += ROW));
    ctx.fillText(`cahaya ${L.lights}/${LIGHT_CAP}  draw ${L.draws}  kunang ${L.flies}  tier ${fx.low ? "hemat" : "normal"}`, x + 8, (ty += ROW));
    ctx.fillText(`owners ${[...(g._pauseOwners || [])].join(",") || "-"}`, x + 8, (ty += ROW));
    t.chapter = CHAPTERS[g.journey.current].label;
    t.x = Math.round(g.player.x);
    t.cam = Math.round(g.cameraX);
    t.v = g.player.velocityX.toFixed(2);
    ctx.fillText(JOR.fillTokens(C.rows.place, t), x + 8, (ty += ROW));
    const kind = fx.weatherKind;
    t.kind = kind ? C.weather[kind] || kind : "-";
    t.code = fx.realCode ?? "-";
    t.kmh = Math.round(fx.realKmh);
    t.from = Math.round(fx.realFrom);
    t.wind = fx.realKmh != null && fx.realFrom != null ? JOR.fillTokens(C.rows.wind, t) : "-";
    ctx.fillText(JOR.fillTokens(C.rows.weather, t), x + 8, (ty += ROW));

    // Sparkline of work ms, oldest to newest; the line marks the 16.7 ms budget (at 2x budget = top).
    const graphY = y + 8 + ROWS * ROW + 4;
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
  }

  // The aside, on change only (R1): the slow toggle locked while a course runs or waits (R4),
  // the save JSON when the save moved (R2).
  syncAside() {
    if (!this.el) return;
    const mg = this.game.minigames;
    const locked = !!(mg.activeMinigame || mg.pendingMinigame);
    if (locked !== this.locked) {
      this.locked = locked;
      this.slowBtn.disabled = locked;
    }
    if (save.rev !== this.rev) {
      this.rev = save.rev;
      this.pre.textContent = save.json();
    }
  }

  // R5: every entity box and the 1-D ranges in world space with the drawn camera, over the
  // whole scene (unlit, readable). Ranges are x only (|bike centre - target centre|), drawn as
  // spans with end ticks: E reach around the bike, face and alert around each NPC, the fill
  // reach around each gauge, and the kopi reach as a column over each cup showing now.
  renderHitboxes(ctx, g, cam) {
    const w = g.world;
    const W = g.canvas.width;
    const ground = w.groundY();
    const p = g.player;
    const px = g.drawnPlayerX;
    ctx.save();
    ctx.translate(0, g.drawnShakeY || 0); // the landing thump the sprites got this frame (B-8)
    ctx.lineWidth = 2;
    ctx.strokeStyle = BOX;
    ctx.beginPath();
    boxes(ctx, w.objects, cam, W);
    boxes(ctx, w.billboards, cam, W);
    boxes(ctx, w.gauges, cam, W);
    boxes(ctx, w.specialNPCs, cam, W);
    boxes(ctx, w.npcs, cam, W);
    ctx.rect(px - cam, p.y, p.width, p.height);
    ctx.stroke();

    const bike = px + p.width / 2 - cam;
    ctx.strokeStyle = REACH;
    ctx.beginPath();
    span(ctx, bike, RANGE, ground + 8);
    ctx.moveTo(bike, p.y);
    ctx.lineTo(bike, ground + 16); // the bike's centre: every range is measured from it
    ctx.stroke();

    const npcs = w.npcs;
    ctx.strokeStyle = FACE;
    ctx.beginPath();
    for (let i = 0; i < npcs.length; i++) span(ctx, npcs[i].x + npcs[i].width / 2 - cam, FACE_RANGE, npcs[i].y + npcs[i].height + 4);
    ctx.stroke();
    ctx.strokeStyle = ALERT;
    ctx.beginPath();
    for (let i = 0; i < npcs.length; i++) span(ctx, npcs[i].x + npcs[i].width / 2 - cam, ALERT_RANGE, npcs[i].y + npcs[i].height + 10);
    ctx.stroke();

    const gauges = w.gauges;
    ctx.strokeStyle = GAUGE;
    ctx.beginPath();
    for (let i = 0; i < gauges.length; i++) span(ctx, gauges[i].x + gauges[i].width / 2 - cam, GAUGE_RADIUS, gauges[i].y - 6 - 4 * i);
    ctx.stroke();

    // Cups show where world.render shows them: not in the opening ride or a course (R9).
    if (p.lockBacktrack && !g.minigames.activeMinigame) this.renderCups(ctx, g, cam, ground);
    ctx.restore();
  }

  // Each cup not found that shows now: its reach column, and Kopi #5's sprite (R9), which only
  // this view ever draws.
  renderCups(ctx, g, cam, ground) {
    const fx = g.effects;
    const a = fx.currentTimeState ? fx.currentTimeState.a : 0;
    ctx.strokeStyle = CUP;
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath();
    for (let i = 0; i < KOPI.length; i++) {
      const cup = KOPI[i];
      if (g.kopi.includes(cup.id) || kopiShown(cup, a, fx.rainIntensity, true) <= 0) continue;
      const cx = cup.x - cam;
      const top = ground - cup.lift - KOPI_SIZE;
      ctx.rect(cx - KOPI_RADIUS, top, KOPI_RADIUS * 2, cup.lift + KOPI_SIZE);
      if (cup.when === "bengkel") ctx.drawImage(g.world.cupSprite, cx - KOPI_SIZE / 2, top, KOPI_SIZE, KOPI_SIZE);
    }
    ctx.stroke();
  }
}

// Entity boxes {x, y, width, height} (world x, screen y) into the current path, culled to the
// view. A sprite not loaded yet has no width: NaN never draws.
function boxes(ctx, list, cam, W) {
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    const x = o.x - cam;
    if (x + o.width >= 0 && x <= W) ctx.rect(x, o.y, o.width, o.height);
  }
}

// A 1-D range: a line from cx - r to cx + r at y, with an end tick on each side.
function span(ctx, cx, r, y) {
  ctx.moveTo(cx - r, y - 4);
  ctx.lineTo(cx - r, y + 4);
  ctx.moveTo(cx - r, y);
  ctx.lineTo(cx + r, y);
  ctx.moveTo(cx + r, y - 4);
  ctx.lineTo(cx + r, y + 4);
}

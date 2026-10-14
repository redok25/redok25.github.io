// ===================================
// LIGHTING.JS - Night lighting (V7) and the quality tier stepper (V10).
// A 1/4-res darkness map: filled with the night tint, cut with destination-out by banded
// stamps baked once, tinted with coloured stamps, then upscaled with smoothing off, so the
// night reads as 4 x 4 chunky pixels with warm pools. Its grid is anchored to the world
// (camera x snapped to SCALE), so a standing torch's pool never crawls while the road scrolls.
// The pure part (gate and fade, light list, bike points, fireflies, tier stepper) is up top:
// no DOM, node tests import it. The Lighting class touches the DOM in its constructor only.
// ===================================
import { KOPI, KOPI_SIZE, kopiShown } from "./kopi.js";
import { CHAPTERS } from "./journey.js";

export const SCALE = 4; // screen px per darkness pixel
export const LIGHT_CAP = 24; // bike + props + gauges + cups + fireflies, pushed in that order
export const DARK_NIGHT = 0.78; // darkness alpha at full night (currentTimeState.a >= 0.45)
export const NIGHT_INK = [16, 22, 60]; // darkness colour at full night (moonlit blue, not grey)
const BANDS = 5; // alpha steps per stamp: the rings read as pixel art, not a blur

// Night fade 0..1 (R7): the night cup's own ramp (kopi.js, a 0.25 -> 0.45), so the cup and
// the lights switch on in the same frame and nothing pops at 0.25.
const NIGHT_CUP = { when: "night" };
export const nightK = (a) => kopiShown(NIGHT_CUP, a, 0);
// Lighting draws only above the 0.25 line, and never on the low tier (R2): noon draws nothing.
export const lightingOn = (a, low) => !low && nightK(a) > 0;
// Darkness alpha and colour: equal to the flat tint (a, its rgb) at the 0.25 line, so the
// hand-over never pops; DARK_NIGHT and NIGHT_INK from 0.45 on. Colour packed 0xRRGGBB.
export const darkAlpha = (a) => a + (DARK_NIGHT - a) * nightK(a);
export function darkRgb(ts) {
  const k = nightK(ts.a);
  const r = Math.round(ts.r + (NIGHT_INK[0] - ts.r) * k);
  const g = Math.round(ts.g + (NIGHT_INK[1] - ts.g) * k);
  return (r << 16) | (g << 8) | Math.round(ts.b + (NIGHT_INK[2] - ts.b) * k);
}

// Banded falloff: strength 0..1 -> the nearest of BANDS alpha steps (a faint edge rounds to 0).
export const band = (f) => Math.round(Math.min(1, Math.max(0, f)) * BANDS) / BANDS;

// Light kinds. A cut reveals the scene under a pool; a tint stamp colours it (its alpha and
// any lit centre pixel are baked in). RED and FLY only shine: no cut, drawn 1:1.
export const CONE = 0; // headlight: lens + beam in one stamp, turned with the wheelie
export const WARM = 1; // torch, warung window, kopi cup: orange
export const PALE = 2; // gauge lamps: pale yellow, plus a bulb pixel on the sign
export const RED = 3; // tail light
export const FLY = 4; // firefly
const CUT = [0.95, 1, 0.95, 0, 0];

// The frame's lights, preallocated (no per-frame objects). r = screen px, k = 0..1,
// a/m = cone angle and mirror.
export function createLightList(cap = LIGHT_CAP) {
  return {
    n: 0, cap,
    kind: new Uint8Array(cap), x: new Float32Array(cap), y: new Float32Array(cap),
    r: new Float32Array(cap), k: new Float32Array(cap), a: new Float32Array(cap), m: new Float32Array(cap),
  };
}

// Adds a light at screen (x, y) unless the list is full, it is dark (k <= 0) or it lies
// fully outside the w x h view. Returns its index or -1. Earlier pushes win the cap.
export function pushLight(L, kind, x, y, r, k, w, h) {
  if (L.n >= L.cap || !(k > 0) || x + r < 0 || x - r > w || y + r < 0 || y - r > h) return -1;
  const i = L.n++;
  L.kind[i] = kind; L.x[i] = x; L.y[i] = y; L.r[i] = r; L.k[i] = k;
  L.a[i] = 0; L.m[i] = 1;
  return i;
}

// A point of the bike sprite (local 200 px space, facing right) in world px as drawn:
// mirrored when facing left and turned with the wheelie about the rear wheel, exactly like
// player.render. Writes [x, y, angle, mirror] into out.
export function bikePoint(p, lx, ly, out) {
  const o = (p.wheelOffsetsByState[p.currentAnimation] || p.wheelOffsetsByState.idle)[0];
  const right = p.facingRight;
  const px = right ? o.x : p.width - o.x;
  const dx = (right ? lx : p.width - lx) - px;
  const dy = ly - o.y;
  const th = right ? -p.wheelieRotation : p.wheelieRotation;
  const c = Math.cos(th), s = Math.sin(th);
  out[0] = p.x + px + c * dx - s * dy;
  out[1] = p.y + o.y + s * dx + c * dy;
  out[2] = th;
  out[3] = right ? 1 : -1;
  return out;
}

// Fireflies (R5): only where the road is still green (Prolog, Bab 1, Bab 2).
export const FLY_MAX = 12;
export const FLY_END_X = CHAPTERS.find((c) => c.biome !== "normal").startX;
const FLY_PER_PX = 150; // one firefly per 150 px of screen width
const FLY_MARGIN = 20;
export const flyCount = (w) => Math.min(FLY_MAX, Math.ceil(w / FLY_PER_PX));

// Firefly i of n at sim time t (ms): world x, y and glow 0..1 into out. Seeded by its index
// (no Math.random: a bench replays the same frame) and wrapped around the view like the
// snow, so the swarm rides along. still (reduced motion): no drift, steady glow.
export function fly(i, n, t, cam, w, ground, still, out) {
  const span = w + 2 * FLY_MARGIN;
  const ph = i * 2.39996; // golden angle: no two flies in step
  const tt = still ? 0 : t;
  const wx = ((i + 0.5) * span) / n + Math.sin(tt * 0.0006 + ph) * 36 + tt * 0.004;
  out[0] = cam - FLY_MARGIN + ((((wx - cam + FLY_MARGIN) % span) + span) % span);
  out[1] = ground - 34 - ((i * 47) % 104) + Math.sin(tt * 0.0011 + ph * 1.7) * 10;
  out[2] = still ? 1 : 0.6 + 0.4 * Math.sin(tt * 0.0025 + ph * 3);
  return out;
}

// V10 quality tier (R2): mean `work` over a 2 s window of unpaused frames, averaged over
// the frames that ran a sim step. A frame's interval is capped like fixedSteps (50 ms), so
// one frame after a hidden tab never fills the window. True once TIER_WINDOWS windows in a
// row are over the limit; the caller latches effects.low (sticky for the page load).
export const TIER_WINDOW_MS = 2000;
export const TIER_LIMIT_MS = 12; // mean work of the step frames (bench: 4x <= 8.6, 6x 12.2-13.5, 8x 15.3-19.6)
export const TIER_WINDOWS = 2; // windows in a row over the limit: a start-up or an arrival fills only one
export const createTier = () => ({ ms: 0, work: 0, n: 0, over: 0 });
export function tierStep(t, intervalMs, workMs, steps, paused) {
  if (paused) return false;
  t.ms += Math.min(50, Math.max(0, intervalMs));
  if (steps > 0) {
    t.work += workMs;
    t.n++;
  }
  if (t.ms < TIER_WINDOW_MS) return false;
  t.over = t.n > 0 && t.work / t.n > TIER_LIMIT_MS ? t.over + 1 : 0;
  t.ms = t.work = t.n = 0;
  return t.over >= TIER_WINDOWS;
}

// --- Lighting (browser only below this line) ---

const PROP_SINK = 12; // world.js: a prop's foot ends 12 px above the road
const TORCH = { r: 130, flameX: 6.5, flameY: 12 }; // standing-torch.png flame centre (sprite px)
const WINDOW = { r: 100, fx: 0.47, fy: 0.59 }; // warung counter opening, fraction of the drawn sprite
const HEAD = { x: 155, y: 124 }; // headlight lens in the 200 px bike space
const TAIL = { x: 14, y: 137 };
const GAUGE_R0 = 34; // gauge lamp radius at level 0; + level * GAUGE_RL (radius follows the skill)
const GAUGE_RL = 0.5;
const KOPI_GLOW = 46;
const RADIAL = 32; // radial stamp radius in darkness px (scaled per light)
const LENS = 7; // lens glow radius in darkness px (28 screen px), part of the cone stamp
const CONE_LEN = 70; // beam length in darkness px (280 screen px)
const CONE_TILT = 0.15; // rad, the beam dips toward the road ahead
const CONE_HALF = 0.16; // rad, half spread
const TAIL_R = 3; // tail glow, 7 x 7 darkness px
const FLY_R = 2; // firefly glow, 5 x 5
const COLORS = { warm: [255, 150, 60], pale: [255, 236, 170], red: [255, 50, 40], fly: [214, 255, 120] };
const TINT = { cone: 0.3, warm: 0.34, pale: 0.3, red: 0.5, fly: 0.45 }; // pool colour alpha, baked in
const BULB = "#fff6c8"; // gauge lamp bulb pixel

// The beam along +x from the lens at (LENS, CONE_OY), tilted down; brightest near the lens.
const CONE_OY = Math.max(LENS, Math.ceil(CONE_LEN * Math.max(0, Math.sin(CONE_HALF - CONE_TILT))) + 2);
const CONE_H = CONE_OY + Math.max(LENS, Math.ceil(CONE_LEN * Math.sin(CONE_TILT + CONE_HALF)) + 2);
const CONE_W = LENS + CONE_LEN;
const radialAlpha = (x, y) => band((1 - Math.min(1, Math.hypot(x - RADIAL, y - RADIAL) / RADIAL)) ** 1.3);
function coneAlpha(px, y) {
  const lens = band(1 - Math.hypot(px - LENS, y - CONE_OY) / LENS);
  const x = px - LENS;
  const dy = y - CONE_OY;
  const along = x * Math.cos(CONE_TILT) + dy * Math.sin(CONE_TILT);
  const across = Math.abs(dy * Math.cos(CONE_TILT) - x * Math.sin(CONE_TILT));
  if (along <= 0) return lens;
  const side = 1 - across / (along * Math.tan(CONE_HALF));
  return Math.max(lens, band(Math.min(side * 2, 1) * (1 - Math.min(1, along / CONE_LEN)) ** 0.7));
}
// Small 1:1 glows (tail light, firefly): a lit centre pixel, then faint rings out to r.
const glowAlpha = (r, ring) => (x, y) => {
  const d = Math.max(Math.abs(x - r - 0.5), Math.abs(y - r - 0.5));
  return d < 1 ? 1 : Math.hypot(x - r - 0.5, y - r - 0.5) <= r + 0.1 ? ring * (d < 2 ? 1 : 0.35) : 0;
};

// Every stamp in one atlas, [x, y, w, h] per slot. Drawn from an <img> copy: a canvas source
// costs ~3x more per drawImage (0.2 ms vs 0.06 ms per stamp on a 4x-throttled phone).
const D = RADIAL * 2 + 2;
const SLOT = {
  cut: [0, 0, RADIAL * 2, RADIAL * 2], warm: [D, 0, RADIAL * 2, RADIAL * 2], pale: [2 * D, 0, RADIAL * 2, RADIAL * 2],
  coneCut: [0, D, CONE_W, CONE_H], coneTint: [CONE_W + 2, D, CONE_W, CONE_H],
  red: [2 * CONE_W + 4, D, 2 * TAIL_R + 1, 2 * TAIL_R + 1],
  fly: [2 * CONE_W + 2 * TAIL_R + 7, D, 2 * FLY_R + 1, 2 * FLY_R + 1],
};
const CUT_SLOT = [SLOT.coneCut, SLOT.cut, SLOT.cut, null, null]; // by kind
const TINT_SLOT = [SLOT.coneTint, SLOT.warm, SLOT.pale, SLOT.red, SLOT.fly];

function bakeAtlas() {
  const W = 3 * D, H = D + CONE_H + 2;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  const img = g.createImageData(W, H);
  const put = ([sx, sy, w, h], rgb, alphaAt) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = ((sy + y) * W + sx + x) * 4;
        img.data[i] = rgb[0];
        img.data[i + 1] = rgb[1];
        img.data[i + 2] = rgb[2];
        img.data[i + 3] = Math.round(255 * alphaAt(x + 0.5, y + 0.5));
      }
    }
  };
  const white = [255, 255, 255];
  const lensPx = (x, y) => Math.floor(x) === LENS && Math.floor(y) === CONE_OY; // the lit lens pixel
  put(SLOT.cut, white, radialAlpha);
  put(SLOT.warm, COLORS.warm, (x, y) => radialAlpha(x, y) * TINT.warm);
  put(SLOT.pale, COLORS.pale, (x, y) => radialAlpha(x, y) * TINT.pale);
  put(SLOT.coneCut, white, coneAlpha);
  put(SLOT.coneTint, COLORS.pale, (x, y) => (lensPx(x, y) ? 1 : coneAlpha(x, y) * TINT.cone));
  put(SLOT.red, COLORS.red, glowAlpha(TAIL_R, TINT.red));
  put(SLOT.fly, COLORS.fly, glowAlpha(FLY_R, TINT.fly));
  g.putImageData(img, 0, 0);
  return c;
}

export class Lighting {
  constructor() {
    this.buf = document.createElement("canvas");
    this.bctx = this.buf.getContext("2d");
    // The atlas canvas serves until its <img> copy has decoded (well before the loader ends).
    this.atlas = bakeAtlas();
    const img = new Image();
    img.onload = () => (this.atlas = img);
    img.src = this.atlas.toDataURL();
    this.list = createLightList();
    this.pt = new Float32Array(4); // bikePoint / fly scratch
    this.t = 0; // sim ms: firefly drift and torch flicker freeze with every pause
    this.draws = 0; // ctx draw calls of the last frame (Mode Bengkel, R14)
    this.lights = 0;
    this.flies = 0;
    this._rgb = -1;
    this._fill = "";
  }

  step(dt) {
    this.t += dt;
  }

  // Slot #5 of game.render (inside the shake transform, after the bike and particles).
  // False when lighting is off (noon, morning, afternoon, low tier): the caller draws the
  // flat tint then, and this frame counts zero lighting draws.
  render(g) {
    this.draws = this.lights = this.flies = 0;
    const fx = g.effects;
    const ts = fx.currentTimeState;
    const a = ts ? ts.a : 0;
    if (!lightingOn(a, fx.low)) return false;
    const k = nightK(a);
    const W = g.canvas.width;
    const H = g.canvas.height;
    const cam = g.cameraX;
    const ox = cam - Math.floor(cam / SCALE) * SCALE; // world-anchored grid
    const bw = Math.ceil(W / SCALE) + 1;
    const bh = Math.ceil(H / SCALE) + 1; // +1 row: the landing thump lifts the scene 2 px
    const buf = this.buf;
    const b = this.bctx;
    if (buf.width !== bw || buf.height !== bh) {
      buf.width = bw; // resets the context state
      buf.height = bh;
    }
    b.imageSmoothingEnabled = false;
    const L = this.list;
    L.n = 0;
    this.collect(g, k, cam, W, H);

    // Darkness: its colour string is rebuilt only when the rounded colour changes (a fade).
    const rgb = darkRgb(ts);
    if (rgb !== this._rgb) {
      this._rgb = rgb;
      this._fill = `rgb(${rgb >> 16}, ${(rgb >> 8) & 255}, ${rgb & 255})`;
    }
    b.globalCompositeOperation = "copy"; // replaces last frame's map, no clear needed
    b.globalAlpha = darkAlpha(a);
    b.fillStyle = this._fill;
    b.fillRect(0, 0, bw, bh);
    let draws = 1;

    // Cut every pool out of the darkness, then colour it (warm, pale, the lens, red, flies).
    b.globalCompositeOperation = "destination-out";
    for (let i = 0; i < L.n; i++) {
      const kind = L.kind[i];
      if (!CUT[kind]) continue;
      b.globalAlpha = L.k[i] * CUT[kind];
      this.stamp(b, CUT_SLOT[kind], i, ox);
      draws++;
    }
    b.globalCompositeOperation = "source-over";
    b.fillStyle = BULB;
    for (let i = 0; i < L.n; i++) {
      const kind = L.kind[i];
      b.globalAlpha = L.k[i];
      this.stamp(b, TINT_SLOT[kind], i, ox);
      draws++;
      if (kind === PALE) {
        b.globalAlpha = k; // the gauge bulb is lit whatever the gauge's fill
        b.fillRect(Math.floor((L.x[i] + ox) / SCALE), Math.floor(L.y[i] / SCALE), 1, 1);
        draws++;
      }
    }
    b.globalAlpha = 1;

    const ctx = g.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, -ox, 0, bw * SCALE, bh * SCALE);
    ctx.restore();
    this.draws = draws + 1;
    this.lights = L.n;
    return true;
  }

  // Atlas slot s ([x, y, w, h]) for light i, in darkness px: the light's screen px shifted by
  // the snapped camera offset, / SCALE. The cone turns and mirrors with the bike. Indexed, not
  // destructured: array destructuring can allocate an iterator before V8 optimises it.
  stamp(b, s, i, ox) {
    const sx = s[0], sy = s[1], sw = s[2], sh = s[3];
    const L = this.list;
    const x = (L.x[i] + ox) / SCALE;
    const y = L.y[i] / SCALE;
    const kind = L.kind[i];
    if (kind === CONE) {
      const c = Math.cos(L.a[i]), n = Math.sin(L.a[i]), m = L.m[i];
      b.setTransform(m * c, m * n, -n, c, x, y);
      b.drawImage(this.atlas, sx, sy, sw, sh, -LENS, -CONE_OY, sw, sh);
      b.setTransform(1, 0, 0, 1, 0, 0);
    } else if (kind === RED || kind === FLY) {
      b.drawImage(this.atlas, sx, sy, sw, sh, Math.floor(x) - (sw >> 1), Math.floor(y) - (sh >> 1), sw, sh);
    } else {
      const r = Math.max(1, Math.round(L.r[i] / SCALE));
      b.drawImage(this.atlas, sx, sy, sw, sh, Math.round(x) - r, Math.round(y) - r, r * 2, r * 2);
    }
  }

  // Every light on screen this frame, in screen px, from the drawn (interpolated) camera and
  // bike: the bike first (never dropped by the cap), then props, gauges, cups, fireflies.
  collect(g, k, cam, W, H) {
    const L = this.list;
    const p = g.player;
    const pt = this.pt;
    const world = g.world;
    const ground = world.groundY();
    const still = g.effects.reducedMotion;
    const t = this.t;

    bikePoint(p, HEAD.x, HEAD.y, pt);
    const i = pushLight(L, CONE, pt[0] - cam, pt[1], CONE_W * SCALE, k, W, H);
    if (i >= 0) {
      L.a[i] = pt[2];
      L.m[i] = pt[3];
    }
    bikePoint(p, TAIL.x, TAIL.y, pt);
    // R6: a dim tail light always; full while a reversal brake bites (player.braking).
    pushLight(L, RED, pt[0] - cam, pt[1], TAIL_R * SCALE, k * (p.braking ? 1 : 0.55), W, H);

    // Standing torches (world.props), sized like renderProps; a small sim-time flicker.
    const props = world.props;
    for (let j = 0; j < props.length; j++) {
      const prop = props[j];
      const img = prop.img;
      if (prop.file !== "standing-torch" || !img.naturalHeight) continue;
      const s = Math.min(prop.scale, (ground - 24) / img.naturalHeight);
      const top = ground - Math.round(img.naturalHeight * s) - PROP_SINK - prop.lift;
      const flicker = still ? 1 : 1 + 0.05 * Math.sin(t * 0.013 + prop.x);
      pushLight(L, WARM, Math.floor(prop.x - cam) + TORCH.flameX * s, top + TORCH.flameY * s, TORCH.r * flicker, k, W, H);
    }

    // The warung window (station "projects"), from its drawn rect once the sprite is in.
    const objects = world.objects;
    for (let j = 0; j < objects.length; j++) {
      const o = objects[j];
      if (o.id !== "projects" || !o.spriteLoaded) continue;
      pushLight(L, WARM, o.x - cam + o.width * WINDOW.fx, o.y + o.height * WINDOW.fy, WINDOW.r, k * 0.9, W, H);
    }

    // Gauge lamps (W2): a bulb on top of each sign, its pool sized by the skill level and
    // brightening as the gauge fills.
    const gauges = world.gauges;
    for (let j = 0; j < gauges.length; j++) {
      const gg = gauges[j];
      const lvl = Math.min(100, Math.max(0, gg.level));
      pushLight(L, PALE, Math.floor(gg.x - cam) + gg.width / 2, gg.y + 2, GAUGE_R0 + lvl * GAUGE_RL, k * (0.45 + 0.55 * gg.fill), W, H);
    }

    // Night cups not found yet glow as they fade in (kopi #1), shown like world.renderKopi.
    if (p.lockBacktrack && !(g.minigames && g.minigames.activeMinigame)) {
      for (let j = 0; j < KOPI.length; j++) {
        const cup = KOPI[j];
        if (cup.when !== "night" || g.kopi.includes(cup.id)) continue;
        pushLight(L, WARM, cup.x - cam, ground - cup.lift - KOPI_SIZE / 2, KOPI_GLOW, k * kopiShown(cup, g.effects.currentTimeState.a, 0), W, H);
      }
    }

    // Fireflies last: the cap drops them first. Off on the low tier with the rest (R5).
    const n = flyCount(W);
    for (let j = 0; j < n; j++) {
      fly(j, n, t, cam, W, ground, still, pt);
      if (pt[0] >= FLY_END_X) continue;
      if (pushLight(L, FLY, pt[0] - cam, pt[1], FLY_R * SCALE, k * pt[2], W, H) >= 0) this.flies++;
    }
  }
}

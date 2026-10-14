// ===================================
// SKY.JS - The sky slot (V3): biome sky, night sky with stars, sun and moon
// ===================================
// world.renderBackgroundLayers draws it first, then the clouds and the hills over it. The
// numbers are pure (node tests); the bitmaps are baked on first use in the browser.

// The bg art is 1024 x 346, cover-scaled (world.drawTiledLayer). Layer 4 is opaque from row
// 148 down at every x, so the sky shows only above row 150 and the slot paints just that band.
export const SKY_ROWS = 150;
// Sky gradients, row 0 -> row 150. normal/5.png and autumn/5.png are flat vertical ramps,
// linear down to row 150 (decoded); winter is the old full-height gradient cut at row 150.
export const SKY = {
  normal: ["#80c2ce", "#c4ebf2"],
  autumn: ["#d1b77a", "#f3e3be"],
  winter: ["#a7b8c8", "#c6d2dc"],
};
// Drawn bright on purpose: the night darkness (the lighting pass or the flat tint) halves it (R3).
const NIGHT_SKY = ["#08102c", "#33467a"];

// effects.currentTimeState.a: noon 0, morning 0.1, afternoon 0.15, night 0.5. The night sky
// and its stars fade in above 0.3 and are complete just under the night target, so a day
// bucket draws none of them and a settled night draws no biome sky and no sun.
const NIGHT_FROM = 0.3;
const NIGHT_FULL = 0.48;
export const nightness = (a) => Math.min(1, Math.max(0, (a - NIGHT_FROM) / (NIGHT_FULL - NIGHT_FROM)));

// Sun centre per day bucket, as a fraction of the width: rises left, sets right. Noon sits
// right of centre: at 667 x 375 the centre is under the journey strip.
export const SUN_X = { morning: 0.3, noon: 0.63, afternoon: 0.8 };
export const MOON_X = 0.72;
// Body centres in bg art rows (times the cover scale = screen px), so they sit on the same
// hills at any aspect. The tallest tree tips reach row 58; the epilog's top letterbox bar
// covers up to row 31, so the moon and the morning sun stay below it.
const SUN_HIGH = 30; // noon
const SUN_LOW = 58; // morning / afternoon: on the tree line, half behind the tallest tips
const MOON_ROW = 42;
const SINK = 100; // rows below its spot when set: behind the hills

// up: effects.sunUp (1 risen, 0 set). The day arc is a parabola through the three spots.
export function sunRow(x, up) {
  const { morning, noon, afternoon } = SUN_X;
  const t = x < noon ? (noon - x) / (noon - morning) : (x - noon) / (afternoon - noon);
  return SUN_HIGH + (SUN_LOW - SUN_HIGH) * Math.min(1, t * t) + SINK * (1 - up);
}
// n: nightness. The moon rises as the night comes.
export const moonRow = (n) => MOON_ROW + SINK * (1 - n);

// Canvas-size cache (world.layout() drops it): one opaque 1 px wide gradient strip per sky,
// drawn stretched over the band; the night strip also paints the starry bitmap.
export function makeSky(w, h) {
  const scale = Math.max(w / 1024, h / 346);
  const sh = Math.ceil(SKY_ROWS * scale);
  const strip = ([top, bottom]) => {
    const c = canvas(1, sh);
    const g = c.getContext("2d", { alpha: false }); // opaque: the blit can skip blending
    const grad = g.createLinearGradient(0, 0, 0, sh);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, 1, sh);
    return c;
  };
  return {
    w, h, sh, scale,
    px: Math.max(1, Math.round(scale)), // one art pixel: the bg's own grid
    normal: strip(SKY.normal), autumn: strip(SKY.autumn), winter: strip(SKY.winter),
    night: strip(NIGHT_SKY),
    starry: null, // the night sky with its stars, full size: baked on the first night frame
  };
}

// Leaves globalAlpha at 1. fade: world.biomeFade; fx: the effects manager.
export function renderSky(ctx, sky, fade, fx) {
  const s = fx && fx.currentTimeState;
  const n = s ? nightness(s.a) : 0;
  if (n < 1) {
    // The biome sky; mid-crossfade the incoming one over it at alpha t (R5).
    ctx.drawImage(sky[fade.from], 0, 0, sky.w, sky.sh);
    if (fade.to !== null) {
      ctx.globalAlpha = fade.t;
      ctx.drawImage(sky[fade.to], 0, 0, sky.w, sky.sh);
    }
  }
  if (!s) {
    ctx.globalAlpha = 1;
    return; // before the first sim step (splash, the layout() render): no sun yet
  }
  // Rain, snow weather and thick fog hide the stars, the sun and the moon.
  const clear = 1 - Math.max(fx.rainIntensity, fx.snowCover, fx.fogAmount);
  if (n > 0) {
    ctx.globalAlpha = n;
    if (clear < 1) {
      ctx.drawImage(sky.night, 0, 0, sky.w, sky.sh);
      ctx.globalAlpha = n * clear;
    }
    if (clear > 0) ctx.drawImage(sky.starry || (sky.starry = bakeStarry(sky)), 0, 0);
  }
  const sun = (1 - n) * clear;
  if (sun > 0) drawBody(ctx, sky, sunArt || (sunArt = bakeSun()), fx.sunX * sky.w, sunRow(fx.sunX, fx.sunUp), sun);
  const moon = n * clear;
  if (moon > 0) drawBody(ctx, sky, moonArt || (moonArt = bakeMoon()), MOON_X * sky.w, moonRow(n), moon);
  ctx.globalAlpha = 1;
}

function drawBody(ctx, sky, art, x, row, alpha) {
  const size = art.width * sky.px;
  const left = Math.round((x - size / 2) / sky.px) * sky.px; // on the art-pixel grid
  const top = Math.round((row * sky.scale - size / 2) / sky.px) * sky.px;
  ctx.globalAlpha = alpha;
  ctx.drawImage(art, left, top, size, size);
}

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// Pixel art, one canvas pixel per art pixel, drawn scaled by px with smoothing off.
let sunArt = null;
let moonArt = null;

function bake(size, paint) {
  const c = canvas(size, size);
  const g = c.getContext("2d");
  const mid = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const color = paint(Math.hypot(x - mid, y - mid), x, y);
      if (color) {
        g.fillStyle = color;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  return c;
}

const bakeSun = () => bake(16, (d) => (d < 5.4 ? "#fff7d6" : d < 6.6 ? "#ffe27a" : d < 7.7 ? "#ffb63d" : null));

const CRATERS = new Set(["4,4", "5,4", "4,5", "8,7", "9,7", "8,8", "5,9", "9,10"]);
const bakeMoon = () =>
  bake(14, (d, x, y) => {
    if (d >= 6.9) return null;
    if (CRATERS.has(`${x},${y}`)) return "#c9c6ad";
    return d > 5.6 && x + y > 13 ? "#d9d6bf" : "#f6f4e2"; // the lower-right limb a shade darker
  });

// The night strip stretched full size plus a fixed star field (same seed every bake),
// denser near the top, on the art-pixel grid. Opaque: a settled night is this one blit.
function bakeStarry(sky) {
  const { w, sh: h, px } = sky;
  const c = canvas(w, h);
  const g = c.getContext("2d", { alpha: false });
  g.imageSmoothingEnabled = false;
  g.drawImage(sky.night, 0, 0, w, h);
  let seed = 20240917;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const count = Math.round((w * h) / (px * px * 260));
  for (let i = 0; i < count; i++) {
    const x = Math.floor((rnd() * w) / px) * px;
    const y = Math.floor((rnd() ** 1.7 * h) / px) * px;
    const r = rnd();
    g.fillStyle = r < 0.12 ? "#fff0b8" : r < 0.3 ? "#cfe0ff" : "#ffffff";
    if (r > 0.97) {
      g.fillRect(x - px, y, 3 * px, px); // a 3 x 3 plus: the few bright ones
      g.fillRect(x, y - px, px, 3 * px);
    } else {
      const size = r > 0.88 ? 2 * px : px;
      g.fillRect(x, y, size, size);
    }
  }
  return c;
}

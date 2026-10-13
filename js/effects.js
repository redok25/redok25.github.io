// ===================================
// EFFECTS.JS - Visual Effects System
// ===================================

export const MAX_PARTICLES = 300;
const MAX_RAIN = 400;
const MAX_SNOW = 200;
export const LEAF_AUTUMN = "#d9822b"; // Bab 3 leaves (V2)
const DUST = "#8b7355";
const SMOKE = "#d6d6d6";
const SPARK = "#ffd34d";
const SKID = "#2b2622";
// renderParticles draws only these, one pass per colour.
export const PARTICLE_COLORS = [DUST, "#4b692f", LEAF_AUTUMN, SMOKE, SPARK, SKID];

// P7 juice stops at JUICE_CAP, so dust and leaves always keep MAX_PARTICLES - JUICE_CAP
// = 60 slots (cruise dust is ~180, juice at its busiest ~70).
export const JUICE_CAP = 240;
// Juice kinds as [min, max]. Velocities are px per step; vx points along the `dir` given
// to emit (+ = that way). Opacity starts at life / maxLife, so smoke starts half-faded.
export const JUICE = {
  smoke: { color: SMOKE, size: [3, 5], vx: [-0.8, -0.3], vy: [-0.6, -0.2], life: [600, 900], maxLife: 1500 },
  spark: { color: SPARK, size: [2, 3], vx: [-3.5, -1.5], vy: [-2.5, -0.5], life: [120, 260], maxLife: 260 },
  skid: { color: SKID, size: [2, 2], vx: [0, 0], vy: [0, 0], life: [1500, 1500], maxLife: 1500 },
  land: { color: DUST, size: [2, 4], vx: [-1.5, 1.5], vy: [-1.8, -0.4], life: [400, 800], maxLife: 800 },
  leaf: { color: LEAF_AUTUMN, size: [3, 5], vx: [1.5, 3.5], vy: [-1.5, -0.5], life: [700, 1100], maxLife: 1100 },
};
const rand = (r) => r[0] + Math.random() * (r[1] - r[0]);
const SMOKE_CHANCE = 0.1; // per step while the engine runs (6/s)...
const SMOKE_CHANCE_TOP = 0.15; // ...plus this much at top speed (15/s, ~11 puffs alive)
export const SKID_MIN_SPEED = 3; // px/step after a reversal-brake step: a "hard" brake
export const SPARKS_PER_STEP = 2;
export const SKID_DOT_GAP = 2; // px of slide per 2 px skid dot: a solid streak
export const LAND_DUST = 10;
const LAND_SPREAD = 24; // px, centred on the front wheel
const WAKE_MIN_SPEED = 4; // px/step
const WAKE_CHANCE = 0.2; // per step at top speed (12/s, ~11 leaves alive)
const TYRE_Y = 196; // tyre contact below player.y: wheel centre 174 + radius 22
// The landing thump by steps left: up 2 px, back, up 1 px, back (100 ms). Values come in
// pairs so a 30 Hz display (2 steps per frame) still sees the jolt. The scene only moves
// up: at most 2 rows bare at the bottom (dark soil, the page background shows there).
const SHAKE = [0, -1, -1, 0, 0, -2, -2];
export const SHAKE_STEPS = SHAKE.length - 1;
export const shakeOffset = (stepsLeft) => SHAKE[stepsLeft] || 0;

export class EffectsManager {
  // accept world reference so clouds can be placed in world space and parallax relative to camera
  constructor(canvas, ctx, world) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.world = world;
    this.particles = [];
    this._pool = []; // dead particles, reused by _spawn (no allocation per step)
    this._halve = {}; // per colour: skip every other spawn under reduced motion
    this.shakeSteps = 0; // landing thump steps left (P7)
    this._rm = matchMedia("(prefers-reduced-motion: reduce)");
    this.clouds = [];
    this.windOffset = 0;
    
    // Rain properties
    this.rainActive = false;
    this.rainParticles = [];
    this.rainIntensity = 0; // 0 to 1 for smooth fade in/out

    // Ambient snow (V8): a rain-path variant. ambientSnow is the chapter's intensity
    // (game.enterChapter: Bab 4 = 0.3); active rain (cheat or real weather) wins over it.
    this.ambientSnow = 0;
    this.snowIntensity = 0;
    this.snowFlakes = [];

    // Time of Day
    this.forcedTime = null; // 'morning', 'noon', 'afternoon', 'night', or null (auto)
    this.timeOverlay = { color: 'rgba(0,0,0,0)', opacity: 0 };
    this.timeTransition = 0; // for smoothing switches if needed

    // Cloud follow mode: 'parallax' = default slow parallax; 'screen' = fixed to screen; 'world' = moves exactly with world/camera
    this.cloudFollowMode = "parallax";

    // Load cloud sprites
    this.cloudSprites = [];
    this.loadCloudSprites();

    this.initClouds();
  }

  loadCloudSprites() {
    for (let i = 1; i <= 5; i++) {
      const img = new Image();
      img.src = `assets/sprites/platformer/cloud/${i}.png`;
      this.cloudSprites.push(img);
    }
  }

  initClouds() {
    // Create floating clouds
    for (let i = 16; i < 32; i++) {
      // Increased count slightly
      // determine parallax per-cloud based on the global follow mode
      const parallaxValue =
        this.cloudFollowMode === "screen"
          ? 0
          : this.cloudFollowMode === "world"
          ? 1
          : 0.08 + Math.random() * 0.12;
      // vertical placement and draw height are fractions of the canvas height,
      // so layout() can re-derive them when the canvas is resized
      const yFrac = 0.05 + Math.random() * 0.35;
      const hFrac = 0.03 + Math.random() * 0.06;
      this.clouds.push({
        // start on screen (camera starts at 0)
        x: Math.random() * this.canvas.width,
        yFrac,
        hFrac,
        y: Math.round(yFrac * this.canvas.height),
        baseHeight: Math.round(hFrac * this.canvas.height),
        // movement speed in pixels per second (time-based)
        speed: 10 + Math.random() * 30,
        opacity: 1,
        // fade-in speed (opacity units per second) used when respawning
        fadeInSpeed: 0,
        // fade-out speed and pending respawn control a smooth fade-out -> respawn flow
        fadeOutSpeed: 0,
        pendingRespawn: null,
        spriteIndex: Math.floor(Math.random() * 5),
        parallax: parallaxValue, // parallax factor (0 = fixed to screen, 1 = world)
      });
    }
  }

  // Change how clouds follow the camera at runtime.
  // mode: 'parallax' (default slower movement), 'screen' (fixed to view), 'world' (move exactly with world)
  setCloudFollowMode(mode) {
    if (!mode || typeof mode !== "string") return;
    const m = mode.toLowerCase();
    if (!["parallax", "screen", "world"].includes(m)) return;
    this.cloudFollowMode = m;

    // Update existing clouds parallax values to reflect selected mode
    this.clouds.forEach((cloud) => {
      if (m === "screen") cloud.parallax = 0;
      else if (m === "world") cloud.parallax = 1;
      else cloud.parallax = 0.08 + Math.random() * 0.12;
    });
  }

  // Clouds keep their place as a fraction of the canvas size (F10 layout), so a wider
  // screen after rotation is not left with an empty right half of the sky.
  layout(oldWidth, cameraX) {
    const { width: w, height: h } = this.canvas;
    const stretch = oldWidth ? w / oldWidth - 1 : 0;
    this.clouds.forEach((cloud) => {
      cloud.x += (cloud.x - cameraX * cloud.parallax) * stretch;
      cloud.y = Math.round(cloud.yFrac * h);
      cloud.baseHeight = Math.round(cloud.hFrac * h);
    });
  }

  // Live: a change in the OS setting applies from the next spawn on.
  get reducedMotion() {
    return !!(this._rm && this._rm.matches);
  }

  update(deltaTime, cameraX = 0) {
    if (this.shakeSteps > 0) this.shakeSteps--;
    this.windOffset += deltaTime * 0.001;
    this.updateRain(deltaTime, cameraX);
    this.updateSnow(deltaTime, cameraX);
    this.updateTimeOfDay(deltaTime);

    // Update clouds
    this.clouds.forEach((cloud) => {
      // time-based movement: speed is pixels/second, deltaTime is ms
      cloud.x += cloud.speed * (deltaTime * 0.001);

      // Compute screen X based on cloud parallax so wrapping is relative to viewport
      const screenX = cloud.x - cameraX * cloud.parallax;

      // Wrapping buffers
      const bufferRight = 200;
      const bufferLeft = 400;

      // If cloud moved past the right edge, begin a fade-out and schedule respawn
      // instead of instantly teleporting (gives a smooth visual transition).
      if (screenX > this.canvas.width + bufferRight) {
        if (!cloud.pendingRespawn) {
          cloud.fadeOutSpeed = 0.6 + Math.random() * 0.6;
          cloud.pendingRespawn = {
            side: "left",
            extraGap: Math.random() * 300,
          };
        }
      }

      // If cloud moved far left off-screen, begin fade-out and schedule respawn
      if (screenX < -bufferLeft) {
        if (!cloud.pendingRespawn) {
          cloud.fadeOutSpeed = 0.6 + Math.random() * 0.6;
          cloud.pendingRespawn = {
            side: "right",
            extraGap: Math.random() * 300,
          };
        }
      }

      // handle fade-out if active
      if (cloud.fadeOutSpeed && cloud.opacity > 0) {
        cloud.opacity = Math.max(
          0,
          cloud.opacity - cloud.fadeOutSpeed * (deltaTime * 0.001)
        );
        // when fully faded out and a respawn is pending, perform the respawn now
        if (cloud.opacity <= 0 && cloud.pendingRespawn) {
          const extraGap = cloud.pendingRespawn.extraGap || Math.random() * 300;
          if (cloud.pendingRespawn.side === "left") {
            if (cloud.parallax <= 0.05) {
              cloud.x =
                cameraX - Math.random() * (this.canvas.width + extraGap);
            } else {
              // Shifting x by d moves screenX by exactly d (screenX = x - cameraX * parallax).
              const shift = this.canvas.width + bufferRight + extraGap;
              cloud.x -= shift;
            }
          } else {
            // right
            if (cloud.parallax <= 0.05) {
              cloud.x =
                cameraX +
                this.canvas.width +
                Math.random() * (this.canvas.width + extraGap);
            } else {
              // Shifting x by d moves screenX by exactly d (screenX = x - cameraX * parallax).
              const shift = this.canvas.width + bufferLeft + extraGap;
              cloud.x += shift;
            }
          }
          const H = this.canvas.height;
          const y = Math.max(
            10,
            Math.min(H - 20, cloud.y + Math.floor((Math.random() - 0.5) * 20))
          );
          cloud.yFrac = y / H;
          cloud.y = y;
          if (Math.random() < 0.2 && this.cloudSprites.length > 0) {
            cloud.spriteIndex = Math.floor(
              Math.random() * this.cloudSprites.length
            );
          }
          // reset fade flags and start fade-in
          cloud.fadeOutSpeed = 0;
          cloud.pendingRespawn = null;
          cloud.fadeInSpeed = 0.6 + Math.random() * 1.0;
          cloud.opacity = 0;
        }
      }

      // handle fade-in if active
      if (cloud.fadeInSpeed && cloud.opacity < 1) {
        cloud.opacity = Math.min(
          1,
          cloud.opacity + cloud.fadeInSpeed * (deltaTime * 0.001)
        );
        if (cloud.opacity >= 1) cloud.fadeInSpeed = 0;
      }
    });

    this.stepParticles(deltaTime);
  }

  // Swap-remove into the pool: no new array and, once warm, no new particle per step.
  stepParticles(deltaTime) {
    const parts = this.particles;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= deltaTime;
      if (p.life <= 0) {
        parts[i] = parts[parts.length - 1];
        parts.pop();
        this._pool.push(p);
        continue;
      }
      p.x += p.vx * deltaTime * 0.06;
      p.y += p.vy * deltaTime * 0.06;
      p.opacity = p.life / p.maxLife;
    }
  }

  // One particle, recycled from the pool and written in place (one shape for every kind).
  // False at the cap, and on every other spawn of a colour under reduced motion (P7: half
  // the particles; per colour, so one kind never eats another kind's turns).
  _spawn(cap, x, y, vx, vy, size, color, life, maxLife) {
    if (this.particles.length >= cap) return false;
    if (this.reducedMotion) {
      const skip = (this._halve[color] = !this._halve[color]);
      if (skip) return false;
    }
    const p = this._pool.pop() || {};
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.size = size;
    p.color = color;
    p.opacity = life / maxLife;
    p.life = life;
    p.maxLife = maxLife;
    this.particles.push(p);
    return true;
  }

  // P7 juice: n particles of one JUICE kind from x .. x + spreadX at y, vx along dir (+1/-1).
  emit(kind, x, y, dir, n = 1, spreadX = 0) {
    const k = JUICE[kind];
    for (let i = 0; i < n; i++) {
      const px = x + ((i + Math.random()) / n) * spreadX; // stratified: gaps stay under spreadX / n
      this._spawn(JUICE_CAP, px, y, dir * rand(k.vx), rand(k.vy), rand(k.size), k.color, rand(k.life), k.maxLife);
    }
  }

  // P7, once per sim step after the bike moved (game.update, so never while paused). It is
  // the bike's own feedback, so it also runs in the opening ride and in minigame courses.
  //   rot0: wheelieRotation before this step. A landing is the drop to 0 inside the step;
  //         a teleport zeroes it outside update, so a teleport never lands.
  //   autumn: the current chapter's biome is autumn (Bab 3): leaves ride the wake.
  juice(p, rot0, autumn) {
    const v = p.velocityX;
    const speed = Math.abs(v);
    const ratio = Math.min(1, speed / p.maxSpeed);
    const tyreY = p.y + TYRE_Y;
    // Exhaust smoke while the engine runs (the engine sound's 0.1 threshold), from the pipe's
    // narrow end at the back of the sprite, drifting backwards and up.
    if (speed > 0.1 && Math.random() < SMOKE_CHANCE + SMOKE_CHANCE_TOP * ratio) {
      const ex = (p.exhaustOffsetsByState[p.currentAnimation] || p.exhaustOffsetsByState.idle)[0];
      const tipX = p.facingRight ? ex.x - ex.w / 2 : p.width - ex.x + ex.w / 2;
      this.emit("smoke", p.x + tipX, p.y + ex.y - 2, p.facingRight ? 1 : -1);
    }
    if (speed >= SKID_MIN_SPEED) {
      // The wheel at the back of the MOTION: a reversal brake flips the sprite at once, so
      // the facing "rear" wheel would be the leading one.
      const a = p.wheelX(0);
      const b = p.wheelX(1);
      const dir = v > 0 ? 1 : -1;
      const trailX = dir > 0 ? Math.min(a, b) : Math.max(a, b);
      if (p.braking) {
        this.emit("spark", trailX, tyreY - 2, dir, SPARKS_PER_STEP);
        // Dots over the stretch the tyre slid this step: trailX - v .. trailX.
        this.emit("skid", trailX - v, tyreY - 1, dir, Math.ceil(speed / SKID_DOT_GAP), v);
      }
      if (autumn && speed >= WAKE_MIN_SPEED && Math.random() < WAKE_CHANCE * ratio) {
        this.emit("leaf", trailX, tyreY - 8, dir);
      }
    }
    // Wheelie landing: the rotation reached 0 inside this step. Dust under the front wheel and
    // the 2 px thump (none under reduced motion).
    if (rot0 > 0 && p.wheelieRotation === 0) {
      this.emit("land", p.wheelX(1) - LAND_SPREAD / 2, tyreY - 2, 1, LAND_DUST, LAND_SPREAD);
      if (!this.reducedMotion) this.shakeSteps = SHAKE_STEPS;
    }
  }

  // Draw only clouds (keeps particles separate so caller can control ordering)
  renderClouds(cameraX) {
    const ctx = this.ctx;
    const viewW = this.canvas.width;
    this.clouds.forEach((cloud) => {
      const sprite = this.cloudSprites[cloud.spriteIndex];

      if (sprite && sprite.complete) {
        ctx.save();
        ctx.globalAlpha = cloud.opacity;

        // Compute width from sprite aspect ratio so image isn't squashed (use baseHeight)
        const aspect = sprite.naturalWidth / sprite.naturalHeight || 1;
        const height = Math.round(cloud.baseHeight);
        const width = Math.round(height * aspect);

        // Draw cloud at world position, parallax relative to camera
        const sx = Math.floor(cloud.x - cameraX * cloud.parallax);
        ctx.imageSmoothingEnabled = false;

        // Primary copy
        ctx.drawImage(sprite, sx, cloud.y, width, height);

        // Draw additional copies when the cloud crosses viewport boundaries.
        // Use +/- viewport width so wrapping aligns to the viewport (avoid extra +width offsets).
        if (sx + width < 0) ctx.drawImage(sprite, sx + viewW, cloud.y, width, height);
        if (sx > viewW) ctx.drawImage(sprite, sx - viewW, cloud.y, width, height);

        ctx.restore();
      }
    });
  }

  // Clouds currently drawn inside the viewport (Mode Bengkel; acceptance wants >= 13/16).
  visibleCloudCount(cameraX) {
    let n = 0;
    for (const cloud of this.clouds) {
      const sprite = this.cloudSprites[cloud.spriteIndex];
      const aspect = sprite && sprite.naturalHeight ? sprite.naturalWidth / sprite.naturalHeight : 1;
      const left = cloud.x - cameraX * cloud.parallax;
      const right = left + cloud.baseHeight * aspect;
      if (cloud.opacity > 0 && right > 0 && left < this.canvas.width) n++;
    }
    return n;
  }

  // Draw only particle effects (so caller can render them after world)
  renderParticles(cameraX) {
    const ctx = this.ctx;
    const alpha = ctx.globalAlpha;
    const w = this.canvas.width;
    for (const color of PARTICLE_COLORS) {
      ctx.fillStyle = color;
      for (const p of this.particles) {
        if (p.color !== color) continue;
        const sx = p.x - cameraX;
        if (sx < -8 || sx > w) continue; // offscreen: a skid left behind, a teleport
        ctx.globalAlpha = p.opacity;
        ctx.fillRect(sx, p.y, p.size, p.size);
      }
    }
    ctx.globalAlpha = alpha;
  }

  // createDustParticles(x, y, opts)
  // - x, y: coordinates in WORLD space by default (backwards compatible)
  // - x, y: coordinates in WORLD space by default (backwards compatible)
  // - opts.cameraX: number (optional) — current camera X, used when `isScreen` is true
  // - opts.isScreen: boolean (optional) — if true, treat x,y as screen coords and convert to world using cameraX
  // - opts.count: number (optional) — how many particles to spawn (default 3)
  // - opts.spreadX / opts.spreadY: numbers (optional) — spawn spread (defaults keep previous behavior)
  createDustParticles(x, y, opts = {}) {
    const cameraX = typeof opts.cameraX === "number" ? opts.cameraX : 0;
    const isScreen = !!opts.isScreen;
    const count = typeof opts.count === "number" ? opts.count : 3;
    const spreadX = typeof opts.spreadX === "number" ? opts.spreadX : 20;
    const spreadY = typeof opts.spreadY === "number" ? opts.spreadY : 10;
    const baseX = isScreen ? x + cameraX : x;
    const baseY = y;

    for (let i = 0; i < count; i++) {
      this._spawn(
        MAX_PARTICLES,
        baseX + Math.random() * spreadX - spreadX / 2,
        baseY + Math.random() * spreadY,
        (Math.random() - 0.5) * 2,
        -Math.random() * 2,
        2 + Math.random() * 2,
        DUST,
        500 + Math.random() * 500,
        1000
      );
    }
  }

  // createLeafParticles(x, y, opts)
  // - x,y: world coordinates by default
  // - opts.cameraX: number (optional) - current camera X if passing screen coords
  // - opts.isScreen: boolean (optional) - treat x,y as screen coords when true
  // - opts.count: number (optional) - how many leaf particles to spawn (default 1)
  // - opts.spreadX / opts.spreadY: numbers (optional) - spawn spread
  // - opts.force: boolean (optional) - force spawn (bypass internal randomness)
  // - opts.color: string (optional) - leaf color, one of PARTICLE_COLORS (Bab 3: LEAF_AUTUMN)
  createLeafParticles(x, y, opts = {}) {
    const cameraX = typeof opts.cameraX === "number" ? opts.cameraX : 0;
    const isScreen = !!opts.isScreen;
    const count = typeof opts.count === "number" ? opts.count : 1;
    const spreadX = typeof opts.spreadX === "number" ? opts.spreadX : 12;
    const spreadY = typeof opts.spreadY === "number" ? opts.spreadY : 10;
    const force = !!opts.force;

    // decide whether to spawn (preserve small ambient probability when not forced)
    if (!force && Math.random() >= 0.02) return;

    const baseX = isScreen ? x + cameraX : x;
    const baseY = y;

    for (let i = 0; i < count; i++) {
      this._spawn(
        MAX_PARTICLES,
        baseX + Math.random() * spreadX - spreadX / 2,
        baseY + Math.random() * spreadY,
        (Math.random() - 0.5) * 1,
        Math.random() * 1 + 0.5,
        3 + Math.random() * 2,
        opts.color || "#4b692f",
        2000 + Math.random() * 1000,
        3000
      );
    }
  }

  getWindSway() {
    return Math.sin(this.windOffset) * 3;
  }

  // Easter Egg: Rain
  toggleRain(enable = null) {
    if (enable !== null) {
        this.rainActive = enable;
    } else {
        this.rainActive = !this.rainActive;
    }
    console.log(`Rain status: ${this.rainActive}`);
  }

  // Time of Day System
  setTimeOfDay(mode) {
    this.forcedTime = mode; // null, 'morning', 'noon', 'afternoon', 'night'
    console.log(`Time set to: ${mode || 'Auto'}`);
    // We rely on updateTimeOfDay to smooth the transition, or we could force it here.
  }

  updateTimeOfDay(deltaTime) {
    let mode = this.forcedTime;
    
    // If auto, determine based on hour
    if (!mode) {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 10) mode = 'morning';
        else if (hour >= 10 && hour < 15) mode = 'noon';
        else if (hour >= 15 && hour < 19) mode = 'afternoon';
        else mode = 'night';
    }

    // Target overlay properties based on mode
    let targetColor = [0, 0, 0]; // r, g, b
    let targetAlpha = 0;

    switch (mode) {
        case 'morning':
            targetColor = [255, 200, 100]; // Warm Yellow
            targetAlpha = 0.1;
            break;
        case 'noon':
            targetColor = [255, 255, 255]; // Clear
            targetAlpha = 0;
            break;
        case 'afternoon':
            targetColor = [255, 160, 80]; // Softer Golden Sunset
            targetAlpha = 0.15;
            break;
        case 'night':
            targetColor = [10, 10, 30]; // Dark Blue/Black
            targetAlpha = 0.5;
            break;
    }

    // Simple lerp for smooth transition could be added, but for now let's just set it
    // Or implemented a basic transition state. Let's use current state.
    // To do proper color interpolation we need to store current r,g,b,a.
    if (!this.currentTimeState) {
        this.currentTimeState = { r: targetColor[0], g: targetColor[1], b: targetColor[2], a: targetAlpha };
    } else {
        const speed = deltaTime * 0.002; // Slow transition
        this.currentTimeState.r += (targetColor[0] - this.currentTimeState.r) * speed;
        this.currentTimeState.g += (targetColor[1] - this.currentTimeState.g) * speed;
        this.currentTimeState.b += (targetColor[2] - this.currentTimeState.b) * speed;
        this.currentTimeState.a += (targetAlpha - this.currentTimeState.a) * speed;
    }
  }

  renderTimeOverlay() {
      if (!this.currentTimeState || this.currentTimeState.a <= 0.01) return;
      
      this.ctx.save();
      this.ctx.fillStyle = `rgba(${Math.round(this.currentTimeState.r)}, ${Math.round(this.currentTimeState.g)}, ${Math.round(this.currentTimeState.b)}, ${this.currentTimeState.a})`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
  }

  updateRain(deltaTime, cameraX) {
    // Smoothly transition intensity
    const targetIntensity = this.rainActive ? 1 : 0;
    if (this.rainIntensity < targetIntensity) {
        this.rainIntensity = Math.min(targetIntensity, this.rainIntensity + deltaTime * 0.001); // 1 sec to fade in
    } else if (this.rainIntensity > targetIntensity) {
        this.rainIntensity = Math.max(targetIntensity, this.rainIntensity - deltaTime * 0.001); // 1 sec to fade out
    }

    // Spawn new rain drops if intensity > 0
    if (this.rainIntensity > 0.01) {
      // Spawn rate based on screen width and intensity
      const spawnCount = Math.floor(5 * this.rainIntensity); 
      // Always spawn at least 1 occasionally if low intensity
      if (spawnCount === 0 && Math.random() < this.rainIntensity) {
           this.spawnRainDrop(cameraX);
      } else {
          for (let i = 0; i < spawnCount; i++) {
            this.spawnRainDrop(cameraX);
          }
      }
    }

    // Update existing rain drops
    // Swap-remove, same as particles.
    const drops = this.rainParticles;
    for (let i = drops.length - 1; i >= 0; i--) {
      const drop = drops[i];
      drop.y += drop.vy * (deltaTime * 0.001);
      drop.x -= 200 * (deltaTime * 0.001); // Slight wind to left
      // Remove if far below screen
      if (drop.y >= this.canvas.height + 100) {
        drops[i] = drops[drops.length - 1];
        drops.pop();
      }
    }
  }

  spawnRainDrop(cameraX) {
      if (this.rainParticles.length >= MAX_RAIN) return;
      this.rainParticles.push({
        x: cameraX + Math.random() * (this.canvas.width + 200), // Spawn wider to cover wind drift
        y: -50 - Math.random() * 50, // Start above screen
        vy: 800 + Math.random() * 400, // Fall speed (px/sec)
        length: 20 + Math.random() * 15,
        opacity: (0.6 + Math.random() * 0.4) * this.rainIntensity
    });
  }

  renderRain(cameraX) {
    if (this.rainParticles.length === 0 && this.rainIntensity <= 0.01) return;

    this.ctx.save();
    
    // Rain Filter / Overlay
    // Darken the screen slightly with a blueish tint, scaled by intensity
    if (this.rainIntensity > 0) {
        const alpha = 0.3 * this.rainIntensity;
        this.ctx.fillStyle = `rgba(20, 25, 40, ${alpha})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    this.ctx.strokeStyle = "rgba(174, 194, 224, 0.6)";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    
    this.rainParticles.forEach(drop => {
        const screenX = drop.x - cameraX;
        
        // Optimization: only draw if on screen
        if (screenX > -50 && screenX < this.canvas.width + 50) {
            this.ctx.moveTo(screenX, drop.y);
            this.ctx.lineTo(screenX - 5, drop.y + drop.length); // Angled slightly
        }
    });
    
    this.ctx.stroke();
    this.ctx.restore();
  }

  // Snow (V8): a pool of flakes sized by intensity and screen area (~130 at 1440x900 and
  // ~26 at 375x667 for 0.3). Flakes are spread over the whole sky and fade in, so the
  // snowfall arrives with the 1 s biome crossfade instead of trickling down from the top.
  updateSnow(deltaTime, cameraX) {
    const target = this.rainActive ? 0 : this.ambientSnow;
    const ease = deltaTime * 0.0003; // 0.3 per second
    if (this.snowIntensity < target) this.snowIntensity = Math.min(target, this.snowIntensity + ease);
    else if (this.snowIntensity > target) this.snowIntensity = Math.max(target, this.snowIntensity - ease);

    const flakes = this.snowFlakes;
    const w = this.canvas.width;
    const ground = Math.max(0, this.canvas.height - 80); // flakes land on the road top; >= 0 on a tiny viewport
    const count = Math.min(MAX_SNOW, Math.round((this.snowIntensity * (w + 40) * ground) / 2800));
    if (flakes.length > count) flakes.length = count;
    while (flakes.length < count) flakes.push(this.newFlake(cameraX, Math.random() * ground));

    const s = deltaTime * 0.001;
    const span = w + 40;
    for (const f of flakes) {
      f.y += f.vy * s;
      f.x += (Math.sin(f.phase + f.y * 0.02) * 15 - 20) * s; // flutter + a light wind to the left
      f.a = Math.min(1, f.a + s * 2); // fade in over 0.5 s
      if (f.y >= ground) {
        // Landed: back to the top somewhere in view, faded out.
        f.y = -10;
        f.a = 0;
        f.x = cameraX - 20 + Math.random() * span;
      }
      // Wrap around the view: the snowfall rides along instead of thinning out behind the bike.
      f.x = cameraX - 20 + ((((f.x - cameraX + 20) % span) + span) % span);
    }
  }

  newFlake(cameraX, y) {
    return {
      x: cameraX - 20 + Math.random() * (this.canvas.width + 40),
      y,
      vy: 40 + Math.random() * 50, // px per second
      size: Math.random() < 0.3 ? 3 : 2,
      phase: Math.random() * Math.PI * 2,
      a: 0,
    };
  }

  // Drawn after rain: one fillRect per flake (<= 200), alpha per flake for the fade-in.
  renderSnow(cameraX) {
    const flakes = this.snowFlakes;
    if (!flakes.length) return;
    const ctx = this.ctx;
    const alpha = ctx.globalAlpha;
    ctx.fillStyle = "#f4f8ff";
    for (const f of flakes) {
      ctx.globalAlpha = 0.9 * f.a;
      ctx.fillRect(Math.round(f.x - cameraX), Math.round(f.y), f.size, f.size);
    }
    ctx.globalAlpha = alpha;
  }
}

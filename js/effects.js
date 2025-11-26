// ===================================
// EFFECTS.JS - Visual Effects System
// ===================================

class EffectsManager {
  // accept world reference so clouds can be placed in world space and parallax relative to camera
  constructor(canvas, ctx, world) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.world = world;
    this.particles = [];
    this.clouds = [];
    this.windOffset = 0;

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
    const worldWidth =
      this.world && this.world.worldWidth
        ? this.world.worldWidth
        : this.canvas.width * 2;
    for (let i = 16; i < 32; i++) {
      // Increased count slightly
      // determine parallax per-cloud based on the global follow mode
      const parallaxValue =
        this.cloudFollowMode === "screen"
          ? 0
          : this.cloudFollowMode === "world"
          ? 1
          : 0.08 + Math.random() * 0.12;
      this.clouds.push({
        // place clouds in world coordinates so they parallax with camera
        x: Math.random() * worldWidth,
        // vertical placement and base height are proportional to canvas size
        y: Math.round((0.05 + Math.random() * 0.35) * this.canvas.height),
        // store desired draw height as percentage of canvas height to keep consistent across resolutions
        baseHeight: Math.round(
          (0.03 + Math.random() * 0.06) * this.canvas.height
        ),
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

  update(deltaTime, cameraX = 0) {
    this.windOffset += deltaTime * 0.001;

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
              const shift =
                (this.canvas.width + bufferRight + extraGap) / cloud.parallax;
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
              const shift =
                (this.canvas.width + bufferLeft + extraGap) / cloud.parallax;
              cloud.x += shift;
            }
          }
          cloud.y = Math.max(
            10,
            Math.min(
              this.canvas.height - 20,
              cloud.y + Math.floor((Math.random() - 0.5) * 20)
            )
          );
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

    // Update particles
    this.particles = this.particles.filter((particle) => {
      particle.life -= deltaTime;
      particle.x += particle.vx * deltaTime * 0.06;
      particle.y += particle.vy * deltaTime * 0.06;
      particle.opacity = particle.life / particle.maxLife;
      return particle.life > 0;
    });
  }

  render(cameraX) {
    // Backwards-compatible render: draw clouds then particles
    this.renderClouds(cameraX);
    this.renderParticles(cameraX);
  }

  // Draw only clouds (keeps particles separate so caller can control ordering)
  renderClouds(cameraX) {
    this.clouds.forEach((cloud) => {
      const sprite = this.cloudSprites[cloud.spriteIndex];

      if (sprite && sprite.complete) {
        this.ctx.save();
        this.ctx.globalAlpha = cloud.opacity;

        // Compute width from sprite aspect ratio so image isn't squashed (use baseHeight)
        const aspect = sprite.naturalWidth / sprite.naturalHeight || 1;
        const height = Math.round(cloud.baseHeight);
        const width = Math.round(height * aspect);

        // Draw cloud at world position, parallax relative to camera
        const screenX = cloud.x - cameraX * cloud.parallax;
        const sx = Math.floor(screenX);
        this.ctx.imageSmoothingEnabled = false;

        // Primary copy
        this.ctx.drawImage(sprite, sx, cloud.y, width, height);

        // Draw additional copies when the cloud crosses viewport boundaries.
        // Use +/- canvas.width so wrapping aligns to the viewport (avoid extra +width offsets).
        if (sx + width < 0) {
          this.ctx.drawImage(
            sprite,
            sx + this.canvas.width,
            cloud.y,
            width,
            height
          );
        }
        if (sx > this.canvas.width) {
          this.ctx.drawImage(
            sprite,
            sx - this.canvas.width,
            cloud.y,
            width,
            height
          );
        }

        this.ctx.restore();
      }
    });
  }

  // Draw only particle effects (so caller can render them after world)
  renderParticles(cameraX) {
    this.particles.forEach((particle) => {
      this.ctx.save();
      this.ctx.globalAlpha = particle.opacity;
      this.ctx.fillStyle = particle.color;
      this.ctx.fillRect(
        particle.x - cameraX,
        particle.y,
        particle.size,
        particle.size
      );
      this.ctx.restore();
    });
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
      this.particles.push({
        x: baseX + Math.random() * spreadX - spreadX / 2,
        y: baseY + Math.random() * spreadY,
        vx: (Math.random() - 0.5) * 2,
        vy: -Math.random() * 2,
        size: 2 + Math.random() * 2,
        color: "#8b7355",
        opacity: 1,
        life: 500 + Math.random() * 500,
        maxLife: 1000,
      });
    }
  }

  // createLeafParticles(x, y, opts)
  // - x,y: world coordinates by default
  // - opts.cameraX: number (optional) - current camera X if passing screen coords
  // - opts.isScreen: boolean (optional) - treat x,y as screen coords when true
  // - opts.count: number (optional) - how many leaf particles to spawn (default 1)
  // - opts.spreadX / opts.spreadY: numbers (optional) - spawn spread
  // - opts.force: boolean (optional) - force spawn (bypass internal randomness)
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
      this.particles.push({
        x: baseX + Math.random() * spreadX - spreadX / 2,
        y: baseY + Math.random() * spreadY,
        vx: (Math.random() - 0.5) * 1,
        vy: Math.random() * 1 + 0.5,
        size: 3 + Math.random() * 2,
        color: "#4b692f",
        opacity: 1,
        life: 2000 + Math.random() * 1000,
        maxLife: 3000,
      });
    }
  }

  getWindSway() {
    return Math.sin(this.windOffset) * 3;
  }
}

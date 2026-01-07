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
    
    // Rain properties
    this.rainActive = false;
    this.rainParticles = [];
    this.rainIntensity = 0; // 0 to 1 for smooth fade in/out

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
    this.updateRain(deltaTime, cameraX);
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
    this.renderTimeOverlay(); // Draw time overlay (behind rain)
    this.renderRain(cameraX);
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
    this.rainParticles = this.rainParticles.filter(drop => {
        drop.y += drop.vy * (deltaTime * 0.001);
        drop.x -= 200 * (deltaTime * 0.001); // Slight wind to left
        
        // Remove if far below screen
        return drop.y < this.canvas.height + 100;
    });
  }

  spawnRainDrop(cameraX) {
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
}

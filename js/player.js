// ===================================
// PLAYER.JS - Player & Motorcycle
// ===================================

class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.width = 200;
    this.height = 200;
    this.velocityX = 0;
    this.maxSpeed = 10; // top speed (px/frame-ish)
    // Movement tuning: ground accel, braking, and friction
    this.accelGround = 0.6; // acceleration when pressing throttle
    this.brake = 1.2; // stronger deceleration when reversing direction
    this.rollResistance = 0.985; // slight resistance while accelerating
    this.groundFriction = 0.88; // friction when no input (slows to stop)
    this.minSpeedThreshold = 0.12; // snap-to-zero threshold
    this.facingRight = true;

    // Animation
    this.currentAnimation = "idle";
    this.animationTimer = 0;
    this.animationDuration = 500; // ms untuk transisi

    // Sprites (each file is a complete animation, not a sprite sheet)
    this.sprites = {
      idle: null,
      init_move: null,
      move: null,
    };

    this.spritesLoaded = false;
    this.loadSprites();
    // track previous animation so we can trigger audio on changes
    this._prevAnimation = this.currentAnimation;

    // Wheel visual effect (no extra asset required)
    // `wheelOffsets` are positions relative to the sprite's top-left
    // where wheels are approximately located (x, y, radius).
    this.wheelAngle = 0; // current rotation angle (radians)
    this.wheelSpinMultiplier = 0.35; // how much velocity affects spin
    // Per-animation wheel offsets (x, y, radius) relative to sprite top-left
    this.wheelOffsetsByState = {
      idle: [
        { x: 43, y: 174, r: 22 },
        { x: 162, y: 173, r: 22 },
      ],
      init_move: [
        { x: 44, y: 174, r: 22 },
        { x: 162, y: 173, r: 22 },
      ],
      move: [
        { x: 49, y: 174, r: 22 },
        { x: 166, y: 173, r: 22 },
      ],
    };

    // Exhaust part (single image asset). Load once in constructor so it can complete.
    this.exhaustImage = new Image();
    this.exhaustLoaded = false;
    this.exhaustImage.onload = () => {
      this.exhaustLoaded = true;
      console.log("Loaded exhaust part");
    };
    this.exhaustImage.onerror = () => {
      console.error("Failed to load exhaust part");
    };
    this.exhaustImage.src = "assets/sprites/player-bike/part_exhaust.png";

    // Per-state exhaust offsets (x,y are center positions relative to sprite top-left; w/h size)
    this.exhaustOffsetsByState = {
      idle: [{ x: 52, y: 180, w: 45, h: 12 }],
      init_move: [{ x: 53, y: 180, w: 45, h: 12 }],
      move: [{ x: 57, y: 180, w: 45, h: 12 }],
    };

    // Splash/run-in-place helper
    this.splashMoving = false;
    this.splashTargetX = null;
    this.splashCallback = null;
    this.splashSpeed = null;
    // Prevent backtracking: minimum X player can move to (set after opening splash)
    // Start unlocked so the player/camera can reach world left on initial load.
    this.minX = 0;
    this.lockBacktrack = false;

    // Wheelie state
    this.wheelieActive = false;
    this.wheelieRotation = 0; // current rotation angle in radians
    this.wheelieMaxRotation = 0.35; // max tilt angle (~20 degrees)
    this.wheelieTransitionSpeed = 0.15; // how fast to transition in/out
    this.wheelieMinSpeed = this.maxSpeed; // minimum velocity to perform wheelie

    // Internal flag to differentiate an opening 'splash' (which should lock
    // backtracking when complete) from ad-hoc scripted moves (like offscreen
    // return). `startSplashMove` sets this to true; `moveTo` sets false.
    this._isOpeningSplash = false;
  }

  loadSprites() {
    const spriteNames = ["idle", "init_move", "move"];
    let loadedCount = 0;

    spriteNames.forEach((name) => {
      const img = new Image();
      img.src = `assets/sprites/player-bike/player_bike_${name}.png`;
      img.onload = () => {
        loadedCount++;
        console.log(`Loaded sprite: ${name} (${img.width}x${img.height})`);
        if (loadedCount === spriteNames.length) {
          console.log("All player sprites loaded!");
          this.spritesLoaded = true;
        }
      };
      img.onerror = () => {
        console.error(`Failed to load sprite: ${name}`);
      };
      this.sprites[name] = img;
    });
  }

  update(deltaTime, keys) {
    const isMovingRight = keys["ArrowRight"] || keys["d"] || keys["D"];
    const isMovingLeft = keys["ArrowLeft"] || keys["a"] || keys["A"];
    const oldAnim = this.currentAnimation;

    // If we're in a scripted 'splash' move, ignore player keys
    if (this.splashMoving) {
      // move toward target using fixed speed
      const dir = this.splashSpeed >= 0 ? 1 : -1;
      this.facingRight = dir > 0;
      this.velocityX = this.splashSpeed;

      // Apply friction lightly (keep movement smoother)
      this.velocityX *= 0.985;

      // --- Animation state machine while scripted movement ---
      // allow init_move -> move transition to happen even when keys are ignored
      if (this.currentAnimation === "idle") {
        this.currentAnimation = "init_move";
        this.animationTimer = 0;
      } else if (this.currentAnimation === "init_move") {
        this.animationTimer += deltaTime;
        if (this.animationTimer >= this.animationDuration) {
          this.currentAnimation = "move";
          this.animationTimer = 0;
        }
      }

      this.x += this.velocityX;

      // Check target reached (assume moving right for splash flow)
      if (
        (this.splashSpeed > 0 && this.x >= this.splashTargetX) ||
        (this.splashSpeed < 0 && this.x <= this.splashTargetX)
      ) {
        // stop
        this.x = this.splashTargetX;
        this.velocityX = 0;
        this.splashMoving = false;

        // Only lock backtracking/minX when this scripted move was the
        // initial opening 'splash'. Ad-hoc scripted moves (e.g. offscreen
        // return) should not change world start.
        if (this._isOpeningSplash) {
          this.minX = this.x;
          this.lockBacktrack = true;
        }

        // reset opening flag so subsequent scripted moves don't inherit state
        this._isOpeningSplash = false;

        if (typeof this.splashCallback === "function") {
          try {
            const traveled =
              typeof this._splashStartX === "number"
                ? this.x - this._splashStartX
                : this.splashTargetX - (this._splashStartX || 0);
            this.splashCallback(traveled);
          } catch (e) {
            console.error(e);
          }
        }
      }

      // Update wheel rotation during scripted splash as well
      const dtFactorSplash = deltaTime ? deltaTime / 16.6667 : 1;
      this.wheelAngle +=
        this.velocityX * this.wheelSpinMultiplier * dtFactorSplash;

      // Ensure engine sound plays during splash
      try {
         if (window.AudioManager && window.AudioManager.playEngine) {
             window.AudioManager.playEngine();
         }
         if (window.AudioManager && window.AudioManager.setEngineVolumeBySpeed) {
             const ratio = Math.min(1, Math.abs(this.velocityX) / this.maxSpeed);
             window.AudioManager.setEngineVolumeBySpeed(ratio);
         }
      } catch(e) {}

      return; // skip normal input handling while scripted move runs
    }
    // Handle input and animation transitions with smoother acceleration/braking
    const desiredDir = isMovingRight ? 1 : isMovingLeft ? -1 : 0;

    if (desiredDir !== 0) {
      // Set facing direction
      this.facingRight = desiredDir > 0;

      // If current velocity is opposite the desired direction, apply stronger braking
      if (this.velocityX * desiredDir < 0) {
        this.velocityX += desiredDir * this.brake;
      } else {
        // Normal acceleration toward desired direction
        this.velocityX += desiredDir * this.accelGround;
      }

      // Small roll resistance to avoid runaway speeds and to feel natural
      this.velocityX *= this.rollResistance;

      // Animation state machine
      if (this.currentAnimation === "idle") {
        this.currentAnimation = "init_move";
        this.animationTimer = 0;
      } else if (this.currentAnimation === "init_move") {
        this.animationTimer += deltaTime;
        if (this.animationTimer >= this.animationDuration) {
          this.currentAnimation = "move";
          this.animationTimer = 0;
        }
      }
    } else {
      // No input: apply ground friction to decelerate naturally
      this.velocityX *= this.groundFriction;
      if (Math.abs(this.velocityX) < this.minSpeedThreshold) {
        this.velocityX = 0;
        this.currentAnimation = "idle";
        this.animationTimer = 0;
      }
    }

    // Audio Engine Handling
    try {
        const speed = Math.abs(this.velocityX);
        if (speed > 0.1) { // lowered threshold slightly
             if (window.AudioManager && window.AudioManager.playEngine) {
                 window.AudioManager.playEngine();
             }
             // Dynamic volume based on speed (smoother stop)
             if (window.AudioManager && window.AudioManager.setEngineVolumeBySpeed) {
                 const ratio = Math.min(1, speed / this.maxSpeed);
                 window.AudioManager.setEngineVolumeBySpeed(ratio);
             }
        } else {
             if (window.AudioManager && window.AudioManager.stopEngine) {
                 window.AudioManager.stopEngine();
             }
        }
    } catch(e) {}

    // Clamp speed
    if (this.velocityX > this.maxSpeed) this.velocityX = this.maxSpeed;
    if (this.velocityX < -this.maxSpeed) this.velocityX = -this.maxSpeed;

    // Update position
    this.x += this.velocityX;

    // Update wheel rotation based on horizontal velocity.
    // Normalize by a nominal frame time (16.67ms) so speed feels consistent.
    const dtFactor = deltaTime ? deltaTime / 16.6667 : 1;
    this.wheelAngle += this.velocityX * this.wheelSpinMultiplier * dtFactor;

    // Handle wheelie activation (spacebar)
    const spacePressed = keys[" "] || keys["Space"];
    const movingFastEnough = Math.abs(this.velocityX) >= this.wheelieMinSpeed;
    
    // Update canWheelie state for UI tooltip
    this.canWheelie = movingFastEnough && !this.wheelieActive;
    
    if (spacePressed && movingFastEnough && !this.wheelieActive) {
      this.wheelieActive = true;
    } else if (!spacePressed && this.wheelieActive) {
      this.wheelieActive = false;
    }

    // Update wheelie rotation with smooth transitions
    if (this.wheelieActive && movingFastEnough) {
      // Transition to wheelie rotation
      this.wheelieRotation = Math.min(
        this.wheelieMaxRotation,
        this.wheelieRotation + this.wheelieTransitionSpeed * dtFactor
      );
    } else {
      // Transition back to normal
      this.wheelieRotation = Math.max(
        0,
        this.wheelieRotation - this.wheelieTransitionSpeed * dtFactor
      );
      if (this.wheelieRotation === 0) {
        this.wheelieActive = false;
      }
    }

    // Enforce backtrack lock: don't allow player to move left past `minX`.
    // NOTE: camera/backtrack locking is handled by `Game` (camera clamp).
    // We intentionally do NOT prevent the player's world X from decreasing
    // here so the player can still move left visually while the camera
    // remains clamped to the splash start. This allows the player to step
    // back (see-saw) without revealing off-screen world behind the splash.
  }

  // After update steps outside (caller of update should call render afterwards),
  // we can provide a small helper to be called by the game loop to sync audio
  // with animation changes. However, to simplify integration, callers don't
  // need to call it — we will update `_prevAnimation` inside `update` end.

  // Start a scripted splash movement: move `distance` pixels at `speed` (px/frame)
  startSplashMove(distance = 600, speed = 4, onComplete = null) {
    this.splashMoving = true;
    this._isOpeningSplash = true;
    this.splashSpeed = Math.abs(speed);
    // always move right for splash; set facing accordingly
    this.facingRight = true;
    // record start so we can report traveled distance later
    this._splashStartX = this.x;
    this.splashTargetX = this.x + Math.abs(distance);
    // callback will receive the traveled distance (in world units)
    this.splashCallback = onComplete;

    // Ensure animation starts transitioning into movement during splash
    this.currentAnimation = "init_move";
    this.animationTimer = 0;
  }

  // Move player toward an absolute target X in world coordinates.
  // `speed` is pixels/frame (positive number). If `targetX` is left
  // of the current position, the player will move left. `onComplete`
  // is called when the move finishes.
  moveTo(targetX, speed = 4, onComplete = null) {
    this.splashMoving = true;
    this._isOpeningSplash = false;
    // determine direction from current position to target
    const dir = targetX >= this.x ? 1 : -1;
    this.splashSpeed = Math.abs(speed) * dir; // signed speed
    this._splashStartX = this.x;
    this.splashTargetX = targetX;
    this.splashCallback = onComplete;

    // Set animation to transition into movement
    this.currentAnimation = "init_move";
    this.animationTimer = 0;
  }

  render(ctx, cameraX) {
    const sprite = this.sprites[this.currentAnimation];

    if (!sprite || !sprite.complete || !this.spritesLoaded) {
      // Fallback rectangle if sprite not loaded
      const screenX = this.x - cameraX;
      ctx.fillStyle = "#3498db";
      ctx.fillRect(screenX, this.y, this.width, this.height);
      ctx.fillStyle = "#fff";
      ctx.font = "12px monospace";
      ctx.fillText("Loading...", screenX, this.y - 10);
      // Draw wheel overlays so player still has moving wheels while loading
      this.drawWheels(ctx, screenX);
      return;
    }

    // Draw sprite with wheelie rotation
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    const screenX = this.x - cameraX;

    // Apply wheelie rotation if active
    if (this.wheelieRotation > 0) {
      // Get rear wheel position as pivot point
      const wheelOffsets = this.wheelOffsetsByState[this.currentAnimation] || 
                          this.wheelOffsetsByState.idle;
      
      // Calculate pivot based on facing direction
      let pivotX, pivotY;
      if (this.facingRight) {
        // Rear wheel is on the left when facing right
        pivotX = screenX + (wheelOffsets && wheelOffsets[0] ? wheelOffsets[0].x : 43);
        pivotY = this.y + (wheelOffsets && wheelOffsets[0] ? wheelOffsets[0].y : 174);
      } else {
        // Rear wheel is on the right when facing left (mirrored)
        pivotX = screenX + (wheelOffsets && wheelOffsets[0] ? this.width - wheelOffsets[0].x : this.width - 43);
        pivotY = this.y + (wheelOffsets && wheelOffsets[0] ? wheelOffsets[0].y : 174);
      }
      
      // Translate to rear wheel, rotate, then translate back
      ctx.translate(pivotX, pivotY);
      // Rotate based on facing direction: negative for wheelie when facing right, positive when facing left
      const rotationAngle = this.facingRight ? -this.wheelieRotation : this.wheelieRotation;
      ctx.rotate(rotationAngle);
      ctx.translate(-pivotX, -pivotY);
    }

    // Flip sprite if moving/facing left
    if (!this.facingRight) {
      ctx.scale(-1, 1);
      ctx.drawImage(
        sprite,
        -(screenX + this.width),
        this.y,
        this.width,
        this.height
      );
    } else {
      ctx.drawImage(sprite, screenX, this.y, this.width, this.height);
    }

    // Draw wheels and exhaust BEFORE restoring context so they follow the rotation
    this.drawWheels(ctx, screenX);
    this.drawExhaust(ctx, screenX);

    ctx.restore();
  }

  // Draw rotating wheel overlays at the configured offsets.
  drawWheels(ctx, screenX) {
    const offsetsArr =
      (this.wheelOffsetsByState &&
        this.wheelOffsetsByState[this.currentAnimation]) ||
      (this.wheelOffsetsByState && this.wheelOffsetsByState.idle);
    if (!offsetsArr || !offsetsArr.length) return;

    ctx.save();
    ctx.lineJoin = "round";

    for (let i = 0; i < offsetsArr.length; i++) {
      const off = offsetsArr[i];
      // When facingRight is false, the context is already scaled(-1, 1)
      // so we need to use negative coordinates
      let cx, cy;
      if (!this.facingRight) {
        // Context is flipped, so use negative X coordinate
        cx = -(screenX + this.width - off.x);
        cy = this.y + off.y;
      } else {
        cx = screenX + off.x;
        cy = this.y + off.y;
      }

      ctx.translate(cx, cy);

      // small variation per wheel (alternate directions for visual interest)
      const direction = this.facingRight ? 1 : -1;
      const wheelDir = (i % 2 === 0 ? 1 : -1) * direction;
      const angle = this.wheelAngle * wheelDir;
      ctx.rotate(angle);

      // Rim
      ctx.beginPath();
      ctx.strokeStyle = "rgba(20,20,20,0.95)";
      ctx.lineWidth = Math.max(2, off.r * 0.12);
      ctx.arc(0, 0, off.r, 0, Math.PI * 2);
      ctx.stroke();

      // Spokes
      const spokeCount = 32;
      ctx.lineWidth = Math.max(0.1, off.r * 0.04);
      ctx.strokeStyle = "rgba(200,200,200,0.9)";
      for (let s = 0; s < spokeCount; s++) {
        const a = (Math.PI * 2 * s) / spokeCount;
        const inner = off.r * 0.2;
        const outer = off.r * 0.86;
        ctx.beginPath();
        ctx.moveTo(inner * Math.cos(a), inner * Math.sin(a));
        ctx.lineTo(outer * Math.cos(a), outer * Math.sin(a));
        ctx.stroke();
      }

      // Hub
      ctx.beginPath();
      ctx.fillStyle = "rgba(40,40,40,0.95)";
      ctx.arc(0, 0, off.r * 0.18, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(-angle);
      ctx.translate(-cx, -cy);
    }

    ctx.restore();
  }

  // Draw exhaust part(s) per-state. Exhaust offsets are centers relative to sprite.
  drawExhaust(ctx, screenX) {
    if (!this.exhaustOffsetsByState) return;
    const offsets =
      this.exhaustOffsetsByState[this.currentAnimation] ||
      this.exhaustOffsetsByState.idle;
    if (!offsets || !offsets.length) return;

    ctx.save();

    for (let i = 0; i < offsets.length; i++) {
      const off = offsets[i];

      // Compute center position accounting for context transformation
      let cx, cy;
      if (!this.facingRight) {
        // Context is already flipped, use negative X coordinate
        cx = -(screenX + this.width - off.x);
        cy = this.y + off.y;
      } else {
        cx = screenX + off.x;
        cy = this.y + off.y;
      }

      const w = off.w || 40;
      const h = off.h || 16;

      if (this.exhaustLoaded && this.exhaustImage.complete) {
        // Draw exhaust image (no additional flipping needed, context is already transformed)
        ctx.drawImage(this.exhaustImage, cx - w / 2, cy - h / 2, w, h);
      } else {
        // Simple fallback rectangle so exhaust position is visible even if image missing
        ctx.fillStyle = "rgba(160,80,20,0.9)";
        ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
      }
    }

    ctx.restore();
  }

  getBounds() {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
    };
  }
}

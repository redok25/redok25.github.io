// ===================================
// SPECIAL-NPC.JS - Minigame NPC Engine
// ===================================

class SpecialNPC {
  constructor(config) {
    this.x = config.x || 0;
    this.y = config.y || 0;
    this.minigameId = config.minigameId || null;
    this.width = config.width || 87;
    this.height = config.height || 87;

    // Animation state
    this.state = "idle";
    this.direction = 1;
    this.frameTimer = 0;
    this.currentFrame = 0;
    this.animationSpeed = 200;

    // Sprites
    this.sprites = {
      idle: null,
      moveLeft: null,
      moveRight: null,
    };

    this.loaded = false;
    this.loadSprites();

    // AI / Movement logic
    this.homeX = this.x;
    this.patrolRadius = config.patrolRadius || 100;
    this.speed = 0.5;
    this.moveTimer = 0;
    this.isMoving = false;
    this.waitTime = 0;
  }

  loadSprites() {
    const types = ["idle", "move_left_leg", "move_right_leg"];
    let loadedCount = 0;
    const targetCount = 3;

    types.forEach((type) => {
      const img = new Image();
      const suffix = type;

      // Load from special-npc folder using minigameId
      img.src = `assets/sprites/special-npc/${this.minigameId}_${suffix}.png`;

      img.onload = () => {
        loadedCount++;
        if (type === "idle") {
          const ratio = img.naturalWidth / img.naturalHeight;
          this.width = this.height * ratio;
        }
        if (loadedCount === targetCount) {
          console.log(`Special NPC ${this.minigameId} loaded all sprites.`);
          this.loaded = true;
        }
      };

      img.onerror = () => {
        console.error(`Failed to load sprite: ${img.src}`);
      };

      if (type === "idle") this.sprites.idle = img;
      else if (type === "move_left_leg") this.sprites.moveLeft = img;
      else if (type === "move_right_leg") this.sprites.moveRight = img;
    });
  }

  update(deltaTime) {
    if (!this.loaded) return;

    this.updateAI(deltaTime);
    this.updateAnimation(deltaTime);
  }

  updateAI(deltaTime) {
    if (this.isMoving) {
      this.x += this.speed * this.direction;
      this.moveTimer -= deltaTime;

      if (
        this.moveTimer <= 0 ||
        Math.abs(this.x - this.homeX) > this.patrolRadius
      ) {
        this.isMoving = false;
        this.waitTime = 1000 + Math.random() * 2000;
      }
    } else {
      this.waitTime -= deltaTime;
      if (this.waitTime <= 0) {
        this.isMoving = true;
        this.moveTimer = 1000 + Math.random() * 3000;

        if (this.x < this.homeX - this.patrolRadius) {
          this.direction = 1;
        } else if (this.x > this.homeX + this.patrolRadius) {
          this.direction = -1;
        } else {
          this.direction = Math.random() > 0.5 ? 1 : -1;
        }
      }
    }
  }

  updateAnimation(deltaTime) {
    if (this.isMoving) {
      this.frameTimer += deltaTime;
      if (this.frameTimer >= this.animationSpeed) {
        this.frameTimer = 0;
        this.currentFrame = (this.currentFrame + 1) % 4;
      }
      this.state = "move";
    } else {
      this.currentFrame = 1;
      this.state = "idle";
    }
  }

  render(ctx, cameraX) {
    if (!this.loaded) return;

    const screenX = this.x - cameraX;
    const screenY = this.y;

    ctx.save();

    // Flip sprite if direction is left (-1)
    const pivotX = screenX + this.width / 2;

    ctx.translate(pivotX, screenY);
    if (this.direction === -1) {
      ctx.scale(-1, 1);
    }
    ctx.translate(-pivotX, -screenY);

    let spriteToDraw = this.sprites.idle;
    if (this.isMoving) {
      if (this.currentFrame === 0) spriteToDraw = this.sprites.moveLeft;
      else if (this.currentFrame === 1) spriteToDraw = this.sprites.idle;
      else if (this.currentFrame === 2) spriteToDraw = this.sprites.moveRight;
      else spriteToDraw = this.sprites.idle;
    } else {
      spriteToDraw = this.sprites.idle;
    }

    if (spriteToDraw) {
      ctx.drawImage(spriteToDraw, screenX, screenY, this.width, this.height);
    }

    ctx.restore();

    // Draw Minigame Badge
    this.renderBadge(ctx, screenX + this.width / 2, screenY - 25);
  }

  renderBadge(ctx, x, y) {
    const invites = {
      wheelie_challenge: "Main Wheelie?",
      red_light_green_light: "Main Lampu Merah?",
      drag_race: "Balapan Yuk!",
    };

    const text = invites[this.minigameId] || "Main Game?";

    ctx.save();

    const floatOffset = Math.sin(Date.now() * 0.005) * 5;
    const bubbleY = y - 40 + floatOffset;

    ctx.font = "bold 14px 'VT323', monospace";
    const padding = 8;
    const textMetrics = ctx.measureText(text);
    const textW = textMetrics.width;
    const bubbleW = textW + padding * 2;
    const bubbleH = 26;
    const bubbleX = x - bubbleW / 2;

    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.rect(bubbleX, bubbleY, bubbleW, bubbleH);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - 5, bubbleY + bubbleH);
    ctx.lineTo(x + 5, bubbleY + bubbleH);
    ctx.lineTo(x, bubbleY + bubbleH + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, bubbleY + bubbleH / 2);

    ctx.restore();
  }

  handleClick(mouseX, mouseY, cameraX) {
    const screenX = this.x - cameraX;
    const screenY = this.y;

    if (
      mouseX >= screenX &&
      mouseX <= screenX + this.width &&
      mouseY >= screenY &&
      mouseY <= screenY + this.height
    ) {
      if (this.minigameId && window.game && window.game.minigames) {
        window.game.minigames.startMinigame(this.minigameId);
      }
      return true;
    }
    return false;
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

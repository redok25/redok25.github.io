// ===================================
// NPC.JS - Non-Playable Character
// ===================================

class NPC {
  constructor(config) {
    this.x = config.x || 0;
    this.y = config.y || 0;
    this.id = config.id || 'npc1'; // npc1, npc2, npc3
    this.width = config.width || 87;
    this.height = config.height || 87;
    
    // Animation state
    this.state = "idle"; // idle, move
    this.direction = 1; // 1 = right, -1 = left
    this.frameTimer = 0;
    this.currentFrame = 0;
    this.animationSpeed = 200; // ms per frame
    
    // Sprites
    this.sprites = {
      idle: null,
      moveLeft: null, 
      moveRight: null 
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
    
    // Chat logic
    this.chats = [];
    this.chatBubble = null; // { text, timer, alpha }
    
    // Load chat data
    this.loadChats();
  }

  loadSprites() {
    const types = ['idle', 'move_left_leg', 'move_right_leg'];
    let loadedCount = 0;
    const targetCount = 3; // Expect 3 sprites
    
    types.forEach(type => {
      const img = new Image();
      // Filename format:
      // idle -> npc1_idle.png
      // move_left_leg -> npc1_move_left_leg.png
      const suffix = type; 
      img.src = `assets/sprites/npc/${this.id}_${suffix}.png`;
      img.onload = () => {
        loadedCount++;
        // If it's the idle sprite, set dimensions based on it
        if (type === 'idle') {
            const ratio = img.naturalWidth / img.naturalHeight;
            this.width = this.height * ratio;
        }
        if (loadedCount === targetCount) {
             console.log(`NPC ${this.id} loaded all sprites.`);
             this.loaded = true;
        }
      };
      img.onerror = () => {
        console.error(`Failed to load sprite: ${img.src}`);
      };
      
      if (type === 'idle') this.sprites.idle = img;
      else if (type === 'move_left_leg') this.sprites.moveLeft = img;
      else if (type === 'move_right_leg') this.sprites.moveRight = img;
    });
  }

  loadChats() {
    // Fetch global chat data
    fetch('assets/data/npc_chats.json')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
            this.chats = data;
        }
      })
      .catch(err => console.error("Failed to load NPC chats", err));
  }

  update(deltaTime) {
    if (!this.loaded) return;

    this.updateAI(deltaTime);
    this.updateAnimation(deltaTime);
    this.updateChat(deltaTime);
  }

  updateAI(deltaTime) {
    if (this.isMoving) {
      this.x += this.speed * this.direction;
      this.moveTimer -= deltaTime;
      
      // Stop if move timer runs out OR if we hit the patrol boundary
      if (this.moveTimer <= 0 || Math.abs(this.x - this.homeX) > this.patrolRadius) {
        this.isMoving = false;
        this.waitTime = 1000 + Math.random() * 2000; // wait 1-3s
      }
    } else {
      this.waitTime -= deltaTime;
      if (this.waitTime <= 0) {
        this.isMoving = true;
        this.moveTimer = 1000 + Math.random() * 3000; // Move for 1-4 seconds
        
        // Intelligent direction choice:
        // If outside left bound, go right.
        // If outside right bound, go left.
        // Otherwise random.
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
      if (this.frameTimer > this.animationSpeed) {
        this.frameTimer = 0;
        // Cycle: Left -> Idle -> Right -> Idle
        this.currentFrame = (this.currentFrame + 1) % 4; 
      }
    } else {
      this.currentFrame = 0; // Idle
    }
  }
  
  updateChat(deltaTime) {
    if (this.chatBubble) {
      this.chatBubble.timer -= deltaTime;
      if (this.chatBubble.timer <= 0) {
        this.chatBubble = null;
      }
    }
  }

  render(ctx, cameraX) {
    if (!this.loaded) return;

    // Check visibility
    if (this.x - cameraX + this.width < 0 || this.x - cameraX > ctx.canvas.width) {
        return;
    }

    const screenX = this.x - cameraX;
    const screenY = this.y;

    ctx.save();
    
    // Flip if direction is left (-1)
    // Assuming default sprites face right. If they face left, invert logic.
    // Let's assume they face FRONT or RIGHT. The user said "move left leg", "move right leg", "idle". 
    // Usually top-down or side-scroller. Given "move left leg", it sounds like a walk cycle.
    // If side scroller, we flip.
    
    // Center pivot for flipping
    const pivotX = screenX + this.width / 2;
    
    ctx.translate(pivotX, screenY);
    if (this.direction === -1) {
        ctx.scale(-1, 1);
    }
    ctx.translate(-pivotX, -screenY);

    let spriteToDraw = this.sprites.idle;
    if (this.isMoving) {
        // 0: Left, 1: Idle, 2: Right, 3: Idle
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

    // Draw Chat Bubble
    if (this.chatBubble) {
        this.renderChatBubble(ctx, screenX + this.width / 2, screenY - 10);
    }
  }

  renderChatBubble(ctx, x, y) {
    const text = this.chatBubble.text;
    ctx.font = "14px 'VT323', monospace";
    const padding = 10;
    const textWidth = ctx.measureText(text).width;
    const boxWidth = textWidth + padding * 2;
    const boxHeight = 30;
    
    // Bubble background
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    
    // Centered bubble
    const startX = x - boxWidth / 2;
    const startY = y - boxHeight;
    
    // Draw box
    ctx.fillRect(startX, startY, boxWidth, boxHeight);
    ctx.strokeRect(startX, startY, boxWidth, boxHeight);
    
    // Triangle (Tail)
    ctx.beginPath();
    ctx.moveTo(x - 5, startY + boxHeight);
    ctx.lineTo(x + 5, startY + boxHeight);
    ctx.lineTo(x, startY + boxHeight + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, startY + boxHeight / 2);
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
        this.triggerChat();
        return true;
    }
    return false;
  }

  triggerChat() {
    if (this.chats.length === 0) return;
    const randomMsg = this.chats[Math.floor(Math.random() * this.chats.length)];
    this.chatBubble = {
        text: randomMsg,
        timer: 3000 // Show for 3 seconds
    };
  }
}

// ===================================
// NPC.JS - Non-Playable Character
// W7, NPCs that remember and react: a regular NPC stops and looks at the bike within
// FACE_RANGE, shows "!" when it wheelies past, greets on first sight (the first NPC met each
// load speaks the visit memory, D537), and talks from its own shuffle bag on a tap or E.
// Reactions sleep during the opening ride and a minigame course: game.js passes a NaN bike.
// ===================================
import { JOR } from "./helpers.js";
import { COPY } from "./copy.js";

const FACE_RANGE = 200; // px, bike centre to NPC centre: stop and look at it
const FACE_DEAD = 8; // px: no flip-flop while the bike's centre crosses the NPC's
const LOOK_MS = 800; // keeps looking this long after the bike leaves, then patrols again
const ALERT_RANGE = 150; // px: a wheelie this close earns a "!"
const ALERT_MS = 1200; // the "!" stays this long after the last step a wheelie was in range
const CHAT_MS = 3000; // bubble life (sim time: frozen while paused)

// The tags of assets/data/npc_chats.json. "greeting" is said on first sight; the rest is talk
// for a tap or E. "hintCheat" lines ask for typing, so they sit out on touch screens.
export const CHAT_TAGS = ["greeting", "fakta", "joke", "flavor", "hintCheat", "tipsMinigame"];

// Talk about the sky ("cerah", "hujan") sits out while it rains or snows.
export const DRY = /cerah|hujan/i;

// Any JSON in, { greeting, talk } out, never a throw. The tagged object is the format; a
// cached copy of the old flat array can still meet this file, so it loads as talk only.
export function normaliseChats(data, keyboard = true) {
  const strings = (a) => (Array.isArray(a) ? a.filter((s) => typeof s === "string" && s !== "") : []);
  if (Array.isArray(data)) return { greeting: [], talk: strings(data) };
  const o = data && typeof data === "object" ? data : {};
  const talk = [];
  for (const tag of CHAT_TAGS) {
    if (tag === "greeting" || (tag === "hintCheat" && !keyboard)) continue;
    talk.push(...strings(o[tag]));
  }
  return { greeting: strings(o.greeting), talk };
}

// One NPC's shuffle bag (W7): every line once before any repeats, and never the same line
// twice in a row, not even across a refill. While wet, dry lines are skipped (they come back
// with the next refill). `bag` is the NPC's own array of indexes. -1 = nothing to say.
export function drawLine(bag, lines, last, wet) {
  for (let tries = 0; tries <= 2 * lines.length; tries++) {
    if (bag.length === 0) {
      for (let i = 0; i < lines.length; i++) bag.push(i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = bag[i];
        bag[i] = bag[j];
        bag[j] = t;
      }
    }
    const i = bag.pop();
    if (i === undefined) return -1;
    if (i !== last && !(wet && DRY.test(lines[i]))) return i;
  }
  return -1;
}

// The visit memory (D537), from JOR.visit = { record: { count }, returning, sameDay }:
// a first visit, a new day (count = days visited) or a same-day reload. No visit, no line.
export function memoryLine(visit) {
  if (!visit || !visit.record) return null;
  if (!visit.returning) return COPY.npc.first;
  if (visit.sameDay) return COPY.npc.sameDay;
  return JOR.fillTokens(COPY.npc.returning, { visitCount: visit.record.count });
}

// Two rows at most: a line wider than the canvas splits at the space nearest its middle.
export function splitLine(text) {
  const mid = text.length / 2;
  let best = -1;
  for (let i = text.indexOf(" "); i >= 0; i = text.indexOf(" ", i + 1)) {
    if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i;
  }
  return best < 0 ? [text] : [text.slice(0, best), text.slice(best + 1)];
}

// One fetch for every NPC (was one per NPC); the result is shared and never mutated.
const NO_LINES = { greeting: [], talk: [] };
let chatsPromise = null;
const loadChatLines = () =>
  (chatsPromise ??= fetch("assets/data/npc_chats.json")
    .then((res) => res.json())
    .then((data) => normaliseChats(data, !matchMedia("(pointer: coarse)").matches))
    .catch((err) => {
      console.error("Failed to load NPC chats", err);
      return NO_LINES;
    }));

// The visit memory is said once per page load, by the first NPC the bike meets while the
// phone gesture sheet (shown after every opening ride on touch, z 10005, no pause) is gone.
let memorySaid = false;
const sheetUp = () => {
  const g = document.getElementById("gesture-info");
  return !!g && !g.classList.contains("hidden");
};

export class NPC {
  constructor(config) {
    this.x = config.x || 0;
    this.y = config.y || 0;
    this.id = config.id || "npc1"; // npc1, npc2, npc3
    this.width = config.width || 87;
    this.height = config.height || 87;

    // Animation state
    this.state = "idle"; // idle, move
    this.direction = 1; // where it walks: 1 = right, -1 = left
    this.facing = 1; // where it looks (W7): the walk direction, or the bike while it is near
    this.frameTimer = 0;
    this.currentFrame = 0;
    this.animationSpeed = 200; // ms per frame

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

    // Reactions (W7)
    this.near = false; // the bike was within FACE_RANGE last step
    this.alertTimer = 0; // ms left on the "!"
    this.greeted = false; // said its first-sight line this load

    // Chat logic
    this.lines = NO_LINES; // shared, read-only
    this.bag = []; // this NPC's own shuffle bag of talk indexes
    this.lastLine = -1;
    this.rainNext = Math.floor(Math.random() * COPY.npc.rain.length);
    this.chatBubble = null; // { text, timer, rows, w }: rows and w are laid out on first draw

    // Load chat data
    this.loadChats();
  }

  loadSprites() {
    const types = ["idle", "move_left_leg", "move_right_leg"];
    let loadedCount = 0;
    const targetCount = 3; // Expect 3 sprites

    types.forEach((type) => {
      const img = new Image();
      // Filename format:
      // idle -> npc1_idle.png
      // move_left_leg -> npc1_move_left_leg.png
      const suffix = type;

      // Standard NPC path
      img.src = `assets/sprites/npc/${this.id}_${suffix}.png`;

      img.onload = () => {
        loadedCount++;
        // If it's the idle sprite, set dimensions based on it
        if (type === "idle") {
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

      if (type === "idle") this.sprites.idle = img;
      else if (type === "move_left_leg") this.sprites.moveLeft = img;
      else if (type === "move_right_leg") this.sprites.moveRight = img;
    });
  }

  loadChats() {
    loadChatLines().then((lines) => {
      this.lines = lines;
    });
  }

  // Once per sim step. bikeX = the bike's centre, NaN while NPCs must not react; wheelie =
  // the bike is on its back wheel; fx = the effects manager (weather). Allocates nothing.
  update(deltaTime, bikeX = NaN, wheelie = false, fx = null) {
    if (!this.loaded) return;

    const dx = bikeX - (this.x + this.width / 2); // NaN: every comparison below is false
    const near = Math.abs(dx) < FACE_RANGE;
    if (near) {
      if (!this.near) this.greet(fx); // the bike just came into view
      if (dx > FACE_DEAD) this.facing = 1;
      else if (dx < -FACE_DEAD) this.facing = -1;
      this.isMoving = false; // stand still to look: no moonwalk
      this.waitTime = LOOK_MS;
    } else {
      this.updateAI(deltaTime);
    }
    this.near = near;

    if (wheelie && Math.abs(dx) < ALERT_RANGE) this.alertTimer = ALERT_MS;
    else if (this.alertTimer > 0) this.alertTimer -= deltaTime;

    this.updateAnimation(deltaTime);
    this.updateChat(deltaTime);
  }

  updateAI(deltaTime) {
    if (this.isMoving) {
      this.x += this.speed * this.direction;
      this.moveTimer -= deltaTime;

      // Stop if move timer runs out OR if we hit the patrol boundary
      if (
        this.moveTimer <= 0 ||
        Math.abs(this.x - this.homeX) > this.patrolRadius
      ) {
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
        this.facing = this.direction;
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
    if (
      this.x - cameraX + this.width < 0 ||
      this.x - cameraX > ctx.canvas.width
    ) {
      return;
    }

    const screenX = this.x - cameraX;
    const screenY = this.y;

    ctx.save();

    // The sprites face right: flip around the centre when the NPC looks left.
    const pivotX = screenX + this.width / 2;

    ctx.translate(pivotX, screenY);
    if (this.facing === -1) {
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
  }

  // Bubble and "!" (W7), drawn by game.render after the bike, the night tint and the rain, so
  // they stay readable. Nothing to draw = no canvas state touched.
  renderOverlay(ctx, cameraX) {
    if (!this.loaded || (!this.chatBubble && this.alertTimer <= 0)) return;
    const screenX = this.x - cameraX;
    if (screenX + this.width < 0 || screenX > ctx.canvas.width) return;
    const x = screenX + this.width / 2;
    ctx.save();
    const top = this.chatBubble ? this.renderChatBubble(ctx, x, this.y - 10) - 4 : this.y - 6;
    if (this.alertTimer > 0) {
      ctx.font = "bold 28px 'VT323', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#1a1c2c";
      ctx.fillStyle = "#ffcd75";
      ctx.strokeText("!", x, top);
      ctx.fillText("!", x, top);
    }
    ctx.restore();
  }

  // Draws the bubble with its tail at (x, y); returns the bubble's top y. Laid out once per
  // bubble (no measureText per frame): one row, or two when wider than the canvas (phones).
  renderChatBubble(ctx, x, y) {
    const b = this.chatBubble;
    const padding = 10;
    const rowH = 16;
    ctx.font = "14px 'VT323', monospace";
    if (!b.rows) {
      const fits = ctx.canvas.width - 8 - padding * 2;
      b.rows = ctx.measureText(b.text).width > fits ? splitLine(b.text) : [b.text];
      for (const row of b.rows) b.w = Math.max(b.w, ctx.measureText(row).width);
    }
    const boxWidth = b.w + padding * 2;
    const boxHeight = 14 + rowH * b.rows.length; // 30 for one row, as before

    // Centred over the NPC but kept on the canvas; the tail stays over the NPC.
    const startX = Math.max(4, Math.min(x - boxWidth / 2, ctx.canvas.width - 4 - boxWidth));
    const startY = y - boxHeight;
    const tailX = Math.max(startX + 6, Math.min(x, startX + boxWidth - 6));

    // Bubble background
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.fillRect(startX, startY, boxWidth, boxHeight);
    ctx.strokeRect(startX, startY, boxWidth, boxHeight);

    // Triangle (Tail)
    ctx.beginPath();
    ctx.moveTo(tailX - 5, y);
    ctx.lineTo(tailX + 5, y);
    ctx.lineTo(tailX, y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = startX + boxWidth / 2;
    for (let i = 0; i < b.rows.length; i++) ctx.fillText(b.rows[i], cx, startY + 15 + rowH * i);
    return startY;
  }

  // First sight (W7): the first NPC met this load speaks the visit memory (D537); after that
  // a rain line while it rains, else this NPC's one greeting. A bubble already up wins.
  greet(fx) {
    if (this.chatBubble) return;
    let text = memorySaid || sheetUp() ? null : memoryLine(JOR.visit);
    if (text) memorySaid = true;
    if (!text && fx && fx.rainActive) {
      text = COPY.npc.rain[this.rainNext];
      this.rainNext = (this.rainNext + 1) % COPY.npc.rain.length;
    } else if (!text && !this.greeted) {
      const g = this.lines.greeting;
      if (g.length) text = g[Math.floor(Math.random() * g.length)];
    }
    this.greeted = true;
    if (text) this.say(text);
  }

  // A tap or E (W7): the next line from this NPC's own bag. fx = the effects manager.
  triggerChat(fx = null) {
    const talk = this.lines.talk;
    const wet = !!fx && (fx.rainActive || fx.ambientSnow > 0);
    const i = drawLine(this.bag, talk, this.lastLine, wet);
    if (i < 0) return;
    this.lastLine = i;
    this.say(talk[i]);
  }

  say(text) {
    this.chatBubble = {
      // {projectCount}, {firstYear}, ... come from the Quick View project list (D498).
      text: JOR.fillTokens(text, JOR.contentTokens(document)),
      timer: CHAT_MS,
      rows: null,
      w: 0,
    };
  }
}

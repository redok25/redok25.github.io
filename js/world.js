// ===================================
// WORLD.JS - World & Environment
// ===================================
import { NPC } from "./npc.js";
import { SpecialNPC } from "./special-npc.js";
import { CHAPTERS, createBiomeFade, stepBiomeFade, biomeWeight } from "./journey.js";
import { COPY } from "./copy.js";
import { JOR } from "./helpers.js";
import { KOPI, KOPI_SIZE, kopiShown, goldPixel } from "./kopi.js";

const NPC_HEIGHT = 87; // NPC draw height (npc.js / special-npc.js default)
const BIOMES = ["normal", "autumn", "winter"];
// winter/5.png is byte-identical to normal/5.png: the winter sky is a cold gradient (sky slot).
const WINTER_SKY = ["#a7b8c8", "#eef3f7"];
// Autumn trees (V2): an orange wash over each tree sprite's opaque pixels.
const AUTUMN_TREE_TINT = "rgba(214, 110, 30, 0.55)";
// Decoration props (V4; sprites restored from commit 3c215ff, license D512): passive scenery
// in the tree plane, never in world.objects. x = left edge in world px (R3 zones). Scale is
// nearest-neighbour. lift raises a prop off its ground line: the laundry hangs on Fence 1's
// top rail (sprite row 5 x 3 = 15 px below the fence top).
const PROPS = [
  { file: "house", x: 150, scale: 3 }, // the bike leaves from its door (start x 200)
  { file: "fence-1", x: 760, scale: 3 },
  { file: "laundry", x: 759, scale: 3, lift: 3 },
  { file: "fence-2", x: 991, scale: 3 },
  { file: "fence-1", x: 3010, scale: 3 }, // Bab 1: Kopi Rahasia #1 sits on its lower rail (kopi.js)
  { file: "wooden-shed", x: 4661, scale: 3 }, // roofs the Skills sign (center 4835)
  { file: "barrel", x: 4676, scale: 3 },
  { file: "standing-torch", x: 5747, scale: 2 }, // either side of the warung (5771-6112)
  { file: "standing-torch", x: 6110, scale: 2 },
  { file: "standing-torch", x: 6890, scale: 2 }, // by the mailbox (6771-6871)
  { file: "stacked-rocks", x: 7040, scale: 3 },
];
// A prop's foot ends 12 px above the road: the grass strip (drawn after it) covers 8 px of it.
const PROP_SINK = 12;

// Year billboards (W1, R3, R17): centre x per project year in Bab 3. Count and icons come
// from the Quick View list (D498); a year without a slot or without projects gets none.
const BILLBOARD_X = { 2021: 5300, 2022: 5500, 2023: 5700, 2024: 6142, 2025: 6342 };
const BOARD_W = 120; // panel width (billboards stand 200 px apart)
const BOARD_H = 78; // panel height
const POST_H = 56; // legs under the panel
const BILLBOARD_SINK = 20; // stands on the grass like the stations (groundOffset -20)
const SIGN_INK = "#3b2414";
const SIGN_FACE = "#f4e4c1";
const SIGN_WOOD = "#5a3a22";

// Skill gauges (W2, R3, R26): centre x of the six posts in Bab 2, in Quick View order.
// Passive scenery in the props plane: never E targets, never in world.objects.
const GAUGE_X = [4100, 4200, 4300, 4400, 4500, 4600];
const GAUGE_W = 72;
const GAUGE_H = 118;
const GAUGE_RADIUS = 300; // the bike's centre within this fills a gauge
const GAUGE_FILL_STEP = 1 / 48; // empty -> full in 0.8 s of sim steps
const GAUGE_FILL = "#38b764";
const GAUGE_BAR = { x: 9, y: 27, w: 54, h: 10 }; // the bar well inside the baked panel

// Pre-tinted copy of a loaded sprite: the color lands on its opaque pixels only (source-atop).
function tintCopy(img, color) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const g = canvas.getContext("2d");
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = color;
  g.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

// Motor Emas (P3): a gold copy of a loaded bike sprite, made once (kopi.js goldPixel). Alpha
// stays, so the outline and the shading stay. The sprites are same-origin: readable.
export function goldCopy(img) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const g = canvas.getContext("2d");
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.data.length; i += 4) if (data.data[i + 3]) goldPixel(data.data, i);
  g.putImageData(data, 0, 0);
  return canvas;
}

// Kopi Rahasia cup (P3): 10 x 10 pixel art baked once, drawn at KOPI_SIZE (3x like the props).
// o ink, c coffee, w mug, s steam.
const CUP_ART = [
  "..s..s....",
  "...s..s...",
  "..s..s....",
  "oooooooo..",
  "occcccco..",
  "owwwwwwooo",
  "owwwwwwo.o",
  "owwwwwwooo",
  "owwwwwwo..",
  ".oooooo...",
];
const CUP_INK = { o: SIGN_INK, c: "#6b3a1e", w: "#fbf3e4", s: "#ffffff" };

function bakeCup() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = CUP_ART.length;
  const g = canvas.getContext("2d");
  CUP_ART.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!CUP_INK[row[x]]) continue;
      g.fillStyle = CUP_INK[row[x]];
      g.fillRect(x, y, 1, 1);
    }
  });
  return canvas;
}

export class World {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.worldWidth = 7400; // Total world width
    this.splashDistance = 2571; // Match value from splash.js

    // Terrain layout config - use offsets from canvas bottom so layout
    // automatically adapts to canvas resize. Offsets are pixels measured
    // from the bottom of the canvas (so bottomOffset=100 -> Y = canvas.height - 100).
    // You can change these at runtime via `game.world.terrainConfig`.
    this.terrainConfig = {
      bottomOffset: 20, // offset from bottom to top edge of bottom terrain
      roadOffset: 80, // offset from bottom to top edge of the road
      grassOffset: 100, // offset from bottom to top edge of the grass strip
      bottomHeight: 20,
      roadHeight: 60,
      grassHeight: 20,
    };

    // Background layers: one set per biome (V2); bgLayers is the normal set (the loader waits for it).
    this.loadBackgroundLayers();
    // Biome crossfade (V2, R5): game.enterChapter sets biomeWanted, render() steps the fade.
    this.biomeFade = createBiomeFade("normal");
    this.biomeWanted = "normal";
    this._biomeReady = (biome) => this.biomeReady(biome); // bound once: render() must not allocate a closure per frame

    // Interactive objects (width/height will be auto-filled from sprite natural size)
    // The four stations (D496): id = the Quick View section they open and the stamp they give
    // (W4); label = the "Tujuan:" name (COPY.stations, D511).
    this.objects = [
      {
        id: "about",
        type: "post",
        baseX: 700,
        x: 700,
        y: canvas.height, // initial Y; will be adjusted to ground after sprite loads
        sprite: null,
        modalId: "about-modal",
        label: COPY.stations.about,
        groundOffset: -20,
        heightPercent: 60,
      },
      {
        id: "skills",
        type: "sign",
        baseX: 2200,
        x: 2200,
        y: canvas.height, // initial Y; will be adjusted to ground after sprite loads
        sprite: null,
        modalId: "skills-modal",
        label: COPY.stations.skills,
        groundOffset: -20,
        heightPercent: 45,
      },
      {
        id: "projects",
        type: "warung",
        baseX: 3200,
        x: 3200,
        y: canvas.height, // initial Y; will be adjusted to ground after sprite loads
        sprite: null,
        modalId: "projects-modal",
        label: COPY.stations.projects,
        groundOffset: -20,
        heightPercent: 70,
      },
      {
        id: "contact",
        type: "mailbox",
        baseX: 4200,
        x: 4200,
        y: canvas.height, // initial Y; will be adjusted to ground after sprite loads
        sprite: null,
        modalId: "contact-modal",
        label: COPY.stations.contact,
        groundOffset: -20,
        heightPercent: 30,
      },
    ];

    // Trees for decoration
    this.trees = [];
    this.treeSprites = []; // Store loaded tree sprites
    this.autumnTrees = []; // pre-tinted copies (V2), filled as the tree sprites load
    this.loadTreeSprites();
    this.generateTrees();

    // Grass tufts
    this.grassSprites = []; // flat list (for compatibility)
    this.grassGroups = []; // array of groups, each group is array of Image
    this.grassTufts = [];
    this.loadGrassSprites();
    this.generateGrassTufts();

    // Configurable grass options (can be changed at runtime via `game.world.grassConfig`)
    this.grassConfig = {
      spacing: 48, // horizontal spacing between tufts
      jitterX: 6, // horizontal jitter range (+/-)
      sinkMin: 0, // minimum sink into ground (px)
      sinkMax: 2, // maximum sink into ground (px)
      globalYOffset: -15, // manual global nudge (positive moves tuft down)
      scale: 1, // uniform scale for grass sprites
      groupSpacing: 300, // approx distance between different group clusters
      clusterMin: 8, // minimum tufts per cluster
      clusterMax: 8, // maximum tufts per cluster
    };

    // Leaf spawn configuration (ambient leaves near trees)
    this.leafConfig = {
      ambientRange: 1000, // world units - how close player must be to a tree to spawn leaves
      ratePerSecond: 1, // base leaves per second per nearby tree
      spreadX: 20,
      spreadY: 12,
      maxPerTick: 3, // cap leaves spawned per tree per frame
    };

    // Load object sprites
    this.loadObjectSprites();
    // Decoration props (V4): sized and grounded at draw time, so layout() has nothing to re-bake.
    this.loadProps();
    this.cupSprite = bakeCup(); // Kopi Rahasia (P3)
    // grass texture (used for the top grass strip)
    this.grassTexture = null;
    this.loadGrassTexture();

    // splash tracking: distance traveled during splash/opening (world units)
    this.splashDistance = 2571;

    // Apply splashDistance offset to object positions (use baseX if present)
    try {
      this.objects.forEach((obj) => {
        if (typeof obj.baseX === "number") {
          obj.x = obj.baseX + (this.splashDistance || 0);
        } else if (typeof obj.x === "number") {
          obj.x = obj.x + (this.splashDistance || 0);
        }
      });
    } catch (e) {
      // ignore if objects not ready
    }

    // NPCs
    this.npcs = [];
    this.specialNPCs = []; // Separate array for minigame NPCs
    this.spawnNPCs();

    // Year billboards (W1) and skill gauges (W2): data from Quick View markup (none on a page
    // without #qv, e.g. tests/check.html), panels baked to canvases. Canvas text needs VT323
    // or it bakes in the fallback font: bake now, then once more when the font is in (or failed).
    this.billboards = this.buildBillboards();
    this.gauges = this.buildGauges();
    this.bakeSigns();
    if (document.fonts && document.fonts.load) {
      document.fonts.load('16px "VT323"').then(() => this.bakeSigns(), () => {});
    }
  }

  // Autumn and winter start loading only once everything the loader waits for is in
  // (game.waitForAssetsThenStart), so they never delay it on a slow phone link (R5).
  streamBiomes() {
    for (const biome of ["autumn", "winter"]) {
      for (const layer of this.biomes[biome]) if (layer.image) layer.image.src = layer.src;
    }
  }

  // Teleports (R12): show `biome` at once, no crossfade, if its images are in. If not, the
  // normal 1 s crossfade runs once they arrive (stepBiomeFade waits for ready).
  snapBiome(biome) {
    if (this.biomeReady(biome)) this.biomeFade = createBiomeFade(biome);
  }

  spawnNPCs() {
    this.npcs = []; // Clear existing list if any
    this.specialNPCs = []; // Clear special NPCs list

    // Spawn Special NPCs first (minigame NPCs)
    this.spawnSpecialNPCs();

    // Then spawn regular NPCs
    this.spawnRegularNPCs();
  }

  // Top of the road: everything that stands on the ground is placed from this (F10).
  groundY() {
    const { grassOffset, grassHeight } = this.terrainConfig;
    return this.canvas.height - grassOffset + grassHeight;
  }

  // Re-bake every y derived from the canvas height (resize/rotation, no reload).
  layout() {
    const ground = this.groundY();
    this.objects.forEach((obj) => this.placeObject(obj, ground));
    this.trees.forEach((tree) => {
      tree.y = Math.floor(ground - tree.height + tree.jitterY) - 5;
    });
    const npcY = ground - NPC_HEIGHT - 12.5;
    this.npcs.forEach((npc) => {
      npc.y = npcY;
      if (npc.chatBubble) { npc.chatBubble.rows = null; npc.chatBubble.w = 0; } // re-measured at the new width
    });
    this.specialNPCs.forEach((npc) => (npc.y = npcY));
    this.billboards.forEach((b) => (b.y = ground - BILLBOARD_SINK - b.height));
    this.gauges.forEach((g) => (g.y = ground - PROP_SINK - g.height));
    this._fog = null;
    this._sky = null; // the winter sky gradient spans the canvas height
  }

  // Bottom-align a loaded object sprite on the ground (unless alignToGround === false).
  placeObject(obj, ground) {
    if (!obj.spriteLoaded || obj.alignToGround === false) return;
    const offset = typeof obj.groundOffset === "number" ? obj.groundOffset : 0;
    obj.y = Math.floor(ground - obj.height + offset);
  }

  spawnSpecialNPCs() {
    const y = this.groundY() - NPC_HEIGHT - 12.5;

    // R3 homes are the NPCs' centres (R16): Wheelie in Bab 1, RLGL just inside Bab 2, Drag
    // just inside Bab 3. Keep this order: probes read specialNPCs[2] as the Drag NPC.
    const specialNPCConfigs = [
      { centerX: 3650, minigameId: "wheelie_challenge" },
      { centerX: 3950, minigameId: "red_light_green_light" },
      { centerX: 5100, minigameId: "drag_race" },
    ];

    specialNPCConfigs.forEach((spec) => {
      this.specialNPCs.push(
        new SpecialNPC({
          centerX: spec.centerX,
          y: y,
          patrolRadius: 100,
          minigameId: spec.minigameId,
        })
      );
      console.log(`Spawned Special NPC (${spec.minigameId}) at ${spec.centerX}`);
    });
  }

  spawnRegularNPCs() {
    // Configuration
    // Start where the opening ride ends (player 200 + ride 2571): the camera never
    // returns left of it, so NPCs placed earlier were never seen (F14).
    const safeStart = 200 + this.splashDistance;
    const safeEnd = this.worldWidth - 500;
    const density = 750; // 1 NPC every ~750 pixels
    const npcCount = Math.floor((safeEnd - safeStart) / density);

    console.log(
      `World Width: ${this.worldWidth}, Spawning approx ${npcCount} NPCs`
    );

    const y = this.groundY() - NPC_HEIGHT - 12.5;

    // Available NPC types
    const npcTypes = ["npc1", "npc2", "npc3", "npc4", "npc5"];
    let npcPool = [];

    for (let i = 0; i < npcCount; i++) {
      // Divide world into segments to ensure distribution, but add randomness within segment
      const segmentSize = (safeEnd - safeStart) / npcCount;
      const segmentStart = safeStart + i * segmentSize;
      const segmentEnd = segmentStart + segmentSize;

      // Random position within this segment (with some padding)
      const padding = 100;
      const minX = segmentStart + padding;
      const maxX = segmentEnd - padding;
      const x = Math.random() * (maxX - minX) + minX;

      // Shuffle Sack / Bag logic: Exhaust all types before repeating
      if (npcPool.length === 0) {
        // Refill
        npcPool = [...npcTypes];
        // Fisher-Yates Shuffle
        for (let j = npcPool.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [npcPool[j], npcPool[k]] = [npcPool[k], npcPool[j]];
        }

        // Check boundary to avoid repeating the same one back-to-back from prev batch
        const prevId = i > 0 ? this.npcs[i - 1].id : null;
        if (prevId && npcPool[0] === prevId && npcPool.length > 1) {
          // Swap the first item with the last item to avoid duplicate
          [npcPool[0], npcPool[npcPool.length - 1]] = [
            npcPool[npcPool.length - 1],
            npcPool[0],
          ];
        }
      }

      const id = npcPool.shift();

      console.log(`Spawning ${id} at x=${Math.floor(x)}`);

      this.npcs.push(
        new NPC({
          x: x,
          y: y,
          id: id,
          patrolRadius: 200, // Slightly larger patrol radius
        })
      );
    }
  }

  loadGrassTexture() {
    this.grassTexture = new Image();
    this.grassTexture.src = `assets/sprites/platformer/texture/grass.png`;
    this.grassTexture.onload = () => console.log(`Grass texture loaded`);
    this.grassTexture.onerror = () =>
      console.error(
        `Failed to load grass texture: assets/sprites/platformer/texture/grass.png`
      );

    this.terraTexture = new Image();
    this.terraTexture.src = `assets/sprites/platformer/texture/terra.png`;
    this.terraTexture.onload = () => console.log(`Grass texture loaded`);
    this.terraTexture.onerror = () =>
      console.error(
        `Failed to load grass texture: assets/sprites/platformer/texture/grass.png`
      );
  }

  loadBackgroundLayers() {
    const layerFiles = ["5.png", "4.png", "3.png", "2.png", "1.png"]; // far (sky) -> near
    this.biomes = {};
    for (const biome of BIOMES) {
      this.biomes[biome] = layerFiles.map((file, index) => {
        const speed = (index + 1) * 0.1; // parallax factor
        if (biome === "winter" && index === 0) {
          return { sky: WINTER_SKY, speed, loaded: true, name: "winter/sky" };
        }
        const img = new Image();
        const src = `assets/sprites/platformer/background/${biome}/${file}`;
        const layer = { image: img, speed, loaded: false, name: `${biome}/${file}`, src };
        img.onload = () => {
          layer.loaded = true;
        };
        img.onerror = () => console.error(`Failed to load BG layer ${biome}/${file}`);
        if (biome === "normal") img.src = src; // the others wait for streamBiomes()
        return layer;
      });
    }
    // world.isLoaded() waits for this set only; autumn and winter stream in (R5).
    this.bgLayers = this.biomes.normal;
  }

  // True once every layer of a biome can be drawn; until then the old biome stays (R5).
  biomeReady(biome) {
    return this.biomes[biome].every((layer) => layer.loaded);
  }

  loadTreeSprites() {
    // load all tree sprites we have (adjust count here if you add more files)
    const treeCount = 6;
    for (let i = 1; i <= treeCount; i++) {
      const img = new Image();
      img.src = `assets/sprites/platformer/tree/${i}.png`;
      img.onload = () => {
        console.log(`Tree sprite ${i} loaded`);
        // Autumn copy (V2): same pixels with an orange wash on the opaque ones.
        this.autumnTrees[i - 1] = tintCopy(img, AUTUMN_TREE_TINT);
      };
      img.onerror = () => console.error(`Failed to load tree sprite ${i}`);
      this.treeSprites.push(img);
    }
  }

  loadGrassSprites() {
    // New: try to load a manifest `groups.json` inside the grass folder that
    // describes groups of grass sprites. Format:
    // { "groups": [ ["group1/1.png","group1/2.png"], ["group2/1.png"] ] }
    // Filenames are relative to `assets/sprites/platformer/grass/`.
    const manifestUrl = `assets/sprites/platformer/grass/groups.json`;

    fetch(manifestUrl)
      .then((res) => {
        if (!res.ok) throw new Error("no-manifest");
        return res.json();
      })
      .then((json) => {
        if (!json || !Array.isArray(json.groups) || json.groups.length === 0)
          throw new Error("invalid-manifest");

        let pending = 0;
        json.groups.forEach((groupFiles, gidx) => {
          const group = [];
          groupFiles.forEach((file) => {
            pending++;
            const img = new Image();
            img.src = `assets/sprites/platformer/grass/${file}`;
            img.onload = () => {
              pending--;
              console.log(`Grass image loaded: ${file}`);
              if (pending === 0) this._computeGrassVisibleHeights();
            };
            img.onerror = () => {
              pending--;
              console.error(`Failed to load grass image: ${file}`);
              if (pending === 0) this._computeGrassVisibleHeights();
            };
            group.push(img);
            // also keep flat list for compatibility
            this.grassSprites.push(img);
          });
          this.grassGroups.push(group);
        });
      })
      .catch(() => {
        // Fallback: load old numbered sprites (1..7)
        const grassCount = 7;
        this._grassLoadedCount = 0;
        for (let i = 1; i <= grassCount; i++) {
          const img = new Image();
          img.src = `assets/sprites/platformer/grass/${i}.png`;
          img.onload = () => {
            this._grassLoadedCount++;
            console.log(`Grass sprite ${i} loaded`);
            if (this._grassLoadedCount === grassCount) {
              // compute visible heights for each grass sprite to align bottoms
              this._computeGrassVisibleHeights();
            }
          };
          img.onerror = () => console.error(`Failed to load grass sprite ${i}`);
          this.grassSprites.push(img);
        }
        // Put them into a single default group for cluster logic
        if (this.grassSprites.length > 0)
          this.grassGroups = [this.grassSprites.slice()];
      });
  }

  _computeGrassVisibleHeights() {
    // create offscreen canvas to inspect pixels
    const off = document.createElement("canvas");
    const ctx = off.getContext("2d", { willReadFrequently: true });
    // Build a flat list of images from groups (if present) or fallback to grassSprites
    const allImgs =
      this.grassGroups && this.grassGroups.length > 0
        ? this.grassGroups.flat()
        : this.grassSprites;

    allImgs.forEach((img, idx) => {
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      off.width = w;
      off.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      try {
        const data = ctx.getImageData(0, 0, w, h).data;
        let visibleBottom = -1;
        // scan rows from bottom up to find first non-transparent pixel
        for (let row = h - 1; row >= 0; row--) {
          let rowHasAlpha = false;
          const rowStart = row * w * 4;
          for (let col = 0; col < w; col++) {
            const alpha = data[rowStart + col * 4 + 3];
            if (alpha > 0) {
              rowHasAlpha = true;
              break;
            }
          }
          if (rowHasAlpha) {
            visibleBottom = row;
            break;
          }
        }

        const visibleHeight = visibleBottom >= 0 ? visibleBottom + 1 : h;
        img._visibleHeight = visibleHeight;
        // also store natural sizes for convenience
        img._naturalWidth = w;
        img._naturalHeight = h;
      } catch (e) {
        // fallback if getImageData fails (unlikely for same-origin)
        img._visibleHeight = img.naturalHeight || 12;
        img._naturalWidth = img.naturalWidth || 12;
        img._naturalHeight = img.naturalHeight || 12;
      }
    });
    // After computing image metrics, (re)generate tufts so they can pick sprites
    try {
      this.generateGrassTufts();
    } catch (e) {
      // swallow - generation may run earlier when constructor hasn't finished,
      // but that's harmless; calling again later will regenerate properly.
    }
  }

  generateGrassTufts() {
    // create clustered tufts so sprites belonging to the same group render
    // close together while different groups are spaced further apart.
    this.grassTufts = [];

    const groups =
      this.grassGroups && this.grassGroups.length > 0
        ? this.grassGroups
        : this.grassSprites.length > 0
        ? [this.grassSprites.slice()]
        : [];

    const groupSpacing =
      (this.grassConfig && this.grassConfig.groupSpacing) || 400;
    const intraSpacing = (this.grassConfig && this.grassConfig.spacing) || 48;
    const jitterX = (this.grassConfig && this.grassConfig.jitterX) || 6;
    const sinkMin =
      this.grassConfig && typeof this.grassConfig.sinkMin === "number"
        ? this.grassConfig.sinkMin
        : 0;
    const sinkMax =
      this.grassConfig && typeof this.grassConfig.sinkMax === "number"
        ? this.grassConfig.sinkMax
        : 2;

    if (groups.length === 0) {
      // fallback to spaced tufts without sprites
      for (let x = 0; x < this.worldWidth; x += intraSpacing) {
        const posX = x + (Math.random() * jitterX * 2 - jitterX);
        const sink = -(sinkMin + Math.random() * (sinkMax - sinkMin));
        this.grassTufts.push({ x: posX, yOffset: sink, sprite: null });
      }
      return;
    }

    // group-3 (flowers, the manifest's third group) blooms in Bab 1 only (V4, R3): 3 of 4
    // clusters there are flowers; everywhere else picks from the grass groups.
    const flowers = groups.length > 2 ? groups[2] : null;
    const grass = flowers ? groups.slice(0, 2) : groups;
    const bab1 = CHAPTERS[1];

    // iterate across world by group centers
    let gx = 0;
    let groupIndex = 0;
    while (gx < this.worldWidth) {
      // choose group (randomize for variety)
      const inBab1 = gx >= bab1.startX && gx < bab1.endX;
      const group =
        flowers && inBab1 && Math.random() < 0.75
          ? flowers
          : grass[Math.floor(Math.random() * grass.length)];

      // cluster center with a small random shift
      const center = gx + (Math.random() - 0.5) * groupSpacing * 0.3;

      // cluster size (number of tufts in this group cluster)
      const clusterMin =
        this.grassConfig && typeof this.grassConfig.clusterMin === "number"
          ? this.grassConfig.clusterMin
          : 2;
      const clusterMax =
        this.grassConfig && typeof this.grassConfig.clusterMax === "number"
          ? this.grassConfig.clusterMax
          : 6;
      const clusterSize =
        clusterMin + Math.floor(Math.random() * (clusterMax - clusterMin + 1));

      // produce tufts around center
      for (let i = 0; i < clusterSize; i++) {
        const offset = (i - clusterSize / 2) * (intraSpacing * 0.5);
        const posX = center + offset + (Math.random() - 0.5) * jitterX * 2;
        const sink = -(sinkMin + Math.random() * (sinkMax - sinkMin));

        // pick a random sprite from the selected group; a flower cluster straddling a Bab 1
        // edge gets grass for its tufts outside Bab 1 (flowers never leave the chapter)
        const pool = group === flowers && (posX < bab1.startX || posX >= bab1.endX) ? grass[0] : group;
        let sprite = null;
        if (pool && pool.length > 0) {
          sprite = pool[Math.floor(Math.random() * pool.length)];
        }

        this.grassTufts.push({ x: posX, yOffset: sink, sprite });
      }

      // advance gx by roughly groupSpacing (add some jitter)
      gx += groupSpacing * (0.9 + Math.random() * 0.2);
      groupIndex++;
    }
  }

  loadProps() {
    const images = {};
    this.props = PROPS.map((prop) => {
      if (!images[prop.file]) {
        const img = new Image();
        img.onerror = () => console.error(`Failed to load prop ${prop.file}`);
        img.src = `assets/sprites/platformer/props/${prop.file}.png`;
        images[prop.file] = img;
      }
      return { ...prop, lift: prop.lift || 0, img: images[prop.file] };
    });
  }

  // Props (V4) between the trees and the ground strip, culled with the objects' 200 px margin.
  renderProps(cameraX) {
    const ground = this.groundY();
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const prop of this.props) {
      const img = prop.img;
      if (!img.complete || !img.naturalWidth) continue;
      // Short screens (667x375 landscape) shrink a tall prop so its top stays on screen.
      const s = Math.min(prop.scale, (ground - 24) / img.naturalHeight);
      const w = Math.round(img.naturalWidth * s);
      const h = Math.round(img.naturalHeight * s);
      const screenX = Math.floor(prop.x - cameraX);
      if (screenX + w < -200 || screenX > this.canvas.width + 200) continue;
      ctx.drawImage(img, screenX, ground - h - PROP_SINK - prop.lift, w, h);
    }
    ctx.restore();
  }

  // Kopi Rahasia (P3): the cups not found yet (got = ids found), faded by kopiShown (night,
  // rain), after the ground strip and before the stations (#3 stands under the warung's eave).
  // y from the ground at draw time, like the props; culled with the same 200 px margin.
  renderKopi(cameraX, effects, got) {
    const ctx = this.ctx;
    const ground = this.groundY();
    const nightA = effects.currentTimeState ? effects.currentTimeState.a : 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < KOPI.length; i++) {
      const cup = KOPI[i];
      const sx = Math.floor(cup.x - cameraX - KOPI_SIZE / 2);
      if (sx + KOPI_SIZE < -200 || sx > this.canvas.width + 200 || got.includes(cup.id)) continue;
      const shown = kopiShown(cup, nightA, effects.rainIntensity);
      if (shown <= 0) continue;
      ctx.globalAlpha = shown;
      ctx.drawImage(this.cupSprite, sx, ground - cup.lift - KOPI_SIZE, KOPI_SIZE, KOPI_SIZE);
    }
    ctx.restore();
  }

  loadObjectSprites() {
    this.objects.forEach((obj) => {
      const img = new Image();
      img.src = `assets/sprites/object/object-${obj.type}.png`;
      img.onload = () => {
        // store natural size for later aspect-preserving draw
        img._naturalWidth = img.naturalWidth || 0;
        img._naturalHeight = img.naturalHeight || 0;
        obj.spriteLoaded = true;
        // if object didn't specify explicit width/height, adopt natural size
        if (typeof obj.width !== "number" || typeof obj.height !== "number") {
          obj.width = img._naturalWidth;
          obj.height = img._naturalHeight;
        }

        // Support height resizing by percentage or scale and keep width following aspect ratio.
        // - `heightPercent`: number (0..100) treated as percentage of natural height (50 -> 50%)
        // - `heightScale`: number (0..1) treated as fraction of natural height (0.5 -> 50%)
        // If both present, `heightPercent` takes precedence.
        const natW = img._naturalWidth || 1;
        const natH = img._naturalHeight || 1;
        if (typeof obj.heightPercent === "number") {
          // accept >1 percent values (e.g. 50) and clamp
          const pct = Math.max(0, Math.min(100, obj.heightPercent));
          const newH = Math.round((pct / 100) * natH);
          obj.height = Math.max(1, newH);
          obj.width = Math.max(1, Math.round((obj.height / natH) * natW));
        } else if (typeof obj.heightScale === "number") {
          const s = Math.max(0, obj.heightScale);
          const newH = Math.round(s * natH);
          obj.height = Math.max(1, newH);
          obj.width = Math.max(1, Math.round((obj.height / natH) * natW));
        }

        // Auto bottom-align to ground unless caller opts out via `alignToGround:false`.
        // Per-object `groundOffset` supported (number). Positive -> moves object down (increase y).
        this.placeObject(obj, this.groundY());

        console.log(
          `Loaded ${obj.type} sprite (${img._naturalWidth}x${img._naturalHeight}) -> obj ${obj.width}x${obj.height} @ y=${obj.y}`
        );
      };
      img.onerror = () => {
        console.error(`Failed to load ${obj.type} sprite`);
      };
      obj.sprite = img;
    });
  }

  // Return true when all world assets are loaded
  isLoaded() {
    // All background layers must be loaded
    const bgsLoaded =
      this.bgLayers.length > 0 && this.bgLayers.every((l) => l.loaded === true);

    // All tree sprites must be complete
    const treesLoaded =
      this.treeSprites.length > 0 &&
      this.treeSprites.every((img) => img && img.complete);

    // All object sprites loaded
    const objectsLoaded =
      this.objects.length > 0 &&
      this.objects.every((o) => o.sprite && o.sprite.complete);

    return bgsLoaded && treesLoaded && objectsLoaded;
  }

  generateTrees() {
    // Generate trees along the world.
    // Clear any existing trees so repeated calls don't append duplicates.
    this.trees = [];

    const count = 30;
    const spacing = this.worldWidth / Math.max(1, count);

    const ground = this.groundY(); // trees stand on the road top

    for (let i = 0; i < count; i++) {
      // even distribution with jitter so trees don't clump
      const centerX = (i + 0.5) * spacing;
      const jitterX = (Math.random() - 0.5) * spacing * 0.6; // up to ~30% spacing jitter
      const x = Math.max(0, Math.min(this.worldWidth, centerX + jitterX));

      const width = 120 + Math.random() * 80;
      const height = Math.floor(width * (1.1 + Math.random() * 0.4));

      // small vertical jitter so trees don't look perfectly aligned
      const jitterY = Math.floor((Math.random() - 0.5) * 20);

      // top-left y so the bottom of the sprite aligns with the ground
      const y = Math.floor(ground - height + jitterY) - 5;

      // pick spriteIndex safely (if none loaded, pick 0 which will be ignored in render)
      const spriteIndex =
        this.treeSprites && this.treeSprites.length > 0
          ? Math.floor(Math.random() * this.treeSprites.length)
          : 0;

      this.trees.push({ x, y, width, height, spriteIndex, jitterY });
    }

    // Sort by x position for proper rendering order
    this.trees.sort((a, b) => a.x - b.x);
  }

  // kopi: the ids of the cups found (game.kopi), or null to hide the cups (the opening ride or a
  // minigame course).
  render(cameraX, windSway, effects, kopi = null) {
    // Biome crossfade (V2, R5): stepped by real time here, so it takes 1 s at any refresh
    // rate; a biome still loading is not faded in (the old one stays).
    stepBiomeFade(this.biomeFade, this.biomeWanted, this._biomeReady, performance.now());
    this.renderBackgroundLayers(cameraX, effects);

    // Trees sit in world space (parallax 1.0, F14). During a crossfade the incoming biome's
    // tree is drawn over the outgoing one at the fade alpha (autumn = pre-tinted copies).
    const fade = this.biomeFade;
    const treesFrom = this.treeSet(fade.from);
    const treesTo = fade.to !== null ? this.treeSet(fade.to) : treesFrom;
    this.trees.forEach((tree) => {
      const screenX = Math.floor(tree.x - cameraX);
      if (screenX > -200 && screenX < this.canvas.width + 200) {
        const i = tree.spriteIndex;
        const sprite = treesFrom[i] || this.treeSprites[i];
        const overlay = treesTo !== treesFrom ? treesTo[i] || this.treeSprites[i] : null;
        this.renderTree(screenX, tree.y, tree.width, tree.height, sprite, windSway, overlay, fade.t);
      }
    });

    // Decoration props (V4): in front of the trees, behind the ground strip and the stations.
    this.renderProps(cameraX);
    // Skill gauges (W2): in the props plane, the grass strip covers their feet.
    this.renderGauges(cameraX);

    // Render ground
    this.renderGround(cameraX);

    // Kopi Rahasia (P3): on the grass and the Bab 1 fence rail, behind the stations.
    if (kopi) this.renderKopi(cameraX, effects, kopi);

    // Render interactive objects
    this.objects.forEach((obj) => {
      // Compute object's horizontal bounds conservatively so a partially
      // visible object isn't culled when its anchor point is offscreen.
      const objWidth =
        typeof obj.width === "number"
          ? obj.width
          : obj.sprite && (obj.sprite._naturalWidth || obj.sprite.naturalWidth)
          ? obj.sprite._naturalWidth || obj.sprite.naturalWidth
          : 0;

      // Consider two common conventions for `obj.x`:
      // - `obj.x` is the left edge -> [obj.x, obj.x + objWidth]
      // - `obj.x` is the center    -> [obj.x - half, obj.x + half]
      const half = objWidth / 2;
      const left = Math.min(obj.x, obj.x - half);
      const right = Math.max(obj.x + objWidth, obj.x + half);

      // Now test against camera with a small margin for smooth entrance/exit.
      if (right - cameraX > -200 && left - cameraX < this.canvas.width + 200) {
        this.renderObject(obj, cameraX);
      }
    });

    // Year billboards (W1): after the stations, so they stand in front of the warung torch.
    this.renderBillboards(cameraX);

    // Render NPCs
    this.npcs.forEach((npc) => npc.render(this.ctx, cameraX));

    // Render Special NPCs (Minigame NPCs)
    this.specialNPCs.forEach((specialNpc) =>
      specialNpc.render(this.ctx, cameraX)
    );

    // Render fog overlay (lighter now)
    this.renderFog();
  }

  // Cover-scale one layer and tile it horizontally with its parallax offset.
  drawTiledLayer(img, speed, cameraX) {
    const { width: w, height: h } = this.canvas;
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const drawW = Math.ceil(img.naturalWidth * scale) + 1; // 1 px overlap hides seams
    const drawH = Math.ceil(img.naturalHeight * scale) + 1;
    let startX = Math.floor(-(cameraX * speed) % drawW);
    if (startX > 0) startX -= drawW;
    const tiles = Math.ceil(w / drawW) + 2;
    for (let t = 0; t < tiles; t++) this.ctx.drawImage(img, startX + t * drawW, 0, drawW, drawH);
  }

  // Parallax layers far to near, clouds between the sky and the rest. During a biome
  // crossfade each layer is drawn twice: outgoing at 1, incoming over it at alpha t. The
  // biome sets share identical binary alpha masks, so this per-layer blend is exact and
  // nothing pops when the fade ends (R5, no compose buffer).
  // ponytail: a low-res compose buffer (F11) measured slower on desktop (A/B +2 ms avg at
  // 1440-2560 px); revisit only if a real phone shows fill-bound frames.
  renderBackgroundLayers(cameraX, effects) {
    const fade = this.biomeFade;
    const from = this.biomes[fade.from];
    const to = fade.to !== null ? this.biomes[fade.to] : null;
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < from.length; i++) {
      this.drawLayer(from[i], cameraX);
      if (to) {
        ctx.globalAlpha = fade.t;
        this.drawLayer(to[i], cameraX);
        ctx.globalAlpha = 1;
      }
      if (i === 0 && effects) effects.renderClouds(cameraX);
    }
    ctx.restore();
  }

  // One layer: a tiled parallax image, or the winter sky gradient (the sky slot).
  // ponytail: one cached gradient (winter is the only gradient sky); key it by biome when a second appears.
  drawLayer(layer, cameraX) {
    if (layer.sky) {
      if (!this._sky) {
        const g = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        g.addColorStop(0, layer.sky[0]);
        g.addColorStop(1, layer.sky[1]);
        this._sky = g;
      }
      this.ctx.fillStyle = this._sky;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else if (layer.loaded && layer.image.naturalWidth) {
      this.drawTiledLayer(layer.image, layer.speed, cameraX);
    }
  }

  // Tree sprites per biome: autumn draws the pre-tinted copies (V2), the others the originals.
  treeSet(biome) {
    return biome === "autumn" ? this.autumnTrees : this.treeSprites;
  }

  renderTree(x, y, width, height, sprite, windSway, overlay = null, overlayAlpha = 0) {
    // Images report `complete`; the pre-tinted canvases have no such flag and are always ready.
    if (!sprite || sprite.complete === false) return;
    this.ctx.save();

    // Apply wind sway (pivot at bottom center)
    this.ctx.translate(x + width / 2, y + height);
    this.ctx.rotate(windSway * 0.005); // Subtle sway
    this.ctx.translate(-(x + width / 2), -(y + height));

    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(sprite, x, y, width, height);
    // Biome crossfade (V2): the incoming biome's tree over it, same transform.
    if (overlay && overlay.complete !== false) {
      this.ctx.globalAlpha = overlayAlpha;
      this.ctx.drawImage(overlay, x, y, width, height);
    }

    this.ctx.restore();
  }

  renderGround(cameraX) {
    // Compute Y positions from bottom-offsets so layout is resilient to resize.
    const bottomOffset =
      this.terrainConfig && typeof this.terrainConfig.bottomOffset === "number"
        ? this.terrainConfig.bottomOffset
        : 100;

    const roadOffset =
      this.terrainConfig && typeof this.terrainConfig.roadOffset === "number"
        ? this.terrainConfig.roadOffset
        : 80;

    const grassOffset =
      this.terrainConfig && typeof this.terrainConfig.grassOffset === "number"
        ? this.terrainConfig.grassOffset
        : 110;

    const bottomY = this.canvas.height - bottomOffset;
    const roadY = this.canvas.height - roadOffset;
    const grassY = this.canvas.height - grassOffset;

    const bottomHeight =
      this.terrainConfig && typeof this.terrainConfig.bottomHeight === "number"
        ? this.terrainConfig.bottomHeight
        : 100;

    // Render layers using provided/derived Y values so they don't overlap.
    this.renderTerra(cameraX, bottomY, bottomHeight);
    this.renderRoad(cameraX, roadY);
    this.renderGrass(cameraX, grassY);

    // Winter ground (V8): a snow-white wash over the grass strip and the soil, weighted by
    // the crossfade so it arrives with the winter backdrop. The road stays dark (ridden clear).
    const snow = biomeWeight(this.biomeFade, "winter");
    if (snow > 0) {
      this.ctx.fillStyle = `rgba(236, 242, 248, ${(0.85 * snow).toFixed(3)})`;
      this.ctx.fillRect(0, grassY, this.canvas.width, this.terrainConfig.grassHeight);
      this.ctx.fillRect(0, bottomY, this.canvas.width, bottomHeight);
    }
  }

  renderTerra(cameraX, bottomY, bottomHeight) {
    // Render textured ground if available, otherwise fallback solid color
    if (
      this.terraTexture &&
      this.terraTexture.complete &&
      this.terraTexture.naturalWidth !== 0
    ) {
      const tileWidth = this.terraTexture.naturalWidth;
      const tileHeight = this.terraTexture.naturalHeight;

      const startX = -(cameraX % tileWidth);
      const tilesNeeded = Math.ceil(this.canvas.width / tileWidth) + 2;

      for (let i = -1; i < tilesNeeded; i++) {
        const x = startX + i * tileWidth;
        // tile only within the bottom terrain height
        const tileBottom = bottomY + bottomHeight;
        for (let y = bottomY; y < tileBottom; y += tileHeight) {
          this.ctx.drawImage(this.terraTexture, Math.floor(x), Math.floor(y));
        }
      }

      this.ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      this.ctx.fillRect(0, bottomY, this.canvas.width, bottomHeight);
    } else {
      this.ctx.fillStyle = "#3b2d26";
      this.ctx.fillRect(0, bottomY, this.canvas.width, bottomHeight);
    }
  }

  renderRoad(cameraX, roadY) {
    // Use configured roadHeight when available
    const roadHeight =
      this.terrainConfig && typeof this.terrainConfig.roadHeight === "number"
        ? this.terrainConfig.roadHeight
        : 60;

    // Road base
    this.ctx.fillStyle = "#444";
    this.ctx.fillRect(0, roadY, this.canvas.width, roadHeight);

    // Road center dashed line (vertically centered in road)
    this.ctx.strokeStyle = "#d4d4d4";
    this.ctx.lineWidth = 4;
    this.ctx.setLineDash([40, 40]);
    this.ctx.beginPath();
    this.ctx.moveTo(-cameraX % 80, roadY + Math.floor(roadHeight / 2));
    this.ctx.lineTo(this.canvas.width, roadY + Math.floor(roadHeight / 2));
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  renderGrass(cameraX, grassY) {
    // Use configured grassHeight when available
    const grassHeight =
      this.terrainConfig && typeof this.terrainConfig.grassHeight === "number"
        ? this.terrainConfig.grassHeight
        : 10;

    // Top grass strip (position controlled by `grassY` param)
    if (
      this.grassTexture &&
      this.grassTexture.complete &&
      this.grassTexture.naturalWidth
    ) {
      // Tile the grass texture across the width, scaled to `grassHeight`.
      const tileW = this.grassTexture.naturalWidth || 1;
      const tileH = this.grassTexture.naturalHeight || 1;
      const scale = tileH > 0 ? grassHeight / tileH : 1;
      const drawW = Math.max(1, Math.floor(tileW * scale));
      const drawH = Math.max(1, Math.floor(grassHeight));

      // Start tiling with camera parallax so it scrolls with the world
      let startX = -(cameraX % drawW);
      if (startX > 0) startX -= drawW;
      const tilesNeeded = Math.ceil(this.canvas.width / drawW) + 2;
      for (let t = 0; t < tilesNeeded; t++) {
        const drawX = Math.floor(startX + t * drawW);
        this.ctx.drawImage(this.grassTexture, drawX, grassY, drawW, drawH);
      }
    } else {
      // Fallback solid strip when texture not available
      this.ctx.fillStyle = "#4b692f";
      this.ctx.fillRect(0, grassY, this.canvas.width, grassHeight);
    }

    // Decorative grass tufts (sprite-based) or fallback simple blades
    if (
      this.grassTufts &&
      this.grassTufts.length > 0 &&
      this.grassSprites.length > 0
    ) {
      this.ctx.save();
      this.ctx.imageSmoothingEnabled = false;
      for (let i = 0; i < this.grassTufts.length; i++) {
        const tuft = this.grassTufts[i];
        const screenX = Math.floor(tuft.x - cameraX);
        if (screenX < -100 || screenX > this.canvas.width + 100) continue;

        const sprite =
          tuft.sprite ||
          (typeof tuft.spriteIndex !== "undefined"
            ? this.grassSprites[tuft.spriteIndex]
            : null);
        if (sprite && sprite.complete) {
          const visibleH = sprite._visibleHeight || sprite.naturalHeight || 12;
          const naturalW = sprite._naturalWidth || sprite.naturalWidth || 12;
          const naturalH =
            sprite._naturalHeight || sprite.naturalHeight || visibleH;

          // Align the visible bottom of the tuft to the top grass strip bottom
          const baseDrawY = grassY - visibleH + grassHeight; // ensure tuft sits on top strip
          const globalY =
            this.grassConfig && this.grassConfig.globalYOffset
              ? this.grassConfig.globalYOffset
              : 0;
          const drawY = Math.floor(
            baseDrawY + Math.min(0, tuft.yOffset) + globalY
          );
          const drawX = screenX;

          this.ctx.drawImage(sprite, drawX, drawY, naturalW, naturalH);
        }
      }
      this.ctx.restore();
    } else {
      // fallback decorative grass (single-frame) when sprites missing
      this.ctx.fillStyle = "#5d823b";
      for (let i = 0; i < this.canvas.width; i += 50) {
        const x = i - ((cameraX * 1) % 50);
        if (Math.random() > 0.5) {
          this.ctx.fillRect(x, grassY + 2, 4, 8);
          this.ctx.fillRect(x + 2, grassY + 4, 4, 6);
        }
      }
    }
  }

  buildBillboards() {
    const ground = this.groundY();
    const height = BOARD_H + POST_H;
    const out = [];
    for (const group of JOR.yearGroups(document)) {
      const centerX = BILLBOARD_X[group.year];
      if (centerX === undefined || !group.count) continue;
      out.push({
        year: group.year,
        count: group.count,
        icons: group.icons,
        x: centerX - BOARD_W / 2,
        y: ground - BILLBOARD_SINK - height,
        width: BOARD_W,
        height,
        canvas: null,
      });
    }
    return out;
  }

  // (Re)bake every sign panel; cheap (a handful of small canvases), runs twice per load.
  bakeSigns() {
    this.billboards.forEach((b) => this.bakeBillboard(b));
    this.gauges.forEach((g) => this.bakeGauge(g));
  }

  // A wooden panel on two posts: the year, "N proyek", and that year's project icons.
  bakeBillboard(b) {
    const c = b.canvas || (b.canvas = document.createElement("canvas"));
    c.width = b.width;
    c.height = b.height;
    const g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = SIGN_WOOD;
    g.fillRect(18, BOARD_H - 4, 8, POST_H + 4);
    g.fillRect(b.width - 26, BOARD_H - 4, 8, POST_H + 4);
    g.fillStyle = SIGN_INK;
    g.fillRect(0, 0, b.width, BOARD_H);
    g.fillStyle = SIGN_FACE;
    g.fillRect(4, 4, b.width - 8, BOARD_H - 8);
    g.fillStyle = SIGN_INK;
    g.textAlign = "center";
    g.font = '32px "VT323", monospace';
    g.fillText(String(b.year), b.width / 2, 32);
    g.font = '18px "VT323", monospace';
    g.fillText(JOR.fillTokens(COPY.billboard.count, { count: b.count }), b.width / 2, 50);
    g.font = "14px sans-serif"; // emoji: the system emoji font
    g.fillText(b.icons.join(" "), b.width / 2, 69, b.width - 12);
  }

  renderBillboards(cameraX) {
    for (const b of this.billboards) {
      const screenX = Math.floor(b.x - cameraX);
      if (screenX + b.width < -200 || screenX > this.canvas.width + 200) continue;
      this.ctx.drawImage(b.canvas, screenX, b.y);
    }
  }

  buildGauges() {
    const ground = this.groundY();
    return JOR.skillLevels(document)
      .slice(0, GAUGE_X.length)
      .map((skill, i) => ({
        name: skill.name,
        level: skill.level,
        x: GAUGE_X[i] - GAUGE_W / 2,
        y: ground - PROP_SINK - GAUGE_H,
        width: GAUGE_W,
        height: GAUGE_H,
        fill: 0,
        canvas: null,
      }));
  }

  // A small sign on a post: the skill name, an empty bar and the level as Quick View shows it.
  bakeGauge(g) {
    const c = g.canvas || (g.canvas = document.createElement("canvas"));
    c.width = g.width;
    c.height = g.height;
    const x = c.getContext("2d");
    x.clearRect(0, 0, c.width, c.height);
    x.fillStyle = SIGN_WOOD;
    x.fillRect(32, 58, 8, g.height - 58);
    x.fillStyle = SIGN_INK;
    x.fillRect(0, 0, g.width, 62);
    x.fillStyle = SIGN_FACE;
    x.fillRect(3, 3, g.width - 6, 56);
    x.fillStyle = SIGN_INK;
    x.fillRect(GAUGE_BAR.x - 1, GAUGE_BAR.y - 1, GAUGE_BAR.w + 2, GAUGE_BAR.h + 2);
    x.fillStyle = "#d8c8a4";
    x.fillRect(GAUGE_BAR.x, GAUGE_BAR.y, GAUGE_BAR.w, GAUGE_BAR.h);
    x.fillStyle = SIGN_INK;
    x.textAlign = "center";
    x.font = '16px "VT323", monospace';
    x.fillText(g.name, g.width / 2, 20, g.width - 8);
    x.font = '20px "VT323", monospace';
    x.fillText(String(g.level), g.width / 2, 55);
  }

  // Fills as the bike rides past (sim steps; never empties within a page load). Game.update
  // skips it during a minigame course (R7).
  updateGauges(centerX) {
    for (const g of this.gauges) {
      if (g.fill < 1 && Math.abs(centerX - (g.x + g.width / 2)) <= GAUGE_RADIUS) {
        g.fill = Math.min(1, g.fill + GAUGE_FILL_STEP);
      }
    }
  }

  renderGauges(cameraX) {
    const ctx = this.ctx;
    for (const g of this.gauges) {
      const screenX = Math.floor(g.x - cameraX);
      if (screenX + g.width < -200 || screenX > this.canvas.width + 200) continue;
      ctx.drawImage(g.canvas, screenX, g.y);
      if (g.fill > 0) {
        ctx.fillStyle = GAUGE_FILL;
        ctx.fillRect(screenX + GAUGE_BAR.x, g.y + GAUGE_BAR.y, Math.round(GAUGE_BAR.w * (Math.min(100, Math.max(0, g.level)) / 100) * g.fill), GAUGE_BAR.h);
      }
    }
  }

  renderObject(obj, cameraX) {
    const screenX = obj.x - cameraX;

    if (obj.sprite && obj.sprite.complete) {
      const sprite = obj.sprite;

      // natural sizes (prefer cached _natural* if present)
      const natW =
        sprite.naturalWidth || sprite._naturalWidth || obj.width || 32;
      const natH =
        sprite.naturalHeight || sprite._naturalHeight || obj.height || 32;

      // target box to fit into (use configured obj.width/height if available)
      const targetW = typeof obj.width === "number" ? obj.width : natW;
      const targetH = typeof obj.height === "number" ? obj.height : natH;

      // choose uniform scale to fit the sprite inside the target box (no distortion)
      const scale = Math.min(targetW / natW, targetH / natH);

      const drawW = Math.max(1, Math.round(natW * scale));
      const drawH = Math.max(1, Math.round(natH * scale));

      // center horizontally inside the target box and align bottom so sprite "sits" on ground
      const drawX = Math.round(screenX + (targetW - drawW) / 2);
      const drawY = Math.round(obj.y + (targetH - drawH));

      this.ctx.save();
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.drawImage(sprite, drawX, drawY, drawW, drawH);
      this.ctx.restore();
    } else {
      // Fallback rectangle
      this.ctx.fillStyle = "#8b4513";
      this.ctx.fillRect(screenX, obj.y, obj.width, obj.height);

      // Label
      this.ctx.fillStyle = "#fff";
      this.ctx.font = "12px monospace";
      this.ctx.textAlign = "center";
      this.ctx.fillText(obj.label, screenX + obj.width / 2, obj.y - 10);
    }
  }

  renderFog() {
    // Fog gradient overlay - lighter for better visibility of new bg.
    // Cached; layout() drops it because it depends on the canvas height.
    if (!this._fog) {
      const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
      gradient.addColorStop(0.5, "rgba(200, 200, 220, 0.05)");
      gradient.addColorStop(1, "rgba(150, 150, 170, 0.1)");
      this._fog = gradient;
    }

    this.ctx.fillStyle = this._fog;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

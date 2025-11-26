// ===================================
// WORLD.JS - World & Environment
// ===================================

class World {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.worldWidth = 7400; // Total world width

    // Background Layers
    this.bgLayers = [];
    this.loadBackgroundLayers();

    // Interactive objects (width/height will be auto-filled from sprite natural size)
    this.objects = [
      {
        type: "post",
        baseX: 700,
        x: 700,
        y: canvas.height, // initial Y; will be adjusted to ground after sprite loads
        sprite: null,
        modalId: "about-modal",
        label: "About Me",
        groundOffset: -20,
        heightPercent: 60,
      },
      {
        type: "sign",
        baseX: 2200,
        x: 2200,
        y: canvas.height, // initial Y; will be adjusted to ground after sprite loads
        sprite: null,
        modalId: "skills-modal",
        label: "Skills",
        groundOffset: -20,
        heightPercent: 45,
      },
      {
        type: "warung",
        baseX: 3200,
        x: 3200,
        y: canvas.height, // initial Y; will be adjusted to ground after sprite loads
        sprite: null,
        modalId: "projects-modal",
        label: "Projects",
        groundOffset: -20,
        heightPercent: 70,
      },
      {
        type: "mailbox",
        baseX: 4200,
        x: 4200,
        y: canvas.height, // initial Y; will be adjusted to ground after sprite loads
        sprite: null,
        modalId: "contact-modal",
        label: "Contact",
        groundOffset: -20,
        heightPercent: 30,
      },
    ];

    // Trees for decoration
    this.trees = [];
    this.treeSprites = []; // Store loaded tree sprites
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

    // Load object sprites
    this.loadObjectSprites();
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
    const layerFiles = [
      "5.png", // Sky/Far
      "4.png",
      "3.png",
      "2.png",
      "1.png", // Near
    ];

    console.log("Loading background layers...");
    layerFiles.forEach((file, index) => {
      const img = new Image();
      img.src = `assets/sprites/platformer/background/normal/${file}`;

      // create layer record with loaded flag so render knows when ready
      const layer = {
        image: img,
        speed: (index + 1) * 0.1, // Parallax speed factor
        loaded: false,
        name: file,
      };

      img.onload = () => {
        layer.loaded = true;
        console.log(
          `BG Layer ${index + 1} loaded: ${file} (${img.naturalWidth}x${
            img.naturalHeight
          })`
        );
      };
      img.onerror = () => {
        console.error(`Failed to load BG Layer ${index + 1}: ${file}`);
      };

      this.bgLayers.push(layer);
    });
  }

  loadTreeSprites() {
    // load all tree sprites we have (adjust count here if you add more files)
    const treeCount = 6;
    for (let i = 1; i <= treeCount; i++) {
      const img = new Image();
      img.src = `assets/sprites/platformer/tree/${i}.png`;
      img.onload = () => console.log(`Tree sprite ${i} loaded`);
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
    const ctx = off.getContext("2d");
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

    // iterate across world by group centers
    let gx = 0;
    let groupIndex = 0;
    while (gx < this.worldWidth) {
      // choose group (randomize for variety)
      const group = groups[Math.floor(Math.random() * groups.length)];

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

        // pick a random sprite from the selected group
        let sprite = null;
        if (group && group.length > 0) {
          sprite = group[Math.floor(Math.random() * group.length)];
        }

        this.grassTufts.push({ x: posX, yOffset: sink, sprite });
      }

      // advance gx by roughly groupSpacing (add some jitter)
      gx += groupSpacing * (0.9 + Math.random() * 0.2);
      groupIndex++;
    }
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
        if (
          !obj.hasOwnProperty("alignToGround") ||
          obj.alignToGround !== false
        ) {
          const grassOffset =
            this.terrainConfig &&
            typeof this.terrainConfig.grassOffset === "number"
              ? this.terrainConfig.grassOffset
              : 100;
          const grassHeight =
            this.terrainConfig &&
            typeof this.terrainConfig.grassHeight === "number"
              ? this.terrainConfig.grassHeight
              : 20;
          const grassTop = this.canvas.height - grassOffset;
          const groundBaseY = grassTop + grassHeight; // bottom line objects should sit on

          // place object's top so its bottom equals groundBaseY, plus optional groundOffset
          const offset =
            typeof obj.groundOffset === "number" ? obj.groundOffset : 0;
          obj.y = Math.floor(groundBaseY - obj.height + offset);
        }

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

    // compute ground baseline using terrainConfig so trees sit on the ground
    const grassOffset =
      this.terrainConfig && typeof this.terrainConfig.grassOffset === "number"
        ? this.terrainConfig.grassOffset
        : 100;
    const grassHeight =
      this.terrainConfig && typeof this.terrainConfig.grassHeight === "number"
        ? this.terrainConfig.grassHeight
        : 20;

    const grassTop = this.canvas.height - grassOffset;
    const groundBaseY = grassTop + grassHeight; // y coordinate where tree bases should align

    for (let i = 0; i < count; i++) {
      // even distribution with jitter so trees don't clump
      const centerX = (i + 0.5) * spacing;
      const jitterX = (Math.random() - 0.5) * spacing * 0.6; // up to ~30% spacing jitter
      const x = Math.max(0, Math.min(this.worldWidth, centerX + jitterX));

      const width = 120 + Math.random() * 80;
      const height = Math.floor(width * (1.1 + Math.random() * 0.4));

      // small vertical jitter so trees don't look perfectly aligned
      const jitterY = Math.floor((Math.random() - 0.5) * 20);

      // compute top-left y so the bottom of the sprite aligns with the groundBaseY
      const y = Math.floor(groundBaseY - height + jitterY) - 5;

      // pick spriteIndex safely (if none loaded, pick 0 which will be ignored in render)
      const spriteIndex =
        this.treeSprites && this.treeSprites.length > 0
          ? Math.floor(Math.random() * this.treeSprites.length)
          : 0;

      this.trees.push({ x, y, width, height, spriteIndex });
    }

    // Sort by x position for proper rendering order
    this.trees.sort((a, b) => a.x - b.x);
  }

  render(cameraX, windSway, effects) {
    // Render Background Layers (Parallax)
    // Draw the farthest background layer first (index 0), then draw clouds
    // so they appear after the far layer, then draw the remaining layers on top.
    if (this.bgLayers && this.bgLayers.length > 0) {
      // Draw the farthest (index 0) if available
      const firstLayer = this.bgLayers[0];
      if (
        firstLayer &&
        firstLayer.loaded &&
        firstLayer.image &&
        firstLayer.image.naturalWidth
      ) {
        const layer = firstLayer;
        const speed = layer.speed;
        const scale = Math.max(
          this.canvas.width / layer.image.naturalWidth,
          this.canvas.height / layer.image.naturalHeight
        );
        const floatW = layer.image.naturalWidth * scale;
        const floatH = layer.image.naturalHeight * scale;
        const drawW = Math.ceil(floatW) + 1;
        const drawH = Math.ceil(floatH) + 1;
        const y = 0;
        const rawOffset = -(cameraX * speed);
        this.ctx.save();
        this.ctx.imageSmoothingEnabled = false;
        let startX = Math.floor(rawOffset % drawW);
        if (startX > 0) startX -= drawW;
        const tilesNeeded = Math.ceil(this.canvas.width / drawW) + 2;
        for (let t = 0; t < tilesNeeded; t++) {
          const drawX = startX + t * drawW;
          this.ctx.drawImage(
            layer.image,
            Math.floor(drawX),
            Math.floor(y),
            drawW,
            drawH
          );
        }
        this.ctx.restore();
      }

      // Draw clouds immediately after the farthest layer
      if (effects && typeof effects.renderClouds === "function") {
        effects.renderClouds(cameraX);
      }

      // Draw remaining layers (1..end-1)
      for (let i = 1; i < this.bgLayers.length; i++) {
        const layer = this.bgLayers[i];
        if (layer && layer.loaded && layer.image && layer.image.naturalWidth) {
          const speed = layer.speed;
          const scale = Math.max(
            this.canvas.width / layer.image.naturalWidth,
            this.canvas.height / layer.image.naturalHeight
          );
          const floatW = layer.image.naturalWidth * scale;
          const floatH = layer.image.naturalHeight * scale;
          const drawW = Math.ceil(floatW) + 1;
          const drawH = Math.ceil(floatH) + 1;
          const y = 0;
          const rawOffset = -(cameraX * speed);
          this.ctx.save();
          this.ctx.imageSmoothingEnabled = false;
          let startX = Math.floor(rawOffset % drawW);
          if (startX > 0) startX -= drawW;
          const tilesNeeded = Math.ceil(this.canvas.width / drawW) + 2;
          for (let t = 0; t < tilesNeeded; t++) {
            const drawX = startX + t * drawW;
            this.ctx.drawImage(
              layer.image,
              Math.floor(drawX),
              Math.floor(y),
              drawW,
              drawH
            );
          }
          this.ctx.restore();
        }
      }
    } else {
      // Fallback to original full background renderer if no layers
      this.renderBackground(cameraX);
    }

    // Render trees in background
    this.trees.forEach((tree) => {
      // Use same parallax factor for both culling and drawing so
      // trees aren't prematurely culled when parallax shifts them.
      const parallax = 0.6;
      const screenX = Math.floor(tree.x - cameraX * parallax);

      if (screenX > -200 && screenX < this.canvas.width + 200) {
        this.renderTree(
          screenX,
          tree.y,
          tree.width,
          tree.height,
          tree.spriteIndex,
          windSway
        );
      }
    });

    // Render ground
    this.renderGround(cameraX);

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

    // Render fog overlay (lighter now)
    this.renderFog();
  }

  renderBackground(cameraX) {
    this.bgLayers.forEach((layer, index) => {
      // Only render when the layer reports loaded
      if (layer.loaded && layer.image && layer.image.naturalWidth) {
        const speed = layer.speed;

        // Use 'cover' scaling so background fills the whole canvas (width or height)
        const scale = Math.max(
          this.canvas.width / layer.image.naturalWidth,
          this.canvas.height / layer.image.naturalHeight
        );

        const floatW = layer.image.naturalWidth * scale;
        const floatH = layer.image.naturalHeight * scale;

        // Use integer tile sizes and add a 1px overlap to avoid thin seams
        // that can appear when fractional scaling/positions are used.
        const drawW = Math.ceil(floatW) + 1;
        const drawH = Math.ceil(floatH) + 1;

        // Cover entire canvas from top
        const y = 0;

        // Use a pixel-exact camera offset (integer) based on parallax speed.
        const rawOffset = -(cameraX * speed);

        this.ctx.save();
        this.ctx.imageSmoothingEnabled = false; // keep pixel-art crisp

        // Normalize starting x so it's in range [-drawW, 0)
        let startX = Math.floor(rawOffset % drawW);
        if (startX > 0) startX -= drawW;

        const tilesNeeded = Math.ceil(this.canvas.width / drawW) + 2;
        for (let t = 0; t < tilesNeeded; t++) {
          const drawX = startX + t * drawW;
          this.ctx.drawImage(
            layer.image,
            Math.floor(drawX),
            Math.floor(y),
            drawW,
            drawH
          );
        }

        this.ctx.restore();

        // Debug: optionally tint and log draw area when window.DEBUG_BG === true
        if (window.DEBUG_BG) {
          this.ctx.save();
          this.ctx.globalAlpha = 0.2;
          // cycle tint colors per layer
          const tints = ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff"];
          this.ctx.fillStyle = tints[index % tints.length];
          this.ctx.fillRect(x, y, width, height);
          this.ctx.restore();

          // draw outline
          this.ctx.strokeStyle = "#ffffff";
          this.ctx.lineWidth = 2;
          this.ctx.strokeRect(x, y, width, height);

          console.log(
            `BG draw rect L${index + 1}: x=${Math.round(x)} y=${Math.round(
              y
            )} w=${Math.round(width)} h=${Math.round(height)} speed=${speed}`
          );
        }
      }
    });
  }

  renderTree(x, y, width, height, spriteIndex, windSway) {
    const sprite = this.treeSprites[spriteIndex];

    if (sprite && sprite.complete) {
      this.ctx.save();

      // Apply wind sway (pivot at bottom center)
      this.ctx.translate(x + width / 2, y + height);
      this.ctx.rotate(windSway * 0.005); // Subtle sway
      this.ctx.translate(-(x + width / 2), -(y + height));

      this.ctx.imageSmoothingEnabled = false;
      this.ctx.drawImage(sprite, x, y, width, height);

      this.ctx.restore();
    }
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
    // Fog gradient overlay - lighter for better visibility of new bg
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    gradient.addColorStop(0.5, "rgba(200, 200, 220, 0.05)");
    gradient.addColorStop(1, "rgba(150, 150, 170, 0.1)");

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  getObjects() {
    return this.objects;
  }
}

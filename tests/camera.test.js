// Run: node --test
// The camera's bounds (R-E2): the playable world (7400) everywhere, the scenery width only while
// the epilog runs, so the ride can be framed like the opening ride and nothing else gets past 7400.
import test from "node:test";
import assert from "node:assert/strict";
import { Camera } from "../js/camera.js";
import { RIDE_END_X } from "../js/credits.js";

const SCENERY = 9200; // world.js sceneryWidth
const game = (w, running, open = false) => ({
  player: { x: 7000, lockBacktrack: true, minX: 2771 },
  world: { worldWidth: 7400, sceneryWidth: SCENERY },
  canvas: { width: w },
  credits: { epilog: { running }, isOpen: () => open },
});

test("camera: the playable end outside the epilog, the scenery end during it", () => {
  for (const w of [375, 667, 1440]) {
    const cam = new Camera(game(w, false));
    assert.equal(cam.bounds().max, 7400 - w);
    cam.jumpTo(99999);
    assert.equal(cam.x, 7400 - w);
    cam.game.credits.epilog.running = true;
    assert.equal(cam.bounds().max, SCENERY - w);
    cam.jumpTo(99999);
    assert.equal(cam.x, SCENERY - w);
    assert.equal(new Camera(game(w, false, true)).bounds().max, SCENERY - w, "the card is up: a resize keeps the bike");
  }
  // Built before Credits exists (Game's constructor): the playable end.
  const early = game(1440, false);
  delete early.credits;
  assert.equal(new Camera(early).bounds().max, 5960);
});

test("camera: the bike can stop on the left third at the end of the epilog ride (W <= 1950)", () => {
  for (const w of [375, 667, 1440, 1920]) {
    const cam = new Camera(game(w, true));
    const want = RIDE_END_X - 100 - w / 3; // the follow target with the bike standing at the stop
    assert.equal(cam.clamp(want), want, `W ${w}`);
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the finished literary exploration", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>The Holy Office — A Gothic Exploration<\/title>/i);
  assert.match(html, /ENTER THE PRISON/);
  assert.match(html, /A GOTHIC EXPLORATION AFTER W\. H\. IRELAND/);
  assert.match(html, /ABOUT THE TEXT/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("includes the complete playable dungeon and its literary notes", async () => {
  const [game, css, packageJson] = await Promise.all([
    readFile(new URL("../app/InquisitionGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  for (const place of [
    "The Prison Gate",
    "A Familiar’s Dark Chamber",
    "The Passage of High Lamps",
    "The Table of the Holy Office",
    "Bendetta’s Wall",
    "The Plainer Dungeon",
    "The Wardrobe Room",
    "The Masked Official",
    "The Chamber of Groans",
    "The Hidden Stair",
  ]) {
    assert.match(game, new RegExp(place.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(game, /requestAnimationFrame/);
  assert.match(game, /DungeonRenderer/);
  assert.match(game, /requestPointerLock/);
  assert.match(game, /pointerlockchange/);
  assert.match(game, /hitsDungeonCollider/);
  assert.match(game, /Touch controls/);
  const world = await readFile(new URL("../app/three-world.ts", import.meta.url), "utf8");
  assert.match(world, /THREE\.WebGLRenderer/);
  assert.match(world, /DUNGEON_COLLIDERS/);
  assert.match(world, /addLimb/);
  assert.match(world, /MISERICORDIA\s+ET\s+JUSTITIA/);
  assert.match(world, /stone-wall\.png/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media \(max-width: 760px\), \(pointer: coarse\)/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("uses modeled RPG characters instead of portrait cards", async () => {
  const world = await readFile(new URL("../app/three-world.ts", import.meta.url), "utf8");
  const characterStart = world.indexOf("function makePerson");
  const characterEnd = world.indexOf("function makeChair");
  const character = world.slice(characterStart, characterEnd);

  assert.ok(characterStart >= 0 && characterEnd > characterStart);

  // The face is a curved shell welded to the skull and unwrapped onto the
  // portrait sheet, not a flat card hovering in front of the head.
  assert.match(world, /function makeHead/);
  assert.match(world, /function projectFaceUv/);
  assert.match(character, /makeHead\(materials, skin, faceMaterial/);

  // Garment sheets are mapped onto the body volumes themselves. The old
  // makeGarmentPanel quads stood proud of the torso as floating slabs.
  assert.match(world, /function addGarmentVolume/);
  assert.match(character, /addGarmentVolume\(group, garmentMaterial/);
  assert.doesNotMatch(world, /makeGarmentPanel|makeFaceGeometry/);
  assert.match(character, /garmentMaterial/);
  assert.match(character, /materials\.prisonerCloth/);
  assert.doesNotMatch(character, /CircleGeometry|faceMask|transparent:\s*true/);

  // Collar, neck and head all chain off the top of the torso, so they cannot
  // drift apart and leave a gap of bare background under the chin.
  assert.match(character, /const shoulderTopY = torsoY \+ torsoHeight \/ 2/);
  assert.match(character, /const headY = collarTopY \+/);

  assert.match(world, /familiar\.position\.set\(x,\s*0,\s*18\.64\)/);
  assert.match(world, /secretary\.position\.set\(17,\s*0,\s*4\.58\)/);
  assert.match(world, /inquisitor\.position\.set\(15\.45,\s*0,\s*z\)/);
});

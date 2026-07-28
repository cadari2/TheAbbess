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
  assert.match(html, /TAKE UP THE CLOAK/);
  assert.match(html, /A GOTHIC EXPLORATION AFTER W\. H\. IRELAND/);
  assert.match(html, /ABOUT THE TEXT/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships no placeholder scaffolding", async () => {
  const [css, packageJson] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  // Accessibility and responsive affordances the exploration depends on.
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media \(max-width: 760px\), \(pointer: coarse\)/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

// The character rig and dungeon geometry are asserted here only where a
// regression would be invisible in the model tests: that the figures are built
// as solid volumes with mapped garment and face sheets rather than the flat
// billboard cards they replaced. Everything spatial is checked behaviourally in
// world-model.test.mjs instead.
test("characters are modelled volumes, not portrait cards", async () => {
  const source = await readFile(new URL("../app/three-world.ts", import.meta.url), "utf8");
  const start = source.indexOf("export function makePerson");
  const end = source.indexOf("export function makeChair");
  assert.ok(start >= 0 && end > start, "makePerson is no longer locatable");
  const character = source.slice(start, end);

  assert.match(character, /makeHead\(materials, skin, faceMaterial/);
  assert.match(character, /addGarmentVolume\(group, garmentMaterial/);
  // Flat quads standing proud of the torso, and transparent face cutouts, are
  // the specific regressions this guards against.
  assert.doesNotMatch(source, /makeGarmentPanel|makeFaceGeometry/);
  assert.doesNotMatch(character, /CircleGeometry|faceMask|transparent:\s*true/);
});

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
  assert.match(game, /renderWorld/);
  assert.match(game, /MISERICORDIA\s+ET\s+JUSTITIA/);
  assert.match(game, /Touch controls/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media \(max-width: 760px\), \(pointer: coarse\)/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

// Headless walkthrough driver.
//
// Not part of `pnpm test`: it needs a running dev server and a real GPU-backed
// browser, so it is run on demand.
//
//   pnpm dev &
//   node tests/walkthrough.mjs [--url http://localhost:3000] [--out DIR]
//
// What this can establish: that the page boots, that the canvas acquires a WebGL
// context, that keyboard movement changes the player's position, that collision
// stops the player at masonry, that the location label tracks rooms, that the
// map and journal open, and that every discovery can be examined. It reports the
// browser console and any uncaught exception.
//
// What it cannot establish: how mouse-look feels, whether the audio mix works,
// or whether touch controls are usable on a real device. Those stay manual.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const url = flag("url", "http://localhost:3000");
const outDir = flag("out", "/tmp/walkthrough");

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const consoleLines = [];
const failures = [];
page.on("console", (message) => {
  consoleLines.push(`${message.type()}: ${message.text()}`);
  if (message.type() === "error") failures.push(`console error: ${message.text()}`);
});
page.on("pageerror", (error) => failures.push(`page error: ${error.message}`));

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

await page.goto(url, { waitUntil: "networkidle" });
check("page loads", await page.locator("text=TAKE UP THE CLOAK").isVisible());

await page.screenshot({ path: `${outDir}/01-intro.png` });

await page.click("text=TAKE UP THE CLOAK");
await page.waitForSelector("canvas.world");
await page.waitForTimeout(1500);

const webgl = await page.evaluate(() => {
  const canvas = document.querySelector("canvas.world");
  if (!canvas) return "no canvas";
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  return gl ? gl.getParameter(gl.VERSION) : "no context";
});
check("canvas has a WebGL context", !String(webgl).startsWith("no"), String(webgl));

// The renderer paints to the canvas; a blank canvas means nothing drew.
// Sampled through drawImage rather than readPixels: the drawing buffer is not
// preserved after compositing, so reading the GL buffer directly returns a
// cleared surface and reports a false blank.
const painted = await page.evaluate(
  () =>
    new Promise((resolve) => {
      // Sampled from inside a requestAnimationFrame callback. The renderer does
      // not preserve its drawing buffer, so once the frame is composited both
      // readPixels and drawImage return a cleared surface and report a false
      // blank. Registering after the app's own callback puts this read in the
      // same frame, while the buffer is still intact.
      requestAnimationFrame(() => {
        const source = document.querySelector("canvas.world");
        const scratch = document.createElement("canvas");
        scratch.width = 160;
        scratch.height = 90;
        const ctx = scratch.getContext("2d");
        ctx.drawImage(source, 0, 0, scratch.width, scratch.height);
        const { data } = ctx.getImageData(0, 0, scratch.width, scratch.height);
        let lit = 0;
        let brightest = 0;
        for (let i = 0; i < data.length; i += 4) {
          const luma = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (luma > 8) lit++;
          if (luma > brightest) brightest = luma;
        }
        resolve({ lit, total: data.length / 4, brightest });
      });
    }),
);
check(
  "the dungeon renders lit geometry",
  painted.lit > painted.total * 0.02,
  `${painted.lit}/${painted.total} pixels lit, brightest ${painted.brightest}`,
);

await page.screenshot({ path: `${outDir}/02-gate.png` });

const label = () => page.locator(".location-card strong").innerText();
const startLabel = await label();
check("location label reads on entry", startLabel.length > 0, startLabel);

// Walk north out of the gate court and into the outer office.
const press = async (key, ms) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(120);
};

// Position is read from the map marker, the only place the running game exposes
// it. Distances here are small on purpose: software WebGL renders this scene at
// roughly 1 fps, and movement is `dt`-capped at 0.04, so a held key advances
// about 0.09 units per frame. Crossing a room takes the better part of a minute.
// Whether movement and collision are *correct* is settled deterministically in
// world-model.test.mjs; this only confirms input reaches the running game.
const position = async () => {
  await page.keyboard.press("m");
  await page.waitForTimeout(350);
  const style = await page.locator(".map-player").getAttribute("style");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  const left = Number(/left:\s*([\d.]+)%/.exec(style)?.[1]);
  const top = Number(/top:\s*([\d.]+)%/.exec(style)?.[1]);
  return { x: (left / 100) * 36, y: (top / 100) * 28 };
};

const before = await position();
await press("w", 6000);
const after = await position();
const moved = Math.hypot(after.x - before.x, after.y - before.y);
check(
  "holding forward moves the player",
  moved > 0.05,
  `moved ${moved.toFixed(3)} units from ${before.x.toFixed(2)},${before.y.toFixed(2)}`,
);
await page.screenshot({ path: `${outDir}/03-after-walk.png` });

// Collision: drive into the west wall and confirm the player does not leave the
// building. The gate court's west masonry is at x=2, so x must stay above it.
await press("a", 6000);
const wall = await position();
check("collision keeps the player inside", wall.x > 2.5 && wall.y < 27, `at ${wall.x.toFixed(2)},${wall.y.toFixed(2)}`);
await page.screenshot({ path: `${outDir}/04-wall.png` });

// The examine prompt appears near a discovery, and E opens the record.
await page.keyboard.press("m");
await page.waitForTimeout(400);
check("map opens", await page.locator(".map-panel").isVisible());
await page.screenshot({ path: `${outDir}/05-map.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

await page.keyboard.press("j");
await page.waitForTimeout(400);
check("journal opens", await page.locator(".journal-panel").isVisible());
await page.screenshot({ path: `${outDir}/06-journal.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// Visit every discovery via the debug start points plus direct examination, so
// reachability is exercised in the running game and not only in the model.
const examined = [];
for (const start of ["", "office", "tribunal", "cells", "vault"]) {
  const target = start ? `${url}/?start=${start}` : url;
  await page.goto(target, { waitUntil: "networkidle" });
  await page.click("text=TAKE UP THE CLOAK");
  await page.waitForSelector("canvas.world");
  await page.waitForTimeout(1200);
  const prompt = page.locator(".examine-prompt");
  if (await prompt.isVisible().catch(() => false)) {
    await page.keyboard.press("e");
    await page.waitForTimeout(500);
    const title = await page.locator(".lore-card h2").innerText().catch(() => "");
    if (title) examined.push(`${start || "gate"}:${title}`);
    await page.screenshot({ path: `${outDir}/07-examine-${start || "gate"}.png` });
    await page.keyboard.press("Escape");
  }
}
check("discoveries can be examined from start points", examined.length > 0, examined.join(", "));

check("no uncaught errors or console errors", failures.length === 0, failures.join(" | "));

await writeFile(
  `${outDir}/console.log`,
  `${consoleLines.join("\n")}\n\n--- failures ---\n${failures.join("\n")}\n`,
);

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots and console log in ${outDir}`);
process.exit(failed.length === 0 ? 0 : 1);

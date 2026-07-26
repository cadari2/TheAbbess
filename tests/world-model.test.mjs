// Behavioural tests for the derived world model.
//
// These run the real module under Node's native type stripping and assert on
// what the model computes, not on how its source is written. The suite this
// replaces asserted source text — exact `position.set(...)` literals, the
// presence of identifiers — so it passed against a dungeon nobody could finish
// and would have failed on any refactor that preserved behaviour perfectly.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const world = await import("../app/world/index.ts");
const { NPCS } = await import("../app/world-data.ts");
const {
  DISCOVERIES,
  REOPENED_BY_ORDER_FIX,
  SPAWN,
  WORLD_MODEL: model,
  gridToText,
  hasLineOfSight,
  isWallAt,
  misconnectedOpenings,
  misplacedDiscoveries,
  orphanedCells,
  reachableCells,
  reachablePositions,
  isBlockedAt,
  roomNameAt,
  routeMasonryBreaches,
} = world;

test("the plan builds a world of the declared size", () => {
  assert.equal(model.width, 36);
  assert.equal(model.height, 28);
  assert.equal(model.grid.length, 28);
  for (const row of model.grid) assert.equal(row.length, 36);
});

test("no opening is sealed by the masonry of another plan step", () => {
  // Openings are cut after all rooms are laid, which makes this structural.
  // Before that fix, five of nine doorways were paved over by the room that
  // followed them.
  assert.deepEqual(model.sealed, []);
});

test("every opening reaches both rooms it claims to join", () => {
  assert.deepEqual(misconnectedOpenings(model), []);
});

test("every open cell is walkable from the spawn", () => {
  // The check that matters most. Two rooms and two discoveries were previously
  // stranded behind sealed doorways, so the shipped game could not be finished.
  const orphans = orphanedCells(model, SPAWN.x, SPAWN.y);
  assert.deepEqual(
    orphans,
    [],
    `unreachable open cells: ${orphans.map((c) => c.join(",")).join(" ")}`,
  );
});

test("the spawn point is not inside masonry", () => {
  assert.equal(isWallAt(model, SPAWN.x, SPAWN.y), false);
});

test("every discovery sits inside the room it declares", () => {
  assert.deepEqual(misplacedDiscoveries(model), []);
});

test("every discovery is reachable and correctly labelled", () => {
  const reachable = reachableCells(model, SPAWN.x, SPAWN.y);
  const roomById = new Map(model.rooms.map((room) => [room.id, room]));
  for (const discovery of DISCOVERIES) {
    const key = `${Math.floor(discovery.x)},${Math.floor(discovery.y)}`;
    assert.ok(reachable.has(key), `${discovery.id} is not reachable from the spawn`);
    assert.equal(
      roomNameAt(model, discovery.x, discovery.y),
      roomById.get(discovery.room).name,
      `${discovery.id} is labelled with the wrong room`,
    );
  }
});

test("all ten places from the romance are present", () => {
  assert.equal(DISCOVERIES.length, 10);
  for (const title of [
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
    assert.ok(
      DISCOVERIES.some((d) => d.title === title),
      `missing place: ${title}`,
    );
  }
});

test("every walkable position is given a room name", () => {
  // Asserted through the function the game actually calls, not through a
  // reimplementation of it. An earlier version of this test checked regions and
  // openings directly and passed while `roomNameAt` itself still blanked to the
  // fallback in every doorway.
  const unnamed = [];
  for (let y = 0.5; y < model.height; y += 0.5) {
    for (let x = 0.5; x < model.width; x += 0.5) {
      if (isWallAt(model, x, y)) continue;
      if (roomNameAt(model, x, y) === "THE SUBTERRANEAN MAZE") unnamed.push(`${x},${y}`);
    }
  }
  assert.deepEqual(unnamed, [], `positions with no room name: ${unnamed.join(" ")}`);
});

test("no patrol route passes through masonry", () => {
  for (const npc of NPCS) {
    const breaches = routeMasonryBreaches(model, npc.route);
    assert.deepEqual(
      breaches,
      [],
      `${npc.id} breaches masonry: ${breaches
        .map((b) => `${b.segment} at ${b.x.toFixed(2)},${b.y.toFixed(2)}`)
        .join("; ")}`,
    );
  }
});

test("every patrol route stays inside the world and is a usable cycle", () => {
  for (const npc of NPCS) {
    assert.ok(npc.route.length >= 2, `${npc.id} has too few waypoints`);
    assert.ok(npc.speed > 0, `${npc.id} has no speed`);
    assert.ok(npc.dialogue.length > 0, `${npc.id} has no dialogue`);
    const circuit = npc.route.reduce((total, point, index) => {
      const next = npc.route[(index + 1) % npc.route.length];
      return total + Math.hypot(next[0] - point[0], next[1] - point[1]);
    }, 0);
    assert.ok(circuit > 0, `${npc.id} has a zero-length circuit`);
  }
});

test("voices do not carry through masonry", () => {
  const at = (id) => DISCOVERIES.find((d) => d.id === id);
  // The gate court and the tribunal are separated by the whole western range.
  assert.equal(hasLineOfSight(model, at("gate").x, at("gate").y, at("tribunal").x, at("tribunal").y), false);
  assert.equal(hasLineOfSight(model, at("gate").x, at("gate").y, at("maddalena").x, at("maddalena").y), false);
  // Within a room, sound carries.
  assert.equal(hasLineOfSight(model, at("marcello").x, at("marcello").y, at("marcello").x, at("marcello").y - 1), true);
  // The paired cells are joined by the keeper's slit, a straight vertical shaft.
  // A voice passing between them is a property of the plan, not a leak: it is
  // how "one groan, then a woman's cry" reaches a listener in the other cell.
  assert.equal(hasLineOfSight(model, at("marcello").x, at("marcello").y, at("maddalena").x, at("maddalena").y), true);
});

test("every discovery can be approached closely enough to examine", () => {
  // Cell reachability is not the same as walkable reachability. The player is
  // 0.56 across, so props and one-cell doorways decide this, and both had
  // sealed rooms shut: a portcullis collider and a surgeon's table each barred
  // the only route onward. `nearestDiscovery` uses a 2.15 radius, so a marker
  // inside furniture is fine as long as the player can stand near it.
  const flood = reachablePositions(model, SPAWN.x, SPAWN.y);
  assert.ok(flood.size > 1000, "the walkable flood is suspiciously small");
  for (const discovery of DISCOVERIES) {
    let closest = Infinity;
    for (const key of flood) {
      const [gx, gy] = key.split(",").map(Number);
      const distance = Math.hypot(gx * 0.1 - discovery.x, gy * 0.1 - discovery.y);
      if (distance < closest) closest = distance;
    }
    assert.ok(
      closest <= 2.15,
      `${discovery.id} cannot be approached: closest walkable point is ${closest.toFixed(2)} away`,
    );
  }
});

test("holding forward from the spawn walks out of the gate court", () => {
  // The plainest possible first-run check. The spawn used to sit outside the
  // 0.44-wide window through its own doorway, so pressing forward walked into a
  // wall. Mirrors the game's axis-separated movement exactly.
  let x = SPAWN.x;
  let y = SPAWN.y;
  const stepSize = 0.05;
  let travelled = 0;
  let arrived = null;
  const startRoom = roomNameAt(model, x, y);
  while (travelled < 8) {
    const nx = x + Math.cos(SPAWN.dir) * stepSize;
    const ny = y + Math.sin(SPAWN.dir) * stepSize;
    if (!isBlockedAt(model, nx, y)) x = nx;
    if (!isBlockedAt(model, x, ny)) y = ny;
    travelled += stepSize;
    const room = roomNameAt(model, x, y);
    if (room !== startRoom && room !== "THE SUBTERRANEAN MAZE") {
      arrived = room;
      break;
    }
  }
  assert.equal(startRoom, "THE PRISON GATE");
  assert.equal(arrived, "THE OUTER OFFICE", `walked ${travelled.toFixed(2)} and reached ${arrived}`);
});

test("the grid differs from the shipped one only at the reopened doorways", async () => {
  // Pins the build-order correction to an enumerated, reviewable diff so the
  // grid cannot drift silently in either direction.
  const shipped = (
    await readFile(new URL("./fixtures/shipped-grid.txt", import.meta.url), "utf8")
  )
    .trim()
    .split("\n");
  const derived = gridToText(model.grid).trim().split("\n");
  const differing = [];
  for (let y = 0; y < derived.length; y++) {
    for (let x = 0; x < derived[y].length; x++) {
      if (derived[y][x] !== shipped[y][x]) differing.push(`${x},${y}`);
    }
  }
  assert.deepEqual(
    differing.sort(),
    REOPENED_BY_ORDER_FIX.map(([x, y]) => `${x},${y}`).sort(),
  );
  // And every one of them opened up rather than closing down.
  for (const [x, y] of REOPENED_BY_ORDER_FIX) {
    assert.notEqual(shipped[y][x], "0", `${x},${y} was already open`);
    assert.equal(derived[y][x], "0", `${x},${y} did not open`);
  }
});

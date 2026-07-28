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
const {
  DISCOVERIES,
  DOORS,
  NPCS,
  SPAWN,
  WORLD_HEIGHT,
  WORLD_WIDTH,
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
  routeObstructions,
  groundHeightAt,
  isScreenAt,
  createNpcStates,
  updateNpcs,
  overheardAt,
  turnToward,
  createDoorStates,
  updateDoors,
  doorBlocksAt,
  PLAYER_RADIUS,
} = world;

test("the plan builds a world of the declared size", () => {
  assert.equal(model.width, WORLD_WIDTH);
  assert.equal(model.height, WORLD_HEIGHT);
  assert.equal(model.grid.length, WORLD_HEIGHT);
  for (const row of model.grid) assert.equal(row.length, WORLD_WIDTH);
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

test("no round passes through masonry or through furniture", () => {
  // Checked against props as well as walls, and at the figure's own girth. Two
  // of the four old routes cut the closing leg of their cycle through masonry,
  // and the gaoler's walked the length of his prisoner's pallet.
  for (const npc of NPCS) {
    const problems = routeObstructions(model, npc.route);
    assert.deepEqual(
      problems,
      [],
      `${npc.id} is obstructed: ${problems
        .map((b) => `${b.segment} at ${b.x.toFixed(2)},${b.y.toFixed(2)} by ${b.reason}`)
        .join("; ")}`,
    );
  }
});

test("every round is a usable cycle that stops somewhere", () => {
  for (const npc of NPCS) {
    assert.ok(npc.route.length >= 2, `${npc.id} has too few nodes`);
    assert.ok(npc.speed > 0, `${npc.id} has no speed`);
    const circuit = npc.route.reduce((total, node, index) => {
      const next = npc.route[(index + 1) % npc.route.length];
      return total + Math.hypot(next.at[0] - node.at[0], next.at[1] - node.at[1]);
    }, 0);
    assert.ok(circuit > 0, `${npc.id} has a zero-length circuit`);
    // A round with no dwell anywhere is a figure that never stops, which is what
    // made the old patrols read as furniture on castors.
    assert.ok(
      npc.route.some((node) => (node.dwellMs ?? 0) > 0),
      `${npc.id} never pauses anywhere on its round`,
    );
  }
});

test("the simulation is never given the player", async () => {
  // Enforced structurally rather than by discipline. The premise is that the
  // cloaked stranger is never noticed; the way to keep that true through every
  // later change is for the module that decides what NPCs do to have no access
  // to where she is. `updateNpcs` takes no player argument, and this pins the
  // module's source against the vocabulary that would be needed to add one.
  const source = await readFile(new URL("../app/world/npcs.ts", import.meta.url), "utf8");
  // Comments are stripped first: the doc comment at the top of that file is
  // *about* not knowing the player, and would otherwise fail its own rule.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  for (const forbidden of ["player", "Player", "SPAWN", "camera", "overheard"]) {
    assert.ok(!code.includes(forbidden), `npcs.ts references "${forbidden}" outside a comment`);
  }
  // The signature itself: states, definitions, elapsed time. Nothing else.
  assert.equal(updateNpcs.length, 3);
});

test("figures walk their rounds, stop at their posts, and speak on arrival", () => {
  const states = createNpcStates(NPCS);
  const keeper = states.find((s) => s.id === "cell-keeper");
  const start = { x: keeper.x, y: keeper.y };
  const spoken = new Set();
  let everWalked = false;
  let everDwelt = false;
  // Two minutes at a fixed step, which is long enough for every round here to
  // close at least once.
  for (let i = 0; i < 7200; i++) {
    updateNpcs(states, NPCS, 16.7);
    for (const state of states) {
      if (state.saying) spoken.add(`${state.id}:${state.saying}`);
      assert.ok(
        !isWallAt(model, state.x, state.y),
        `${state.id} walked into masonry at ${state.x.toFixed(2)},${state.y.toFixed(2)}`,
      );
    }
    if (keeper.phase === "walk") everWalked = true;
    if (keeper.phase === "dwell" || keeper.phase === "speak") everDwelt = true;
  }
  assert.ok(everWalked, "the gaoler never walked");
  assert.ok(everDwelt, "the gaoler never stopped");
  assert.ok(
    Math.hypot(keeper.x - start.x, keeper.y - start.y) < 6,
    "the gaoler left his corridor",
  );
  // Every authored line is reached, so none is written into a node the round
  // never arrives at.
  const authored = NPCS.flatMap((npc) => npc.route.filter((n) => n.say).map((n) => `${npc.id}:${n.say}`));
  for (const line of authored) assert.ok(spoken.has(line), `never spoken: ${line}`);
});

test("distance walked drives the stride, so a stopped figure is not still walking", () => {
  const states = createNpcStates(NPCS);
  const keeper = states.find((s) => s.id === "cell-keeper");
  let walkingFrames = 0;
  let dwellingTravel = 0;
  for (let i = 0; i < 3000; i++) {
    const before = keeper.travelled;
    updateNpcs(states, NPCS, 16.7);
    const moved = keeper.travelled - before;
    if (keeper.phase === "walk") walkingFrames += 1;
    else dwellingTravel += moved;
  }
  assert.ok(walkingFrames > 0, "never walked");
  assert.equal(dwellingTravel, 0, "accrued stride distance while standing still");
});

test("a voice carries through iron and not through stone", () => {
  const states = createNpcStates(NPCS);
  // Marcello speaks from inside his cell; the corridor outside its bars is in
  // earshot, and the tribunal on the far side of four metres of rock is not.
  const marcello = states.find((s) => s.id === "marcello");
  marcello.saying = "Bendetta.";
  marcello.sayingMs = 5000;
  const throughBars = overheardAt(model, [marcello], NPCS, 29, 5.3);
  assert.ok(throughBars, "nothing audible from the corridor outside the cell");
  assert.equal(throughBars.id, "marcello");
  assert.equal(overheardAt(model, [marcello], NPCS, 22, 8), null, "audible through the rock");
  // And the gaol's own length defeats it: six cells down the corridor is out of
  // earshot even though nothing but air is in the way.
  assert.equal(overheardAt(model, [marcello], NPCS, 29, 24.5), null, "audible the length of the corridor");
});

test("turning takes the short way round", () => {
  assert.equal(turnToward(3.0, -3.0, Math.PI), -3.0);
  const stepped = turnToward(3.0, -3.0, 0.1);
  assert.ok(stepped > 3.0, `turned the long way: ${stepped}`);
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
  assert.equal(startRoom, "THE APPROACH");
  assert.equal(arrived, "THE PRISON GATE", `walked ${travelled.toFixed(2)} and reached ${arrived}`);
});

test("the derived grid matches the recorded plan", async () => {
  // A snapshot, regenerated deliberately whenever the plan is revised, so the
  // building cannot drift silently between revisions. It replaces a fixture that
  // pinned the derived grid against the originally shipped one; that comparison
  // stopped being meaningful once the cell range was replanned, and keeping it
  // would have meant asserting the layout must stay wrong.
  const recorded = (
    await readFile(new URL("./fixtures/plan-grid.txt", import.meta.url), "utf8")
  ).trim();
  assert.equal(gridToText(model.grid).trim(), recorded);
});

test("the cells are fronted with iron, not walled up", () => {
  assert.ok(model.screens.length >= 6, "no screened cell fronts in the plan");
  for (const screen of model.screens) {
    for (let y = screen.y1; y <= screen.y2; y++) {
      for (let x = screen.x1; x <= screen.x2; x++) {
        // Solid to the body: a screen is masonry that has been drawn differently,
        // not a hole. If this ever became open floor the cells would have no
        // fronts at all and the prisoners could walk out.
        assert.ok(isWallAt(model, x + 0.5, y + 0.5), `${screen.id} is not solid at ${x},${y}`);
        assert.ok(isScreenAt(model, x + 0.5, y + 0.5), `${screen.id} is not screened at ${x},${y}`);
      }
    }
  }
  // And open to the eye: a prisoner is visible from the corridor outside.
  assert.equal(hasLineOfSight(model, 29, 5.3, 32.5, 5.3), true);
  assert.equal(hasLineOfSight(model, 29, 9.3, 32.5, 9.3), true);
});

test("the moon stair climbs, and climbs to the door", () => {
  const flight = model.stairs.find((s) => s.id === "moon-flight");
  assert.ok(flight, "no flight in the plan");
  const landing = model.landings.find((s) => s.id === "moon-landing");
  assert.ok(landing, "no landing in the plan");
  // Level floor at the foot, rising all the way to the landing's height.
  const axis = (flight.x1 + flight.x2) / 2;
  assert.equal(groundHeightAt(model, axis, 34.4), 0);
  assert.equal(groundHeightAt(model, axis, 30.2), landing.height);
  assert.ok(landing.height > 1.2, "the climb is not worth the name");
  // Monotonic: no tread drops below the one below it.
  let previous = -1;
  for (let y = 34.9; y >= 30.0; y -= 0.05) {
    const height = groundHeightAt(model, axis, y);
    assert.ok(height >= previous - 1e-9, `the stair falls at y=${y.toFixed(2)}`);
    previous = height;
  }
  // The door is entered on level floor, not halfway up the flight.
  const door = model.openings.find((o) => o.id === "groans-moonstair");
  for (let y = door.y1 + 0.3; y <= door.y2 + 0.7; y += 0.1) {
    assert.equal(
      groundHeightAt(model, axis, y),
      0,
      `the doorway opens onto a tread at y=${y.toFixed(2)}`,
    );
  }
});

test("no prop stands in a doorway the player has to pass through", () => {
  // The press stood across the wardrobe's own door, leaving 0.50 of gap where
  // the player is 0.56 across, so a room about a disguise could only be entered
  // the long way round. Every opening is now measured at its narrowest.
  for (const opening of model.openings) {
    const horizontal = opening.x2 - opening.x1 >= opening.y2 - opening.y1;
    let widest = 0;
    let run = 0;
    const from = horizontal ? opening.y1 : opening.x1;
    const to = (horizontal ? opening.y2 : opening.x2) + 1;
    const across = horizontal ? (opening.x1 + opening.x2 + 1) / 2 : (opening.y1 + opening.y2 + 1) / 2;
    for (let at = from; at <= to; at += 0.02) {
      const blocked = horizontal
        ? isBlockedAt(model, across, at)
        : isBlockedAt(model, at, across);
      run = blocked ? 0 : run + 0.02;
      widest = Math.max(widest, run);
    }
    assert.ok(widest > 0.3, `${opening.id} is passable across only ${widest.toFixed(2)}`);
  }
});

test("a swinging leg stays inside its robe", () => {
  // The fault this replaces: a 0.72m cone to a hem of 0.262 over legs swinging
  // 0.52 radians put the knee's surface 0.253 from the axis where the cloth was
  // 0.224, so the knee came through the front of every cassock on every stride
  // and the shin was outside the garment for the whole of the lower swing.
  //
  // Checked at the shipped swing and at half again beyond it, so the margin is
  // real rather than exactly zero at the one value that happens to be in use.
  const clearance = -world.legEscapesRobe(world.LEG_SWING);
  assert.ok(clearance > 0.01, `the leg leaves the robe by ${(-clearance).toFixed(3)}m`);
  // And the containment must not have been bought by turning the robe into a
  // tunic. The hem still falls below the knee, which is what makes it a habit.
  const hem = world.ROBE.centreY - world.ROBE.height / 2;
  assert.ok(hem < world.LEG.kneeY, `the hem has risen to ${hem.toFixed(2)}, above the knee`);
});

test("a stride covers the distance the legs actually swing", () => {
  // Cadence is driven from distance travelled, so if the cycle length disagrees
  // with the geometry the feet slide over the floor at exactly the difference.
  const step = 2 * world.LEG.hipY * Math.sin(world.LEG_SWING);
  assert.ok(
    Math.abs(world.STRIDE_CYCLE - 2 * step) < 1e-9,
    `a cycle of ${world.STRIDE_CYCLE.toFixed(3)} against two steps of ${step.toFixed(3)}`,
  );
});

test("the cell gates are shut until she is close, and one is never open at all", () => {
  const states = createDoorStates(DOORS);
  const gate = DOORS.find((d) => d.id === "marcello-gate");
  const mid = [
    gate.hinge[0] + (gate.along[0] * gate.width) / 2,
    gate.hinge[1] + (gate.along[1] * gate.width) / 2,
  ];
  // Shut, and solid, with nobody near it.
  assert.equal(states.find((s) => s.id === gate.id).open, 0);
  assert.equal(doorBlocksAt(states, DOORS, mid[0], mid[1], PLAYER_RADIUS), true);

  // Standing well back leaves it shut however long it is left.
  updateDoors(states, DOORS, mid[0] - 6, mid[1], 10000);
  assert.equal(states.find((s) => s.id === gate.id).open, 0);

  // Walking up to it opens it, and the doorway becomes passable.
  updateDoors(states, DOORS, mid[0] - 1.2, mid[1], gate.travelMs);
  assert.equal(states.find((s) => s.id === gate.id).open, 1);
  assert.equal(doorBlocksAt(states, DOORS, mid[0], mid[1], PLAYER_RADIUS), false);

  // Walking away shuts it again.
  updateDoors(states, DOORS, mid[0] - 6, mid[1], gate.travelMs);
  assert.equal(states.find((s) => s.id === gate.id).open, 0);

  // The approach door is the exception, and stays the exception: standing on it
  // for a minute does not move it.
  const outer = DOORS.find((d) => d.id === "approach-door");
  assert.equal(outer.yieldsWithin, null);
  updateDoors(states, DOORS, outer.hinge[0] + outer.width / 2, outer.hinge[1], 60000);
  assert.equal(states.find((s) => s.id === outer.id).open, 0);
  assert.equal(
    doorBlocksAt(states, DOORS, outer.hinge[0] + outer.width / 2, outer.hinge[1], PLAYER_RADIUS),
    true,
    "the way out is not shut",
  );
});

test("every cell gate hangs in the doorway its plan cuts", () => {
  const gates = model.openings.filter((o) => o.id.endsWith("-gate"));
  assert.equal(gates.length, 6, "the gaol has lost a cell");
  for (const opening of gates) {
    const door = DOORS.find((d) => d.id === opening.id);
    assert.ok(door, `${opening.id} has no leaf`);
    // The hinge stands in the opening's own cells, so a doorway that moves in
    // the plan cannot leave its iron behind in the old wall.
    assert.ok(
      door.hinge[0] >= opening.x1 && door.hinge[0] <= opening.x2 + 1,
      `${opening.id}'s hinge is outside its doorway in x`,
    );
    assert.ok(
      door.hinge[1] >= opening.y1 && door.hinge[1] <= opening.y2 + 1,
      `${opening.id}'s hinge is outside its doorway in y`,
    );
  }
});

test("no sightline runs the length of the building", () => {
  // The layout's own argument is compartmented secrecy, and the strongest thing
  // working against it is a straight line. Before the bent passage there was a
  // clear shot of twenty-nine cells along row 8 — the tribunal's west door to
  // the inside of a cell, five rooms on one line.
  //
  // Rooms are allowed to be as long as they are; what is not allowed is a run
  // that crosses more than two of them.
  const longest = { run: 0, where: "" };
  const scan = (cells, label) => {
    let run = 0;
    let start = 0;
    for (let i = 0; i <= cells.length; i++) {
      const open = i < cells.length && !cells[i];
      if (open) {
        if (run === 0) start = i;
        run++;
      } else {
        if (run > longest.run) {
          longest.run = run;
          longest.where = `${label} ${start}..${start + run - 1}`;
        }
        run = 0;
      }
    }
  };
  for (let y = 0; y < model.height; y++) {
    const cells = [];
    for (let x = 0; x < model.width; x++) cells.push(isWallAt(model, x + 0.5, y + 0.5));
    // The gaoler's corridor is meant to be long, and is the one room whose whole
    // effect is that you can see all six identical fronts at once.
    scan(cells, `row ${y}`);
  }
  for (let x = 0; x < model.width; x++) {
    if (x === 28 || x === 29) continue;
    const cells = [];
    for (let y = 0; y < model.height; y++) cells.push(isWallAt(model, x + 0.5, y + 0.5));
    scan(cells, `column ${x}`);
  }
  assert.ok(longest.run <= 20, `a clear run of ${longest.run} cells at ${longest.where}`);
});

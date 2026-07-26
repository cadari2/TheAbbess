import {
  OPEN,
  type DerivedWorld,
  type Extent,
  type Grid,
  type Landing,
  type Opening,
  type PlanStep,
  type Room,
  type Screen,
  type SealedOpening,
  type Stair,
} from "./model.ts";

const cellsOf = (extent: Extent) => {
  const cells: [number, number][] = [];
  for (let y = extent.y1; y <= extent.y2; y++) {
    for (let x = extent.x1; x <= extent.x2; x++) cells.push([x, y]);
  }
  return cells;
};

/** Floor extents of a room: strictly inside the ring for a chamber. */
export function floorExtent(room: Room): Extent {
  if (room.kind === "passage") {
    return { x1: room.x1, y1: room.y1, x2: room.x2, y2: room.y2 };
  }
  return { x1: room.x1 + 1, y1: room.y1 + 1, x2: room.x2 - 1, y2: room.y2 - 1 };
}

/**
 * Applies the plan to a grid and reports what the build order destroyed.
 *
 * A room laid after an opening paves its masonry ring back over that opening.
 * Rather than trusting build order to be authored correctly, every opening is
 * re-checked once the whole plan has run: any cell that is no longer open was
 * sealed, and the room that sealed it is named.
 */
export function derivePlan(
  plan: readonly PlanStep[],
  width: number,
  height: number,
): DerivedWorld {
  const grid: Grid = Array.from({ length: height }, () => Array(width).fill("1"));
  const rooms: Room[] = [];
  const openings: Opening[] = [];
  const screens: Screen[] = [];
  const stairs: Stair[] = [];
  const landings: Landing[] = [];
  /** Which plan step last wrote masonry into each cell, for blame. */
  const lastMason = new Map<string, string>();

  const write = (x: number, y: number, value: string, by: string) => {
    if (y < 0 || y >= height || x < 0 || x >= width) {
      throw new Error(`plan step "${by}" writes outside the world at ${x},${y}`);
    }
    grid[y][x] = value;
    if (value === OPEN) lastMason.delete(`${x},${y}`);
    else lastMason.set(`${x},${y}`, by);
  };

  // Two phases, and the order between them is the whole point.
  //
  // Rooms are laid first, in plan order, so that neighbours sharing a wall still
  // layer their materials the way the plan reads. Openings are then cut through
  // the finished masonry. Interleaving the two — which is what the previous
  // hand-built grid did — lets a room paved after a doorway seal that doorway
  // silently, and it had done so five times, leaving the Chamber of Groans and
  // the Moon Stair unreachable with two discoveries stranded inside them.
  // Cutting every opening last makes that failure structurally impossible
  // instead of something the author has to keep in their head.
  for (const step of plan) {
    if (step.op !== "room") continue;
    const { room } = step;
    rooms.push(room);
    for (const [x, y] of cellsOf(room)) {
      const onRing = x === room.x1 || x === room.x2 || y === room.y1 || y === room.y2;
      if (room.kind === "chamber" && onRing) write(x, y, room.material, room.id);
      else write(x, y, OPEN, room.id);
    }
  }
  for (const step of plan) {
    if (step.op !== "open") continue;
    const { opening } = step;
    openings.push(opening);
    for (const [x, y] of cellsOf(opening)) write(x, y, OPEN, opening.id);
  }

  // Screens, stairs and landings write no masonry, so they are collected in a
  // third pass with nothing to seal and nothing to be sealed by.
  for (const step of plan) {
    if (step.op === "screen") screens.push(step.screen);
    else if (step.op === "stair") stairs.push(step.stair);
    else if (step.op === "landing") landings.push(step.landing);
  }

  const roomById = new Map(rooms.map((room) => [room.id, room]));
  for (const opening of openings) {
    for (const id of opening.between) {
      if (!roomById.has(id)) {
        throw new Error(`opening "${opening.id}" names unknown room "${id}"`);
      }
    }
  }
  for (const item of [...screens, ...stairs, ...landings]) {
    if (!roomById.has(item.room)) {
      throw new Error(`"${item.id}" names unknown room "${item.room}"`);
    }
  }
  // A screen is masonry drawn as bars. If the cell under it is open floor there
  // is no wall to replace, and the bars would hang across a doorway the player
  // walks straight through.
  for (const item of screens) {
    for (const [x, y] of cellsOf(item)) {
      if (grid[y][x] === OPEN) {
        throw new Error(`screen "${item.id}" covers open floor at ${x},${y}`);
      }
    }
  }

  const sealed: SealedOpening[] = [];
  for (const opening of openings) {
    const lost = cellsOf(opening).filter(([x, y]) => grid[y][x] !== OPEN);
    if (lost.length === 0) continue;
    const culprits = new Set(lost.map(([x, y]) => lastMason.get(`${x},${y}`) ?? "?"));
    sealed.push({
      openingId: opening.id,
      sealedBy: [...culprits].sort().join(", "),
      cells: lost,
    });
  }

  return {
    width,
    height,
    grid,
    rooms,
    openings,
    regions: rooms.map((room) => ({ ...floorExtent(room), id: room.id, name: room.name })),
    sealed,
    screens,
    stairs,
    landings,
  };
}

/** Whether a grid cell's masonry is drawn as bars rather than stone. */
export function isScreenAt(world: DerivedWorld, x: number, y: number) {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  return world.screens.some(
    (s) => gx >= s.x1 && gx <= s.x2 && gy >= s.y1 && gy <= s.y2,
  );
}

/**
 * The height of the floor under a position: stair tread, landing, or zero.
 *
 * Quantised to the tread rather than interpolated smoothly, so the surface the
 * player stands on is the surface they can see. A smooth ramp under drawn steps
 * puts the eye half a tread out for most of the climb, which reads as sinking
 * into the stone and then rising out of it once per step.
 */
export function groundHeightAt(world: DerivedWorld, x: number, y: number) {
  for (const landing of world.landings) {
    if (x >= landing.x1 && x <= landing.x2 && y >= landing.y1 && y <= landing.y2) {
      return landing.height;
    }
  }
  for (const stair of world.stairs) {
    if (x < stair.x1 || x > stair.x2 || y < stair.y1 || y > stair.y2) continue;
    const along = stair.axis === "x"
      ? (x - stair.x1) / (stair.x2 - stair.x1)
      : (y - stair.y1) / (stair.y2 - stair.y1);
    const tread = Math.min(stair.treads - 1, Math.floor(along * stair.treads));
    return stair.from + ((stair.to - stair.from) * (tread + 0.5)) / stair.treads;
  }
  return 0;
}

/**
 * Where each tread of a stair sits, so the renderer builds the surface the
 * player is actually standing on rather than its own idea of one.
 */
export function treadsOf(stair: Stair) {
  const alongLow = stair.axis === "x" ? stair.x1 : stair.y1;
  const alongHigh = stair.axis === "x" ? stair.x2 : stair.y2;
  const depth = (alongHigh - alongLow) / stair.treads;
  return Array.from({ length: stair.treads }, (_, i) => ({
    /** Centre of the tread along the climb axis. */
    centre: alongLow + depth * (i + 0.5),
    depth,
    height: stair.from + ((stair.to - stair.from) * (i + 0.5)) / stair.treads,
  }));
}

const overlaps = (a: Extent, b: Extent) =>
  a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1;

/**
 * Openings whose extents do not actually reach both rooms they name.
 *
 * `between` is documentation that has to earn its keep: without this check an
 * opening could be relabelled, or a room moved, and the connectivity graph would
 * keep asserting a join that the masonry no longer makes.
 */
export function misconnectedOpenings(world: DerivedWorld) {
  const roomById = new Map(world.rooms.map((room) => [room.id, room]));
  const problems: { openingId: string; missing: string }[] = [];
  for (const opening of world.openings) {
    for (const id of opening.between) {
      const room = roomById.get(id);
      if (room && !overlaps(opening, room)) {
        problems.push({ openingId: opening.id, missing: id });
      }
    }
  }
  return problems;
}

/**
 * Names the room containing a world position.
 *
 * Regions are tested in plan order and the first containing match wins, which is
 * deterministic where the old hand-maintained zone list was not: its rectangles
 * overlapped each other and disagreed with the masonry, so a position near a
 * shared wall could be labelled with either neighbour depending on array order.
 */
export function roomNameAt(
  world: DerivedWorld,
  x: number,
  y: number,
  fallback = "THE SUBTERRANEAN MAZE",
) {
  const region = world.regions.find(
    (r) => x >= r.x1 && x <= r.x2 + 1 && y >= r.y1 && y <= r.y2 + 1,
  );
  if (region) return region.name;
  // Doorways lie between two rooms and belong to neither region, so without this
  // the label blanked to the fallback every time the player stood in a threshold
  // — which, in a building this small, is a good deal of the time. A doorway
  // reads as the room it leads out of.
  const opening = world.openings.find(
    (o) => x >= o.x1 && x <= o.x2 + 1 && y >= o.y1 && y <= o.y2 + 1,
  );
  if (opening) {
    const room = world.rooms.find((r) => r.id === opening.between[0]);
    if (room) return room.name;
  }
  return fallback;
}

export function isWallAt(world: DerivedWorld, x: number, y: number) {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  if (gx < 0 || gy < 0 || gx >= world.width || gy >= world.height) return true;
  return world.grid[gy][gx] !== OPEN;
}

/**
 * Every open cell reachable on foot from a starting cell, by 4-connected flood.
 *
 * Diagonal movement is excluded deliberately. The player's collision samples a
 * disc against four corners, so a diagonal pinch between two masonry cells is
 * not actually walkable even though it is topologically connected; counting it
 * as reachable would let the suite pass on a dungeon the player cannot cross.
 */
export function reachableCells(world: DerivedWorld, fromX: number, fromY: number) {
  const start: [number, number] = [Math.floor(fromX), Math.floor(fromY)];
  const seen = new Set<string>();
  if (isWallAt(world, start[0], start[1])) return seen;
  const queue: [number, number][] = [start];
  seen.add(`${start[0]},${start[1]}`);
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || isWallAt(world, nx, ny)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

/** Open cells the plan created that cannot be walked to from the spawn. */
export function orphanedCells(world: DerivedWorld, fromX: number, fromY: number) {
  const reachable = reachableCells(world, fromX, fromY);
  const orphans: [number, number][] = [];
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      if (world.grid[y][x] === OPEN && !reachable.has(`${x},${y}`)) orphans.push([x, y]);
    }
  }
  return orphans;
}

/**
 * Whether an unobstructed straight line runs between two points.
 *
 * Used for earshot: a voice should not carry through masonry. Sampling is on a
 * fixed short step rather than a grid-exact traversal because a supercover walk
 * treats a line grazing a corner as blocked, which would silence NPCs across
 * open doorways they are standing in.
 *
 * Iron screens are transparent here. They are masonry to the body and nothing at
 * all to sight or sound, which is the entire architecture of a cell: the
 * prisoner can be watched and heard from the corridor and cannot leave it.
 */
export function hasLineOfSight(
  world: DerivedWorld,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  step = 0.2,
) {
  const distance = Math.hypot(bx - ax, by - ay);
  const samples = Math.ceil(distance / step);
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    if (isWallAt(world, x, y) && !isScreenAt(world, x, y)) return false;
  }
  return true;
}

/**
 * Points along a closed patrol route that pass through masonry.
 *
 * Routes were previously hand-typed and never checked, and two of the four
 * shipped patrols walked through walls — in both cases the closing segment,
 * because a route is a cycle and the leg from the last waypoint back to the
 * first is the easy one to forget. Sampling is deliberately finer than the
 * player's collision step so a patrol cannot clip a corner between samples.
 */
export function routeMasonryBreaches(
  world: DerivedWorld,
  route: readonly (readonly [number, number])[],
  step = 0.1,
) {
  const breaches: { segment: string; x: number; y: number }[] = [];
  for (let i = 0; i < route.length; i++) {
    const from = route[i];
    const to = route[(i + 1) % route.length];
    const segment = `${i}→${(i + 1) % route.length}`;
    if (isWallAt(world, from[0], from[1])) {
      breaches.push({ segment: `waypoint ${i}`, x: from[0], y: from[1] });
    }
    const samples = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / step);
    for (let s = 1; s < samples; s++) {
      const t = s / samples;
      const x = from[0] + (to[0] - from[0]) * t;
      const y = from[1] + (to[1] - from[1]) * t;
      if (isWallAt(world, x, y)) {
        breaches.push({ segment, x, y });
        break;
      }
    }
  }
  return breaches;
}

export function gridToText(grid: Grid) {
  return grid.map((row) => row.join("")).join("\n");
}

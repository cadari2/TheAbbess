import { isWallAt } from "./derive.ts";
import type { DerivedWorld } from "./model.ts";
import { CELL_GATE_ROWS } from "./plan.ts";

/**
 * Prop collision volumes.
 *
 * These mirror the substantial furniture the renderer builds — the tribunal
 * table, the selette, the judges' chairs, pallets, barrels, the wardrobe press,
 * the torture apparatus. They live here rather than beside the geometry because
 * reachability has to account for them: a doorway wide enough in the masonry can
 * still be blocked by a barrel, and only the model can answer that.
 *
 * People are deliberately absent. The cloaked stranger passes through the
 * institution's servants without being obstructed by them, exactly as she passes
 * through its locks; interpenetration is the accepted tell. The circles here that
 * sit under a seated figure are that figure's *chair*.
 */
export type DungeonCollider =
  | { shape: "box"; x: number; z: number; halfX: number; halfZ: number }
  | { shape: "circle"; x: number; z: number; radius: number };

/** Cell gate rows, shared with the renderer's pallets and the door hinges. */
export const CELL_ROWS = CELL_GATE_ROWS;

export const DUNGEON_COLLIDERS: DungeonCollider[] = [
  // The approach. The door at the player's back is a real solid, not a painted
  // one: it is here so that walking into it stops you, which is the only way the
  // first thing the game says about this place gets said at all.
  { shape: "box", x: 6, z: 48.9, halfX: 0.95, halfZ: 0.12 },

  // The gate hall: the counter across it, a barrel, a chest.
  { shape: "box", x: 6.75, z: 40.6, halfX: 2.75, halfZ: 0.18 },
  { shape: "circle", x: 3.2, z: 38.4, radius: 0.42 },
  { shape: "box", x: 10.6, z: 38.2, halfX: 0.48, halfZ: 0.48 },

  // The outer office: the familiars' desk and their two chairs.
  { shape: "box", x: 6, z: 31.4, halfX: 1.3, halfZ: 0.62 },
  { shape: "circle", x: 5.2, z: 30.48, radius: 0.4 },
  { shape: "circle", x: 6.8, z: 30.48, radius: 0.4 },

  // The anteroom: a bench along the west wall and a basin on its stand.
  { shape: "box", x: 10.4, z: 5.5, halfX: 0.25, halfZ: 1.0 },
  { shape: "circle", x: 13.6, z: 3.6, radius: 0.3 },

  // The tribunal: the long table along the room's long axis, the dais behind it
  // with the great crucifix at its back, the bench of judges, the secretary's
  // desk off the east end, and the selette.
  { shape: "box", x: 22.5, z: 6.2, halfX: 4.0, halfZ: 0.9 },
  { shape: "box", x: 22.5, z: 4.5, halfX: 1.2, halfZ: 0.8 },
  { shape: "box", x: 22.5, z: 3.12, halfX: 0.55, halfZ: 0.12 },
  { shape: "circle", x: 19, z: 4.65, radius: 0.38 },
  { shape: "circle", x: 20.6, z: 4.65, radius: 0.38 },
  { shape: "circle", x: 24.4, z: 4.65, radius: 0.38 },
  { shape: "circle", x: 26, z: 4.65, radius: 0.38 },
  { shape: "box", x: 27.6, z: 8.6, halfX: 0.65, halfZ: 0.45 },
  { shape: "circle", x: 28.5, z: 8.6, radius: 0.38 },
  { shape: "circle", x: 23.8, z: 9.4, radius: 0.35 },

  // The six cells. Each pallet lies along its cell's south wall at the west
  // end — under the demon, in Marcello's — leaving the gate row clear to walk
  // in by and the east half of the floor, where the moon falls, clear.
  ...CELL_ROWS.map((row) => ({
    shape: "box" as const,
    x: 41.95,
    z: row + 2.55,
    halfX: 0.85,
    halfZ: 0.35,
  })),
  // And each has a stool in its north-east corner.
  ...CELL_ROWS.map((row) => ({
    shape: "circle" as const,
    x: 44.35,
    z: row + 0.45,
    radius: 0.3,
  })),

  // The gaoler's lodge: his stool.
  { shape: "circle", x: 34.5, z: 27.3, radius: 0.3 },

  // The wardrobe: the press against the south wall, the bench by the door.
  { shape: "box", x: 14, z: 36.5, halfX: 0.8, halfZ: 0.45 },
  { shape: "box", x: 14, z: 33.6, halfX: 0.8, halfZ: 0.3 },

  // The Chamber of Groans: four piers, the rack, the surgeon's table, and two
  // basins.
  { shape: "box", x: 29, z: 37, halfX: 0.45, halfZ: 0.45 },
  { shape: "box", x: 34, z: 37, halfX: 0.45, halfZ: 0.45 },
  { shape: "box", x: 29, z: 41, halfX: 0.45, halfZ: 0.45 },
  { shape: "box", x: 34, z: 41, halfX: 0.45, halfZ: 0.45 },
  { shape: "box", x: 31.5, z: 40, halfX: 1.28, halfZ: 0.95 },
  { shape: "box", x: 27.5, z: 43, halfX: 1.12, halfZ: 0.58 },
  { shape: "circle", x: 36.4, z: 43.6, radius: 0.4 },
  { shape: "circle", x: 36.4, z: 35.2, radius: 0.4 },

  // The garden: six cypresses, the basin, and a bench.
  { shape: "circle", x: 49, z: 16, radius: 0.45 },
  { shape: "circle", x: 49, z: 19.5, radius: 0.45 },
  { shape: "circle", x: 49, z: 23, radius: 0.45 },
  { shape: "circle", x: 55, z: 16, radius: 0.45 },
  { shape: "circle", x: 55, z: 19.5, radius: 0.45 },
  { shape: "circle", x: 55, z: 23, radius: 0.45 },
  { shape: "circle", x: 52, z: 20.5, radius: 1.15 },
  { shape: "box", x: 54.6, z: 25.6, halfX: 0.8, halfZ: 0.25 },
];

export function hitsCollider(x: number, z: number, radius = 0.22) {
  return DUNGEON_COLLIDERS.some((collider) => {
    if (collider.shape === "circle") {
      return Math.hypot(x - collider.x, z - collider.z) < radius + collider.radius;
    }
    const nearestX = Math.max(
      collider.x - collider.halfX,
      Math.min(x, collider.x + collider.halfX),
    );
    const nearestZ = Math.max(
      collider.z - collider.halfZ,
      Math.min(z, collider.z + collider.halfZ),
    );
    return Math.hypot(x - nearestX, z - nearestZ) < radius;
  });
}

/** The player's radius, as used by movement collision. */
export const PLAYER_RADIUS = 0.28;

/**
 * Whether a player of `radius` standing at a position overlaps masonry or a prop.
 *
 * Samples the four corners of the player's bounding square, matching the movement
 * code exactly. Any divergence between this and movement would make reachability
 * tests describe a dungeon nobody is walking.
 */
export function isBlockedAt(
  world: DerivedWorld,
  x: number,
  y: number,
  radius = PLAYER_RADIUS,
) {
  return (
    isWallAt(world, x - radius, y - radius) ||
    isWallAt(world, x + radius, y - radius) ||
    isWallAt(world, x - radius, y + radius) ||
    isWallAt(world, x + radius, y + radius) ||
    hitsCollider(x, y, radius)
  );
}

/**
 * Positions a player of `radius` can actually stand, flooded from a start point.
 *
 * Cell-level reachability is not enough. A one-cell doorway is 1.0 wide and the
 * player is 0.56 across, so the passable window is 0.44 — and if the approach is
 * not aligned to it, a corridor that the cell flood calls connected is one the
 * player cannot walk through. This samples real standable positions instead.
 */
export function reachablePositions(
  world: DerivedWorld,
  startX: number,
  startY: number,
  radius = PLAYER_RADIUS,
  step = 0.1,
) {
  const key = (x: number, y: number) => `${Math.round(x / step)},${Math.round(y / step)}`;
  const standable = (x: number, y: number) =>
    x > 0 && y > 0 && x < world.width && y < world.height && !isBlockedAt(world, x, y, radius);
  const seen = new Set<string>();
  if (!standable(startX, startY)) return seen;
  const queue: [number, number][] = [[startX, startY]];
  seen.add(key(startX, startY));
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (seen.has(key(nx, ny)) || !standable(nx, ny)) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  return seen;
}

/** Whether a position is within the flood produced by `reachablePositions`. */
export function floodContains(
  flood: ReadonlySet<string>,
  x: number,
  y: number,
  step = 0.1,
) {
  return flood.has(`${Math.round(x / step)},${Math.round(y / step)}`);
}

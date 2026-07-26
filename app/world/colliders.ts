import { isWallAt } from "./derive.ts";
import type { DerivedWorld } from "./model.ts";

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

export const DUNGEON_COLLIDERS: DungeonCollider[] = [
  { shape: "box", x: 5, z: 25.72, halfX: 2.15, halfZ: 0.16 },
  { shape: "circle", x: 3.25, z: 24.4, radius: 0.42 },
  { shape: "box", x: 6.75, z: 24.7, halfX: 0.48, halfZ: 0.48 },
  { shape: "box", x: 5.15, z: 19.4, halfX: 1.3, halfZ: 0.62 },
  { shape: "circle", x: 4.35, z: 18.48, radius: 0.4 },
  { shape: "circle", x: 5.95, z: 18.48, radius: 0.4 },
  { shape: "box", x: 17, z: 7.65, halfX: 1.28, halfZ: 2.78 },
  { shape: "box", x: 17, z: 10.2, halfX: 1.4, halfZ: 0.9 },
  { shape: "circle", x: 15.45, z: 5.15, radius: 0.38 },
  { shape: "circle", x: 15.45, z: 6.45, radius: 0.38 },
  { shape: "circle", x: 15.45, z: 7.75, radius: 0.38 },
  { shape: "circle", x: 15.45, z: 9.05, radius: 0.38 },
  { shape: "circle", x: 17, z: 4.5, radius: 0.38 },
  { shape: "circle", x: 18.6, z: 9.65, radius: 0.35 },
  // The three cells. Each pallet lies along its cell's north wall, leaving the
  // floor between the pallet and the iron front clear — which is the only part
  // of a cell a prisoner has, and it should be walkable.
  { shape: "box", x: 32.5, z: 5.5, halfX: 0.85, halfZ: 0.4 },
  { shape: "circle", x: 33.4, z: 7.5, radius: 0.3 },
  { shape: "box", x: 32.5, z: 10.5, halfX: 0.85, halfZ: 0.4 },
  { shape: "box", x: 32.5, z: 15.5, halfX: 0.85, halfZ: 0.4 },
  // The press, moved off the office doorway it used to stand across. At its old
  // seat it left 0.50 of gap where the player needs 0.56, so the wardrobe room's
  // own door was impassable and the room could only be entered from the vault.
  { shape: "box", x: 12.5, z: 21.5, halfX: 0.8, halfZ: 0.45 },
  { shape: "box", x: 12.5, z: 19.6, halfX: 0.8, halfZ: 0.3 },
  // No collider for the portcullis at 24.15: it hangs raised in the doorway, and
  // a blocking volume there sealed the Chamber of Groans and the Moon Stair.
  { shape: "box", x: 27.3, z: 23.1, halfX: 1.28, halfZ: 0.95 },
  // The surgeon's narrow table, now along the south wall and turned with it.
  { shape: "box", x: 27.4, z: 24.9, halfX: 1.12, halfZ: 0.58 },
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

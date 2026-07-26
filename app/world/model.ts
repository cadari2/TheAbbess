/**
 * Types for the authored dungeon plan.
 *
 * Everything the game knows about the shape of the Holy Office derives from a
 * single ordered plan: the collision grid, the room labels, the map regions,
 * the reachability graph, and the validation of NPC routes against all of them.
 * Nothing here is a duplicate of anything else. Before this module the same
 * building was described three times — a hand-built character grid, a separate
 * `ROOM_ZONES` list, and a hand-placed `DUNGEON_COLLIDERS` list — and the three
 * had already drifted apart.
 */

/** Wall material key. These are the grid characters the renderer instances. */
export type WallMaterial = "1" | "2" | "3" | "4";

export const WALL_MATERIALS: readonly WallMaterial[] = ["1", "2", "3", "4"];

/** Open floor. Any other grid character is masonry of the matching material. */
export const OPEN = "0";

export type RoomKind =
  /** A walled room: masonry ring at the extents, floor within. */
  | "chamber"
  /** A corridor or stair: floor across the whole extents, no ring of its own. */
  | "passage";

export type Room = {
  id: string;
  /** Displayed as the location name, so it carries the period register. */
  name: string;
  kind: RoomKind;
  /**
   * Outer extents in grid cells, inclusive. For a `chamber` the masonry ring
   * sits *on* these lines and the floor is strictly inside them, so a chamber
   * of extents 2..8 has interior 3..7.
   */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  material: WallMaterial;
};

/**
 * A hole cut through masonry to join two rooms.
 *
 * `between` is not decoration: it is checked. A opening whose extents do not
 * actually touch both named rooms is a plan error, and so is one that a later
 * plan step paves back over.
 */
export type Opening = {
  id: string;
  between: readonly [string, string];
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /**
   * Concealed from the institution's official plan — the keeper's slit behind
   * the paired cells. Recorded so the map can withhold it until it is walked.
   */
  hidden?: boolean;
};

/**
 * One step of the build, applied in order.
 *
 * Order is load-bearing and destructive: a room laid after an opening will pave
 * its own masonry ring back over that opening and silently seal it. That is not
 * hypothetical — it had already happened twice in the previous hand-built grid.
 * Keeping the plan an explicit ordered list is what lets `derivePlan` detect it
 * instead of shipping it.
 */
export type PlanStep =
  | { op: "room"; room: Room }
  | { op: "open"; opening: Opening };

export type Grid = string[][];

/** A rectangle in grid space, inclusive of its bounds. */
export type Extent = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/**
 * An opening that a later plan step paved over. Carries the culprit so the
 * failure names the room that sealed it rather than just the hole that closed.
 */
export type SealedOpening = {
  openingId: string;
  sealedBy: string;
  cells: readonly (readonly [number, number])[];
};

export type DerivedWorld = {
  width: number;
  height: number;
  grid: Grid;
  rooms: readonly Room[];
  openings: readonly Opening[];
  /** Floor extents per room, for map regions and point-in-room labelling. */
  regions: readonly (Extent & { id: string; name: string })[];
  /** Openings destroyed by a later plan step. Empty in a healthy plan. */
  sealed: readonly SealedOpening[];
};

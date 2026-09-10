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
  /**
   * Roofless: the lane beyond the moon door and the garden it leads to. The
   * renderer lays no ceiling over an open-air room and lets the sky in, and the
   * moon lights it. Everything else in the building is roofed.
   */
  openAir?: boolean;
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
 * Masonry replaced by an iron screen: bars in a stone frame.
 *
 * The cell fronts. Collision treats a screen exactly as the wall it replaces —
 * the grid is untouched — but sight and sound pass through it, and the renderer
 * draws bars instead of instancing a stone block. That combination is the whole
 * point of a cell: the prisoner is visible and audible from the corridor and
 * cannot leave it.
 */
export type Screen = {
  id: string;
  /** The room whose front this is, for the renderer's material choice. */
  room: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/**
 * A run of steps, described once and used by three consumers.
 *
 * The stair geometry, the height the player's eye rides at, and the height any
 * figure standing on it is drawn at all read this. Before it, the moon stair was
 * decoration: eight boxes drawn on a flat floor that the player walked straight
 * through without rising, so the "hidden stair" could be crossed but never
 * climbed.
 *
 * Height is quantised to the tread, so the surface the player stands on is the
 * surface they can see, rather than a ramp hidden under drawn steps.
 */
export type Stair = {
  id: string;
  room: string;
  /** Footprint in world units, not cells. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** The axis the treads climb along. */
  axis: "x" | "y";
  /** Height at the low edge (`x1`/`y1`) and at the high edge (`x2`/`y2`). */
  from: number;
  to: number;
  /** Number of treads. Rise per tread is `(to - from) / treads`. */
  treads: number;
};

/**
 * A floor at a fixed height: the landing a stair arrives at.
 *
 * Kept separate from `Stair` rather than modelled as a stair of zero rise, so a
 * landing cannot be given treads by accident and the renderer has nothing to
 * draw for one but a slab.
 */
export type Landing = {
  id: string;
  room: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  height: number;
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
  | { op: "open"; opening: Opening }
  | { op: "screen"; screen: Screen }
  | { op: "stair"; stair: Stair }
  | { op: "landing"; landing: Landing };

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
  /** Masonry drawn as bars: solid to the body, open to sight and sound. */
  screens: readonly Screen[];
  stairs: readonly Stair[];
  landings: readonly Landing[];
};

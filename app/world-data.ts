/**
 * Compatibility facade over `app/world/`.
 *
 * The building used to be described three times here — a hand-typed character
 * grid, a separate `ROOM_ZONES` rectangle list, and (in `three-world.ts`) a
 * hand-placed collider list — and the three had drifted apart: zone rectangles
 * overlapped and disagreed with the masonry, and five doorways had been paved
 * over by the build order, leaving two rooms unreachable. Everything spatial now
 * derives from the single plan in `app/world/plan.ts`.
 *
 * This module stays only so existing importers keep their shape. New code should
 * import from `./world` directly.
 */
import {
  WORLD_HEIGHT,
  WORLD_MODEL,
  WORLD_WIDTH,
  roomNameAt,
} from "./world/index.ts";

export { DISCOVERIES, type Discovery } from "./world/index.ts";

export const W = WORLD_WIDTH;
export const H = WORLD_HEIGHT;
export const WORLD = WORLD_MODEL.grid;

/**
 * Room rectangles for the map and the location label, derived from the plan
 * rather than maintained beside it.
 */
export const ROOM_ZONES = WORLD_MODEL.regions;

/** Names the room at a world position. */
export const roomNameAtPosition = (x: number, y: number) =>
  roomNameAt(WORLD_MODEL, x, y);

export { NPCS, type NpcDefinition, type NpcState } from "./world/index.ts";

/**
 * The patrols and their positions used to live here as a bare list of waypoint
 * pairs plus a closed-form `npcPosition(npc, timeMs)`. Both are gone: routes are
 * now nodes carrying dwell, facing and speech, and figures are advanced by a
 * fixed-step simulation that can hold a pause. See `app/world/npcs.ts`.
 */

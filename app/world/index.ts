/**
 * The single description of the Holy Office.
 *
 * Import the derived world from here. Nothing outside `app/world/` should hold
 * its own copy of a coordinate that this module can compute.
 */
import { derivePlan } from "./derive.ts";
import { PLAN, WORLD_HEIGHT, WORLD_WIDTH } from "./plan.ts";

export * from "./model.ts";
export {
  derivePlan,
  floorExtent,
  gridToText,
  hasLineOfSight,
  isWallAt,
  misconnectedOpenings,
  orphanedCells,
  reachableCells,
  routeMasonryBreaches,
  roomNameAt,
} from "./derive.ts";
export { PLAN, REOPENED_BY_ORDER_FIX, SPAWN, WORLD_HEIGHT, WORLD_WIDTH } from "./plan.ts";
export { DISCOVERIES, misplacedDiscoveries, type Discovery } from "./discoveries.ts";
export {
  DUNGEON_COLLIDERS,
  PLAYER_RADIUS,
  floodContains,
  hitsCollider,
  isBlockedAt,
  reachablePositions,
  type DungeonCollider,
} from "./colliders.ts";

export const WORLD_MODEL = derivePlan(PLAN, WORLD_WIDTH, WORLD_HEIGHT);

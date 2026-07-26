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

export type DungeonNpc = {
  id: string;
  name: string;
  role: string;
  route: readonly [number, number][];
  dialogue: readonly string[];
  speed: number;
};

export const NPCS: DungeonNpc[] = [
  // Routes are cycles, so the leg from the last waypoint back to the first is
  // part of the walk. This one and the gaoler's below both used to cut that leg
  // straight through masonry; each now returns the way it came, through the
  // doorway it actually has.
  { id: "gate-familiar", name: "A Familiar", role: "Officer of the threshold", route: [[4.2, 24.2], [5.5, 24.2], [5.5, 19.2], [4.2, 19.2], [5.5, 19.2], [5.5, 24.2]], speed: 0.38, dialogue: ["The Office receives no one by that name.", "Keep your hood raised. There are questions enough without faces."] },
  { id: "tribunal-clerk", name: "The Secretary", role: "Keeper of testimony", route: [[11, 8], [14, 8], [17, 5.2], [20.8, 8]], speed: 0.3, dialogue: ["Every answer is entered. Every silence also.", "The fathers will summon the prisoner when the record is prepared."] },
  // Passes between the paired cells along the keeper's slit, then retraces.
  { id: "cell-keeper", name: "A Gaoler", role: "Keeper of the cells", route: [[25, 7.8], [30, 7.8], [30, 15.8], [25, 15.8], [30, 15.8], [30, 7.8]], speed: 0.34, dialogue: ["You pass as though the walls had given you leave.", "The woman prays. The young man studies the painted wall."] },
  { id: "masked-watch", name: "The Masked Official", role: "Watcher of the hidden road", route: [[18.2, 20.2], [21.2, 20.2], [21.2, 23], [18.2, 23]], speed: 0.2, dialogue: ["The word? No—do not speak it here.", "I know the habit. I do not know the man within it."] },
];

export function npcPosition(npc: DungeonNpc, timeMs: number) {
  const route = npc.route;
  const distances = route.map((point, index) => {
    const next = route[(index + 1) % route.length];
    return Math.hypot(next[0] - point[0], next[1] - point[1]);
  });
  const circuit = distances.reduce((total, distance) => total + distance, 0);
  let travel = ((timeMs / 1000) * npc.speed) % circuit;
  let segment = 0;
  while (travel > distances[segment]) {
    travel -= distances[segment];
    segment += 1;
  }
  const from = route[segment];
  const to = route[(segment + 1) % route.length];
  const amount = distances[segment] === 0 ? 0 : travel / distances[segment];
  return {
    x: from[0] + (to[0] - from[0]) * amount,
    y: from[1] + (to[1] - from[1]) * amount,
    dir: Math.atan2(to[1] - from[1], to[0] - from[0]),
  };
}

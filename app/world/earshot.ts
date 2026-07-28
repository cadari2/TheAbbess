/**
 * What the player can hear, resolved from outside the simulation.
 *
 * This is the seam that keeps the NPCs innocent. `updateNpcs` is given no player
 * and produces no dialogue events; it only records what each figure is currently
 * saying, to nobody. This module reads that record — strictly read-only — and
 * answers a separate question: standing here, is any of it audible?
 *
 * Overhearing is therefore something the player does, never something an NPC
 * does at her. A line does not begin because she arrived and does not stop
 * because she left; she walks into and out of it.
 */

import { hasLineOfSight } from "./derive.ts";
import type { DerivedWorld } from "./model.ts";
import type { NpcDefinition, NpcState } from "./npcs.ts";

/**
 * How far a voice carries with nothing in the way.
 *
 * Generous, because the alternative is worse: too short and lines only ever
 * land when the player is standing on top of a figure, which is both hard to
 * arrange and hard to read as overhearing rather than as being addressed.
 */
export const EARSHOT = 5.6;

export type Overheard = {
  id: string;
  name: string;
  role: string;
  line: string;
  /** How far away the speaker is, so the caller can attenuate. */
  distance: number;
};

/**
 * The nearest line currently audible at a position, or null.
 *
 * Occluded by masonry: a voice does not carry through a wall. Iron screens are
 * transparent to it, which is why a prisoner's murmur reaches the corridor.
 */
export function overheardAt(
  world: DerivedWorld,
  states: readonly NpcState[],
  definitions: readonly NpcDefinition[],
  x: number,
  y: number,
  earshot = EARSHOT,
): Overheard | null {
  const byId = new Map(definitions.map((npc) => [npc.id, npc]));
  let best: Overheard | null = null;
  for (const state of states) {
    if (!state.saying) continue;
    const distance = Math.hypot(state.x - x, state.y - y);
    if (distance > earshot) continue;
    if (best && distance >= best.distance) continue;
    if (!hasLineOfSight(world, state.x, state.y, x, y)) continue;
    const npc = byId.get(state.id);
    if (!npc) continue;
    best = { id: npc.id, name: npc.name, role: npc.role, line: state.saying, distance };
  }
  return best;
}

/**
 * Doors that yield, and one that has to be unlocked.
 *
 * The cell gates are shut. They are shut in the plan, shut in the collision
 * model, and shut on screen, and a player who walks at one walks into iron —
 * until they are close enough, at which point it swings and they go through.
 *
 * There is no prompt and no keypress, and that is the whole design. The cloaked
 * stranger's access is the premise of this adaptation, and a premise stated by
 * an interaction is a premise the player has to agree to perform; stated by a
 * door that is simply already moving by the time they reach it, it is something
 * that happens *to* them. They do not open the Holy Office's gaol. It opens.
 *
 * Two exceptions fix the meaning of the rule.
 *
 * `yieldsWithin: null` is a door that never yields however long you stand at
 * it, and the approach door — the one at the player's back in the first ten
 * seconds of the game — is one. The building is not indifferent to her because
 * nothing here is locked. It is indifferent because she is not the one it is
 * locked against.
 *
 * `requiresKey` is a door that yields only to someone carrying a particular
 * key, and the moon door at the top of the hidden stair is the one. In the
 * romance the guide's key is the last thing between the dungeons and the
 * moonlight, and the one lock in the building that answers to a key rather
 * than to a habit is the lock on the way out.
 *
 * None of this is known to `npcs.ts`, which is given no player and no doors. A
 * gaoler walks his round past a gate that opens for someone he does not see.
 */

import { CELL_GATE_ROWS, UPPER_FLOOR } from "./plan.ts";

/** What a door is made of, for the renderer. Collision does not care. */
export type DoorLeaf = "iron-gate" | "stone-panel" | "moon-door" | "shut-door";

export type DoorDefinition = {
  id: string;
  /** The hinge post, in world coordinates. */
  hinge: readonly [number, number];
  /**
   * The leaf's direction when shut, as a unit vector from the hinge. The leaf
   * occupies `hinge` to `hinge + along * width`.
   */
  along: readonly [number, number];
  width: number;
  /**
   * How far the leaf swings, in radians, and which way. Positive turns the
   * leaf's free end anticlockwise in the x/y plane.
   */
  swing: number;
  /**
   * How near the player must come, in metres, before the leaf begins to move.
   * `null` for a door that never opens.
   *
   * Generously set. A door that starts moving at arm's length is a door the
   * player collides with first and watches open second, which reads as a lock
   * they picked rather than a threshold that did not apply to them.
   */
  yieldsWithin: number | null;
  /** How long the leaf takes to travel its full arc. */
  travelMs: number;
  leaf: DoorLeaf;
  /** The floor the leaf hangs over, so a door on a landing is drawn on it. */
  floor?: number;
  /**
   * The key this door answers to. A door with one stays shut, however close
   * she comes, until the key is in her hand — and then yields like the rest.
   */
  requiresKey?: string;
};

export type DoorState = {
  id: string;
  /** 0 shut, 1 fully open. */
  open: number;
};

/**
 * Iron, and heavy, and slow.
 *
 * 2.6s across the arc is far slower than a player walks, which is deliberate:
 * approached at a normal pace the gate is still moving when they reach it, so
 * they pass through a door in the act of opening rather than through a doorway
 * that was already clear.
 */
const GATE_TRAVEL_MS = 2600;

/** The key of the moon door, kept by the watcher of the hidden road. */
export const MOON_KEY = "moon-key";

const CELL_GATE_IDS = ["marcello-gate", "maddalena-gate", "third-gate", "fourth-gate", "fifth-gate", "sixth-gate"];

export const DOORS: readonly DoorDefinition[] = [
  // Each leaf hangs in the middle of its doorway cell and swings *into* the
  // cell. Into the corridor would be wrong twice over: six leaves standing open
  // would half-close it, and a gate that opens inwards is a gate whose arc
  // sweeps the only floor its prisoner has — which is, unhappily, correct, and
  // worth seeing.
  ...CELL_GATE_ROWS.map((row, i) => ({
    id: CELL_GATE_IDS[i],
    hinge: [40.5, row + 0.04] as const,
    along: [0, 1] as const,
    width: 0.92,
    swing: -Math.PI / 2,
    yieldsWithin: 2.2,
    travelMs: GATE_TRAVEL_MS,
    leaf: "iron-gate" as const,
  })),
  // The panel of stone in the party wall beside the demon. It turns on a pivot
  // at its west edge and swings into Maddalena's cell, and from Marcello's side
  // it is wall until it is not.
  {
    id: "keepers-panel",
    hinge: [43.04, 7.08],
    along: [1, 0],
    width: 0.92,
    swing: Math.PI / 2,
    yieldsWithin: 1.7,
    travelMs: 3400,
    leaf: "stone-panel",
  },
  // The moon door: oak, iron-strapped, on the landing at the top of the stair,
  // and locked. It swings outward into the lane, so that what comes through
  // the widening gap is the light and not the leaf.
  {
    id: "moon-door",
    hinge: [42.05, 38.92],
    along: [1, 0],
    width: 1.9,
    swing: -Math.PI / 2,
    yieldsWithin: 2.4,
    travelMs: 3600,
    leaf: "moon-door",
    floor: UPPER_FLOOR,
    requiresKey: MOON_KEY,
  },
  // The way she came in. It does not open again.
  {
    id: "approach-door",
    hinge: [5.05, 48.85],
    along: [1, 0],
    width: 1.9,
    swing: 0,
    yieldsWithin: null,
    travelMs: GATE_TRAVEL_MS,
    leaf: "shut-door",
  },
];

export function createDoorStates(
  definitions: readonly DoorDefinition[] = DOORS,
): DoorState[] {
  return definitions.map((door) => ({ id: door.id, open: 0 }));
}

const NO_KEYS: ReadonlySet<string> = new Set();

/**
 * Advance every leaf toward where the player's distance says it should be.
 *
 * Unlike the NPC simulation this *is* given the player, and the difference is
 * the point: the institution's people never register her, and the institution's
 * fabric always does. `held` is what she carries; a door that wants a key she
 * does not have behaves exactly as though she were not there.
 */
export function updateDoors(
  states: DoorState[],
  definitions: readonly DoorDefinition[],
  playerX: number,
  playerY: number,
  dtMs: number,
  held: ReadonlySet<string> = NO_KEYS,
) {
  for (const state of states) {
    const door = definitions.find((entry) => entry.id === state.id);
    if (!door) continue;
    if (door.yieldsWithin === null) {
      state.open = 0;
      continue;
    }
    const unlocked = !door.requiresKey || held.has(door.requiresKey);
    // Measured to the leaf's midpoint rather than the hinge, so a wide gate does
    // not wait for the player to reach the post it is hung on.
    const midX = door.hinge[0] + (door.along[0] * door.width) / 2;
    const midY = door.hinge[1] + (door.along[1] * door.width) / 2;
    const near = unlocked && Math.hypot(playerX - midX, playerY - midY) <= door.yieldsWithin;
    const step = dtMs / door.travelMs;
    state.open = near
      ? Math.min(1, state.open + step)
      : Math.max(0, state.open - step);
  }
}

/**
 * Whether the player is standing at a door that wants a key they do not hold.
 *
 * The HUD's business, not the door's: the door simply stays shut. This exists
 * so the player can be told *why* it stayed shut, once, in words.
 */
export function lockedDoorNear(
  definitions: readonly DoorDefinition[],
  playerX: number,
  playerY: number,
  held: ReadonlySet<string>,
) {
  for (const door of definitions) {
    if (!door.requiresKey || held.has(door.requiresKey) || door.yieldsWithin === null) continue;
    const midX = door.hinge[0] + (door.along[0] * door.width) / 2;
    const midY = door.hinge[1] + (door.along[1] * door.width) / 2;
    if (Math.hypot(playerX - midX, playerY - midY) <= door.yieldsWithin) return door;
  }
  return null;
}

/** The leaf's free end, given how far through its arc it is. */
export function doorLeafEnd(door: DoorDefinition, open: number) {
  const angle = door.swing * open;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = door.along[0] * door.width;
  const dy = door.along[1] * door.width;
  return [
    door.hinge[0] + dx * cos - dy * sin,
    door.hinge[1] + dx * sin + dy * cos,
  ] as const;
}

/**
 * Whether a body of `radius` at a position is standing in a leaf.
 *
 * Tested against where the leaf actually is this frame, not against whether the
 * door is nominally open, so walking into a gate that has begun to swing is
 * stopped by the part of it still in the way.
 */
export function doorBlocksAt(
  states: readonly DoorState[],
  definitions: readonly DoorDefinition[],
  x: number,
  y: number,
  radius: number,
) {
  for (const state of states) {
    const door = definitions.find((entry) => entry.id === state.id);
    if (!door) continue;
    const [endX, endY] = doorLeafEnd(door, state.open);
    const ax = door.hinge[0];
    const ay = door.hinge[1];
    const bx = endX - ax;
    const by = endY - ay;
    const lengthSquared = bx * bx + by * by;
    if (lengthSquared < 1e-9) continue;
    const t = Math.max(
      0,
      Math.min(1, ((x - ax) * bx + (y - ay) * by) / lengthSquared),
    );
    const nearestX = ax + bx * t;
    const nearestY = ay + by * t;
    // The leaf's own thickness, so a shut gate is a solid the player stops
    // against rather than a line they can be nudged across in one frame.
    if (Math.hypot(x - nearestX, y - nearestY) < radius + 0.08) return true;
  }
  return false;
}

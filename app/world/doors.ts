/**
 * Doors that yield.
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
 * The nearest thing to an exception proves it. `yieldsWithin: null` is a door
 * that never yields however long you stand at it, and the approach door — the
 * one at the player's back in the first ten seconds of the game — is one. The
 * building is not indifferent to her because nothing here is locked. It is
 * indifferent because she is not the one it is locked against.
 *
 * None of this is known to `npcs.ts`, which is given no player and no doors. A
 * gaoler walks his round past a gate that opens for someone he does not see.
 */

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

/**
 * The gate rows of the six cells, read off the plan's `*-gate` openings.
 *
 * Each leaf hangs in the middle of its doorway cell and swings *into* the cell.
 * Into the corridor would be wrong twice over: the corridor is two metres wide
 * and six leaves standing open would half-close it, and a gate that opens
 * inwards is a gate whose arc sweeps the only floor its prisoner has — which
 * is, unhappily, correct, and worth seeing.
 */
const CELL_GATE_ROWS: readonly [string, number][] = [
  ["marcello-gate", 4],
  ["maddalena-gate", 8],
  ["third-gate", 12],
  ["fourth-gate", 16],
  ["fifth-gate", 20],
  ["sixth-gate", 24],
];

export const DOORS: readonly DoorDefinition[] = [
  ...CELL_GATE_ROWS.map(([id, row]) => ({
    id,
    hinge: [30.5, row + 0.04] as const,
    along: [0, 1] as const,
    width: 0.92,
    swing: -Math.PI / 2,
    yieldsWithin: 2.2,
    travelMs: GATE_TRAVEL_MS,
  })),
  // The way she came in. It does not open again.
  {
    id: "approach-door",
    hinge: [4.05, 34.85],
    along: [1, 0],
    width: 1.9,
    swing: 0,
    yieldsWithin: null,
    travelMs: GATE_TRAVEL_MS,
  },
];

export function createDoorStates(
  definitions: readonly DoorDefinition[] = DOORS,
): DoorState[] {
  return definitions.map((door) => ({ id: door.id, open: 0 }));
}

/**
 * Advance every leaf toward where the player's distance says it should be.
 *
 * Unlike the NPC simulation this *is* given the player, and the difference is
 * the point: the institution's people never register her, and the institution's
 * fabric always does.
 */
export function updateDoors(
  states: DoorState[],
  definitions: readonly DoorDefinition[],
  playerX: number,
  playerY: number,
  dtMs: number,
) {
  for (const state of states) {
    const door = definitions.find((entry) => entry.id === state.id);
    if (!door) continue;
    if (door.yieldsWithin === null) {
      state.open = 0;
      continue;
    }
    // Measured to the leaf's midpoint rather than the hinge, so a wide gate does
    // not wait for the player to reach the post it is hung on.
    const midX = door.hinge[0] + (door.along[0] * door.width) / 2;
    const midY = door.hinge[1] + (door.along[1] * door.width) / 2;
    const near = Math.hypot(playerX - midX, playerY - midY) <= door.yieldsWithin;
    const step = dtMs / door.travelMs;
    state.open = near
      ? Math.min(1, state.open + step)
      : Math.max(0, state.open - step);
  }
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

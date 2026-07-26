/**
 * The inhabitants of the Holy Office, and the simulation that walks them.
 *
 * Two rules shape this module, and both are structural rather than remembered.
 *
 * **Nothing here knows the player exists.** `updateNpcs` takes no player
 * argument, and no function in this file reads a position that is not an NPC's
 * own. That is the agreed premise made unbreakable: the cloaked stranger is
 * never noticed, never challenged, never stopped, and no future change can
 * quietly introduce a glance in her direction because there is nothing to glance
 * at. What the player can *hear* is resolved outside the simulation, in
 * `earshot.ts`, from a read-only view of NPC state.
 *
 * **A route is a list of things to do, not a list of points.** The old routes
 * were bare coordinate pairs traversed at constant speed, so every figure slid
 * around its circuit forever without once stopping, turning, or attending to
 * anything. A gaoler who never pauses at a cell is not keeping cells. Each node
 * now carries how long to stand there, which way to face while standing, and
 * what — if anything — is said on arrival.
 */

import { isBlockedAt } from "./colliders.ts";
import { isWallAt } from "./derive.ts";
import type { DerivedWorld } from "./model.ts";

/** A stop on a round: where to walk, how long to stand, what to say there. */
export type RouteNode = {
  at: readonly [number, number];
  /** Milliseconds spent standing here. Zero makes it a corner, not a stop. */
  dwellMs?: number;
  /**
   * Heading to hold while dwelling, in world radians. Omitted means keep facing
   * the way the walk arrived, which is right for a corner and wrong for a post.
   */
  facing?: number;
  /** Spoken on arrival, once, to nobody. */
  say?: string;
};

export type NpcDefinition = {
  id: string;
  name: string;
  role: string;
  /** Metres per second. A cellar walk, not a march. */
  speed: number;
  route: readonly RouteNode[];
  /** How the renderer builds the figure. Kept with the definition so a patrol
   * cannot be given a body by one list and a round by another. */
  appearance: {
    hood?: boolean;
    beard?: boolean;
    masked?: boolean;
    prisoner?: boolean;
    garment?: "clerk";
    face?: "young" | "mature" | "elder" | "secretary";
    scale?: number;
  };
};

export type NpcPhase = "walk" | "dwell" | "turn" | "speak";

export type NpcState = {
  id: string;
  x: number;
  y: number;
  /** Facing, world radians, matching `Math.atan2(dy, dx)`. */
  heading: number;
  phase: NpcPhase;
  /** Index of the node being walked towards, or stood at. */
  node: number;
  /** Milliseconds left of the current dwell. */
  remainingMs: number;
  /**
   * Total metres walked. The renderer takes stride phase from this rather than
   * from elapsed time, which is what keeps a foot planted: distance and stride
   * advance together, so a figure that slows or stops stops striding too.
   */
  travelled: number;
  /** The line currently being spoken, and how long it has left to hang in the air. */
  saying: string | null;
  sayingMs: number;
};

/** How close counts as arrived. Smaller than a stride, larger than a frame. */
const ARRIVE = 0.06;
/** Radians per second a figure turns on the spot. */
const TURN_RATE = 2.2;
/** How long a line stays audible after it is spoken. */
const LINE_MS = 5200;

const wrapAngle = (angle: number) => {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/** Turns `from` towards `to` by at most `maxStep`, the short way round. */
export function turnToward(from: number, to: number, maxStep: number) {
  const delta = wrapAngle(to - from);
  if (Math.abs(delta) <= maxStep) return to;
  return wrapAngle(from + Math.sign(delta) * maxStep);
}

export function createNpcStates(definitions: readonly NpcDefinition[]): NpcState[] {
  return definitions.map((npc) => {
    const first = npc.route[0];
    const next = npc.route[1 % npc.route.length];
    return {
      id: npc.id,
      x: first.at[0],
      y: first.at[1],
      heading: first.facing ?? Math.atan2(next.at[1] - first.at[1], next.at[0] - first.at[0]),
      phase: "dwell" as NpcPhase,
      node: 0,
      remainingMs: first.dwellMs ?? 0,
      travelled: 0,
      saying: first.say ?? null,
      sayingMs: first.say ? LINE_MS : 0,
    };
  });
}

/**
 * Advances every figure by `dtMs`.
 *
 * Deliberately not a function of absolute time. The previous patrols were
 * `position(npc, timeMs)` — closed-form, stateless, and therefore incapable of
 * ever pausing, because a pause is a fact about what has happened rather than
 * about what time it is. Everything asked of these figures now (standing at a
 * post, turning to face a cell, speaking on arrival) needs a state to be in.
 *
 * Takes no player. See the note at the top of the file: that is the point.
 */
export function updateNpcs(
  states: NpcState[],
  definitions: readonly NpcDefinition[],
  dtMs: number,
) {
  const byId = new Map(definitions.map((npc) => [npc.id, npc]));
  // Clamped so a backgrounded tab does not resume with one enormous step that
  // teleports every figure through a wall.
  const dt = Math.min(dtMs, 100);
  for (const state of states) {
    const npc = byId.get(state.id);
    if (!npc) continue;
    step(state, npc, dt);
    if (state.sayingMs > 0) {
      state.sayingMs -= dt;
      if (state.sayingMs <= 0) state.saying = null;
    }
  }
  return states;
}

function step(state: NpcState, npc: NpcDefinition, dtMs: number) {
  const node = npc.route[state.node];
  const seconds = dtMs / 1000;

  if (state.phase === "dwell" || state.phase === "speak") {
    // A dwell with a declared facing turns first and waits afterwards, so the
    // gaoler is looking into the cell for the whole of his pause rather than
    // spending it swinging round.
    if (node.facing !== undefined && Math.abs(wrapAngle(node.facing - state.heading)) > 0.01) {
      state.heading = turnToward(state.heading, node.facing, TURN_RATE * seconds);
      return;
    }
    state.remainingMs -= dtMs;
    if (state.remainingMs > 0) return;
    state.node = (state.node + 1) % npc.route.length;
    state.phase = "turn";
    return;
  }

  const target = npc.route[state.node];
  const toTarget = Math.atan2(target.at[1] - state.y, target.at[0] - state.x);

  if (state.phase === "turn") {
    // Turn on the spot before setting off, rather than sliding sideways into the
    // new heading. This is most of what made the old patrols read as furniture
    // on castors.
    state.heading = turnToward(state.heading, toTarget, TURN_RATE * seconds);
    if (Math.abs(wrapAngle(toTarget - state.heading)) < 0.05) state.phase = "walk";
    return;
  }

  const distance = Math.hypot(target.at[0] - state.x, target.at[1] - state.y);
  if (distance <= ARRIVE) {
    state.x = target.at[0];
    state.y = target.at[1];
    state.phase = target.say ? "speak" : "dwell";
    state.remainingMs = target.dwellMs ?? 0;
    if (target.say) {
      state.saying = target.say;
      state.sayingMs = LINE_MS;
    }
    return;
  }

  state.heading = turnToward(state.heading, toTarget, TURN_RATE * seconds);
  const advance = Math.min(distance, npc.speed * seconds);
  state.x += Math.cos(state.heading) * advance;
  state.y += Math.sin(state.heading) * advance;
  state.travelled += advance;
}

/**
 * Points along a route that a figure cannot occupy.
 *
 * Checked against props as well as masonry, and at the figure's own girth rather
 * than as a bare point. A route drawn down the middle of a corridor is not a
 * walkable route if a table stands in it — which is exactly how the gaoler used
 * to walk through his prisoner's pallet — and a route that only clears the walls
 * when treated as an infinitely thin line will still put a shoulder in the
 * stone at every doorway.
 */
export function routeObstructions(
  world: DerivedWorld,
  route: readonly RouteNode[],
  radius = NPC_RADIUS,
  sampleStep = 0.08,
) {
  const problems: { segment: string; x: number; y: number; reason: string }[] = [];
  const report = (segment: string, x: number, y: number) => {
    const reason = isWallAt(world, x, y) ? "masonry" : "a prop";
    problems.push({ segment, x, y, reason });
  };
  for (let i = 0; i < route.length; i++) {
    const from = route[i].at;
    const to = route[(i + 1) % route.length].at;
    if (isBlockedAt(world, from[0], from[1], radius)) report(`node ${i}`, from[0], from[1]);
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const samples = Math.ceil(length / sampleStep);
    for (let s = 1; s < samples; s++) {
      const t = s / samples;
      const x = from[0] + (to[0] - from[0]) * t;
      const y = from[1] + (to[1] - from[1]) * t;
      if (isBlockedAt(world, x, y, radius)) {
        report(`${i}→${(i + 1) % route.length}`, x, y);
        break;
      }
    }
  }
  return problems;
}

/**
 * How wide a walking figure is taken to be for route validation.
 *
 * Below the player's own 0.28, on purpose. NPCs do not push against geometry the
 * way a player does — they follow authored lines — and holding them to the
 * player's clearance would reject routes down corridors they visibly fit in.
 * They still have to clear props and doorways.
 */
export const NPC_RADIUS = 0.24;

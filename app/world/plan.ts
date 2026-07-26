import type { PlanStep, Room, Opening } from "./model.ts";

export const WORLD_WIDTH = 36;
export const WORLD_HEIGHT = 28;

const room = (room: Room): PlanStep => ({ op: "room", room });
const open = (opening: Opening): PlanStep => ({ op: "open", opening });

/**
 * The plan of the subterranean Holy Office, in build order.
 *
 * This reproduces the previously hand-authored grid, with one class of
 * correction: `derivePlan` cuts every opening after all masonry is laid, so the
 * five doorways that the old interleaved build order paved back over are now
 * actually open. Two of them had left the Chamber of Groans and the Moon Stair
 * unreachable, stranding the last two discoveries. The layout itself is revised
 * later; this stage only gives it a single description to revise.
 *
 * Material keys carry meaning: "1" institutional stone, "2" the tribunal's
 * chestnut panelling, "3" the cell range's rougher masonry, "4" the brown stone
 * of the service and threshold rooms.
 */
export const PLAN: readonly PlanStep[] = [
  room({ id: "gate", name: "THE PRISON GATE", kind: "chamber", x1: 2, y1: 22, x2: 8, y2: 26, material: "4" }),
  room({ id: "office", name: "THE OUTER OFFICE", kind: "chamber", x1: 2, y1: 17, x2: 8, y2: 21, material: "1" }),
  open({ id: "gate-office", between: ["gate", "office"], x1: 5, y1: 21, x2: 5, y2: 22 }),

  room({ id: "high-lamp", name: "THE HIGH-LAMP PASSAGE", kind: "passage", x1: 5, y1: 6, x2: 6, y2: 17, material: "1" }),
  room({ id: "tribunal", name: "THE TRIBUNAL CHAMBER", kind: "chamber", x1: 9, y1: 3, x2: 24, y2: 12, material: "2" }),
  open({ id: "lamp-tribunal", between: ["high-lamp", "tribunal"], x1: 6, y1: 8, x2: 9, y2: 9 }),

  room({ id: "south-return", name: "THE TRIBUNAL’S SOUTH RETURN", kind: "passage", x1: 15, y1: 12, x2: 16, y2: 17, material: "1" }),
  room({ id: "marcello", name: "MARCELLO’S CELL", kind: "chamber", x1: 27, y1: 4, x2: 33, y2: 10, material: "3" }),
  open({ id: "tribunal-marcello", between: ["tribunal", "marcello"], x1: 24, y1: 7, x2: 27, y2: 8 }),

  room({ id: "east-range", name: "THE EASTERN RANGE", kind: "passage", x1: 16, y1: 14, x2: 27, y2: 16, material: "1" }),
  // The corridor door into Maddalena's cell. Authored in the original grid and
  // then sealed by the chamber laid after it, which is why she could previously
  // only be reached through Marcello's cell via the keeper's slit.
  open({ id: "range-maddalena", between: ["east-range", "maddalena"], x1: 27, y1: 15, x2: 27, y2: 16 }),
  room({ id: "maddalena", name: "MADDALENA’S CELL", kind: "chamber", x1: 27, y1: 13, x2: 33, y2: 19, material: "3" }),

  // The keeper's slit behind the paired cells. An interpretive connection, not a
  // claimed plan of a real building: the public corridor keeps each prisoner
  // feeling isolated while the cloaked figure circulates behind the masonry.
  open({ id: "keepers-slit", between: ["marcello", "maddalena"], x1: 29, y1: 10, x2: 30, y2: 13, hidden: true }),

  // Likewise sealed by the chamber laid after it, which had left the wardrobe
  // enterable only from the vault side.
  open({ id: "office-wardrobe", between: ["office", "wardrobe"], x1: 8, y1: 19, x2: 10, y2: 20 }),
  room({ id: "wardrobe", name: "THE WARDROBE ROOM", kind: "chamber", x1: 10, y1: 18, x2: 14, y2: 22, material: "4" }),
  open({ id: "wardrobe-vault", between: ["wardrobe", "vault"], x1: 14, y1: 20, x2: 17, y2: 21 }),
  room({ id: "vault", name: "THE PASSWORD VAULT", kind: "chamber", x1: 17, y1: 18, x2: 22, y2: 24, material: "1" }),

  // Service stair from the tribunal's west return into the password vault.
  room({ id: "service-stair", name: "THE SERVICE STAIR", kind: "passage", x1: 16, y1: 17, x2: 18, y2: 19, material: "1" }),

  open({ id: "vault-groans", between: ["vault", "groans"], x1: 22, y1: 21, x2: 24, y2: 22 }),
  room({ id: "groans", name: "THE CHAMBER OF GROANS", kind: "chamber", x1: 24, y1: 20, x2: 30, y2: 26, material: "4" }),
  open({ id: "groans-moonstair", between: ["groans", "moon-stair"], x1: 30, y1: 23, x2: 32, y2: 24 }),
  room({ id: "moon-stair", name: "THE MOON STAIR", kind: "chamber", x1: 32, y1: 21, x2: 34, y2: 26, material: "1" }),
];

/**
 * Cells that differ from the grid the game shipped with, as a record of exactly
 * what the build-order fix changed. Asserted by the test suite so the correction
 * stays a reviewed, enumerated diff rather than an unexplained grid rewrite.
 *
 * Each is a doorway the old interleaved build order paved over.
 */
export const REOPENED_BY_ORDER_FIX: readonly (readonly [number, number])[] = [
  [10, 19], [10, 20], // office → wardrobe
  [27, 15], [27, 16], // eastern range → Maddalena's cell
  [17, 20], [17, 21], // wardrobe → password vault
  [24, 21], [24, 22], // password vault → chamber of groans
  [32, 23], [32, 24], // chamber of groans → moon stair
];

/**
 * Where the player begins: the gate court, facing north into the Office.
 *
 * `x` is aligned to the gate doorway rather than to the room. A one-cell doorway
 * is 1.0 wide and the player is 0.56 across, so only x 5.30–5.70 passes through
 * it; spawning at x 5.0 meant the first thing a player did — hold forward — put
 * them into masonry at y 23.25, with no indication that a sideways nudge was
 * needed.
 */
export const SPAWN = { x: 5.5, y: 24.5, dir: -Math.PI / 2, pitch: 0 };

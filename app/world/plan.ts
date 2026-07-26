import type {
  Landing,
  Opening,
  PlanStep,
  Room,
  Screen,
  Stair,
} from "./model.ts";

export const WORLD_WIDTH = 36;
export const WORLD_HEIGHT = 28;

const room = (room: Room): PlanStep => ({ op: "room", room });
const open = (opening: Opening): PlanStep => ({ op: "open", opening });
const screen = (screen: Screen): PlanStep => ({ op: "screen", screen });
const stair = (stair: Stair): PlanStep => ({ op: "stair", stair });
const landing = (landing: Landing): PlanStep => ({ op: "landing", landing });

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

  // The cell range.
  //
  // Previously the two named cells were 5x5 chambers entered directly off the
  // tribunal and the eastern range, each larger than the tribunal's own dais and
  // each with a solid door — which is to say they were rooms, and read as rooms.
  // Ireland's cells are narrow, lofty, and above all *overlooked*: Maddalena is
  // watched, Marcello is visited, and a groan carries from one to the next.
  //
  // They are now three small cells off one gaoler's corridor, fronted with iron
  // screens rather than masonry, so a prisoner is visible and audible from the
  // corridor and cannot leave it. The corridor is reached down a four-metre bore
  // through the rock from the tribunal, which is the compression the approach
  // wanted.
  room({ id: "cell-corridor", name: "THE GAOLER’S CORRIDOR", kind: "passage", x1: 28, y1: 4, x2: 29, y2: 17, material: "3" }),
  open({ id: "tribunal-cells", between: ["tribunal", "cell-corridor"], x1: 24, y1: 7, x2: 28, y2: 8 }),

  room({ id: "east-range", name: "THE EASTERN RANGE", kind: "passage", x1: 16, y1: 14, x2: 27, y2: 16, material: "1" }),
  open({ id: "range-cells", between: ["east-range", "cell-corridor"], x1: 27, y1: 15, x2: 28, y2: 15 }),

  room({ id: "marcello", name: "MARCELLO’S CELL", kind: "chamber", x1: 30, y1: 4, x2: 34, y2: 8, material: "3" }),
  room({ id: "maddalena", name: "MADDALENA’S CELL", kind: "chamber", x1: 30, y1: 9, x2: 34, y2: 13, material: "3" }),
  room({ id: "third-cell", name: "THE FURTHER CELL", kind: "chamber", x1: 30, y1: 14, x2: 34, y2: 18, material: "3" }),

  // Each cell's front is one cell of gate between two of iron screen, so the
  // whole face of the cell is open to the corridor's eye.
  open({ id: "marcello-gate", between: ["cell-corridor", "marcello"], x1: 29, y1: 6, x2: 30, y2: 6 }),
  open({ id: "maddalena-gate", between: ["cell-corridor", "maddalena"], x1: 29, y1: 11, x2: 30, y2: 11 }),
  open({ id: "third-gate", between: ["cell-corridor", "third-cell"], x1: 29, y1: 16, x2: 30, y2: 16 }),
  screen({ id: "marcello-screen-n", room: "marcello", x1: 30, y1: 5, x2: 30, y2: 5 }),
  screen({ id: "marcello-screen-s", room: "marcello", x1: 30, y1: 7, x2: 30, y2: 7 }),
  screen({ id: "maddalena-screen-n", room: "maddalena", x1: 30, y1: 10, x2: 30, y2: 10 }),
  screen({ id: "maddalena-screen-s", room: "maddalena", x1: 30, y1: 12, x2: 30, y2: 12 }),
  screen({ id: "third-screen-n", room: "third-cell", x1: 30, y1: 15, x2: 30, y2: 15 }),
  screen({ id: "third-screen-s", room: "third-cell", x1: 30, y1: 17, x2: 30, y2: 17 }),

  // The keeper's slit behind the paired cells. An interpretive connection, not a
  // claimed plan of a real building: the corridor keeps each prisoner feeling
  // isolated while the cloaked figure circulates behind the masonry. It is one
  // cell wide, which is barely passable — a slit, and meant to be felt as one.
  open({ id: "keepers-slit", between: ["marcello", "maddalena"], x1: 32, y1: 8, x2: 32, y2: 9, hidden: true }),

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
  // Set at the south end of the stair chamber rather than across its middle, so
  // the door is entered on level floor with the flight ahead. Centred, it opened
  // halfway up the treads and stepped the player a metre into the air.
  open({ id: "groans-moonstair", between: ["groans", "moon-stair"], x1: 30, y1: 24, x2: 31, y2: 25 }),
  // Widened from one cell of floor to three. At its old size the stair chamber
  // was a slot the player could stand in but never turn around in, and there was
  // no room for the flight itself to read as a flight.
  room({ id: "moon-stair", name: "THE MOON STAIR", kind: "chamber", x1: 31, y1: 20, x2: 35, y2: 26, material: "1" }),

  // The flight, and the landing it arrives at.
  //
  // These are the stair, not a description of one: the treads the renderer builds
  // and the height the player's eye rides at both read these numbers, so the
  // stair cannot be climbed in one and walked through in the other. Eight treads
  // of 0.2 rise and 0.325 going: about thirty-two degrees, which is steep for a
  // room and ordinary for a cellar, and reads as a climb rather than a slope.
  stair({ id: "moon-flight", room: "moon-stair", x1: 32, y1: 21.4, x2: 35, y2: 24, axis: "y", from: 1.6, to: 0, treads: 8 }),
  landing({ id: "moon-landing", room: "moon-stair", x1: 32, y1: 21, x2: 35, y2: 21.4, height: 1.6 }),
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

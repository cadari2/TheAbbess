import type {
  Landing,
  Opening,
  PlanStep,
  Room,
  Screen,
  Stair,
} from "./model.ts";

export const WORLD_WIDTH = 40;
export const WORLD_HEIGHT = 40;

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
  // The way in.
  //
  // The Office used to begin *inside* itself: the player spawned in the gate
  // hall with no account of how they came to be there, and the room had no
  // outside at all — every wall of it led further in. An institution whose
  // whole subject is who may pass and who may not cannot open the game on a
  // room with no door to the world.
  //
  // So the approach is now a bore of rock six metres long, entered through a
  // door that is already shut and stays shut. The first thing the player does
  // is turn round and find it, and the first fact they are given about this
  // place is that it is easier to enter than to leave.
  room({ id: "approach", name: "THE APPROACH", kind: "passage", x1: 4, y1: 28, x2: 5, y2: 34, material: "4" }),
  room({ id: "gate", name: "THE PRISON GATE", kind: "chamber", x1: 1, y1: 22, x2: 11, y2: 28, material: "4" }),
  // Not "-gate": that suffix names a cell gate, and the renderer and the door
  // model both read it as one.
  open({ id: "approach-mouth", between: ["approach", "gate"], x1: 4, y1: 28, x2: 5, y2: 28 }),
  room({ id: "office", name: "THE OUTER OFFICE", kind: "chamber", x1: 2, y1: 17, x2: 8, y2: 21, material: "1" }),
  // Offset from the high-lamp passage's own column. In line with it, one look
  // north from the gate hall ran twenty-two metres up column 5 — through the
  // outer office and the whole length of the passage — and showed a visitor the
  // spine of the building before they had taken a step into it.
  open({ id: "gate-office", between: ["gate", "office"], x1: 7, y1: 21, x2: 7, y2: 22 }),

  room({ id: "high-lamp", name: "THE HIGH-LAMP PASSAGE", kind: "passage", x1: 5, y1: 6, x2: 6, y2: 17, material: "1" }),
  room({ id: "tribunal", name: "THE TRIBUNAL CHAMBER", kind: "chamber", x1: 9, y1: 3, x2: 24, y2: 12, material: "2" }),
  open({ id: "lamp-tribunal", between: ["high-lamp", "tribunal"], x1: 6, y1: 10, x2: 9, y2: 11 }),

  room({ id: "south-return", name: "THE TRIBUNAL’S SOUTH RETURN", kind: "passage", x1: 15, y1: 12, x2: 16, y2: 17, material: "1" }),

  // The cell range.
  //
  // Ireland's cells are narrow, lofty, and above all *overlooked*: Maddalena is
  // watched, Marcello is visited, and a groan carries from one to the next. They
  // are fronted with iron rather than masonry, so a prisoner is visible and
  // audible from the corridor and cannot leave it.
  //
  // Twenty-four metres of corridor, with six cells opening off one side.
  //
  // Three cells is a set of rooms that happen to hold people. What a gaol has
  // that a set of rooms does not is *repetition* — the same iron front, the same
  // three metres of floor, the same lamp, until the player stops reading each
  // one and starts counting them. The corridor is straight and long for the same
  // reason a ledger is ruled: the building keeps prisoners the way the Office
  // keeps records, in identical numbered slots, and two of the slots happening to
  // have names attached is the exception this story is about.
  //
  // Two of the six stand empty, and are meant to.
  room({ id: "cell-corridor", name: "THE GAOLER’S CORRIDOR", kind: "passage", x1: 28, y1: 3, x2: 29, y2: 27, material: "3" }),
  // The way to the cells, bent.
  //
  // It used to be a straight four-metre bore from the tribunal's east wall into
  // the corridor, which put the tribunal, the bore, the corridor and the inside
  // of a cell on one twenty-nine-metre line: a player standing at the west door
  // of the court could see a prisoner. An institution that keeps its business in
  // compartments does not run a gun-barrel through five of them, and a dungeon
  // that means to be a labyrinth cannot afford a single view that explains it.
  //
  // So the passage goes east, turns south for four metres, and only then turns
  // east again into the gaol. Nothing along it sees anything else along it.
  room({ id: "cell-bore", name: "THE BENT PASSAGE", kind: "passage", x1: 25, y1: 6, x2: 26, y2: 10, material: "3" }),
  open({ id: "tribunal-bore", between: ["tribunal", "cell-bore"], x1: 24, y1: 6, x2: 25, y2: 6 }),
  open({ id: "bore-cells", between: ["cell-bore", "cell-corridor"], x1: 26, y1: 10, x2: 28, y2: 10 }),

  // Stopped a column short of the corridor, so the two meet at a doorway rather
  // than merging into one nineteen-metre room with a kink in it.
  room({ id: "east-range", name: "THE EASTERN RANGE", kind: "passage", x1: 16, y1: 14, x2: 26, y2: 16, material: "1" }),
  open({ id: "range-cells", between: ["east-range", "cell-corridor"], x1: 26, y1: 15, x2: 28, y2: 15 }),

  // Each cell is three metres by two, which is small enough that a figure
  // standing in the middle of one can touch two walls.
  room({ id: "marcello", name: "MARCELLO’S CELL", kind: "chamber", x1: 30, y1: 3, x2: 34, y2: 6, material: "3" }),
  room({ id: "maddalena", name: "MADDALENA’S CELL", kind: "chamber", x1: 30, y1: 7, x2: 34, y2: 10, material: "3" }),
  room({ id: "third-cell", name: "THE FURTHER CELL", kind: "chamber", x1: 30, y1: 11, x2: 34, y2: 14, material: "3" }),
  room({ id: "fourth-cell", name: "AN EMPTY CELL", kind: "chamber", x1: 30, y1: 15, x2: 34, y2: 18, material: "3" }),
  room({ id: "fifth-cell", name: "THE SCRATCHED CELL", kind: "chamber", x1: 30, y1: 19, x2: 34, y2: 22, material: "3" }),
  room({ id: "sixth-cell", name: "THE LAST CELL", kind: "chamber", x1: 30, y1: 23, x2: 34, y2: 26, material: "3" }),

  // Each cell's front is one cell of gate beside one of iron screen, so the whole
  // face of the cell is open to the corridor's eye and none of it to its hand.
  open({ id: "marcello-gate", between: ["cell-corridor", "marcello"], x1: 29, y1: 4, x2: 30, y2: 4 }),
  open({ id: "maddalena-gate", between: ["cell-corridor", "maddalena"], x1: 29, y1: 8, x2: 30, y2: 8 }),
  open({ id: "third-gate", between: ["cell-corridor", "third-cell"], x1: 29, y1: 12, x2: 30, y2: 12 }),
  open({ id: "fourth-gate", between: ["cell-corridor", "fourth-cell"], x1: 29, y1: 16, x2: 30, y2: 16 }),
  open({ id: "fifth-gate", between: ["cell-corridor", "fifth-cell"], x1: 29, y1: 20, x2: 30, y2: 20 }),
  open({ id: "sixth-gate", between: ["cell-corridor", "sixth-cell"], x1: 29, y1: 24, x2: 30, y2: 24 }),
  screen({ id: "marcello-screen", room: "marcello", x1: 30, y1: 5, x2: 30, y2: 5 }),
  screen({ id: "maddalena-screen", room: "maddalena", x1: 30, y1: 9, x2: 30, y2: 9 }),
  screen({ id: "third-screen", room: "third-cell", x1: 30, y1: 13, x2: 30, y2: 13 }),
  screen({ id: "fourth-screen", room: "fourth-cell", x1: 30, y1: 17, x2: 30, y2: 17 }),
  screen({ id: "fifth-screen", room: "fifth-cell", x1: 30, y1: 21, x2: 30, y2: 21 }),
  screen({ id: "sixth-screen", room: "sixth-cell", x1: 30, y1: 25, x2: 30, y2: 25 }),

  // The keeper's slit behind the paired cells. An interpretive connection, not a
  // claimed plan of a real building: the corridor keeps each prisoner feeling
  // isolated while the cloaked figure circulates behind the masonry. It is one
  // cell wide, which is barely passable — a slit, and meant to be felt as one.
  open({ id: "keepers-slit", between: ["marcello", "maddalena"], x1: 32, y1: 6, x2: 32, y2: 7, hidden: true }),

  // Likewise sealed by the chamber laid after it, which had left the wardrobe
  // enterable only from the vault side.
  open({ id: "office-wardrobe", between: ["office", "wardrobe"], x1: 8, y1: 19, x2: 10, y2: 19 }),
  room({ id: "wardrobe", name: "THE WARDROBE ROOM", kind: "chamber", x1: 10, y1: 18, x2: 14, y2: 22, material: "4" }),
  // Dropped a row off the office-wardrobe doorway. Level with it, the two of them
  // opened one clear line from the outer office through the wardrobe and across
  // the vault — the three rooms whose whole point is that each is a secret kept
  // from the last.
  open({ id: "wardrobe-vault", between: ["wardrobe", "vault"], x1: 14, y1: 21, x2: 17, y2: 21 }),
  room({ id: "vault", name: "THE PASSWORD VAULT", kind: "chamber", x1: 17, y1: 18, x2: 22, y2: 24, material: "1" }),

  // Service stair from the tribunal's west return into the password vault.
  room({ id: "service-stair", name: "THE SERVICE STAIR", kind: "passage", x1: 16, y1: 17, x2: 18, y2: 19, material: "1" }),

  // Dropped a row from y 21-22. At its old height it stood in the same rank as
  // the wardrobe-vault doorway, and the two of them together opened one clear
  // shot down row 21 from x 11 to x 29 — a fifth of the building visible in a
  // single glance, in a place whose entire argument is compartmented secrecy.
  open({ id: "vault-groans", between: ["vault", "groans"], x1: 19, y1: 24, x2: 20, y2: 24 }),
  // Four times the floor it had: 10x10 of it, against the old 5x5.
  //
  // The size is the point rather than a setting. A torture chamber the size of
  // a parlour is a room with instruments in it; what the chamber's own name
  // promises is distance — that a sound made at one end takes a while to reach
  // the other, and that the lamps do not between them reach the corners. At
  // 5x5 every wall was legible from the doorway and the far side was three
  // paces away.
  room({ id: "groans", name: "THE CHAMBER OF GROANS", kind: "chamber", x1: 14, y1: 24, x2: 25, y2: 35, material: "4" }),
  // Set at the south end of the stair chamber rather than across its middle, so
  // the door is entered on level floor with the flight ahead. Centred, it opened
  // halfway up the treads and stepped the player a metre into the air.
  open({ id: "groans-moonstair", between: ["groans", "moon-stair"], x1: 25, y1: 33, x2: 26, y2: 33 }),
  // Widened from one cell of floor to three. At its old size the stair chamber
  // was a slot the player could stand in but never turn around in, and there was
  // no room for the flight itself to read as a flight.
  room({ id: "moon-stair", name: "THE MOON STAIR", kind: "chamber", x1: 26, y1: 29, x2: 31, y2: 35, material: "1" }),

  // The flight, and the landing it arrives at.
  //
  // These are the stair, not a description of one: the treads the renderer builds
  // and the height the player's eye rides at both read these numbers, so the
  // stair cannot be climbed in one and walked through in the other. Eight treads
  // of 0.2 rise and 0.325 going: about thirty-two degrees, which is steep for a
  // room and ordinary for a cellar, and reads as a climb rather than a slope.
  stair({ id: "moon-flight", room: "moon-stair", x1: 27, y1: 30.4, x2: 31, y2: 33, axis: "y", from: 1.6, to: 0, treads: 8 }),
  landing({ id: "moon-landing", room: "moon-stair", x1: 27, y1: 30, x2: 31, y2: 30.4, height: 1.6 }),
];

/**
 * Where the player begins: the far end of the approach, with the shut door at
 * their back and the gate hall six metres ahead.
 *
 * `x` is aligned to the bore rather than to any room. The approach is one cell
 * wide — 1.0 across, against a player 0.56 across — so only x 6.30–6.70 passes
 * along it at all, and a spawn off that line puts the first step into rock.
 */
export const SPAWN = { x: 5, y: 33.4, dir: -Math.PI / 2, pitch: 0 };

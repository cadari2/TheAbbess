import type {
  Landing,
  Opening,
  PlanStep,
  Room,
  Screen,
  Stair,
} from "./model.ts";

export const WORLD_WIDTH = 58;
export const WORLD_HEIGHT = 52;

const room = (room: Room): PlanStep => ({ op: "room", room });
const open = (opening: Opening): PlanStep => ({ op: "open", opening });
const screen = (screen: Screen): PlanStep => ({ op: "screen", screen });
const stair = (stair: Stair): PlanStep => ({ op: "stair", stair });
const landing = (landing: Landing): PlanStep => ({ op: "landing", landing });

/**
 * The floor of the escape route above the dungeon floor, in metres.
 *
 * The hidden stair climbs to this height and everything beyond the moon door —
 * the lane and the garden — stands at it. One number, so the landing at the top
 * of the flight and the threshold of the door cannot disagree by a tread.
 */
export const UPPER_FLOOR = 1.6;

/** The rows of the six cell gates, shared with the doors, pallets and lamps. */
export const CELL_GATE_ROWS = [4, 8, 12, 16, 20, 24] as const;

/**
 * The plan of the subterranean Holy Office, in build order.
 *
 * Second plan. The first gave the building one description; this one gives it
 * room. Ireland's passages are *lofty* and his cells *narrow and lofty*, and
 * the old plan was neither: a 4.2m vault over one-metre bores and cells two
 * metres deep, in which a figure could touch both walls. Every passage here is
 * two or three metres wide, every cell is four metres deep by three across,
 * the vault is a metre and a quarter higher, and the building is a labyrinth
 * in the only sense that counts — there is more than one way between any two
 * of its places.
 *
 * The sequence the romance gives is kept as the spine: gate, familiars' office,
 * lofty passages, tribunal, cells; then the escape — wardrobe, password, hidden
 * road, stair, locked door, moonlight. What is added is the return: the
 * gaoler's corridor comes back round by way of the Chamber of Groans into the
 * password vault, so the whole institution is one circuit with the tribunal at
 * the top of it and the moon door at the bottom.
 *
 * Material keys carry meaning: "1" institutional stone, "2" the tribunal's
 * chestnut panelling, "3" the cell range's rougher masonry, "4" the brown stone
 * of the service and threshold rooms.
 *
 * Two rules the layout is checked against, both by the suite: no straight line
 * of open floor runs longer than twenty cells except down the gaoler's corridor,
 * and every open cell is walkable from the spawn.
 */
export const PLAN: readonly PlanStep[] = [
  // The way in.
  //
  // A bore of rock two metres wide and six long, entered through a door that is
  // already shut and stays shut. The first thing the player does is turn round
  // and find it.
  room({ id: "approach", name: "THE APPROACH", kind: "passage", x1: 5, y1: 43, x2: 6, y2: 48, material: "4" }),
  room({ id: "gate", name: "THE PRISON GATE", kind: "chamber", x1: 1, y1: 36, x2: 12, y2: 43, material: "4" }),
  open({ id: "approach-mouth", between: ["approach", "gate"], x1: 5, y1: 43, x2: 6, y2: 43 }),
  room({ id: "office", name: "THE OUTER OFFICE", kind: "chamber", x1: 2, y1: 29, x2: 10, y2: 36, material: "1" }),
  // Off the passage's own columns, so the gate hall does not look up the spine
  // of the building the moment the door shuts.
  open({ id: "gate-office", between: ["gate", "office"], x1: 8, y1: 36, x2: 9, y2: 36 }),

  // The passage of high lamps: three legs and two angles.
  //
  // Ireland's passages are lofty, lit by lamps at intervals with darkness
  // between, and turn corners at which footsteps stop being heard. A straight
  // bore does none of that. The first leg runs north out of the office, the
  // second west-east along a blind angle, the third north again into the
  // anteroom of the tribunal, and no lamp on any leg can see a lamp on another.
  room({ id: "high-lamp", name: "THE HIGH-LAMP PASSAGE", kind: "passage", x1: 4, y1: 18, x2: 6, y2: 28, material: "1" }),
  open({ id: "office-lamp", between: ["office", "high-lamp"], x1: 4, y1: 28, x2: 6, y2: 29 }),
  room({ id: "lamp-angle", name: "THE ANGLE OF THE PASSAGE", kind: "passage", x1: 4, y1: 16, x2: 12, y2: 17, material: "1" }),
  room({ id: "lamp-north", name: "THE HIGH-LAMP PASSAGE", kind: "passage", x1: 10, y1: 10, x2: 12, y2: 15, material: "1" }),

  // The anteroom, where the accused waits to be called: a room the text implies
  // rather than describes, since Marcello is *summoned* into the tribunal and
  // must have been somewhere when the summons came.
  room({ id: "anteroom", name: "THE ANTEROOM OF THE TRIBUNAL", kind: "chamber", x1: 9, y1: 2, x2: 15, y2: 9, material: "1" }),
  open({ id: "lamp-anteroom", between: ["lamp-north", "anteroom"], x1: 10, y1: 9, x2: 12, y2: 10 }),

  // The tribunal: fourteen metres by nine, the largest roofed room in the
  // building, entered from the anteroom on its west wall and left by a service
  // door in its south.
  room({ id: "tribunal", name: "THE TRIBUNAL CHAMBER", kind: "chamber", x1: 15, y1: 2, x2: 30, y2: 12, material: "2" }),
  open({ id: "anteroom-tribunal", between: ["anteroom", "tribunal"], x1: 15, y1: 6, x2: 15, y2: 7 }),

  // The bent passage to the gaol. East out of the tribunal, south, east again:
  // nothing along it sees anything else along it, and the tribunal cannot see
  // a prisoner.
  room({ id: "bore-east", name: "THE BENT PASSAGE", kind: "passage", x1: 31, y1: 4, x2: 33, y2: 5, material: "3" }),
  open({ id: "tribunal-bore", between: ["tribunal", "bore-east"], x1: 30, y1: 4, x2: 31, y2: 5 }),
  room({ id: "bore-south", name: "THE BENT PASSAGE", kind: "passage", x1: 32, y1: 6, x2: 33, y2: 11, material: "3" }),
  room({ id: "bore-turn", name: "THE BENT PASSAGE", kind: "passage", x1: 34, y1: 10, x2: 35, y2: 11, material: "3" }),

  // The cell range.
  //
  // Twenty-eight metres of corridor three metres wide, with six cells opening
  // off its east side, each four metres deep and three across under the full
  // height of the vault: narrow and lofty, as the text has both of them. The
  // corridor is the one place in the building that is allowed to be seen end to
  // end, because its whole effect is six identical iron fronts in a row.
  room({ id: "cell-corridor", name: "THE GAOLER’S CORRIDOR", kind: "passage", x1: 37, y1: 3, x2: 39, y2: 30, material: "3" }),
  open({ id: "bore-cells", between: ["bore-turn", "cell-corridor"], x1: 35, y1: 10, x2: 37, y2: 11 }),

  room({ id: "marcello", name: "MARCELLO’S CELL", kind: "chamber", x1: 40, y1: 3, x2: 45, y2: 7, material: "3" }),
  room({ id: "maddalena", name: "MADDALENA’S CELL", kind: "chamber", x1: 40, y1: 7, x2: 45, y2: 11, material: "3" }),
  room({ id: "third-cell", name: "THE FURTHER CELL", kind: "chamber", x1: 40, y1: 11, x2: 45, y2: 15, material: "3" }),
  room({ id: "fourth-cell", name: "AN EMPTY CELL", kind: "chamber", x1: 40, y1: 15, x2: 45, y2: 19, material: "3" }),
  room({ id: "fifth-cell", name: "THE SCRATCHED CELL", kind: "chamber", x1: 40, y1: 19, x2: 45, y2: 23, material: "3" }),
  room({ id: "sixth-cell", name: "THE LAST CELL", kind: "chamber", x1: 40, y1: 23, x2: 45, y2: 27, material: "3" }),

  // Each cell's front is one cell of gate beside two of iron screen, so the whole
  // face of the cell is open to the corridor's eye and none of it to its hand.
  open({ id: "marcello-gate", between: ["cell-corridor", "marcello"], x1: 39, y1: 4, x2: 40, y2: 4 }),
  open({ id: "maddalena-gate", between: ["cell-corridor", "maddalena"], x1: 39, y1: 8, x2: 40, y2: 8 }),
  open({ id: "third-gate", between: ["cell-corridor", "third-cell"], x1: 39, y1: 12, x2: 40, y2: 12 }),
  open({ id: "fourth-gate", between: ["cell-corridor", "fourth-cell"], x1: 39, y1: 16, x2: 40, y2: 16 }),
  open({ id: "fifth-gate", between: ["cell-corridor", "fifth-cell"], x1: 39, y1: 20, x2: 40, y2: 20 }),
  open({ id: "sixth-gate", between: ["cell-corridor", "sixth-cell"], x1: 39, y1: 24, x2: 40, y2: 24 }),
  screen({ id: "marcello-screen", room: "marcello", x1: 40, y1: 5, x2: 40, y2: 6 }),
  screen({ id: "maddalena-screen", room: "maddalena", x1: 40, y1: 9, x2: 40, y2: 10 }),
  screen({ id: "third-screen", room: "third-cell", x1: 40, y1: 13, x2: 40, y2: 14 }),
  screen({ id: "fourth-screen", room: "fourth-cell", x1: 40, y1: 17, x2: 40, y2: 18 }),
  screen({ id: "fifth-screen", room: "fifth-cell", x1: 40, y1: 21, x2: 40, y2: 22 }),
  screen({ id: "sixth-screen", room: "sixth-cell", x1: 40, y1: 25, x2: 40, y2: 26 }),

  // The keeper's slit behind the demon.
  //
  // In the romance the painted wall of Marcello's cell *opens*: the apparition
  // that terrifies him comes through the masonry, and the guide knows it is a
  // mechanism. So the party wall between the two cells is pierced by one cell
  // of hidden passage, shut by a panel of stone that swings on a pivot, and the
  // demon is painted on the wall beside it. It is one cell wide, which is
  // barely passable — a slit, and meant to be felt as one.
  open({ id: "keepers-slit", between: ["marcello", "maddalena"], x1: 43, y1: 7, x2: 43, y2: 7, hidden: true }),

  // The gaoler's lodge, off the corridor's south end: a stool, a lamp, and the
  // board his keys hang on.
  room({ id: "lodge", name: "THE GAOLER’S LODGE", kind: "chamber", x1: 33, y1: 23, x2: 36, y2: 28, material: "3" }),
  open({ id: "lodge-corridor", between: ["lodge", "cell-corridor"], x1: 36, y1: 25, x2: 37, y2: 26 }),

  // The corridor's return: west at its south end, then south into the Chamber
  // of Groans. This is what closes the circuit — a prisoner is walked from the
  // tribunal to a cell one way and from a cell to the chamber the other, and
  // the two roads never cross.
  room({ id: "groans-jog", name: "THE LOWER PASSAGE", kind: "passage", x1: 33, y1: 29, x2: 36, y2: 30, material: "4" }),
  room({ id: "groans-drop", name: "THE LOWER PASSAGE", kind: "passage", x1: 33, y1: 31, x2: 34, y2: 32, material: "4" }),

  // The wardrobe, the vault and the chamber: the escape's three rooms, each a
  // secret kept from the last, so no two of their doors share a rank.
  room({ id: "wardrobe", name: "THE WARDROBE ROOM", kind: "chamber", x1: 11, y1: 32, x2: 17, y2: 37, material: "4" }),
  open({ id: "office-wardrobe", between: ["office", "wardrobe"], x1: 10, y1: 33, x2: 11, y2: 34 }),
  room({ id: "vault", name: "THE PASSWORD VAULT", kind: "chamber", x1: 17, y1: 30, x2: 24, y2: 39, material: "1" }),
  open({ id: "wardrobe-vault", between: ["wardrobe", "vault"], x1: 17, y1: 35, x2: 17, y2: 36 }),

  // The service return from the tribunal down to the vault: three legs, so the
  // bench cannot look down its own back stair.
  room({ id: "return-north", name: "THE TRIBUNAL’S SOUTH RETURN", kind: "passage", x1: 20, y1: 13, x2: 21, y2: 18, material: "1" }),
  open({ id: "tribunal-return", between: ["tribunal", "return-north"], x1: 20, y1: 12, x2: 21, y2: 13 }),
  room({ id: "return-cross", name: "THE TRIBUNAL’S SOUTH RETURN", kind: "passage", x1: 20, y1: 19, x2: 23, y2: 20, material: "1" }),
  room({ id: "return-south", name: "THE SERVICE STAIR", kind: "passage", x1: 22, y1: 21, x2: 23, y2: 29, material: "1" }),
  open({ id: "return-vault", between: ["return-south", "vault"], x1: 22, y1: 29, x2: 23, y2: 30 }),

  // The Chamber of Groans: twelve metres by eleven under four piers, entered
  // from the vault on the west and from the corridor's return on the north, and
  // left — by those who know — through a door in its east wall.
  room({ id: "groans", name: "THE CHAMBER OF GROANS", kind: "chamber", x1: 25, y1: 33, x2: 38, y2: 45, material: "4" }),
  open({ id: "vault-groans", between: ["vault", "groans"], x1: 24, y1: 37, x2: 25, y2: 38 }),
  open({ id: "drop-groans", between: ["groans-drop", "groans"], x1: 33, y1: 32, x2: 34, y2: 33 }),

  // The moon stair, and the door at the top of it.
  room({ id: "moon-stair", name: "THE MOON STAIR", kind: "chamber", x1: 39, y1: 38, x2: 46, y2: 46, material: "1" }),
  open({ id: "groans-moonstair", between: ["groans", "moon-stair"], x1: 38, y1: 43, x2: 39, y2: 44 }),
  // Eight treads of 0.2 rise and 0.325 going, climbing north from level floor
  // at the door to a landing under the moon door.
  stair({ id: "moon-flight", room: "moon-stair", x1: 40, y1: 40.4, x2: 46, y2: 43, axis: "y", from: UPPER_FLOOR, to: 0, treads: 8 }),
  landing({ id: "moon-landing", room: "moon-stair", x1: 40, y1: 39, x2: 46, y2: 40.4, height: UPPER_FLOOR }),

  // Beyond the door: a walled lane under the open sky, three legs of it, and
  // the garden. All of it stands at the landing's height, and none of it has a
  // roof — the first sky in the building is the one the stair was climbed for.
  room({ id: "moon-lane", name: "THE HIDDEN LANE", kind: "passage", x1: 42, y1: 34, x2: 43, y2: 37, material: "1", openAir: true }),
  open({ id: "moon-door", between: ["moon-stair", "moon-lane"], x1: 42, y1: 37, x2: 43, y2: 38 }),
  room({ id: "moon-lane-cross", name: "THE HIDDEN LANE", kind: "passage", x1: 42, y1: 32, x2: 51, y2: 33, material: "1", openAir: true }),
  room({ id: "moon-lane-north", name: "THE HIDDEN LANE", kind: "passage", x1: 50, y1: 28, x2: 51, y2: 31, material: "1", openAir: true }),
  room({ id: "garden", name: "THE MOONLIT GARDEN", kind: "chamber", x1: 47, y1: 13, x2: 56, y2: 27, material: "1", openAir: true }),
  open({ id: "lane-garden", between: ["moon-lane-north", "garden"], x1: 50, y1: 27, x2: 51, y2: 28 }),
  landing({ id: "moon-threshold", room: "moon-stair", x1: 42, y1: 38, x2: 44, y2: 39, height: UPPER_FLOOR }),
  landing({ id: "lane-floor", room: "moon-lane", x1: 42, y1: 34, x2: 44, y2: 38, height: UPPER_FLOOR }),
  landing({ id: "lane-cross-floor", room: "moon-lane-cross", x1: 42, y1: 32, x2: 52, y2: 34, height: UPPER_FLOOR }),
  landing({ id: "lane-north-floor", room: "moon-lane-north", x1: 50, y1: 27, x2: 52, y2: 32, height: UPPER_FLOOR }),
  landing({ id: "garden-floor", room: "garden", x1: 48, y1: 14, x2: 56, y2: 27, height: UPPER_FLOOR }),
];

/**
 * Where the player begins: the far end of the approach, with the shut door at
 * their back and the gate hall six metres ahead.
 */
export const SPAWN = { x: 6, y: 47.4, dir: -Math.PI / 2, pitch: 0 };

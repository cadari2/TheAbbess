/**
 * Who walks the Holy Office, and the rounds they walk.
 *
 * Every coordinate here is checked by the suite against masonry and props at the
 * figure's own girth, so a round cannot be authored through a wall or through a
 * prisoner's pallet — both of which the previous hand-typed routes did.
 *
 * The lines are written for this adaptation and are not quotation from Ireland.
 * None of them is addressed to the player: each is spoken on arrival at a post,
 * to a colleague, to a cell, or to nobody. That is the whole register the
 * premise allows — she is never spoken to, so everything she learns she learns
 * by being somewhere she is not expected to be and not being stopped.
 */

import type { NpcDefinition } from "./npcs.ts";

export const NPCS: readonly NpcDefinition[] = [
  {
    id: "gate-familiar",
    name: "A Familiar",
    role: "Officer of the threshold",
    speed: 0.62,
    appearance: { hood: true, beard: true, face: "elder", scale: 0.98 },
    route: [
      { at: [6.8, 18.9], dwellMs: 3400, facing: Math.PI / 2, say: "The Office receives no one by that name." },
      { at: [6.8, 20.7] },
      { at: [5.5, 20.7] },
      { at: [5.5, 23.6], dwellMs: 3000, facing: -Math.PI / 2, say: "Nothing came in tonight. Write that, and write nothing else." },
      { at: [5.5, 20.7] },
      { at: [6.8, 20.7] },
    ],
  },
  {
    id: "tribunal-clerk",
    name: "The Secretary",
    role: "Keeper of testimony",
    speed: 0.5,
    appearance: { garment: "clerk", face: "secretary", scale: 0.94 },
    // Out and back down the east side of the table, crossing at the south end.
    // The north end is closed by the secretary's own chair, and the table itself
    // fills the middle of the room; a closed circuit here has to retrace.
    route: [
      { at: [20.6, 5.2], dwellMs: 3200, facing: Math.PI, say: "Every answer is entered. Every silence also." },
      { at: [20.6, 11.55] },
      { at: [13.4, 11.55] },
      { at: [13.4, 5.2], dwellMs: 2600, facing: 0, say: "The fathers will summon the prisoner when the record is prepared." },
      { at: [13.4, 11.55] },
      { at: [20.6, 11.55] },
    ],
  },
  {
    id: "cell-keeper",
    name: "A Gaoler",
    role: "Keeper of the cells",
    speed: 0.46,
    appearance: { hood: true, face: "mature", scale: 0.99 },
    // Down the gaoler's corridor, stopping square in front of each iron front.
    // The facings are what make him a gaoler rather than a man walking: he turns
    // to look into the cell for the whole of his pause.
    route: [
      { at: [29, 6.5], dwellMs: 3800, facing: 0, say: "The young man studies the painted wall. He has not eaten." },
      { at: [29, 11.5], dwellMs: 3800, facing: 0, say: "The woman prays. She has stopped asking the hour." },
      { at: [29, 16.5], dwellMs: 3200, facing: 0, say: "This one has no name entered against him at all." },
      { at: [29, 11.5] },
    ],
  },
  {
    id: "masked-watch",
    name: "The Masked Official",
    role: "Watcher of the hidden road",
    speed: 0.34,
    appearance: { hood: true, masked: true, scale: 1.06 },
    route: [
      { at: [19.6, 20.4], dwellMs: 5400, facing: Math.PI / 2, say: "The word? No—do not speak it here." },
      { at: [21, 22.6], dwellMs: 3800, facing: -Math.PI / 2, say: "I know the habit. I do not know the man within it." },
    ],
  },
  // The prisoners. They are given rounds too, of two paces and long stillnesses,
  // because a cell with a figure standing motionless in it reads as a diorama
  // and a cell with someone slowly using its four square metres reads as a cell.
  {
    id: "marcello",
    name: "Marcello Porta",
    role: "Held without charge entered",
    speed: 0.22,
    appearance: { prisoner: true, face: "young", scale: 1.02 },
    route: [
      { at: [33, 6.5], dwellMs: 7600, facing: 0, say: "Bendetta. Seventeen. The rest of her is scraped away." },
      { at: [32, 7.4], dwellMs: 5200, facing: -Math.PI / 2, say: "They asked me one question with three mouths, and wrote down three answers." },
    ],
  },
  {
    id: "maddalena",
    name: "Maddalena Rosa",
    role: "Held without charge entered",
    speed: 0.2,
    appearance: { prisoner: true, face: "mature", scale: 0.95 },
    route: [
      { at: [32.4, 11.5], dwellMs: 8200, facing: 0, say: "The lamp is noon. The wall is a horizon. I have decided this, and it holds." },
      { at: [33.2, 12.3], dwellMs: 5600, facing: -Math.PI / 2, say: "They cannot come where I have gone. They have not been told the way." },
    ],
  },
  {
    id: "further-prisoner",
    name: "The Further Prisoner",
    role: "No name entered",
    speed: 0.18,
    appearance: { prisoner: true, face: "elder", scale: 0.97 },
    route: [
      { at: [32.6, 16.6], dwellMs: 9000, facing: Math.PI },
      { at: [32.6, 17.3], dwellMs: 6400, facing: 0, say: "I have forgotten what I confessed. I would confess it again if they would tell me what it was." },
    ],
  },
];

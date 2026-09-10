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
    // From his post beside the desk, out through the office door, round the
    // counter to the portcullis, and back.
    route: [
      { at: [8.4, 32.4], dwellMs: 3400, facing: Math.PI, say: "The Office receives no one by that name." },
      { at: [8.5, 35.4] },
      { at: [8.5, 38.6] },
      { at: [7.4, 39.6], dwellMs: 3000, facing: Math.PI / 2, say: "Nothing came in tonight. Write that, and write nothing else." },
      { at: [10.4, 39.6] },
      { at: [10.4, 41.9], dwellMs: 2600, facing: Math.PI / 2, say: "Whoever is at the door may wait. The door is the point." },
      { at: [10.4, 39.6] },
      { at: [8.5, 38.6] },
      { at: [8.5, 35.4] },
    ],
  },
  {
    id: "tribunal-clerk",
    name: "The Secretary",
    role: "Keeper of testimony",
    speed: 0.5,
    appearance: { garment: "clerk", face: "secretary", scale: 0.94 },
    // Out and back along the south side of the court, behind the accused and
    // in front of nobody: the record walks the room the proceeding sits in.
    route: [
      { at: [18.2, 10.4], dwellMs: 3200, facing: -Math.PI / 2, say: "Every answer is entered. Every silence also." },
      { at: [26.6, 10.4], dwellMs: 2600, facing: -Math.PI / 2, say: "The fathers will summon the prisoner when the record is prepared." },
    ],
  },
  {
    id: "cell-keeper",
    name: "A Gaoler",
    role: "Keeper of the cells",
    speed: 0.46,
    appearance: { hood: true, face: "mature", scale: 0.99 },
    // Down the gaoler's corridor, stopping square in front of each iron front,
    // then into his lodge to count his keys, and back up the range.
    route: [
      { at: [38.3, 4.5], dwellMs: 3800, facing: 0, say: "The young man studies the painted wall. He has not eaten." },
      { at: [38.3, 8.5], dwellMs: 3800, facing: 0, say: "The woman prays. She has stopped asking the hour." },
      { at: [38.3, 12.5], dwellMs: 3200, facing: 0, say: "This one has no name entered against him at all." },
      { at: [38.3, 16.5], dwellMs: 2400, facing: 0, say: "Empty since the spring. It is entered in the book as occupied." },
      { at: [38.3, 20.5], dwellMs: 2800, facing: 0, say: "Whoever kept this one counted the days on the wall, and stopped at ninety." },
      { at: [38.3, 24.5], dwellMs: 3000, facing: 0, say: "The last one. We put them here when we mean to forget the hour they came." },
      { at: [38.3, 26] },
      { at: [34.9, 25.9], dwellMs: 4200, facing: Math.PI, say: "Six keys, six nails. The seventh was never mine to hang." },
      { at: [38.3, 26] },
      { at: [38.3, 14.5] },
    ],
  },
  {
    id: "masked-watch",
    name: "The Masked Official",
    role: "Watcher of the hidden road",
    speed: 0.34,
    appearance: { hood: true, masked: true, scale: 1.06 },
    route: [
      { at: [20.5, 33], dwellMs: 5400, facing: Math.PI / 2, say: "The word? No—do not speak it here." },
      { at: [21.8, 36.4], dwellMs: 3800, facing: -Math.PI / 2, say: "I know the habit. I do not know the man within it." },
      { at: [19.4, 35.6], dwellMs: 2600, facing: Math.PI, say: "The key hangs where it hangs. Whoever takes it down has already answered." },
    ],
  },
  // The prisoners. They are given rounds too, of two paces and long stillnesses,
  // because a cell with a figure standing motionless in it reads as a diorama
  // and a cell with someone slowly using its twelve square metres reads as a cell.
  {
    id: "marcello",
    name: "Marcello Porta",
    role: "Held without charge entered",
    speed: 0.22,
    appearance: { prisoner: true, face: "young", scale: 1.02 },
    route: [
      { at: [42.2, 5.9], dwellMs: 7600, facing: Math.PI / 2, say: "Bendetta. Seventeen. The rest of her is scraped away." },
      { at: [43.6, 5.2], dwellMs: 5200, facing: 0, say: "They asked me one question with three mouths, and wrote down three answers." },
      { at: [41.9, 5.3], dwellMs: 4400, facing: Math.PI / 2, say: "Its eyes went with me to the pallet. I did not sleep." },
    ],
  },
  {
    id: "maddalena",
    name: "Maddalena Rosa",
    role: "Held without charge entered",
    speed: 0.2,
    appearance: { prisoner: true, face: "mature", scale: 0.95 },
    route: [
      { at: [42.4, 9.9], dwellMs: 8200, facing: Math.PI / 2, say: "The lamp is noon. The wall is a horizon. I have decided this, and it holds." },
      { at: [43.6, 9.4], dwellMs: 5600, facing: 0, say: "The moon comes in by the grating and lies on the floor in bars. I do not step on it." },
      { at: [41.9, 9.2], dwellMs: 4200, facing: -Math.PI / 2, say: "They cannot come where I have gone. They have not been told the way." },
    ],
  },
  {
    id: "further-prisoner",
    name: "The Further Prisoner",
    role: "No name entered",
    speed: 0.18,
    appearance: { prisoner: true, face: "elder", scale: 0.97 },
    route: [
      { at: [43.4, 13.5], dwellMs: 9000, facing: 0 },
      { at: [41.9, 13.4], dwellMs: 6400, facing: Math.PI, say: "I have forgotten what I confessed. I would confess it again if they would tell me what it was." },
    ],
  },
  // The apparition. In the romance the painted wall of Marcello's cell opens
  // and a figure comes through it; the guide knows the wall for a mechanism.
  // Here it is a veiled woman who walks the keeper's slit between the two
  // cells, standing a long while at the panel before she passes it — and she
  // passes it whether it is shut or not, because the people of this building
  // are given no doors, and a wall she walks through is exactly what Marcello
  // sees.
  {
    id: "veiled-visitant",
    name: "A Veiled Figure",
    role: "Not entered in any book",
    speed: 0.16,
    appearance: { hood: true, face: "mature", scale: 0.96 },
    route: [
      { at: [43.5, 9.8], dwellMs: 14000, facing: -Math.PI / 2, say: "Not yet. Let him look at the wall a little longer." },
      { at: [43.5, 7.5], dwellMs: 6000, facing: -Math.PI / 2 },
      { at: [43.5, 6.2], dwellMs: 5200, facing: Math.PI, say: "Marcello. The wall is not stone tonight." },
      { at: [43.5, 7.5], dwellMs: 2000, facing: Math.PI / 2 },
    ],
  },
];

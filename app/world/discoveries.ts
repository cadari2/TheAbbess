import { floorExtent } from "./derive.ts";
import type { DerivedWorld } from "./model.ts";

export type Discovery = {
  id: string;
  /** The room this belongs to. Checked against the plan, not decorative. */
  room: string;
  x: number;
  y: number;
  title: string;
  kicker: string;
  text: string;
  detail: string;
  perspective?: string;
  interpretation?: string;
  themes?: string[];
};

export const DISCOVERIES: readonly Discovery[] = [
  {
    id: "gate",
    room: "gate",
    x: 5,
    y: 24.2,
    kicker: "I • THRESHOLD",
    title: "The Prison Gate",
    text: "Two shuttered carriages pass beneath the teeth of the portcullis. The captives were separated at the instant of arrest, lest a word or motion carry some hidden meaning.",
    detail:
      "The late chapters begin the prison sequence here: officials admit the vehicles, close the outer gate, and deny the world beyond any knowledge of those confined within.",
    perspective: "You crossed this threshold earlier in another habit. Tonight the same officers look through you, seeing only the authority implied by your hood.",
    interpretation: "The threshold establishes the Office's central power: it can make a person disappear by controlling who is permitted to acknowledge an arrival.",
    themes: ["Secrecy", "Institutional power"],
  },
  {
    id: "familiars",
    room: "office",
    x: 5,
    y: 19,
    kicker: "II • THE OUTER OFFICE",
    title: "A Familiar’s Dark Chamber",
    text: "A smoky taper reveals two silent men at a scarred desk. Petitioners are left here to wait while names, titles, and even the existence of prisoners are calmly denied.",
    detail:
      "Duca Bertocci is held in just such a room. The novel stresses the officials’ sullen faces and the oppressive correspondence between their looks and their residence.",
  },
  {
    id: "passage",
    room: "high-lamp",
    x: 5.5,
    y: 12,
    kicker: "III • THE LIGHTED AVENUE",
    title: "The Passage of High Lamps",
    text: "Glimmering lamps burn far overhead. Their islands of light never meet. At the next angle, footsteps vanish; from behind the masonry comes one groan, then a woman’s cry.",
    detail:
      "Ireland repeatedly returns to these lofty passages. A torch briefly reveals Father Ubaldo, a mysterious youth, and the flash of an assassin’s poniard.",
  },
  {
    id: "tribunal",
    room: "tribunal",
    x: 16.5,
    y: 8,
    kicker: "IV • MISERICORDIA ET JUSTITIA",
    title: "The Table of the Holy Office",
    text: "One lamp gathers the judges, the black velvet table, and the low selette into an amber circle. Scarlet crosses repeat along the chestnut walls. The crucifix rises beyond them, nearly touching the vault.",
    detail:
      "Marcello is ordered to enter barefoot, bareheaded, and with his arms bared. Here the inquisitors attempt to annul his oath, record his answers, threaten torture, and later confront Maddalena with forged testimony.",
    perspective: "From the servants' perimeter you can cross behind the judges without challenge. The prisoner is exposed; the institution's agents are interchangeable.",
    interpretation: "The chamber converts speech into evidence. Its symmetry and repeated crosses make coercion appear orderly, devotional, and inevitable.",
    themes: ["Testimony", "Performance", "Authority"],
  },
  {
    id: "marcello",
    room: "marcello",
    x: 30,
    y: 7,
    kicker: "V • CELL OF MARCELLO PORTA",
    title: "Bendetta’s Wall",
    text: "A rush pallet and a stool are the cell’s only mercies. In the lamp’s weak gleam, a painted demon watches over serpents, skulls, worms, a toad, and a scorpion. Below it, a prisoner’s scratched chronicle survives.",
    detail:
      "The inscription names Bendetta Cazzala, a seventeen-year-old prisoner. Her story has been partly obliterated, then officially preserved as a warning. The demon’s eyes appear to move; the wall opens for a staged apparition.",
    perspective: "You know the painted terror is also machinery: a concealed route passes behind the wall. Marcello can only read it as supernatural threat.",
    interpretation: "Ireland layers authored inscription, official alteration, painting, and theatrical mechanism until the cell itself becomes an unreliable narrator.",
    themes: ["Spectacle", "Memory", "Deception"],
  },
  {
    id: "maddalena",
    room: "maddalena",
    x: 30,
    y: 16,
    kicker: "VI • CELL OF MADDALENA ROSA",
    title: "The Plainer Dungeon",
    text: "This cell is narrow and lofty like Marcello’s, but its walls bear no infernal pictures. A spider threads its web beside the lamp. A small golden cross catches what little light there is.",
    detail:
      "Maddalena turns the dungeon into a test of inward fortitude. She imagines the weak lamp as noon, the walls as a horizon, and the damp air as a morning breeze.",
    perspective: "Your unrestricted passage cannot grant what she creates for herself: a freedom of interpretation that the gaolers cannot regulate.",
    interpretation: "Her imaginative transformation of the cell answers the Office's staged terrors with a private counter-theatre of daylight and open air.",
    themes: ["Interior freedom", "Faith", "Imagination"],
  },
  {
    id: "wardrobe",
    room: "wardrobe",
    x: 12,
    y: 20,
    kicker: "VII • THE DISGUISE",
    title: "The Wardrobe Room",
    text: "A tall press stands open. Within hang black hooded garments, coarse and unmarked. One is missing.",
    detail:
      "During the clandestine escape, the mysterious guide clothes Duca Bertocci in a garment resembling his own, allowing them to pass as officials through the underground maze.",
  },
  {
    id: "watch",
    room: "vault",
    x: 19.5,
    y: 21,
    kicker: "VIII • THE PASSWORD VAULT",
    title: "The Masked Official",
    text: "A lamp swings from the center of a low vault. Beneath it waits a masked figure in a terrifying habit. Passage is granted only after an enigmatic challenge and answer.",
    detail:
      "The novel never supplies the word. Its omission turns language itself into architecture: one unknown syllable separates the hidden route from discovery.",
  },
  {
    id: "antechamber",
    room: "groans",
    x: 27,
    y: 23,
    kicker: "IX • THE ADJOINING CELL",
    title: "The Chamber of Groans",
    text: "Rusty pulleys sleep behind an iron grille; basins, cords, and a surgeon’s narrow table recede into shadow. Nothing moves. The room is described most powerfully by what is heard through its walls.",
    detail:
      "This interpretation avoids spectacle. Ireland’s characters encounter the torture rooms indirectly—through cries, threatened procedures, Bendetta’s damaged account, and their own fearful imagination.",
  },
  {
    id: "escape",
    room: "moon-stair",
    x: 33,
    y: 24,
    kicker: "X • THE MOON DOOR",
    title: "The Hidden Stair",
    text: "The stair climbs sharply toward cold air. At its summit, an iron key turns and moonlight cuts a silver blade across the floor.",
    detail:
      "Here the guide dismisses Bertocci’s gratitude: he once sought the duke’s life and has now saved it. The revelation remains unresolved at the end of Volume II.",
    perspective: "This is your remembered route with Bertocci: the final lock yielded to your key, but your motive remained closed to him.",
    interpretation: "The unresolved rescuer embodies the romance's unstable moral accounting: an intended murderer can become a liberator without becoming legible.",
    themes: ["Debt", "Identity", "Escape"],
  },
];

/**
 * Discoveries whose coordinates fall outside the room they claim.
 *
 * The `room` field is what ties a discovery to the plan. Without this check a
 * room can be resized during layout work and its discovery left sitting in the
 * masonry, still examinable through a wall from the corridor outside.
 */
export function misplacedDiscoveries(world: DerivedWorld) {
  const roomById = new Map(world.rooms.map((room) => [room.id, room]));
  const problems: { id: string; reason: string }[] = [];
  for (const discovery of DISCOVERIES) {
    const room = roomById.get(discovery.room);
    if (!room) {
      problems.push({ id: discovery.id, reason: `unknown room "${discovery.room}"` });
      continue;
    }
    const floor = floorExtent(room);
    const x = Math.floor(discovery.x);
    const y = Math.floor(discovery.y);
    if (x < floor.x1 || x > floor.x2 || y < floor.y1 || y > floor.y2) {
      problems.push({
        id: discovery.id,
        reason: `at ${discovery.x},${discovery.y} is outside "${discovery.room}" floor ` +
          `${floor.x1}..${floor.x2} × ${floor.y1}..${floor.y2}`,
      });
    }
  }
  return problems;
}

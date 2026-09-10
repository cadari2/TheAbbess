import { floorExtent } from "./derive.ts";
import { MOON_KEY } from "./doors.ts";
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
  /**
   * A thing that is taken rather than a place that is read. Examining it puts
   * the named key in the player's hand, and the renderer takes it off its hook.
   */
  grants?: string;
};

/**
 * The places of the romance, in the order the romance reaches them, and the
 * things the adaptation adds between them.
 *
 * The lead text of each closely paraphrases Ireland's descriptions; nothing
 * here is quotation. The details, perspectives and interpretations are this
 * adaptation's own, and `docs/textual-evidence.md` says which is which.
 */
export const DISCOVERIES: readonly Discovery[] = [
  {
    id: "gate",
    room: "gate",
    x: 6,
    y: 39.4,
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
    x: 5.6,
    y: 31.6,
    kicker: "II • THE OUTER OFFICE",
    title: "A Familiar’s Dark Chamber",
    text: "A smoky taper reveals two silent men at a scarred desk. Petitioners are left here to wait while names, titles, and even the existence of prisoners are calmly denied.",
    detail:
      "Duca Bertocci is held in just such a room. The novel stresses the officials’ sullen faces and the oppressive correspondence between their looks and their residence.",
  },
  {
    id: "passage",
    room: "high-lamp",
    x: 5,
    y: 22,
    kicker: "III • THE LIGHTED AVENUE",
    title: "The Passage of High Lamps",
    text: "Glimmering lamps burn far overhead. Their islands of light never meet. At the next angle, footsteps vanish; from behind the masonry comes one groan, then a woman’s cry.",
    detail:
      "Ireland repeatedly returns to these lofty passages. A torch briefly reveals Father Ubaldo, a mysterious youth, and the flash of an assassin’s poniard.",
  },
  {
    id: "poniard",
    room: "lamp-angle",
    x: 9.5,
    y: 16.5,
    kicker: "III • A THING DROPPED AT THE ANGLE",
    title: "A Poniard on the Flagstones",
    text: "Where the passage turns and no lamp reaches, a narrow blade lies against the wall. Its edge takes the light from the far lamp and gives back one line of it.",
    detail:
      "Ireland’s passages flash with an assassin’s poniard seen for an instant by torchlight. It is left here, unexplained, at the one corner in the building where a step cannot be heard from either end.",
    perspective: "You know whose hand it fell from. It is the reason you came to the Office at all, and the reason you left it by the moon door with another man’s life instead of his death.",
    interpretation: "The dropped weapon is the adaptation’s only object that belongs to the guide’s past: a murder intended and not done, lying where the light does not reach.",
    themes: ["Intention", "Concealment"],
  },
  {
    id: "anteroom",
    room: "anteroom",
    x: 12,
    y: 5.5,
    kicker: "IV • THE ANTEROOM",
    title: "Where the Accused Waits",
    text: "A bench, a basin, and a row of pegs. Here the prisoner is stripped of shoes and hat, his sleeves are turned back to the elbow, and he is left to listen to the room beyond the wall.",
    detail:
      "Marcello is ordered into the tribunal barefoot, bareheaded, and with his arms bared. The romance gives the order; the room where it is carried out is this adaptation’s inference.",
  },
  {
    id: "tribunal",
    room: "tribunal",
    x: 22.5,
    y: 9,
    kicker: "V • MISERICORDIA ET JUSTITIA",
    title: "The Table of the Holy Office",
    text: "One lamp gathers the judges, the black velvet table, and the low selette into an amber circle. Scarlet crosses repeat along the chestnut walls. Behind the bench the great crucifix rises, nearly touching the vault.",
    detail:
      "Marcello is ordered to enter barefoot, bareheaded, and with his arms bared. Here the inquisitors attempt to annul his oath, record his answers, threaten torture, and later confront Maddalena with forged testimony.",
    perspective: "From the servants' perimeter you can cross behind the judges without challenge. The prisoner is exposed; the institution's agents are interchangeable.",
    interpretation: "The chamber converts speech into evidence. Its symmetry and repeated crosses make coercion appear orderly, devotional, and inevitable.",
    themes: ["Testimony", "Performance", "Authority"],
  },
  {
    id: "marcello",
    room: "marcello",
    x: 42.2,
    y: 6.2,
    kicker: "VI • CELL OF MARCELLO PORTA",
    title: "Bendetta’s Wall",
    text: "A rush pallet and a stool are the cell’s only mercies. In the lamp’s weak gleam, a painted demon watches over serpents, skulls, worms, a toad, and a scorpion. Below it, a prisoner’s scratched chronicle survives.",
    detail:
      "The inscription names Bendetta Cazzala, a seventeen-year-old prisoner. Her story has been partly obliterated, then officially preserved as a warning. The demon’s eyes appear to move; the wall opens for a staged apparition.",
    perspective: "You know the painted terror is also machinery: a panel of the wall turns on a pivot beside the demon, and the slit behind it runs into the next cell. Marcello can only read it as supernatural threat.",
    interpretation: "Ireland layers authored inscription, official alteration, painting, and theatrical mechanism until the cell itself becomes an unreliable narrator.",
    themes: ["Spectacle", "Memory", "Deception"],
  },
  {
    id: "maddalena",
    room: "maddalena",
    x: 42.6,
    y: 9.6,
    kicker: "VII • CELL OF MADDALENA ROSA",
    title: "The Plainer Dungeon",
    text: "This cell is narrow and lofty like Marcello’s, but its walls bear no infernal pictures. A spider threads its web beside the lamp. A small golden cross catches what little light there is, and the moon lays the shadow of the grating across the floor.",
    detail:
      "Maddalena turns the dungeon into a test of inward fortitude. She imagines the weak lamp as noon, the walls as a horizon, and the damp air as a morning breeze.",
    perspective: "Your unrestricted passage cannot grant what she creates for herself: a freedom of interpretation that the gaolers cannot regulate.",
    interpretation: "Her imaginative transformation of the cell answers the Office's staged terrors with a private counter-theatre of daylight and open air.",
    themes: ["Interior freedom", "Faith", "Imagination"],
  },
  {
    id: "lodge",
    room: "lodge",
    x: 34.6,
    y: 25.6,
    kicker: "VIII • THE GAOLER’S LODGE",
    title: "The Board of Keys",
    text: "Six iron keys hang from six nails, each above a number cut into the board. A seventh nail is bare, and beneath it somebody has scratched a crescent moon.",
    detail:
      "The romance gives the guide the key to the last door and never says where it was kept. This adaptation keeps it where the Office keeps its secrets: with the man who watches the hidden road, not with the man who keeps the cells.",
    perspective: "The gaoler counts prisoners; he does not count doors. The key you want was never on his board.",
    themes: ["Custody", "Absence"],
  },
  {
    id: "wardrobe",
    room: "wardrobe",
    x: 14,
    y: 35.6,
    kicker: "IX • THE DISGUISE",
    title: "The Wardrobe Room",
    text: "A tall press stands open. Within hang black hooded garments, coarse and unmarked. One is missing.",
    detail:
      "During the clandestine escape, the mysterious guide clothes Duca Bertocci in a garment resembling his own, allowing them to pass as officials through the underground maze.",
  },
  {
    id: "watch",
    room: "vault",
    x: 20.5,
    y: 33.6,
    kicker: "X • THE PASSWORD VAULT",
    title: "The Masked Official",
    text: "A lamp swings from the center of a low vault. Beneath it waits a masked figure in a terrifying habit. Passage is granted only after an enigmatic challenge and answer.",
    detail:
      "The novel never supplies the word. Its omission turns language itself into architecture: one unknown syllable separates the hidden route from discovery.",
  },
  {
    id: "moon-key",
    room: "vault",
    x: 18.6,
    y: 32.4,
    kicker: "X • THE WATCHER’S NAIL",
    title: "The Key of the Moon Door",
    text: "On a nail beside the watcher’s lamp hangs one long iron key, blackened, its bow cut into a crescent. Nothing else in the vault is his; this is.",
    detail:
      "The guide of the romance carries the key to the final door and turns it while Bertocci waits in the dark behind him. Where he had it from, the text does not say. Here it hangs at the post of the one official whose office is the road it opens.",
    perspective: "You take it off the nail. The masked man does not turn his head. Whether he does not see you or has been told not to, you have never known.",
    themes: ["Debt", "Passage"],
    grants: MOON_KEY,
  },
  {
    id: "antechamber",
    room: "groans",
    x: 31.5,
    y: 38.6,
    kicker: "XI • THE ADJOINING CELL",
    title: "The Chamber of Groans",
    text: "Rusty pulleys sleep behind an iron grille; basins, cords, and a surgeon’s narrow table recede into shadow. Nothing moves. The room is described most powerfully by what is heard through its walls.",
    detail:
      "This interpretation avoids spectacle. Ireland’s characters encounter the torture rooms indirectly—through cries, threatened procedures, Bendetta’s damaged account, and their own fearful imagination.",
  },
  {
    id: "escape",
    room: "moon-stair",
    x: 43,
    y: 44.4,
    kicker: "XII • THE MOON DOOR",
    title: "The Hidden Stair",
    text: "The stair climbs sharply toward cold air. At its summit, an iron key turns and moonlight cuts a silver blade across the floor.",
    detail:
      "Here the guide dismisses Bertocci’s gratitude: he once sought the duke’s life and has now saved it. The revelation remains unresolved at the end of Volume II.",
    perspective: "This is your remembered route with Bertocci: the final lock yielded to your key, but your motive remained closed to him.",
    interpretation: "The unresolved rescuer embodies the romance's unstable moral accounting: an intended murderer can become a liberator without becoming legible.",
    themes: ["Debt", "Identity", "Escape"],
  },
  {
    id: "garden",
    room: "garden",
    x: 52,
    y: 20.5,
    kicker: "XIII • BEYOND THE DOOR",
    title: "The Moonlit Garden",
    text: "Cypresses stand black against a sky the dungeon does not have. The moon lies whole in a stone basin. In the west wall, low down, three barred slits let out a little of the gaol’s own lamplight.",
    detail:
      "The romance ends the escape in moonlight and open air, on the far side of the last door. Everything in this garden is the adaptation’s: the walls, the basin, the trees, and the further gate in the north wall that does not open, because the story does not go on past it.",
    perspective: "Bertocci wept here. You told him what you had meant to do to him, and left him with it. The gate beyond was yours to open then; tonight it is only a gate.",
    interpretation: "The garden is the prison seen from outside: the same windows, the same lamps, and nothing between them and the sky but the reader’s knowledge of who is behind them.",
    themes: ["Release", "Retrospect"],
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

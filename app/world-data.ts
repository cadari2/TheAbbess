export type Discovery = {
  id: string;
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

export const W = 36;
export const H = 28;

function createWorld() {
  const grid = Array.from({ length: H }, () => Array(W).fill("1"));
  const boundary = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    material = "1",
  ) => {
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        if (x === x1 || x === x2 || y === y1 || y === y2) grid[y][x] = material;
        else grid[y][x] = "0";
      }
    }
  };
  const carve = (x1: number, y1: number, x2: number, y2: number) => {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) grid[y][x] = "0";
  };

  boundary(2, 22, 8, 26, "4");
  boundary(2, 17, 8, 21, "1");
  carve(5, 21, 5, 22);
  carve(5, 6, 6, 17);
  boundary(9, 3, 24, 12, "2");
  carve(6, 8, 9, 9);
  carve(15, 12, 16, 17);
  boundary(27, 4, 33, 10, "3");
  carve(24, 7, 27, 8);
  carve(16, 14, 27, 16);
  carve(27, 15, 27, 16);
  boundary(27, 13, 33, 19, "3");
  // A concealed keeper's slit joins the paired cells. The public corridor still
  // makes each prisoner feel isolated, while the cloaked guide can circulate
  // behind the shared masonry and complete a loop through the eastern range.
  carve(29, 10, 30, 13);
  carve(8, 19, 10, 20);
  boundary(10, 18, 14, 22, "4");
  carve(14, 20, 17, 21);
  boundary(17, 18, 22, 24, "1");
  // Service stair from the tribunal's west return into the password vault.
  // This is an interpretive connection, not a claimed plan of a real building.
  carve(16, 17, 18, 19);
  carve(22, 21, 24, 22);
  boundary(24, 20, 30, 26, "4");
  carve(30, 23, 32, 24);
  boundary(32, 21, 34, 26, "1");

  return grid;
}

export const WORLD = createWorld();

export const DISCOVERIES: Discovery[] = [
  {
    id: "gate",
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

export const ROOM_ZONES = [
  { name: "THE PRISON GATE", x1: 2, y1: 22, x2: 8, y2: 27 },
  { name: "THE OUTER OFFICE", x1: 2, y1: 17, x2: 8, y2: 22 },
  { name: "THE HIGH-LAMP PASSAGE", x1: 4, y1: 6, x2: 9, y2: 17 },
  { name: "THE TRIBUNAL CHAMBER", x1: 9, y1: 3, x2: 25, y2: 13 },
  { name: "MARCELLO’S CELL", x1: 26, y1: 3, x2: 34, y2: 11 },
  { name: "MADDALENA’S CELL", x1: 26, y1: 12, x2: 34, y2: 20 },
  { name: "THE WARDROBE ROOM", x1: 9, y1: 17, x2: 15, y2: 23 },
  { name: "THE PASSWORD VAULT", x1: 16, y1: 17, x2: 23, y2: 25 },
  { name: "THE CHAMBER OF GROANS", x1: 23, y1: 19, x2: 31, y2: 27 },
  { name: "THE MOON STAIR", x1: 31, y1: 20, x2: 35, y2: 27 },
];


export type DungeonNpc = {
  id: string;
  name: string;
  role: string;
  route: readonly [number, number][];
  dialogue: readonly string[];
  speed: number;
};

export const NPCS: DungeonNpc[] = [
  { id: "gate-familiar", name: "A Familiar", role: "Officer of the threshold", route: [[4.2, 24.2], [5.5, 24.2], [5.5, 19.2], [4.2, 19.2], [5.5, 21.5]], speed: 0.38, dialogue: ["The Office receives no one by that name.", "Keep your hood raised. There are questions enough without faces."] },
  { id: "tribunal-clerk", name: "The Secretary", role: "Keeper of testimony", route: [[11, 8], [14, 8], [17, 5.2], [20.8, 8]], speed: 0.3, dialogue: ["Every answer is entered. Every silence also.", "The fathers will summon the prisoner when the record is prepared."] },
  { id: "cell-keeper", name: "A Gaoler", role: "Keeper of the cells", route: [[25, 7.8], [30, 7.8], [30, 15.8], [25, 15.8]], speed: 0.34, dialogue: ["You pass as though the walls had given you leave.", "The woman prays. The young man studies the painted wall."] },
  { id: "masked-watch", name: "The Masked Official", role: "Watcher of the hidden road", route: [[18.2, 20.2], [21.2, 20.2], [21.2, 23], [18.2, 23]], speed: 0.2, dialogue: ["The word? No—do not speak it here.", "I know the habit. I do not know the man within it."] },
];

export function npcPosition(npc: DungeonNpc, timeMs: number) {
  const route = npc.route;
  const distances = route.map((point, index) => {
    const next = route[(index + 1) % route.length];
    return Math.hypot(next[0] - point[0], next[1] - point[1]);
  });
  const circuit = distances.reduce((total, distance) => total + distance, 0);
  let travel = ((timeMs / 1000) * npc.speed) % circuit;
  let segment = 0;
  while (travel > distances[segment]) {
    travel -= distances[segment];
    segment += 1;
  }
  const from = route[segment];
  const to = route[(segment + 1) % route.length];
  const amount = distances[segment] === 0 ? 0 : travel / distances[segment];
  return {
    x: from[0] + (to[0] - from[0]) * amount,
    y: from[1] + (to[1] - from[1]) * amount,
    dir: Math.atan2(to[1] - from[1], to[0] - from[0]),
  };
}

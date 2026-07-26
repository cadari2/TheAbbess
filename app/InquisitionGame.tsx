"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DungeonRenderer, hitsDungeonCollider } from "./three-world";

type Discovery = {
  id: string;
  x: number;
  y: number;
  title: string;
  kicker: string;
  text: string;
  detail: string;
};

const W = 36;
const H = 28;

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
  carve(8, 19, 10, 20);
  boundary(10, 18, 14, 22, "4");
  carve(14, 20, 17, 21);
  boundary(17, 18, 22, 24, "1");
  carve(22, 21, 24, 22);
  boundary(24, 20, 30, 26, "4");
  carve(30, 23, 32, 24);
  boundary(32, 21, 34, 26, "1");

  return grid;
}

const WORLD = createWorld();

const discoveries: Discovery[] = [
  {
    id: "gate",
    x: 5,
    y: 24.2,
    kicker: "I • THRESHOLD",
    title: "The Prison Gate",
    text: "Two shuttered carriages pass beneath the teeth of the portcullis. The captives were separated at the instant of arrest, lest a word or motion carry some hidden meaning.",
    detail:
      "The late chapters begin the prison sequence here: officials admit the vehicles, close the outer gate, and deny the world beyond any knowledge of those confined within.",
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
  },
];

const roomZones = [
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

function nearestDiscovery(x: number, y: number) {
  let nearest: Discovery | null = null;
  let distance = Infinity;
  for (const d of discoveries) {
    const next = Math.hypot(d.x - x, d.y - y);
    if (next < distance) {
      nearest = d;
      distance = next;
    }
  }
  return distance < 2.15 ? nearest : null;
}

function roomName(x: number, y: number) {
  return (
    roomZones.find((r) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2)
      ?.name ?? "THE SUBTERRANEAN MAZE"
  );
}

function isWall(x: number, y: number) {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  return gx < 0 || gy < 0 || gx >= W || gy >= H || WORLD[gy][gx] !== "0";
}

function isBlocked(x: number, y: number, radius = 0.28) {
  const samples = [
    [x - radius, y - radius],
    [x + radius, y - radius],
    [x - radius, y + radius],
    [x + radius, y + radius],
  ];
  return samples.some(([sampleX, sampleY]) => isWall(sampleX, sampleY)) ||
    hitsDungeonCollider(x, y, radius);
}

function initialPlayer() {
  if (typeof window !== "undefined") {
    const start = new URLSearchParams(window.location.search).get("start");
    if (start === "tribunal") return { x: 19.6, y: 11.35, dir: -2.02, pitch: 0.08 };
    if (start === "tribunal-north") return { x: 19.7, y: 4.8, dir: 1.82, pitch: 0.02 };
    if (start === "office") return { x: 7.25, y: 21.25, dir: -2.28, pitch: 0.02 };
    if (start === "cells") return { x: 30, y: 8, dir: Math.PI, pitch: 0 };
    if (start === "vault") return { x: 19.5, y: 23.2, dir: -Math.PI / 2, pitch: 0 };
  }
  return { x: 5, y: 24.5, dir: -Math.PI / 2, pitch: 0 };
}

export default function InquisitionGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const player = useRef(initialPlayer());
  const keys = useRef(new Set<string>());
  const drag = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef<number | null>(null);
  const last = useRef(0);
  const lastViewUpdate = useRef(0);
  const [started, setStarted] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [active, setActive] = useState<Discovery | null>(null);
  const [found, setFound] = useState<string[]>([]);
  const [near, setNear] = useState<Discovery | null>(null);
  const [zone, setZone] = useState("THE PRISON GATE");
  const [view, setView] = useState(initialPlayer);
  const [sound, setSound] = useState(true);
  const [pointerLocked, setPointerLocked] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);

  const foundSet = useMemo(() => new Set(found), [found]);

  const toggleSound = useCallback(() => {
    setSound((v) => !v);
  }, []);

  const interact = useCallback(() => {
    const d = nearestDiscovery(player.current.x, player.current.y);
    if (!d) return;
    if (document.pointerLockElement) document.exitPointerLock();
    setActive(d);
    setFound((current) => (current.includes(d.id) ? current : [...current, d.id]));
  }, []);

  useEffect(() => {
    if (!started) return;
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.key.toLowerCase());
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) e.preventDefault();
      if (e.key.toLowerCase() === "e") interact();
      if (e.key.toLowerCase() === "m") {
        if (document.pointerLockElement) document.exitPointerLock();
        setMapOpen((v) => !v);
      }
      if (e.key.toLowerCase() === "j") {
        if (document.pointerLockElement) document.exitPointerLock();
        setJournalOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setActive(null);
        setJournalOpen(false);
        setMapOpen(false);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [interact, started]);

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onPointerLockChange = () => {
      setPointerLocked(document.pointerLockElement === canvas);
    };
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      player.current.dir += event.movementX * 0.0023;
      player.current.pitch = Math.max(
        -0.5,
        Math.min(0.5, player.current.pitch - event.movementY * 0.002),
      );
    };
    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("mousemove", onMouseMove);
    return () => {
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dungeon = new DungeonRenderer(canvas, WORLD);
    const loop = (time: number) => {
      const dt = Math.min(0.04, (time - (last.current || time)) / 1000);
      last.current = time;
      const p = player.current;
      const k = keys.current;
      const move = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
      const strafe = (k.has("d") ? 1 : 0) - (k.has("a") ? 1 : 0);
      const turn = (k.has("arrowright") ? 1 : 0) - (k.has("arrowleft") ? 1 : 0);
      p.dir += turn * dt * 1.85;
      const speed = dt * 2.35;
      const nx = p.x + (Math.cos(p.dir) * move + Math.cos(p.dir + Math.PI / 2) * strafe) * speed;
      const ny = p.y + (Math.sin(p.dir) * move + Math.sin(p.dir + Math.PI / 2) * strafe) * speed;
      if (!isBlocked(nx, p.y)) p.x = nx;
      if (!isBlocked(p.x, ny)) p.y = ny;
      dungeon.render(p, time);
      const d = nearestDiscovery(p.x, p.y);
      setNear((current) => (current?.id === d?.id ? current : d));
      const z = roomName(p.x, p.y);
      setZone((current) => (current === z ? current : z));
      if (time - lastViewUpdate.current > 100) {
        lastViewUpdate.current = time;
        setView({ ...p });
      }
      frame.current = requestAnimationFrame(loop);
    };
    frame.current = requestAnimationFrame(loop);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      dungeon.dispose();
    };
  }, [started]);

  useEffect(() => {
    if (!started || !sound) {
      audioRef.current?.close();
      audioRef.current = null;
      return;
    }
    try {
      const ac = new AudioContext();
      const gain = ac.createGain();
      const filter = ac.createBiquadFilter();
      const osc = ac.createOscillator();
      const osc2 = ac.createOscillator();
      gain.gain.value = 0.018;
      filter.type = "lowpass";
      filter.frequency.value = 165;
      osc.frequency.value = 52;
      osc2.frequency.value = 77.8;
      osc.type = "sine";
      osc2.type = "sine";
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      osc2.start();
      audioRef.current = ac;
    } catch {
      queueMicrotask(() => setSound(false));
    }
    return () => {
      audioRef.current?.close();
      audioRef.current = null;
    };
  }, [sound, started]);

  const press = (key: string, down: boolean) => {
    if (down) keys.current.add(key);
    else keys.current.delete(key);
  };

  const direction = ((view.dir * 180) / Math.PI + 450) % 360;
  const compass = direction < 45 || direction >= 315 ? "N" : direction < 135 ? "E" : direction < 225 ? "S" : "W";

  return (
    <main className={`game-shell${pointerLocked ? " pointer-locked" : ""}`}>
      {!started ? (
        <section className="intro">
          <div className="intro-grain" />
          <div className="intro-content">
            <p className="eyebrow">FLORENCE · AN IMAGINED SIXTEENTH CENTURY</p>
            <h1>
              THE HOLY
              <span>OFFICE</span>
            </h1>
            <p className="subtitle">A GOTHIC EXPLORATION AFTER W. H. IRELAND</p>
            <div className="rule">
              <i />
              <b>✦</b>
              <i />
            </div>
            <p className="intro-copy">
              Enter the labyrinth described in the final chapters of <em>The Abbess</em>, Volume II.
              Follow lamp-light, read the walls, and discover ten places remembered by its prisoners.
            </p>
            <button className="enter-button" onClick={() => setStarted(true)}>
              <span>ENTER THE PRISON</span>
              <small>best experienced with sound</small>
            </button>
            <div className="intro-controls">
              <span><kbd>WASD</kbd> WALK</span>
              <span><kbd>← →</kbd> TURN</span>
              <span><kbd>E</kbd> EXAMINE</span>
              <span><kbd>M</kbd> MAP</span>
            </div>
            <button className="text-link" onClick={() => setAboutOpen(true)}>ABOUT THE TEXT</button>
          </div>
        </section>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            className="world"
            aria-label="First-person view of the Inquisition dungeon"
            onPointerDown={(e) => {
              if (e.pointerType === "mouse") {
                e.currentTarget.requestPointerLock();
                return;
              }
              drag.current = { x: e.clientX, y: e.clientY };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (e.pointerType === "mouse") return;
              if (drag.current === null) return;
              player.current.dir += (e.clientX - drag.current.x) * 0.004;
              player.current.pitch = Math.max(
                -0.5,
                Math.min(0.5, player.current.pitch - (e.clientY - drag.current.y) * 0.003),
              );
              drag.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={() => (drag.current = null)}
          />
          <div className="vignette" />
          <div className="crosshair" aria-hidden="true"><i /><b /></div>
          {!pointerLocked && !active && !mapOpen && !journalOpen && !aboutOpen && (
            <button
              className="mouse-lock-prompt"
              onClick={() => canvasRef.current?.requestPointerLock()}
            >
              CLICK TO CAPTURE MOUSE
              <small>ESC TO RELEASE</small>
            </button>
          )}
          <header className="hud-top">
            <div className="seal">I</div>
            <div>
              <p>W. H. IRELAND’S</p>
              <strong>THE HOLY OFFICE</strong>
            </div>
            <div className="hud-actions">
              <button onClick={toggleSound} aria-label={sound ? "Mute ambience" : "Enable ambience"}>
                {sound ? "SOUND ON" : "SOUND OFF"}
              </button>
              <button onClick={() => setAboutOpen(true)}>ABOUT</button>
            </div>
          </header>

          <aside className="location-card">
            <span>YOU HAVE ENTERED</span>
            <strong>{zone}</strong>
            <i />
            <p>{found.length} / {discoveries.length} PLACES RECORDED</p>
          </aside>

          <div className="compass" aria-label={`Facing ${compass}`}>
            <span>{compass}</span>
            <i />
          </div>

          <div className="objective">
            <span>THE PRISONER’S PATH</span>
            <div><i style={{ width: `${(found.length / discoveries.length) * 100}%` }} /></div>
            <p>{found.length === discoveries.length ? "THE RECORD IS COMPLETE" : "SEEK THE MARKED PLACES"}</p>
          </div>

          {near && !active && (
            <button className="examine-prompt" onClick={interact}>
              <kbd>E</kbd>
              <span>
                EXAMINE
                <strong>{near.title}</strong>
              </span>
            </button>
          )}

          <nav className="hud-nav" aria-label="Game menu">
            <button onClick={() => setMapOpen(true)}><kbd>M</kbd><span>MAP</span></button>
            <button onClick={() => setJournalOpen(true)}><kbd>J</kbd><span>JOURNAL</span></button>
          </nav>

          <div className="touch-controls" aria-label="Touch controls">
            <div className="touch-move">
              <button onPointerDown={() => press("w", true)} onPointerUp={() => press("w", false)} onPointerLeave={() => press("w", false)}>▲</button>
              <button onPointerDown={() => press("a", true)} onPointerUp={() => press("a", false)} onPointerLeave={() => press("a", false)}>◀</button>
              <button onPointerDown={() => press("s", true)} onPointerUp={() => press("s", false)} onPointerLeave={() => press("s", false)}>▼</button>
              <button onPointerDown={() => press("d", true)} onPointerUp={() => press("d", false)} onPointerLeave={() => press("d", false)}>▶</button>
            </div>
            <div className="touch-turn">
              <button onPointerDown={() => press("arrowleft", true)} onPointerUp={() => press("arrowleft", false)}>↶</button>
              <button onClick={interact}>E</button>
              <button onPointerDown={() => press("arrowright", true)} onPointerUp={() => press("arrowright", false)}>↷</button>
            </div>
          </div>
        </>
      )}

      {active && (
        <div className="modal-backdrop" onClick={() => setActive(null)}>
          <article className="lore-card" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setActive(null)} aria-label="Close">×</button>
            <p className="lore-kicker">{active.kicker}</p>
            <h2>{active.title}</h2>
            <div className="lore-ornament">☩</div>
            <p className="lore-lead">{active.text}</p>
            <p className="lore-detail">{active.detail}</p>
            <button className="return-button" onClick={() => setActive(null)}>RETURN TO THE PASSAGE</button>
          </article>
        </div>
      )}

      {mapOpen && (
        <div className="modal-backdrop" onClick={() => setMapOpen(false)}>
          <article className="map-panel" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setMapOpen(false)} aria-label="Close">×</button>
            <p className="panel-kicker">PLAN OF THE SUBTERRANEAN OFFICES</p>
            <h2>The Prisoner’s Map</h2>
            <DungeonMap x={view.x} y={view.y} dir={view.dir} found={foundSet} />
            <div className="map-legend">
              <span><i className="you" /> YOUR POSITION</span>
              <span><i className="seen" /> RECORDED</span>
              <span><i className="unseen" /> UNEXAMINED</span>
            </div>
          </article>
        </div>
      )}

      {journalOpen && (
        <div className="modal-backdrop" onClick={() => setJournalOpen(false)}>
          <article className="journal-panel" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setJournalOpen(false)} aria-label="Close">×</button>
            <p className="panel-kicker">NOTES TAKEN BENEATH THE HOLY OFFICE</p>
            <h2>Journal of Places</h2>
            <div className="journal-list">
              {discoveries.map((d, index) => (
                <button
                  key={d.id}
                  className={foundSet.has(d.id) ? "found" : ""}
                  onClick={() => foundSet.has(d.id) && setActive(d)}
                  disabled={!foundSet.has(d.id)}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{foundSet.has(d.id) ? d.title : "UNRECORDED PLACE"}</strong>
                  <i>{foundSet.has(d.id) ? "READ" : "—"}</i>
                </button>
              ))}
            </div>
          </article>
        </div>
      )}

      {aboutOpen && (
        <div className="modal-backdrop about-backdrop" onClick={() => setAboutOpen(false)}>
          <article className="about-panel" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setAboutOpen(false)} aria-label="Close">×</button>
            <p className="panel-kicker">A LITERARY RECONSTRUCTION</p>
            <h2>About this exploration</h2>
            <p>
              This is an atmospheric adaptation of Chapters V, VI, and VIII in the 1834 second edition
              of W. H. Ireland’s <em>The Abbess: A Romance</em>, Volume II. It is a work of Gothic fiction,
              not a historical model of an actual Florentine building.
            </p>
            <p>
              The route, objects, inscriptions, and room names follow Ireland’s descriptions where the
              text supplies them. Spatial connections, decorative details, and the non-graphic torture
              antechamber are interpretive additions made to create a coherent place to explore.
            </p>
            <a href="https://commons.wikimedia.org/wiki/File:The_abbess_-_A_romance._(IA_abbessromance02irel).pdf" target="_blank" rel="noreferrer">
              READ THE DIGITIZED VOLUME ↗
            </a>
            <button className="return-button" onClick={() => setAboutOpen(false)}>CLOSE THE FOLIO</button>
          </article>
        </div>
      )}
    </main>
  );
}

function DungeonMap({ x, y, dir, found }: { x: number; y: number; dir: number; found: Set<string> }) {
  const scale = 12;
  return (
    <div className="map-canvas" style={{ aspectRatio: `${W}/${H}` }}>
      {WORLD.flatMap((row, gy) =>
        row.map((cell, gx) =>
          cell !== "0" ? (
            <i
              key={`${gx}-${gy}`}
              className={`map-wall material-${cell}`}
              style={{
                left: `${(gx / W) * 100}%`,
                top: `${(gy / H) * 100}%`,
                width: `${100 / W + 0.2}%`,
                height: `${100 / H + 0.2}%`,
              }}
            />
          ) : null,
        ),
      )}
      {discoveries.map((d) => (
        <b
          key={d.id}
          className={found.has(d.id) ? "map-point found" : "map-point"}
          style={{ left: `${(d.x / W) * 100}%`, top: `${(d.y / H) * 100}%` }}
          title={found.has(d.id) ? d.title : "Unexamined place"}
        />
      ))}
      <span
        className="map-player"
        style={{
          left: `${(x / W) * 100}%`,
          top: `${(y / H) * 100}%`,
          transform: `translate(-50%,-50%) rotate(${dir}rad) scale(${scale / 12})`,
        }}
      />
    </div>
  );
}

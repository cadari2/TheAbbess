"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DungeonRenderer } from "./three-world";
import {
  DISCOVERIES as discoveries,
  H,
  ROOM_ZONES as roomZones,
  W,
  WORLD,
  roomNameAtPosition,
  type Discovery,
} from "./world-data";
import {
  DOORS,
  NPCS,
  PLAYER_RADIUS,
  SPAWN,
  WORLD_MODEL,
  doorBlocksAt,
  isBlockedAt,
  overheardAt,
} from "./world/index.ts";

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

const roomName = roomNameAtPosition;

/**
 * Movement collision. Shares one implementation with the reachability tests, so
 * a corridor the suite calls walkable is the same corridor the player walks.
 */
const isBlocked = (x: number, y: number, radius = PLAYER_RADIUS) =>
  isBlockedAt(WORLD_MODEL, x, y, radius);

function initialPlayer() {
  if (typeof window !== "undefined") {
    const start = new URLSearchParams(window.location.search).get("start");
    if (start === "gate") return { x: 6.5, y: 25.6, dir: -Math.PI / 2, pitch: 0 };
    if (start === "tribunal") return { x: 16.5, y: 9.8, dir: -Math.PI / 2, pitch: 0.06 };
    if (start === "tribunal-north") return { x: 12.4, y: 7.2, dir: -0.7, pitch: 0.02 };
    if (start === "office") return { x: 5.2, y: 20.4, dir: -1.9, pitch: 0.02 };
    if (start === "cells") return { x: 29, y: 14.5, dir: -Math.PI / 2, pitch: 0 };
    if (start === "marcello") return { x: 31.6, y: 5.3, dir: 0, pitch: 0 };
    if (start === "grate") return { x: 29, y: 9.4, dir: 0, pitch: 0.16 };
    if (start === "wardrobe") return { x: 12, y: 19.9, dir: 1.3, pitch: 0 };
    if (start === "vault") return { x: 19.5, y: 22.2, dir: -Math.PI / 2, pitch: 0 };
    if (start === "groans") return { x: 20, y: 27.2, dir: Math.PI / 2, pitch: 0 };
    if (start === "moon") return { x: 29, y: 33.6, dir: -Math.PI / 2, pitch: 0.12 };
  }
  return { ...SPAWN };
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
  const [heard, setHeard] = useState<{ id: string; name: string; role: string; line: string } | null>(null);
  const [surveyed, setSurveyed] = useState<string[]>(["THE PRISON GATE"]);
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
      // Doors are tested against where their leaves actually are this frame, so
      // a gate that has begun to swing stops the player with whatever is still
      // in the way — and the approach door, which never swings, stops her for
      // good.
      const shut = (x: number, y: number) =>
        doorBlocksAt(dungeon.doorStates, DOORS, x, y, PLAYER_RADIUS);
      if (!isBlocked(nx, p.y) && !shut(nx, p.y)) p.x = nx;
      if (!isBlocked(p.x, ny) && !shut(p.x, ny)) p.y = ny;
      dungeon.render(p, time, dt * 1000);
      const d = nearestDiscovery(p.x, p.y);
      setNear((current) => (current?.id === d?.id ? current : d));
      const z = roomName(p.x, p.y);
      setZone((current) => (current === z ? current : z));
      if (time - lastViewUpdate.current > 100) {
        lastViewUpdate.current = time;
        setView({ ...p });
        setSurveyed((current) => (current.includes(z) ? current : [...current, z]));
        // Overhearing is resolved here, from a read-only view of NPC state, and
        // never inside the simulation. Nothing in `updateNpcs` is given the
        // player's position, so a line cannot begin because she arrived: she
        // walks into it and out of it, and it is spoken whether or not she is
        // there to hear it.
        const speaker = overheardAt(WORLD_MODEL, dungeon.npcStates, NPCS, p.x, p.y);
        setHeard((current) =>
          current?.id === speaker?.id && current?.line === speaker?.line
            ? current
            : speaker
              ? { id: speaker.id, name: speaker.name, role: speaker.role, line: speaker.line }
              : null,
        );
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
              You are the unnamed, cloaked stranger who once led Duca Bertocci through the Holy
              Office. Its locks answer your keys. Its servants notice the habit and overlook the man.
            </p>
            <button className="enter-button" onClick={() => setStarted(true)}>
              <span>TAKE UP THE CLOAK</span>
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
            <span>THE CLOAKED STRANGER · UNCHALLENGED</span>
            <strong>{zone}</strong>
            <i />
            <p>{found.length} / {discoveries.length} PLACES RECORDED</p>
          </aside>

          <div className="compass" aria-label={`Facing ${compass}`}>
            <span>{compass}</span>
            <i />
          </div>

          <div className="objective">
            <span>THE STRANGER’S RECORD</span>
            <div><i style={{ width: `${(found.length / discoveries.length) * 100}%` }} /></div>
            <p>{found.length === discoveries.length ? "THE RECORD IS COMPLETE" : "READ THE OFFICE FROM WITHIN"}</p>
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

          {heard && !active && !mapOpen && !journalOpen && (
            <aside className="overheard" key={`${heard.id}-${heard.line}`} aria-live="polite">
              <span>{heard.name} · {heard.role}</span>
              <p>“{heard.line}”</p>
            </aside>
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
            {active.perspective && <section className="lore-layer"><span>THE STRANGER’S KNOWLEDGE</span><p>{active.perspective}</p></section>}
            {active.interpretation && <section className="lore-layer"><span>READING THE ROOM</span><p>{active.interpretation}</p></section>}
            {active.themes && <div className="theme-list">{active.themes.map((theme) => <i key={theme}>{theme}</i>)}</div>}
            <button className="return-button" onClick={() => setActive(null)}>RETURN TO THE PASSAGE</button>
          </article>
        </div>
      )}

      {mapOpen && (
        <div className="modal-backdrop" onClick={() => setMapOpen(false)}>
          <article className="map-panel" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setMapOpen(false)} aria-label="Close">×</button>
            <p className="panel-kicker">PLAN OF THE SUBTERRANEAN OFFICES</p>
            <h2>The Stranger’s Survey</h2>
            <DungeonMap x={view.x} y={view.y} dir={view.dir} found={foundSet} surveyed={new Set(surveyed)} />
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
            <p>
              You play the unnamed guide who rescues Duca Bertocci. His universal access, the patrols,
              and their occasional dialogue extend that episode into a playable premise; the dialogue is
              newly written for this adaptation and is not quotation from Ireland.
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

function DungeonMap({ x, y, dir, found, surveyed }: { x: number; y: number; dir: number; found: Set<string>; surveyed: Set<string> }) {
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
      {roomZones.map((room) => !surveyed.has(room.name) && (
        <i key={room.name} className="map-shroud" style={{ left: `${(room.x1 / W) * 100}%`, top: `${(room.y1 / H) * 100}%`, width: `${((room.x2 - room.x1) / W) * 100}%`, height: `${((room.y2 - room.y1) / H) * 100}%` }} />
      ))}
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

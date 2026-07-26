"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Discovery = {
  id: string;
  x: number;
  y: number;
  title: string;
  kicker: string;
  text: string;
  detail: string;
};

type Prop = {
  x: number;
  y: number;
  kind:
    | "lamp"
    | "cross"
    | "table"
    | "inquisitor"
    | "secretary"
    | "prisoner"
    | "stool"
    | "rushes"
    | "mural"
    | "wardrobe"
    | "guard"
    | "door";
  scale?: number;
  tint?: string;
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

const props: Prop[] = [
  { x: 5, y: 19.2, kind: "table", scale: 0.75, tint: "#492d20" },
  { x: 4, y: 19, kind: "guard", scale: 0.85 },
  { x: 6.2, y: 19, kind: "guard", scale: 0.85 },
  { x: 17, y: 7.7, kind: "table", scale: 2.2, tint: "#160c0e" },
  { x: 17, y: 5.1, kind: "secretary", scale: 0.9 },
  { x: 17, y: 10.4, kind: "inquisitor", scale: 1.12, tint: "#8d1622" },
  { x: 14.3, y: 8.5, kind: "inquisitor", scale: 0.92 },
  { x: 14.3, y: 7.2, kind: "inquisitor", scale: 0.92 },
  { x: 14.3, y: 5.9, kind: "inquisitor", scale: 0.92 },
  { x: 14.3, y: 4.7, kind: "inquisitor", scale: 0.92 },
  { x: 17, y: 8.8, kind: "prisoner", scale: 1.05 },
  { x: 18.5, y: 9.6, kind: "stool", scale: 0.55 },
  { x: 21.3, y: 4.1, kind: "cross", scale: 2.6 },
  { x: 17, y: 7.4, kind: "lamp", scale: 1.3 },
  { x: 30, y: 8.8, kind: "rushes", scale: 1.15 },
  { x: 31.8, y: 6.3, kind: "stool", scale: 0.55 },
  { x: 28.2, y: 6.3, kind: "mural", scale: 1.35 },
  { x: 30, y: 17.7, kind: "rushes", scale: 1.15 },
  { x: 31.3, y: 15.1, kind: "cross", scale: 0.38 },
  { x: 11, y: 19.4, kind: "wardrobe", scale: 1.4 },
  { x: 19.4, y: 20.5, kind: "guard", scale: 1.18 },
  { x: 19.5, y: 20, kind: "lamp", scale: 0.85 },
  { x: 33, y: 23.2, kind: "door", scale: 1.45 },
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

function drawProp(
  ctx: CanvasRenderingContext2D,
  prop: Prop,
  px: number,
  py: number,
  dir: number,
  cw: number,
  ch: number,
  depthBuffer: Float32Array,
) {
  const dx = prop.x - px;
  const dy = prop.y - py;
  const dist = Math.hypot(dx, dy);
  let angle = Math.atan2(dy, dx) - dir;
  while (angle < -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  const fov = Math.PI / 3;
  if (Math.abs(angle) > fov * 0.68 || dist < 0.2) return;
  const screenX = cw / 2 + (angle / (fov / 2)) * (cw / 2);
  const centerCol = Math.max(0, Math.min(cw - 1, Math.floor(screenX)));
  if (dist > depthBuffer[centerCol] + 0.3) return;
  const base = (ch / Math.max(dist, 0.4)) * (prop.scale ?? 1);
  const floor = ch / 2 + ch / Math.max(dist, 1) * 0.18;
  const x = screenX;
  const y = floor;
  ctx.save();
  ctx.globalAlpha = Math.max(0.28, Math.min(1, 1.35 - dist / 18));
  const shadow = ctx.createRadialGradient(x, y, 2, x, y, base * 0.55);
  shadow.addColorStop(0, "rgba(0,0,0,.55)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(x, y, base * 0.48, base * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  const dark = "#100b0a";
  const brown = prop.tint ?? "#3d2418";
  const gold = "#d29a49";
  const red = prop.tint ?? "#7f1822";
  if (prop.kind === "lamp") {
    const glow = ctx.createRadialGradient(x, y - base * 0.9, 1, x, y - base * 0.9, base);
    glow.addColorStop(0, "rgba(255,200,103,.8)");
    glow.addColorStop(0.25, "rgba(221,139,50,.23)");
    glow.addColorStop(1, "rgba(150,62,12,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - base, y - base * 1.9, base * 2, base * 2);
    ctx.strokeStyle = "#45301f";
    ctx.lineWidth = Math.max(1, base * 0.03);
    ctx.beginPath();
    ctx.moveTo(x, y - base * 2.1);
    ctx.lineTo(x, y - base * 1.1);
    ctx.stroke();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.ellipse(x, y - base, base * 0.14, base * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop.kind === "cross") {
    ctx.fillStyle = "#24150f";
    ctx.fillRect(x - base * 0.09, y - base * 1.5, base * 0.18, base * 1.5);
    ctx.fillRect(x - base * 0.42, y - base * 1.17, base * 0.84, base * 0.16);
    ctx.strokeStyle = "#7d6750";
    ctx.lineWidth = Math.max(1, base * 0.025);
    ctx.beginPath();
    ctx.arc(x, y - base * 1.18, base * 0.13, 0, Math.PI * 2);
    ctx.moveTo(x, y - base * 1.05);
    ctx.lineTo(x, y - base * 0.58);
    ctx.moveTo(x, y - base * 0.94);
    ctx.lineTo(x - base * 0.23, y - base * 0.73);
    ctx.moveTo(x, y - base * 0.94);
    ctx.lineTo(x + base * 0.23, y - base * 0.73);
    ctx.stroke();
  } else if (prop.kind === "table") {
    ctx.fillStyle = brown;
    ctx.fillRect(x - base * 0.62, y - base * 0.54, base * 1.24, base * 0.38);
    ctx.fillStyle = "#a91e28";
    for (let i = -2; i <= 2; i++) {
      ctx.fillRect(x + i * base * 0.22 - 1, y - base * 0.42, 2, base * 0.12);
      ctx.fillRect(x + i * base * 0.22 - base * 0.04, y - base * 0.38, base * 0.08, 2);
    }
    ctx.fillStyle = dark;
    ctx.fillRect(x - base * 0.52, y - base * 0.18, base * 0.12, base * 0.23);
    ctx.fillRect(x + base * 0.4, y - base * 0.18, base * 0.12, base * 0.23);
  } else if (
    prop.kind === "inquisitor" ||
    prop.kind === "secretary" ||
    prop.kind === "guard" ||
    prop.kind === "prisoner"
  ) {
    const robe =
      prop.kind === "prisoner" ? "#756553" : prop.kind === "secretary" ? "#241810" : dark;
    ctx.fillStyle = "#b89a7c";
    ctx.beginPath();
    ctx.arc(x, y - base * 1.18, base * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = robe;
    ctx.beginPath();
    ctx.moveTo(x - base * 0.11, y - base * 1.07);
    ctx.lineTo(x - base * 0.3, y - base * 0.12);
    ctx.lineTo(x + base * 0.3, y - base * 0.12);
    ctx.lineTo(x + base * 0.11, y - base * 1.07);
    ctx.closePath();
    ctx.fill();
    if (prop.kind === "inquisitor") {
      ctx.fillStyle = "#050505";
      ctx.fillRect(x - base * 0.16, y - base * 1.34, base * 0.32, base * 0.08);
      ctx.fillStyle = red;
      ctx.fillRect(x - base * 0.025, y - base * 0.94, base * 0.05, base * 0.25);
      ctx.fillRect(x - base * 0.1, y - base * 0.86, base * 0.2, base * 0.045);
    }
    if (prop.kind === "guard") {
      ctx.fillStyle = "#0b0908";
      ctx.beginPath();
      ctx.moveTo(x - base * 0.17, y - base * 1.23);
      ctx.lineTo(x, y - base * 1.43);
      ctx.lineTo(x + base * 0.17, y - base * 1.23);
      ctx.closePath();
      ctx.fill();
    }
  } else if (prop.kind === "stool") {
    ctx.fillStyle = "#4a2b19";
    ctx.fillRect(x - base * 0.3, y - base * 0.45, base * 0.6, base * 0.16);
    ctx.fillRect(x - base * 0.22, y - base * 0.29, base * 0.08, base * 0.29);
    ctx.fillRect(x + base * 0.14, y - base * 0.29, base * 0.08, base * 0.29);
  } else if (prop.kind === "rushes") {
    ctx.fillStyle = "#5b4a24";
    ctx.beginPath();
    ctx.ellipse(x, y - base * 0.12, base * 0.55, base * 0.22, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#a58842";
    ctx.lineWidth = 1;
    for (let i = -5; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * base * 0.08, y - base * 0.28);
      ctx.lineTo(x + i * base * 0.1, y);
      ctx.stroke();
    }
  } else if (prop.kind === "mural") {
    ctx.fillStyle = "#2a160f";
    ctx.fillRect(x - base * 0.5, y - base * 1.45, base, base * 1.35);
    ctx.fillStyle = "#7c261e";
    ctx.beginPath();
    ctx.moveTo(x, y - base * 1.34);
    ctx.lineTo(x - base * 0.34, y - base * 0.48);
    ctx.lineTo(x + base * 0.34, y - base * 0.48);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(x - base * 0.11, y - base * 1.12, base * 0.035, 0, Math.PI * 2);
    ctx.arc(x + base * 0.11, y - base * 1.12, base * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ab8a59";
    ctx.lineWidth = Math.max(1, base * 0.016);
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(x - base * 0.44, y - base * (0.37 - i * 0.035));
      ctx.lineTo(x + base * 0.36, y - base * (0.37 - i * 0.035));
      ctx.stroke();
    }
  } else if (prop.kind === "wardrobe") {
    ctx.fillStyle = "#321c13";
    ctx.fillRect(x - base * 0.42, y - base * 1.35, base * 0.84, base * 1.25);
    ctx.fillStyle = "#100b0b";
    ctx.fillRect(x - base * 0.32, y - base * 1.22, base * 0.64, base * 1.02);
    ctx.fillStyle = "#1d1513";
    ctx.beginPath();
    ctx.moveTo(x - base * 0.1, y - base * 1.15);
    ctx.lineTo(x - base * 0.32, y - base * 0.36);
    ctx.lineTo(x + base * 0.25, y - base * 0.24);
    ctx.lineTo(x + base * 0.08, y - base * 1.15);
    ctx.closePath();
    ctx.fill();
  } else if (prop.kind === "door") {
    ctx.fillStyle = "#160f0c";
    ctx.fillRect(x - base * 0.38, y - base * 1.45, base * 0.76, base * 1.42);
    ctx.strokeStyle = "#6f5439";
    ctx.lineWidth = Math.max(1, base * 0.035);
    ctx.strokeRect(x - base * 0.34, y - base * 1.4, base * 0.68, base * 1.34);
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(x + base * 0.22, y - base * 0.65, base * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function renderWorld(
  canvas: HTMLCanvasElement,
  px: number,
  py: number,
  dir: number,
  time: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(1.45, window.devicePixelRatio || 1);
  const cw = Math.max(480, Math.floor(canvas.clientWidth * dpr));
  const ch = Math.max(300, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }

  const upper = ctx.createLinearGradient(0, 0, 0, ch * 0.55);
  upper.addColorStop(0, "#0e0b0a");
  upper.addColorStop(0.6, "#211610");
  upper.addColorStop(1, "#49301e");
  ctx.fillStyle = upper;
  ctx.fillRect(0, 0, cw, ch / 2);
  const floor = ctx.createLinearGradient(0, ch / 2, 0, ch);
  floor.addColorStop(0, "#3b281b");
  floor.addColorStop(1, "#100c09");
  ctx.fillStyle = floor;
  ctx.fillRect(0, ch / 2, cw, ch / 2);

  const fov = Math.PI / 3;
  const depthBuffer = new Float32Array(cw);
  const step = Math.max(1, Math.floor(cw / 720));
  for (let sx = 0; sx < cw; sx += step) {
    const rayAngle = dir - fov / 2 + (sx / cw) * fov;
    const rayX = Math.cos(rayAngle);
    const rayY = Math.sin(rayAngle);
    let mapX = Math.floor(px);
    let mapY = Math.floor(py);
    const deltaX = Math.abs(1 / (rayX || 0.0001));
    const deltaY = Math.abs(1 / (rayY || 0.0001));
    const stepX = rayX < 0 ? -1 : 1;
    const stepY = rayY < 0 ? -1 : 1;
    let sideX = rayX < 0 ? (px - mapX) * deltaX : (mapX + 1 - px) * deltaX;
    let sideY = rayY < 0 ? (py - mapY) * deltaY : (mapY + 1 - py) * deltaY;
    let side = 0;
    let material = "1";
    for (let i = 0; i < 64; i++) {
      if (sideX < sideY) {
        sideX += deltaX;
        mapX += stepX;
        side = 0;
      } else {
        sideY += deltaY;
        mapY += stepY;
        side = 1;
      }
      if (mapY < 0 || mapX < 0 || mapY >= H || mapX >= W) break;
      if (WORLD[mapY][mapX] !== "0") {
        material = WORLD[mapY][mapX];
        break;
      }
    }
    const rawDist =
      side === 0
        ? (mapX - px + (1 - stepX) / 2) / (rayX || 0.0001)
        : (mapY - py + (1 - stepY) / 2) / (rayY || 0.0001);
    const dist = Math.max(0.1, rawDist * Math.cos(rayAngle - dir));
    for (let z = sx; z < Math.min(cw, sx + step); z++) depthBuffer[z] = dist;
    const wallH = Math.min(ch * 1.8, ch / dist);
    const top = (ch - wallH) / 2;
    const wallXRaw = side === 0 ? py + rawDist * rayY : px + rawDist * rayX;
    const tex = wallXRaw - Math.floor(wallXRaw);
    const fog = Math.max(0.24, 1 - dist / 24);
    let base = material === "2" ? [88, 50, 33] : material === "3" ? [78, 70, 59] : material === "4" ? [66, 48, 37] : [72, 62, 49];
    const mortar = Math.sin(tex * Math.PI * 9) * 5;
    const shade = (side ? 0.72 : 0.9) * fog;
    ctx.fillStyle = `rgb(${base[0] * shade + mortar},${base[1] * shade + mortar},${base[2] * shade + mortar})`;
    ctx.fillRect(sx, top, step + 1, wallH);
    if (material === "2") {
      ctx.fillStyle = `rgba(161,25,35,${0.9 * fog})`;
      if (Math.abs(tex - 0.5) < 0.055) ctx.fillRect(sx, top + wallH * 0.24, step + 1, wallH * 0.48);
      ctx.fillRect(sx, top + wallH * 0.44, step + 1, wallH * 0.105);
      ctx.fillStyle = `rgba(9,5,4,${0.5 * fog})`;
      ctx.fillRect(sx, top + wallH * 0.68, step + 1, wallH * 0.32);
    }
    if (material === "3" && (Math.floor(tex * 8) + mapY + mapX) % 5 === 0) {
      ctx.fillStyle = `rgba(8,6,5,${0.45 * fog})`;
      ctx.fillRect(sx, top + wallH * 0.08, step + 1, wallH * 0.68);
    }
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.62, dist / 30)})`;
    ctx.fillRect(sx, top, step + 1, wallH);
  }

  [...props]
    .sort((a, b) => Math.hypot(b.x - px, b.y - py) - Math.hypot(a.x - px, a.y - py))
    .forEach((prop) => drawProp(ctx, prop, px, py, dir, cw, ch, depthBuffer));

  const zone = roomName(px, py);
  if (zone === "THE TRIBUNAL CHAMBER") {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `${Math.max(10, cw * 0.012)}px Georgia`;
    ctx.fillStyle = "rgba(206,165,104,.68)";
    ctx.fillText("MISERICORDIA  ET  JUSTITIA", cw / 2, ch * 0.18);
    ctx.restore();
  }

  const lampFlicker = 0.94 + Math.sin(time / 137) * 0.025 + Math.sin(time / 79) * 0.018;
  const glow = ctx.createRadialGradient(cw / 2, ch * 0.48, ch * 0.03, cw / 2, ch * 0.48, ch * 0.62);
  glow.addColorStop(0, `rgba(238,157,72,${0.17 * lampFlicker})`);
  glow.addColorStop(0.55, "rgba(90,44,19,.015)");
  glow.addColorStop(1, "rgba(0,0,0,.48)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, cw, ch);

  ctx.fillStyle = "rgba(227,200,155,.6)";
  ctx.fillRect(cw / 2 - 1, ch / 2 - 7, 2, 14);
  ctx.fillRect(cw / 2 - 7, ch / 2 - 1, 14, 2);
}

export default function InquisitionGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const player = useRef({ x: 5, y: 24.5, dir: -Math.PI / 2 });
  const keys = useRef(new Set<string>());
  const drag = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const last = useRef(0);
  const [started, setStarted] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [active, setActive] = useState<Discovery | null>(null);
  const [found, setFound] = useState<string[]>([]);
  const [near, setNear] = useState<Discovery | null>(null);
  const [zone, setZone] = useState("THE PRISON GATE");
  const [sound, setSound] = useState(true);
  const audioRef = useRef<AudioContext | null>(null);

  const foundSet = useMemo(() => new Set(found), [found]);

  const toggleSound = useCallback(() => {
    setSound((v) => !v);
  }, []);

  const interact = useCallback(() => {
    const d = nearestDiscovery(player.current.x, player.current.y);
    if (!d) return;
    setActive(d);
    setFound((current) => (current.includes(d.id) ? current : [...current, d.id]));
  }, []);

  useEffect(() => {
    if (!started) return;
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.key.toLowerCase());
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) e.preventDefault();
      if (e.key.toLowerCase() === "e") interact();
      if (e.key.toLowerCase() === "m") setMapOpen((v) => !v);
      if (e.key.toLowerCase() === "j") setJournalOpen((v) => !v);
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
      const pad = 0.19;
      if (!isWall(nx + Math.sign(nx - p.x) * pad, p.y)) p.x = nx;
      if (!isWall(p.x, ny + Math.sign(ny - p.y) * pad)) p.y = ny;
      renderWorld(canvas, p.x, p.y, p.dir, time);
      const d = nearestDiscovery(p.x, p.y);
      setNear((current) => (current?.id === d?.id ? current : d));
      const z = roomName(p.x, p.y);
      setZone((current) => (current === z ? current : z));
      frame.current = requestAnimationFrame(loop);
    };
    frame.current = requestAnimationFrame(loop);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
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
      setSound(false);
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

  const direction = ((player.current.dir * 180) / Math.PI + 450) % 360;
  const compass = direction < 45 || direction >= 315 ? "N" : direction < 135 ? "E" : direction < 225 ? "S" : "W";

  return (
    <main className="game-shell">
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
              drag.current = e.clientX;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (drag.current === null) return;
              player.current.dir += (e.clientX - drag.current) * 0.004;
              drag.current = e.clientX;
            }}
            onPointerUp={() => (drag.current = null)}
          />
          <div className="vignette" />
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
            <DungeonMap x={player.current.x} y={player.current.y} dir={player.current.dir} found={foundSet} />
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

// Phase 1 harness: one NPC, one light, one camera, no dungeon, no game logic.
//
// This is the scene the character material work is iterated against. It builds
// figures through the same makePerson / createDungeonMaterials path the game
// ships, so whatever looks right here looks right in the tribunal.
//
// Deliberately unlike preview/lab.ts: that rig floods the cast with hemisphere
// and directional fill to judge silhouettes. The reference look depends on the
// ABSENCE of indirect light, so this rig has exactly one warm point light and
// no ambient term at all. Anything that reads well under a single lamp here is
// reading from real shading, not from fill.
//
//   npx vite --config preview/vite.config.mts   →   /npc-lab.html
//
// URL hash selects the figure:  #prisoner #general #inquisitor #secretary
//                               #familiar #masked
import * as THREE from "three";
import { createDungeonMaterials, makePerson } from "../app/three-world";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLDivElement;

// Renderer state mirrors DungeonRenderer exactly. Tone mapping and output
// colour space especially: matching the reference in a differently-managed
// pipeline would prove nothing.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.LinearToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft is deprecated and resolves to this

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0d0b08");
const camera = new THREE.PerspectiveCamera(38, 1, 0.02, 40);

const { materials } = createDungeonMaterials(renderer);

// A floor only so the key light has something to drop a shadow onto; it is not
// part of what is being judged.
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(14, 14),
  new THREE.MeshStandardMaterial({ color: "#2a251d", roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// THE one light. Warm, dominant, hard-ish falloff, no ambient companion.
const key = new THREE.PointLight("#f0a85a", 22, 18, 1.6);
key.position.set(1.5, 2.5, -2.2);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.bias = -0.0015;
key.shadow.normalBias = 0.02;
scene.add(key);

const lampBulb = new THREE.Mesh(
  new THREE.SphereGeometry(0.05, 8, 6),
  new THREE.MeshBasicMaterial({ color: "#ffd078" }),
);
lampBulb.position.copy(key.position);
scene.add(lampBulb);

type Figure = { label: string; options: Parameters<typeof makePerson>[1] };
const figures: Record<string, Figure> = {
  prisoner: { label: "prisoner (bound)", options: { prisoner: true, face: "young", scale: 1.04 } },
  general: {
    label: "inquisitor-general",
    options: { cap: true, cross: true, crimsonTassel: true, seated: true, beard: true, face: "mature", scale: 1.08 },
  },
  inquisitor: {
    label: "inquisitor (seated)",
    options: { cap: true, seated: true, face: "elder", hair: true, scale: 0.92 },
  },
  secretary: {
    label: "secretary",
    options: { seated: true, hair: true, face: "secretary", garment: "clerk", scale: 0.9, robe: "#1c1511" },
  },
  familiar: { label: "familiar (hooded)", options: { hood: true, scale: 0.98 } },
  masked: { label: "masked official", options: { hood: true, masked: true, scale: 1.1 } },
};

let current: THREE.Object3D | null = null;
let currentKey = "prisoner";
let meshCount = 0;
let triCount = 0;

function build(key: string) {
  if (!figures[key]) key = "prisoner";
  currentKey = key;
  if (current) {
    scene.remove(current);
    current.traverse((item) => {
      const item3d = item as THREE.Mesh;
      if (item3d.isMesh) item3d.geometry.dispose();
    });
  }
  current = makePerson(materials, figures[key].options);
  scene.add(current);

  meshCount = 0;
  triCount = 0;
  current.traverse((item) => {
    const item3d = item as THREE.Mesh;
    if (!item3d.isMesh) return;
    meshCount++;
    const position = item3d.geometry.getAttribute("position");
    triCount += item3d.geometry.index ? item3d.geometry.index.count / 3 : position.count / 3;
  });
}

// Camera: orbit around a target height so a head can actually be framed. The
// existing lab hardcodes lookAt y=1.0, which puts every face off-screen.
let orbit = Math.PI;
let distance = 2.6;
let targetY = 1.15;
let elevation = 0.12;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") orbit -= 0.1;
  if (event.key === "ArrowRight") orbit += 0.1;
  if (event.key === "ArrowUp") distance = clamp(distance - 0.15, 0.35, 12);
  if (event.key === "ArrowDown") distance = clamp(distance + 0.15, 0.35, 12);
  if (event.key === "w") targetY += 0.06;
  if (event.key === "s") targetY -= 0.06;
  if (event.key === "q") elevation = clamp(elevation + 0.08, -1.2, 1.2);
  if (event.key === "e") elevation = clamp(elevation - 0.08, -1.2, 1.2);
  if (event.key === "f") build(currentKey); // rebuild after an HMR edit
});

let dragging: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", (event) => {
  dragging = { x: event.clientX, y: event.clientY };
});
addEventListener("pointerup", () => {
  dragging = null;
});
addEventListener("pointermove", (event) => {
  if (!dragging) return;
  orbit += (event.clientX - dragging.x) * 0.008;
  elevation = clamp(elevation - (event.clientY - dragging.y) * 0.005, -1.2, 1.2);
  dragging = { x: event.clientX, y: event.clientY };
});
addEventListener("wheel", (event) => {
  distance = clamp(distance + event.deltaY * 0.002, 0.35, 12);
});
addEventListener("hashchange", () => build(location.hash.slice(1)));

// Hooks so a headless driver can pose the rig deterministically.
Object.assign(window as unknown as Record<string, unknown>, {
  setView: (o: number, d: number, ty: number, el = elevation) => {
    orbit = o;
    distance = d;
    targetY = ty;
    elevation = el;
  },
  setFigure: (name: string) => build(name),
  setLight: (x: number, y: number, z: number, intensity = key.intensity) => {
    key.position.set(x, y, z);
    lampBulb.position.set(x, y, z);
    key.intensity = intensity;
  },
  stats: () => ({
    figure: figures[currentKey].label,
    meshes: meshCount,
    triangles: triCount,
    drawCalls: renderer.info.render.calls,
    trianglesDrawn: renderer.info.render.triangles,
    programs: renderer.info.programs?.length ?? 0,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  }),
});

build(location.hash.slice(1) || "prisoner");

let smoothedMs = 16;
let previous = performance.now();

function frame() {
  const now = performance.now();
  smoothedMs += ((now - previous) - smoothedMs) * 0.08;
  previous = now;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.floor(width * renderer.getPixelRatio())) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const horizontal = Math.cos(elevation) * distance;
  camera.position.set(
    Math.sin(orbit) * horizontal,
    targetY + Math.sin(elevation) * distance,
    Math.cos(orbit) * horizontal,
  );
  camera.lookAt(0, targetY, 0);
  renderer.render(scene, camera);

  hud.innerHTML =
    `<b>${figures[currentKey].label}</b>  [${Object.keys(figures).join(" ")}]\n` +
    `meshes ${meshCount}   tris ${triCount}\n` +
    `draw calls ${renderer.info.render.calls}   drawn tris ${renderer.info.render.triangles}\n` +
    `programs ${renderer.info.programs?.length ?? 0}   geo ${renderer.info.memory.geometries}   tex ${renderer.info.memory.textures}\n` +
    `frame ${smoothedMs.toFixed(1)} ms   orbit ${orbit.toFixed(2)}  dist ${distance.toFixed(2)}  targetY ${targetY.toFixed(2)}\n` +
    `drag / wheel / arrows · w,s target · q,e elevation · f rebuild`;

  requestAnimationFrame(frame);
}
frame();

// Character lab: isolates makePerson on a neutral turntable so model work can
// be judged without the dungeon's heavy amber lighting hiding the silhouette.
import * as THREE from "three";
import { createDungeonMaterials, makeChair, makePerson, makeTable } from "../app/three-world";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft is deprecated and resolves to this

const scene = new THREE.Scene();
scene.background = new THREE.Color("#1b1813");
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 60);

const { materials } = createDungeonMaterials(renderer);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(24, 24),
  new THREE.MeshStandardMaterial({ color: "#3c362c", roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

scene.add(new THREE.HemisphereLight("#cbbca6", "#3a3229", 2.4));
const key = new THREE.DirectionalLight("#ffe6c2", 3.4);
key.position.set(3.5, 6, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -8;
key.shadow.camera.right = 8;
key.shadow.camera.top = 8;
key.shadow.camera.bottom = -8;
scene.add(key);
const fill = new THREE.DirectionalLight("#7f9bc4", 0.6);
fill.position.set(-5, 3, -4);
scene.add(fill);

type Cast = { label: string; build: () => THREE.Object3D };
const cast: Cast[] = [
  {
    label: "prisoner",
    build: () => makePerson(materials, { prisoner: true, face: "young", scale: 1.04 }),
  },
  {
    label: "inquisitor-general",
    build: () =>
      makePerson(materials, {
        cap: true,
        cross: true,
        crimsonTassel: true,
        seated: true,
        beard: true,
        face: "mature",
        scale: 1.08,
      }),
  },
  {
    label: "inquisitor-seated",
    build: () =>
      makePerson(materials, { cap: true, seated: true, face: "elder", hair: true, scale: 0.92 }),
  },
  {
    label: "secretary",
    build: () =>
      makePerson(materials, { seated: true, hair: true, face: "secretary", scale: 0.9, robe: "#1c1511" }),
  },
  { label: "familiar-hooded", build: () => makePerson(materials, { hood: true, scale: 0.98 }) },
  { label: "masked", build: () => makePerson(materials, { hood: true, masked: true, scale: 1.1 }) },
];

const stage = new THREE.Group();
scene.add(stage);
cast.forEach((entry, index) => {
  const slot = new THREE.Group();
  slot.position.x = (index - (cast.length - 1) / 2) * 1.5;
  const person = entry.build();
  slot.add(person);
  if (entry.label.includes("seated") || entry.label.includes("general") || entry.label === "secretary") {
    // Chair backs sit at local +Z and characters face -Z, so an unrotated
    // chair placed just behind the figure seats them correctly.
    const chair = makeChair(materials, entry.label.includes("general"));
    chair.position.z = 0.24;
    slot.add(chair);
  }
  stage.add(slot);
});

const table = makeTable(materials, 9.5, 1.1, true);
table.position.set(0, 0, -1.55);
table.visible = false;
scene.add(table);

let orbit = 0;
let distance = 6.2;
let height = 1.6;
let single = -1;

addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") orbit -= 0.12;
  if (event.key === "ArrowRight") orbit += 0.12;
  if (event.key === "ArrowUp") distance = Math.max(1, distance - 0.3);
  if (event.key === "ArrowDown") distance += 0.3;
  if (event.key === "w") height += 0.12;
  if (event.key === "s") height -= 0.12;
  if (event.key === "t") table.visible = !table.visible;
  if (/^[0-6]$/.test(event.key)) single = Number(event.key) - 1;
});

Object.assign(window as unknown as Record<string, unknown>, {
  setView: (o: number, d: number, h: number) => {
    orbit = o;
    distance = d;
    height = h;
  },
  focus: (index: number) => {
    single = index;
  },
  toggleTable: (on: boolean) => {
    table.visible = on;
  },
});

function frame() {
  const width = canvas.clientWidth;
  const heightPx = canvas.clientHeight;
  if (canvas.width !== width * renderer.getPixelRatio()) {
    renderer.setSize(width, heightPx, false);
    camera.aspect = width / heightPx;
    camera.updateProjectionMatrix();
  }
  const targetX = single >= 0 ? (single - (cast.length - 1) / 2) * 1.5 : 0;
  camera.position.set(
    targetX + Math.sin(orbit) * distance,
    height,
    Math.cos(orbit) * distance,
  );
  camera.lookAt(targetX, 1.0, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

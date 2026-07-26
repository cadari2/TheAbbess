import * as THREE from "three";
import { DungeonRenderer } from "../app/three-world";

const W = 36, H = 28;
function createWorld() {
  const grid: string[][] = Array.from({ length: H }, () => Array(W).fill("1"));
  const boundary = (x1:number,y1:number,x2:number,y2:number,material="1") => {
    for (let y=y1;y<=y2;y++) for (let x=x1;x<=x2;x++)
      grid[y][x] = (x===x1||x===x2||y===y1||y===y2) ? material : "0";
  };
  const carve = (x1:number,y1:number,x2:number,y2:number) => {
    for (let y=y1;y<=y2;y++) for (let x=x1;x<=x2;x++) grid[y][x] = "0";
  };
  boundary(2,22,8,26,"4"); boundary(2,17,8,21,"1"); carve(5,21,5,22); carve(5,6,6,17);
  boundary(9,3,24,12,"2"); carve(6,8,9,9); carve(15,12,16,17);
  boundary(27,4,33,10,"3"); carve(24,7,27,8); carve(16,14,27,16); carve(27,15,27,16);
  boundary(27,13,33,19,"3"); carve(8,19,10,20); boundary(10,18,14,22,"4");
  carve(14,20,17,21); boundary(17,18,22,24,"1"); carve(22,21,24,22);
  boundary(24,20,30,26,"4"); carve(30,23,32,24); boundary(32,21,34,26,"1");
  return grid;
}

const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new DungeonRenderer(canvas, createWorld());

// Camera pose driven by URL hash: #x,z,dir,pitch
function pose() {
  const parts = location.hash.slice(1).split(",").map(Number);
  return {
    x: parts[0] || 17,
    y: parts[1] || 12,
    dir: parts[2] ?? -Math.PI / 2,
    pitch: parts[3] ?? 0,
  };
}
let p = pose();
addEventListener("hashchange", () => { p = pose(); });

// The renderer keeps its scene private to the game; the preview reaches in
// deliberately so a browser console can inspect what is actually being drawn.
const internals = renderer as unknown as { scene: THREE.Scene };
const debugHooks: Record<string, unknown> = { dungeon: renderer };

debugHooks.setPose = (x: number, z: number, dir: number, pitch = 0) => {
  p = { x, y: z, dir, pitch };
};

// Debug hook: list meshes whose world position is near a point.
debugHooks.near = (x: number, y: number, z: number, radius = 0.6) => {
  const target = new THREE.Vector3(x, y, z);
  const found: unknown[] = [];
  internals.scene.updateMatrixWorld(true);
  internals.scene.traverse((item) => {
    if (!(item as THREE.Mesh).isMesh) return;
    const at = new THREE.Vector3().setFromMatrixPosition(item.matrixWorld);
    if (at.distanceTo(target) > radius) return;
    const material = (item as THREE.Mesh).material as THREE.MeshStandardMaterial;
    found.push({
      geometry: (item as THREE.Mesh).geometry.type,
      at: at.toArray().map((v) => Number(v.toFixed(2))),
      color: material?.color?.getHexString(),
      metalness: material?.metalness,
      roughness: material?.roughness,
      emissive: material?.emissive?.getHexString(),
    });
  });
  return found;
};

// Debug hook: cast a ray from the current pose and report what it strikes.
debugHooks.probe = (yawOffset = 0, pitch = 0) => {
  const origin = new THREE.Vector3(p.x, 1.62, p.y);
  const direction = new THREE.Vector3(
    Math.cos(p.dir + yawOffset),
    Math.tan(pitch),
    Math.sin(p.dir + yawOffset),
  ).normalize();
  const ray = new THREE.Raycaster(origin, direction);
  return ray.intersectObjects(internals.scene.children, true).slice(0, 5).map((hit) => ({
    geometry: (hit.object as THREE.Mesh).geometry?.type,
    color: ((hit.object as THREE.Mesh).material as THREE.MeshStandardMaterial)?.color?.getHexString(),
    distance: Number(hit.distance.toFixed(2)),
    point: hit.point.toArray().map((v) => Number(v.toFixed(2))),
  }));
};

Object.assign(window, debugHooks);

function frame(t: number) { renderer.render(p, t); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

import * as THREE from "three";
import { DungeonRenderer } from "../app/three-world";

import { WORLD } from "../app/world-data";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new DungeonRenderer(canvas, WORLD);

// `?hide=characters` blanks every character-shaded mesh before the first frame,
// for telling apart which material a WebGL warning belongs to.
{
  const hide = new URLSearchParams(location.search).get("hide");
  const scene = (renderer as unknown as { scene: THREE.Scene }).scene;
  if (hide === "characters") {
    scene.traverse((item) => {
      const material = (item as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
      if (material?.isShaderMaterial) item.visible = false;
    });
  }
  // `?moonshadow=0` switches the cell gratings' moon spots to unshadowed, for
  // telling a light that is occluded from one that is not reaching at all.
  if (new URLSearchParams(location.search).get("moonshadow") === "0") {
    scene.traverse((item) => {
      const light = item as THREE.SpotLight;
      if (light.isSpotLight && light.position.x > 48 && light.position.x < 49) light.castShadow = false;
    });
  }
}

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

// `?held=moon-key` walks with the key in hand, so the moon door can be seen
// open from the harness; `?open=moon-door` throws that door wide at once.
const held = new Set((new URLSearchParams(location.search).get("held") ?? "").split(",").filter(Boolean));
{
  const open = new URLSearchParams(location.search).get("open");
  const state = renderer.doorStates.find((door) => door.id === open);
  if (state) state.open = 1;
}
function frame(t: number) { renderer.render(p, t, 16.7, held); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

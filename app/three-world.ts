import * as THREE from "three";

export type PlayerView = {
  x: number;
  y: number;
  dir: number;
  pitch: number;
};

type Grid = string[][];

const WALL_HEIGHT = 4.2;
const EYE_HEIGHT = 1.62;

export type DungeonCollider =
  | { shape: "box"; x: number; z: number; halfX: number; halfZ: number }
  | { shape: "circle"; x: number; z: number; radius: number };

// Collision volumes mirror the substantial room props created below.
export const DUNGEON_COLLIDERS: DungeonCollider[] = [
  { shape: "box", x: 5, z: 25.72, halfX: 2.15, halfZ: 0.16 },
  { shape: "circle", x: 3.25, z: 24.4, radius: 0.42 },
  { shape: "box", x: 6.75, z: 24.7, halfX: 0.48, halfZ: 0.48 },
  { shape: "circle", x: 3.35, z: 23.3, radius: 0.38 },
  { shape: "box", x: 5.15, z: 19.4, halfX: 1.3, halfZ: 0.62 },
  { shape: "circle", x: 4.35, z: 18.48, radius: 0.4 },
  { shape: "circle", x: 5.95, z: 18.48, radius: 0.4 },
  { shape: "box", x: 17, z: 7.65, halfX: 1.28, halfZ: 2.78 },
  { shape: "box", x: 17, z: 10.2, halfX: 1.4, halfZ: 0.9 },
  { shape: "circle", x: 15.45, z: 5.15, radius: 0.38 },
  { shape: "circle", x: 15.45, z: 6.45, radius: 0.38 },
  { shape: "circle", x: 15.45, z: 7.75, radius: 0.38 },
  { shape: "circle", x: 15.45, z: 9.05, radius: 0.38 },
  { shape: "circle", x: 17, z: 4.5, radius: 0.38 },
  { shape: "circle", x: 18.55, z: 8.65, radius: 0.42 },
  { shape: "circle", x: 18.6, z: 9.65, radius: 0.35 },
  { shape: "box", x: 30.7, z: 9.25, halfX: 0.46, halfZ: 0.92 },
  { shape: "circle", x: 31.65, z: 6.15, radius: 0.3 },
  { shape: "box", x: 30.7, z: 17.6, halfX: 0.46, halfZ: 0.92 },
  { shape: "box", x: 10.7, z: 19.6, halfX: 0.5, halfZ: 0.9 },
  { shape: "box", x: 12.65, z: 21.25, halfX: 0.9, halfZ: 0.36 },
  { shape: "circle", x: 19.5, z: 20.25, radius: 0.44 },
  { shape: "box", x: 24.15, z: 22, halfX: 0.15, halfZ: 1.65 },
  { shape: "box", x: 27.3, z: 23.1, halfX: 1.28, halfZ: 0.95 },
  { shape: "box", x: 28.9, z: 24.4, halfX: 0.92, halfZ: 1.08 },
];

export function hitsDungeonCollider(x: number, z: number, radius = 0.22) {
  return DUNGEON_COLLIDERS.some((collider) => {
    if (collider.shape === "circle") {
      return Math.hypot(x - collider.x, z - collider.z) < radius + collider.radius;
    }
    const nearestX = Math.max(
      collider.x - collider.halfX,
      Math.min(x, collider.x + collider.halfX),
    );
    const nearestZ = Math.max(
      collider.z - collider.halfZ,
      Math.min(z, collider.z + collider.halfZ),
    );
    return Math.hypot(x - nearestX, z - nearestZ) < radius;
  });
}

function standard(
  color: THREE.ColorRepresentation,
  roughness = 0.9,
  metalness = 0,
) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  shadows = true,
) {
  const result = new THREE.Mesh(geometry, material);
  result.castShadow = shadows;
  result.receiveShadow = shadows;
  return result;
}

function addBox(
  parent: THREE.Object3D,
  material: THREE.Material,
  size: [number, number, number],
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
) {
  const item = mesh(new THREE.BoxGeometry(...size), material);
  item.position.set(...position);
  item.rotation.set(...rotation);
  parent.add(item);
  return item;
}

function addCylinder(
  parent: THREE.Object3D,
  material: THREE.Material,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  segments = 8,
) {
  const item = mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material,
  );
  item.position.set(...position);
  item.rotation.set(...rotation);
  parent.add(item);
  return item;
}

function addLimb(
  parent: THREE.Object3D,
  material: THREE.Material,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radiusStart: number,
  radiusEnd = radiusStart,
  segments = 9,
) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const item = mesh(
    new THREE.CylinderGeometry(radiusEnd, radiusStart, length, segments),
    material,
  );
  item.position.copy(start).add(end).multiplyScalar(0.5);
  item.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  parent.add(item);
  return item;
}

/** A rounded cap at a limb joint so consecutive segments read as continuous. */
function addJoint(
  parent: THREE.Object3D,
  material: THREE.Material,
  at: THREE.Vector3,
  radius: number,
) {
  const item = mesh(new THREE.SphereGeometry(radius, 8, 6), material);
  item.position.copy(at);
  parent.add(item);
  return item;
}

function makeCanvasTexture(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) paint(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeCross(
  wood: THREE.Material,
  figureMaterial: THREE.Material,
  scale = 1,
) {
  const group = new THREE.Group();
  addBox(group, wood, [0.13, 2.15, 0.13], [0, 1.075, 0]);
  addBox(group, wood, [1.02, 0.13, 0.13], [0, 1.49, 0]);

  // The corpus is deliberately shallow and close to the timber. The old
  // version used long, independently rotated cylinders which read as giant
  // arcs when the cross was viewed obliquely.
  const head = mesh(new THREE.IcosahedronGeometry(0.105, 1), figureMaterial);
  head.position.set(0, 1.52, -0.09);
  group.add(head);
  addCylinder(group, figureMaterial, 0.085, 0.115, 0.58, [0, 1.18, -0.09], [0.03, 0, 0], 7);
  addLimb(
    group,
    figureMaterial,
    new THREE.Vector3(-0.38, 1.47, -0.09),
    new THREE.Vector3(0.38, 1.47, -0.09),
    0.045,
    0.052,
    7,
  );
  addLimb(
    group,
    figureMaterial,
    new THREE.Vector3(-0.075, 0.94, -0.09),
    new THREE.Vector3(-0.11, 0.55, -0.09),
    0.055,
    0.045,
    7,
  );
  addLimb(
    group,
    figureMaterial,
    new THREE.Vector3(0.075, 0.94, -0.09),
    new THREE.Vector3(0.11, 0.55, -0.09),
    0.055,
    0.045,
    7,
  );
  group.scale.setScalar(scale);
  return group;
}

function makeScarletCross(material: THREE.Material, scale = 1) {
  const group = new THREE.Group();
  addBox(group, material, [0.12, 0.78, 0.035], [0, 0, 0]);
  addBox(group, material, [0.48, 0.12, 0.035], [0, 0.1, 0.005]);
  group.scale.setScalar(scale);
  return group;
}

type PersonOptions = {
  robe?: THREE.ColorRepresentation;
  skin?: THREE.ColorRepresentation;
  cap?: boolean;
  hood?: boolean;
  masked?: boolean;
  cross?: boolean;
  crimsonTassel?: boolean;
  prisoner?: boolean;
  seated?: boolean;
  beard?: boolean;
  hair?: boolean;
  face?: "mature" | "elder" | "secretary" | "young";
  scale?: number;
};

// Head radius before the per-axis skull scaling below. Faces, hoods, caps and
// the neck are all sized from this so they stay locked together.
const HEAD_RADIUS = 0.145;
const HEAD_SCALE = new THREE.Vector3(0.84, 1.12, 0.9);
// Horizontal half-angle of the textured face shell. Just past 80 degrees puts
// the seam on the head's silhouette, where it is effectively invisible.
const FACE_HALF_SPAN = 1.45;
// Sub-rectangle of the portrait textures that actually contains the head.
const FACE_BOUNDS = { u0: 0.175, u1: 0.825, v0: 0.075, v1: 0.965 };

/**
 * Rewrites a geometry's UVs so a cap of a sphere samples a portrait texture as
 * a cylindrical unwrap: horizontal texture position follows the angle around
 * the head, vertical follows true height. This keeps eyes, nose and mouth
 * evenly spaced instead of bunching them toward the crown the way a raw
 * spherical unwrap does.
 */
function projectFaceUv(geometry: THREE.BufferGeometry, halfSpan: number) {
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const height = Math.max(1e-5, box.max.y - box.min.y);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    // Characters face -Z, so the face shell is centred on that direction.
    const angle = Math.atan2(x, -z);
    const u = THREE.MathUtils.clamp(angle / (halfSpan * 2) + 0.5, 0, 1);
    const v = (y - box.min.y) / height;
    uv.setXY(
      i,
      FACE_BOUNDS.u0 + u * (FACE_BOUNDS.u1 - FACE_BOUNDS.u0),
      FACE_BOUNDS.v0 + v * (FACE_BOUNDS.v1 - FACE_BOUNDS.v0),
    );
  }
  uv.needsUpdate = true;
  return geometry;
}

/**
 * Rescales a geometry's UVs into a sub-rectangle of its texture, so one
 * garment sheet can clothe several separate body volumes without the design
 * repeating on each of them.
 */
function remapUv(
  geometry: THREE.BufferGeometry,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
) {
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
  return geometry;
}

/** A garment volume whose texture is mapped onto the body itself. */
function addGarmentVolume(
  parent: THREE.Object3D,
  material: THREE.Material,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  position: [number, number, number],
  uvRange: [number, number],
  segments = 8,
) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1);
  // Cylinder UVs start at +Z and run around, so u = 0.5 lands on -Z: the
  // texture's centred lacing and belt buckle end up on the character's chest.
  remapUv(geometry, 0, 1, uvRange[0], uvRange[1]);
  const item = mesh(geometry, material);
  item.position.set(...position);
  parent.add(item);
  return item;
}

/**
 * Builds a head as one coherent volume: a skull, a curved face shell welded to
 * its surface, and hair behind. The face is part of the head's silhouette at
 * every angle rather than a flat card hovering in front of it.
 */
function makeHead(
  materials: Record<string, THREE.Material>,
  skin: THREE.Material,
  faceMaterial: THREE.Material,
  options: { hair: boolean; hood: boolean; masked: boolean },
) {
  const head = new THREE.Group();

  const skull = mesh(new THREE.SphereGeometry(HEAD_RADIUS, 14, 11), skin);
  head.add(skull);

  const faceShell = new THREE.SphereGeometry(
    HEAD_RADIUS * 1.006,
    18,
    14,
    -Math.PI / 2 - FACE_HALF_SPAN,
    FACE_HALF_SPAN * 2,
    0.2,
    2.36,
  );
  projectFaceUv(faceShell, FACE_HALF_SPAN);
  const face = mesh(faceShell, options.masked ? materials.mask : faceMaterial);
  head.add(face);

  if (options.hair && !options.hood && !options.masked) {
    // Hair only needs to cover the rear of the skull; the portrait texture
    // already carries the hairline across the front.
    const rearStart = -Math.PI / 2 + FACE_HALF_SPAN - 0.12;
    const hairShell = mesh(
      new THREE.SphereGeometry(
        HEAD_RADIUS * 1.012,
        14,
        10,
        rearStart,
        Math.PI * 2 - FACE_HALF_SPAN * 2 + 0.24,
        0,
        1.85,
      ),
      materials.hair,
    );
    head.add(hairShell);
  }

  // Morrowind's characters never self-shadowed. Letting the skull cast into
  // the shadow map drops a hard dark wedge from the chin down over the chest.
  head.traverse((item) => {
    item.castShadow = false;
  });
  head.scale.copy(HEAD_SCALE);
  return head;
}

export function makePerson(materials: Record<string, THREE.Material>, options: PersonOptions = {}) {
  const group = new THREE.Group();
  const robe = options.robe ? standard(options.robe, 0.98) : materials.blackCloth;
  // Matched to the portrait sheets' own skin tone so the neck and hands read as
  // the same person as the face.
  const skin = standard(options.skin ?? "#9a7659", 1);
  const seated = options.seated ?? false;
  const scale = options.scale ?? 1;
  const prisoner = options.prisoner ?? false;
  const hipY = seated ? 0.72 : 0.86;
  const torsoY = seated ? 1.02 : 1.16;
  const torsoHeight = seated ? 0.48 : 0.52;
  // Collar, neck and head are all chained off the top of the torso. Previously
  // each was an independent constant, so the head hovered above a collar rim
  // with a gap of bare background between chin and shoulders.
  const shoulderTopY = torsoY + torsoHeight / 2;
  const shoulderY = shoulderTopY - 0.06;
  const collarTopY = shoulderTopY + 0.15;
  const headY = collarTopY + HEAD_RADIUS * HEAD_SCALE.y - 0.03;
  const garmentMaterial = prisoner ? materials.prisonerTunic : materials.officialRobe;

  // Lower body. The garment texture is mapped onto the body volumes
  // themselves; nothing is a flat panel floating in front of the mesh.
  if (prisoner) {
    for (const side of [-1, 1]) {
      const thighTop = new THREE.Vector3(side * 0.115, hipY, 0.01);
      const knee = new THREE.Vector3(side * 0.125, seated ? 0.51 : 0.48, seated ? -0.24 : 0);
      const ankle = new THREE.Vector3(side * 0.125, 0.15, seated ? -0.32 : 0);
      addLimb(group, materials.prisonerCloth, thighTop, knee, 0.105, 0.09, 7);
      addJoint(group, materials.prisonerCloth, knee, 0.088);
      addLimb(group, materials.prisonerCloth, knee, ankle, 0.09, 0.065, 7);
      addJoint(group, materials.darkLeather, ankle, 0.07);
      addBox(
        group,
        materials.darkLeather,
        [0.17, 0.15, 0.28],
        [side * 0.125, 0.085, seated ? -0.4 : -0.06],
      );
    }
    addGarmentVolume(group, garmentMaterial, 0.25, 0.29, 0.34, [0, hipY + 0.04, 0.015], [0, 0.3]);
  } else if (seated) {
    addGarmentVolume(group, garmentMaterial, 0.235, 0.28, 0.32, [0, 0.81, 0.015], [0, 0.32]);
    for (const side of [-1, 1]) {
      const thighTop = new THREE.Vector3(side * 0.12, hipY, 0);
      const knee = new THREE.Vector3(side * 0.13, 0.5, -0.24);
      const ankle = new THREE.Vector3(side * 0.13, 0.16, -0.31);
      addLimb(group, robe, thighTop, knee, 0.095, 0.08, 7);
      addJoint(group, robe, knee, 0.078);
      addLimb(group, materials.darkLeather, knee, ankle, 0.075, 0.06, 7);
      addJoint(group, materials.darkLeather, ankle, 0.065);
      addBox(group, materials.darkLeather, [0.17, 0.14, 0.27], [side * 0.13, 0.09, -0.39]);
    }
  } else {
    addGarmentVolume(group, garmentMaterial, 0.245, 0.34, 0.9, [0, 0.48, 0.025], [0, 0.34], 10);
    addBox(group, materials.darkLeather, [0.19, 0.1, 0.29], [-0.145, 0.055, -0.08]);
    addBox(group, materials.darkLeather, [0.19, 0.1, 0.29], [0.145, 0.055, -0.08]);
  }

  // Torso: one tapered volume carrying the garment texture, plus a shoulder
  // yoke that closes the gap where the arms attach.
  addGarmentVolume(group, garmentMaterial, 0.225, 0.26, torsoHeight, [0, torsoY, 0], [0.32, 1], 10);
  // Shoulders taper up toward the neck, and the cone is seated on top of the
  // torso rather than partway down it. Both matter: a straight-sided yoke left
  // the cylinder's top cap facing the camera, and a yoke set below the torso's
  // rim left that rim showing as a dark ring behind the neck.
  // Sampled from the middle of the garment sheet, not its top edge: both sheets
  // paint a dark shoulder shadow across the top, which on a cone reads as a
  // black wedge hanging under the chin.
  addGarmentVolume(
    group,
    garmentMaterial,
    0.115,
    0.264,
    0.19,
    [0, collarTopY - 0.095, 0],
    [0.6, 0.72],
    10,
  );
  // Sleeve heads, so the arms grow out of cloth instead of out of thin air.
  for (const side of [-1, 1]) {
    const sleeve = addCylinder(
      group,
      garmentMaterial,
      0.1,
      0.118,
      0.17,
      [side * 0.208, shoulderTopY - 0.045, 0],
      [0, 0, side * 0.26],
      9,
    );
    sleeve.castShadow = true;
  }
  addBox(group, materials.darkLeather, [0.48, 0.052, 0.31], [0, torsoY - torsoHeight / 2, 0]);
  // Neck bridges the collar opening and the underside of the skull.
  addCylinder(group, skin, 0.062, 0.075, 0.2, [0, collarTopY - 0.03, 0.004], [0, 0, 0], 8);

  const faceKey = options.face ?? (prisoner ? "young" : "mature");
  const faceMaterial =
    faceKey === "young"
      ? materials.faceYoung
      : faceKey === "elder"
        ? materials.faceElder
        : faceKey === "secretary"
          ? materials.faceSecretary
          : materials.faceMature;
  const head = makeHead(materials, skin, faceMaterial, {
    hair: options.hair || prisoner || !options.hood,
    hood: options.hood ?? false,
    masked: options.masked ?? false,
  });
  head.position.set(0, headY, 0.004);
  group.add(head);

  if (options.hood) {
    // The cowl is a shell that hugs the skull and stops at the brow, leaving a
    // clear opening for the face rather than enclosing the head in a helmet.
    // The opening is kept near the head's silhouette. A narrower one put the
    // cowl's straight rim across the cheeks, cutting a hard notch into the face.
    const cowlOpening = 1.24;
    const cowl = mesh(
      new THREE.SphereGeometry(
        HEAD_RADIUS * 1.16,
        16,
        10,
        -Math.PI / 2 + cowlOpening,
        Math.PI * 2 - cowlOpening * 2,
        0,
        1.72,
      ),
      robe,
    );
    cowl.position.set(0, headY + 0.006, 0.006);
    cowl.scale.set(HEAD_SCALE.x, HEAD_SCALE.y * 0.98, HEAD_SCALE.z);
    group.add(cowl);
    // A shallow brow band closes the top of the opening.
    addCylinder(group, robe, 0.152, 0.156, 0.045, [0, headY + 0.108, 0.006], [0.28, 0, 0], 12);
    // Cloth falling from the cowl onto the shoulders.
    addCylinder(group, robe, 0.185, 0.3, 0.24, [0, shoulderY + 0.075, 0.006], [0, 0, 0], 12);
  }

  if (options.masked) {
    addBox(group, materials.eyeSocket, [0.036, 0.014, 0.01], [-0.045, headY + 0.025, -0.126]);
    addBox(group, materials.eyeSocket, [0.036, 0.014, 0.01], [0.045, headY + 0.025, -0.126]);
  }

  // Arms start inside the torso volume and carry joint caps at shoulder and
  // elbow, so limbs read as one continuous arm rather than loose sticks.
  if (options.prisoner) {
    const leftShoulder = new THREE.Vector3(-0.21, shoulderY - 0.02, -0.01);
    const rightShoulder = new THREE.Vector3(0.21, shoulderY - 0.02, -0.01);
    const leftElbow = new THREE.Vector3(-0.27, torsoY - 0.06, -0.08);
    const rightElbow = new THREE.Vector3(0.27, torsoY - 0.06, -0.08);
    const leftWrist = new THREE.Vector3(0.09, torsoY + 0.01, -0.24);
    const rightWrist = new THREE.Vector3(-0.09, torsoY + 0.08, -0.25);
    for (const [shoulder, elbow, wrist] of [
      [leftShoulder, leftElbow, leftWrist],
      [rightShoulder, rightElbow, rightWrist],
    ]) {
      addJoint(group, skin, shoulder, 0.068);
      addLimb(group, skin, shoulder, elbow, 0.062, 0.052);
      addJoint(group, skin, elbow, 0.055);
      addLimb(group, skin, elbow, wrist, 0.052, 0.043);
      const hand = mesh(new THREE.SphereGeometry(0.052, 9, 7), skin);
      hand.position.copy(wrist);
      hand.scale.set(0.72, 1, 0.5);
      group.add(hand);
    }
  } else {
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Vector3(side * 0.22, shoulderY - 0.015, 0);
      const elbow = seated
        ? new THREE.Vector3(side * 0.29, 1.08, -0.07)
        : new THREE.Vector3(side * 0.29, 1.08, 0.01);
      const wrist = seated
        ? new THREE.Vector3(side * 0.18, 0.91, -0.34)
        : new THREE.Vector3(side * 0.26, 0.76, -0.03);
      addJoint(group, robe, shoulder, 0.098);
      addLimb(group, robe, shoulder, elbow, 0.095, 0.077, 10);
      addJoint(group, robe, elbow, 0.079);
      addLimb(group, robe, elbow, wrist, 0.077, 0.06, 10);
      const hand = mesh(new THREE.SphereGeometry(0.05, 9, 7), skin);
      hand.position.copy(wrist);
      hand.scale.set(0.72, 1, 0.5);
      group.add(hand);
    }
  }

  if (options.cap) {
    addBox(group, materials.blackCloth, [0.31, 0.045, 0.29], [0, headY + 0.16, 0.004]);
    addBox(group, materials.blackCloth, [0.225, 0.08, 0.215], [0, headY + 0.122, 0.004]);
    const tassel = addCylinder(
      group,
      options.crimsonTassel ? materials.redSilk : materials.blackCloth,
      0.018,
      0.021,
      0.16,
      [0.145, headY + 0.08, 0.015],
      [0, 0, 0.2],
      6,
    );
    tassel.castShadow = false;
  }

  if (!options.prisoner && !options.hood) {
    // Clerical bands at the throat, tucked against the neck rather than
    // hovering in front of it.
    addBox(group, materials.paper, [0.052, 0.115, 0.02], [-0.032, headY - 0.215, -0.066], [0.12, 0, 0.07]);
    addBox(group, materials.paper, [0.052, 0.115, 0.02], [0.032, headY - 0.215, -0.066], [0.12, 0, -0.07]);
  }

  if (options.cross) {
    const cross = makeScarletCross(materials.redSilk, 0.42);
    cross.position.set(0, torsoY + 0.02, -0.25);
    group.add(cross);
  }
  group.scale.setScalar(scale);
  return group;
}

export function makeChair(materials: Record<string, THREE.Material>, highBack = false) {
  const chair = new THREE.Group();
  addBox(chair, materials.wood, [0.65, 0.12, 0.62], [0, 0.72, 0]);
  addBox(chair, materials.wood, [0.12, highBack ? 1.72 : 1.15, 0.12], [-0.26, highBack ? 1.34 : 1.05, 0.25]);
  addBox(chair, materials.wood, [0.12, highBack ? 1.72 : 1.15, 0.12], [0.26, highBack ? 1.34 : 1.05, 0.25]);
  addBox(chair, materials.wood, [0.55, highBack ? 0.95 : 0.55, 0.08], [0, highBack ? 1.55 : 1.25, 0.25]);
  for (const x of [-0.25, 0.25]) {
    for (const z of [-0.22, 0.22]) addBox(chair, materials.wood, [0.09, 0.72, 0.09], [x, 0.36, z]);
  }
  if (highBack) {
    addBox(chair, materials.woodTrim, [0.76, 0.12, 0.12], [0, 2.05, 0.25]);
    addCylinder(chair, materials.woodTrim, 0.08, 0.08, 0.2, [-0.3, 2.16, 0.25], [0, 0, 0], 8);
    addCylinder(chair, materials.woodTrim, 0.08, 0.08, 0.2, [0.3, 2.16, 0.25], [0, 0, 0], 8);
  }
  return chair;
}

function makeStool(materials: Record<string, THREE.Material>, low = false) {
  const stool = new THREE.Group();
  const height = low ? 0.32 : 0.48;
  addCylinder(stool, materials.wood, 0.28, 0.3, 0.1, [0, height, 0], [0, 0, 0], 10);
  for (const x of [-0.18, 0.18]) {
    for (const z of [-0.15, 0.15]) {
      addCylinder(stool, materials.woodTrim, 0.035, 0.045, height, [x, height / 2, z], [0, 0, x * 0.1], 6);
    }
  }
  return stool;
}

export function makeTable(
  materials: Record<string, THREE.Material>,
  width: number,
  depth: number,
  velvet = false,
) {
  const table = new THREE.Group();
  addBox(table, velvet ? materials.blackVelvet : materials.wood, [width, 0.16, depth], [0, 0.83, 0]);
  if (velvet) {
    addBox(table, materials.blackVelvet, [width + 0.05, 0.5, 0.04], [0, 0.62, -depth / 2]);
    for (let i = -2; i <= 2; i++) {
      const cross = makeScarletCross(materials.redSilk, 0.22);
      cross.position.set((width / 5) * i, 0.63, -depth / 2 - 0.025);
      table.add(cross);
    }
  }
  for (const x of [-width / 2 + 0.18, width / 2 - 0.18]) {
    for (const z of [-depth / 2 + 0.18, depth / 2 - 0.18]) {
      addBox(table, materials.woodTrim, [0.13, 0.82, 0.13], [x, 0.41, z]);
    }
  }
  return table;
}

function makeHangingLamp(
  materials: Record<string, THREE.Material>,
  x: number,
  z: number,
  height: number,
  intensity: number,
  castShadow = false,
) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  addCylinder(group, materials.iron, 0.014, 0.014, WALL_HEIGHT - height, [0, height + (WALL_HEIGHT - height) / 2, 0], [0, 0, 0], 6);
  addCylinder(group, materials.iron, 0.25, 0.18, 0.1, [0, height, 0], [0, 0, 0], 10);
  addCylinder(group, materials.iron, 0.18, 0.25, 0.1, [0, height - 0.42, 0], [0, 0, 0], 10);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    addCylinder(
      group,
      materials.iron,
      0.012,
      0.012,
      0.42,
      [Math.cos(a) * 0.2, height - 0.21, Math.sin(a) * 0.2],
      [0, 0, 0],
      5,
    );
  }
  const flame = mesh(new THREE.SphereGeometry(0.09, 10, 8), materials.flame, false);
  flame.scale.set(0.72, 1.45, 0.72);
  flame.position.set(0, height - 0.23, 0);
  group.add(flame);
  const light = new THREE.PointLight("#f0a85a", intensity * 8.5, 14, 1.15);
  light.position.set(0, height - 0.2, 0);
  light.castShadow = castShadow;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0015;
  light.shadow.normalBias = 0.02;
  group.add(light);
  return { group, light, flame };
}

function makePallet(materials: Record<string, THREE.Material>) {
  const pallet = new THREE.Group();
  addBox(pallet, materials.strawDark, [1.65, 0.12, 0.72], [0, 0.11, 0]);
  for (let i = 0; i < 15; i++) {
    const straw = addCylinder(
      pallet,
      i % 3 === 0 ? materials.strawLight : materials.straw,
      0.012,
      0.014,
      1.68,
      [0, 0.2 + (i % 2) * 0.025, -0.32 + i * 0.045],
      [0, 0, Math.PI / 2 + (i % 3 - 1) * 0.035],
      5,
    );
    straw.castShadow = false;
  }
  addBox(pallet, materials.canvas, [0.45, 0.12, 0.62], [-0.52, 0.26, 0]);
  return pallet;
}

function makeBarrel(materials: Record<string, THREE.Material>) {
  const barrel = new THREE.Group();
  addCylinder(barrel, materials.wood, 0.34, 0.31, 0.78, [0, 0.39, 0], [0, 0, 0], 12);
  for (const y of [0.12, 0.37, 0.66]) addCylinder(barrel, materials.iron, 0.35, 0.35, 0.045, [0, y, 0], [0, 0, 0], 12);
  return barrel;
}

function makePortcullis(materials: Record<string, THREE.Material>) {
  const gate = new THREE.Group();
  for (let x = -1.9; x <= 1.9; x += 0.38) {
    addBox(gate, materials.iron, [0.075, 3.25, 0.08], [x, 1.72, 0]);
    const tooth = mesh(new THREE.ConeGeometry(0.11, 0.4, 4), materials.iron);
    tooth.position.set(x, 0.12, 0);
    tooth.rotation.y = Math.PI / 4;
    gate.add(tooth);
  }
  for (const y of [0.65, 1.45, 2.25, 3.05]) addBox(gate, materials.iron, [4.05, 0.09, 0.09], [0, y, 0]);
  return gate;
}

function makeWardrobe(materials: Record<string, THREE.Material>) {
  const group = new THREE.Group();
  addBox(group, materials.wood, [1.45, 2.65, 0.2], [0, 1.35, 0.42]);
  addBox(group, materials.wood, [0.16, 2.75, 0.82], [-0.7, 1.35, 0]);
  addBox(group, materials.wood, [0.16, 2.75, 0.82], [0.7, 1.35, 0]);
  addBox(group, materials.wood, [1.55, 0.16, 0.82], [0, 2.69, 0]);
  addBox(group, materials.wood, [1.55, 0.16, 0.82], [0, 0.08, 0]);
  addCylinder(group, materials.iron, 0.025, 0.025, 1.2, [0, 2.34, 0], [0, 0, Math.PI / 2], 6);
  for (const x of [-0.38, 0, 0.38]) {
    const garment = makePerson(materials, { hood: true, scale: 0.78 });
    garment.position.set(x, 0.14, 0);
    garment.scale.set(0.58, 0.95, 0.58);
    group.add(garment);
  }
  const leftDoor = addBox(group, materials.woodTrim, [0.12, 2.55, 0.7], [-1.03, 1.37, 0.18], [0, -0.8, 0]);
  const rightDoor = addBox(group, materials.woodTrim, [0.12, 2.55, 0.7], [1.03, 1.37, 0.18], [0, 0.8, 0]);
  leftDoor.castShadow = rightDoor.castShadow = true;
  return group;
}

function makeRack(materials: Record<string, THREE.Material>) {
  const rack = new THREE.Group();
  addBox(rack, materials.wood, [2.2, 0.16, 0.18], [0, 0.48, -0.65]);
  addBox(rack, materials.wood, [2.2, 0.16, 0.18], [0, 0.48, 0.65]);
  addBox(rack, materials.wood, [0.18, 0.16, 1.45], [-1, 0.48, 0]);
  addBox(rack, materials.wood, [0.18, 0.16, 1.45], [1, 0.48, 0]);
  for (const x of [-1.05, 1.05]) {
    addCylinder(rack, materials.woodTrim, 0.13, 0.13, 1.7, [x, 0.52, 0], [Math.PI / 2, 0, 0], 10);
    for (const z of [-0.78, 0.78]) addCylinder(rack, materials.iron, 0.025, 0.025, 0.62, [x, 0.42, z * 0.67], [Math.PI / 2, 0, 0], 6);
  }
  return rack;
}

function makeMuralTexture() {
  return makeCanvasTexture(768, 1024, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, "#271810");
    gradient.addColorStop(0.5, "#47251a");
    gradient.addColorStop(1, "#130d0b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 180; i++) {
      ctx.fillStyle = `rgba(224,179,111,${Math.random() * 0.035})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 8, 2 + Math.random() * 8);
    }
    ctx.strokeStyle = "#8e2d22";
    ctx.fillStyle = "#3b1713";
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.12);
    ctx.lineTo(w * 0.2, h * 0.48);
    ctx.lineTo(w * 0.35, h * 0.78);
    ctx.lineTo(w * 0.5, h * 0.58);
    ctx.lineTo(w * 0.65, h * 0.78);
    ctx.lineTo(w * 0.8, h * 0.48);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#d49b4d";
    ctx.fillRect(w * 0.37, h * 0.37, 55, 24);
    ctx.fillRect(w * 0.56, h * 0.37, 55, 24);
    ctx.strokeStyle = "#b58c55";
    ctx.lineWidth = 8;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(w * 0.12, h * (0.82 + i * 0.02));
      ctx.bezierCurveTo(w * 0.35, h * 0.76, w * 0.6, h * 0.96, w * 0.88, h * (0.82 + i * 0.018));
      ctx.stroke();
    }
    ctx.font = "bold 38px Georgia";
    ctx.textAlign = "center";
    ctx.fillStyle = "#b99a68";
    ctx.fillText("BENEDETTA CAZZALA", w / 2, h * 0.95);
  });
}

function makeInscriptionTexture() {
  return makeCanvasTexture(1024, 180, (ctx, w, h) => {
    ctx.fillStyle = "#24140f";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#6a3d2b";
    ctx.lineWidth = 12;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.font = "52px Georgia";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#c0a276";
    ctx.fillText("MISERICORDIA  ET  JUSTITIA", w / 2, h / 2);
  });
}

/**
 * Builds every material the dungeon and its inhabitants use. Exported so the
 * character lab can inspect the same materials the game ships.
 */
export function createDungeonMaterials(renderer: THREE.WebGLRenderer) {
  const textures: THREE.Texture[] = [];
  const textureLoader = new THREE.TextureLoader();
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

  // Corridors are narrow enough that walls are routinely seen at extreme
  // grazing angles, where a low anisotropy setting collapses the tiling to a
  // flat averaged mip and the wall renders as a blank bright band.
  const load = (url: string, repeatX: number, repeatY: number) => {
    const texture = textureLoader.load(url);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    textures.push(texture);
    return texture;
  };

  // Character sheets are unwrapped, never tiled. Clamping keeps the lower mip
  // levels from bleeding the far edge of a portrait into the opposite cheek.
  const loadSheet = (url: string) => {
    const texture = textureLoader.load(url);
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, maxAnisotropy);
    textures.push(texture);
    return texture;
  };

  const stoneTexture = load("/textures/stone-wall.png", 1.05, 2.1);
  const floorTexture = load("/textures/flagstone-floor.png", 12, 9);
  const woodTexture = load("/textures/chestnut-panels.png", 1, 1.2);
  // A second, tighter tiling of the same sheet for furniture. Tables and chairs
  // were flat untinted colour and read as orange plastic under the lamps.
  const furnitureWoodTexture = load("/textures/chestnut-panels.png", 2.4, 2.4);
  const faceMatureTexture = loadSheet("/textures/face-mature-rpg.png");
  const faceYoungTexture = loadSheet("/textures/face-young-rpg.png");
  const faceElderTexture = loadSheet("/textures/face-elder-rpg.png");
  const faceSecretaryTexture = loadSheet("/textures/face-secretary-rpg.png");
  const officialRobeTexture = loadSheet("/textures/official-robe-rpg.png");
  const prisonerTunicTexture = loadSheet("/textures/prisoner-tunic-rpg.png");

  const clothTexture = makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#756d64";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 3) {
      ctx.fillStyle = i % 6 === 0 ? "rgba(255,255,255,.055)" : "rgba(0,0,0,.05)";
      ctx.fillRect(i, 0, 1, h);
    }
    for (let i = 0; i < h; i += 4) {
      ctx.fillStyle = i % 8 === 0 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.035)";
      ctx.fillRect(0, i, w, 1);
    }
    for (let i = 0; i < 90; i++) {
      const x = (i * 73) % w;
      const y = (i * 131) % h;
      ctx.fillStyle = i % 2 ? "rgba(0,0,0,.09)" : "rgba(255,255,255,.045)";
      ctx.fillRect(x, y, 2 + (i % 4), 1);
    }
  });
  clothTexture.wrapS = clothTexture.wrapT = THREE.RepeatWrapping;
  clothTexture.repeat.set(2.5, 4);
  textures.push(clothTexture);

  // The garment and portrait sheets are painted art that already carries its
  // own light and shade. A near-neutral tint preserves that detail; the old
  // dark tints multiplied it down until only a silhouette survived.
  const garment = (map: THREE.Texture, color: THREE.ColorRepresentation) =>
    new THREE.MeshStandardMaterial({ map, color, roughness: 1 });
  const portrait = (map: THREE.Texture) =>
    new THREE.MeshStandardMaterial({ map, color: "#f2eae0", roughness: 1 });

  const materials: Record<string, THREE.Material> = {
    // Kept well below white: the stone sheet is already light, and a bright
    // tint on top of it clipped every surface facing a lamp to flat white.
    stone: new THREE.MeshStandardMaterial({
      map: stoneTexture,
      bumpMap: stoneTexture,
      bumpScale: 0.035,
      color: "#8a8071",
      roughness: 1,
    }),
    cellStone: new THREE.MeshStandardMaterial({
      map: stoneTexture,
      bumpMap: stoneTexture,
      bumpScale: 0.045,
      color: "#8b8479",
      roughness: 1,
    }),
    brownStone: new THREE.MeshStandardMaterial({
      map: stoneTexture,
      color: "#8d7869",
      roughness: 1,
    }),
    woodPanel: new THREE.MeshStandardMaterial({
      map: woodTexture,
      bumpMap: woodTexture,
      bumpScale: 0.025,
      color: "#8a6248",
      roughness: 0.92,
    }),
    floor: new THREE.MeshStandardMaterial({
      map: floorTexture,
      bumpMap: floorTexture,
      bumpScale: 0.028,
      color: "#9c876b",
      roughness: 1,
    }),
    ceiling: new THREE.MeshStandardMaterial({
      map: stoneTexture,
      color: "#63594b",
      roughness: 1,
      side: THREE.DoubleSide,
    }),
    wood: new THREE.MeshStandardMaterial({
      map: furnitureWoodTexture,
      bumpMap: furnitureWoodTexture,
      bumpScale: 0.02,
      color: "#6b4630",
      roughness: 0.92,
    }),
    woodTrim: new THREE.MeshStandardMaterial({
      map: furnitureWoodTexture,
      color: "#4d3122",
      roughness: 0.92,
    }),
    // Velvet needs a weave, or the tribunal table renders as one flat grey
    // plane with nothing to catch the lamplight.
    blackVelvet: new THREE.MeshStandardMaterial({
      map: clothTexture,
      bumpMap: clothTexture,
      bumpScale: 0.02,
      color: "#241820",
      roughness: 1,
    }),
    blackCloth: new THREE.MeshStandardMaterial({
      map: clothTexture,
      bumpMap: clothTexture,
      bumpScale: 0.012,
      color: "#3b322c",
      roughness: 1,
    }),
    officialRobe: garment(officialRobeTexture, "#b6afa4"),
    prisonerTunic: garment(prisonerTunicTexture, "#d8cbb1"),
    prisonerCloth: garment(prisonerTunicTexture, "#a8977a"),
    clothTrim: standard("#191411", 1),
    redSilk: standard("#7d1a24", 0.72),
    darkLeather: standard("#40291b", 0.82),
    // Dark and rough. A thin vertical bar always turns a fully light-facing
    // sliver toward the lamp, so it takes near-peak irradiance across its whole
    // visible width; anything but a low albedo clips it to a white stripe.
    iron: standard("#22221f", 0.88, 0.2),
    brass: standard("#6e5223", 0.72, 0.28),
    // Carved and painted wood. A light tint here made the corpus on the
    // crucifix read as a stark white mannequin under the tribunal lamp.
    figure: standard("#5d5140", 1),
    hair: standard("#241a13", 1),
    faceMature: portrait(faceMatureTexture),
    faceYoung: portrait(faceYoungTexture),
    faceElder: portrait(faceElderTexture),
    faceSecretary: portrait(faceSecretaryTexture),
    eyeSocket: standard("#150e0a", 1),
    eyeWhite: standard("#b7a88f", 1),
    mouth: standard("#4e241e", 1),
    mask: standard("#3b352d", 1),
    skin: standard("#a08066", 1),
    straw: standard("#8e7436", 1),
    strawLight: standard("#b89448", 1),
    strawDark: standard("#5e4826", 1),
    canvas: standard("#8d7c60", 1),
    paper: standard("#b39a72", 1),
    // Scratches cut into stone: paler than the wall, but nowhere near the
    // brightness of paper, which made them read as glowing rods.
    scratch: standard("#6f6355", 1),
    wax: standard("#b69a6c", 0.9),
    flame: new THREE.MeshBasicMaterial({ color: "#ffd078" }),
  };

  return { materials, textures };
}

export class DungeonRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private lamps: { light: THREE.PointLight; flame: THREE.Mesh; base: number; seed: number }[] = [];
  private disposableTextures: THREE.Texture[] = [];
  private materials: Record<string, THREE.Material>;
  private headLamp: THREE.PointLight;

  constructor(canvas: HTMLCanvasElement, world: Grid) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Morrowind clipped its highlights rather than rolling them off. ACES was
    // desaturating the amber lamps and crushing every texture into black.
    this.renderer.toneMapping = THREE.LinearToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color("#0d0b08");
    // Linear fog over a fixed range reads like Morrowind's draw distance; the
    // old exponential falloff swallowed the far wall of every room.
    this.scene.fog = new THREE.Fog("#16110c", 9, 34);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 60);

    const built = createDungeonMaterials(this.renderer);
    this.materials = built.materials;
    this.disposableTextures.push(...built.textures);

    this.buildArchitecture(world);
    this.buildRooms();

    // Morrowind interiors carried a substantial flat ambient term so surfaces
    // away from a lamp still showed their texture. Without it, the lamps'
    // inverse-square falloff leaves everything past two metres solid black.
    this.scene.add(new THREE.AmbientLight("#4c4034", 1.15));
    this.scene.add(new THREE.HemisphereLight("#a08b6f", "#241c14", 1));
    this.headLamp = new THREE.PointLight("#e8b784", 4.6, 9, 1.4);
    this.headLamp.position.set(0.22, -0.18, -0.3);
    this.camera.add(this.headLamp);
    this.scene.add(this.camera);
  }

  private buildArchitecture(world: Grid) {
    const floor = mesh(new THREE.PlaneGeometry(36, 28), this.materials.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(18, 0, 14);
    floor.receiveShadow = true;
    floor.castShadow = false;
    this.scene.add(floor);

    const ceiling = mesh(new THREE.PlaneGeometry(36, 28), this.materials.ceiling, false);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(18, WALL_HEIGHT, 14);
    this.scene.add(ceiling);

    const types = ["1", "2", "3", "4"];
    const wallMaterials = [
      this.materials.stone,
      this.materials.woodPanel,
      this.materials.cellStone,
      this.materials.brownStone,
    ];
    types.forEach((type, typeIndex) => {
      const positions: [number, number][] = [];
      world.forEach((row, z) =>
        row.forEach((cell, x) => {
          if (cell === type) positions.push([x, z]);
        }),
      );
      const geometry = new THREE.BoxGeometry(1.002, WALL_HEIGHT, 1.002);
      const instanced = new THREE.InstancedMesh(geometry, wallMaterials[typeIndex], positions.length);
      const matrix = new THREE.Matrix4();
      positions.forEach(([x, z], i) => {
        matrix.makeTranslation(x + 0.5, WALL_HEIGHT / 2, z + 0.5);
        instanced.setMatrixAt(i, matrix);
      });
      instanced.castShadow = true;
      instanced.receiveShadow = true;
      this.scene.add(instanced);
    });

    const ribMaterial = standard("#332a21", 1);
    for (const z of [4.25, 7.6, 10.95]) {
      // Shallow transverse ribs imply the vault without sweeping freestanding
      // torus geometry through the people and furniture below.
      addBox(this.scene, ribMaterial, [13.6, 0.12, 0.16], [17, 4.08, z]);
    }
  }

  private addLamp(x: number, z: number, height = 3.25, intensity = 2.5, castShadow = false) {
    const lamp = makeHangingLamp(this.materials, x, z, height, intensity, castShadow);
    this.scene.add(lamp.group);
    this.lamps.push({
      light: lamp.light,
      flame: lamp.flame,
      base: lamp.light.intensity,
      seed: x * 1.37 + z * 0.83,
    });
  }

  private buildRooms() {
    const m = this.materials;

    // Prison gate: portcullis, guard alcove, supplies.
    const gate = makePortcullis(m);
    gate.position.set(5, 0, 25.72);
    this.scene.add(gate);
    const barrel = makeBarrel(m);
    barrel.position.set(3.25, 0, 24.4);
    this.scene.add(barrel);
    addBox(this.scene, m.wood, [0.78, 0.72, 0.72], [6.75, 0.36, 24.7]);
    addBox(this.scene, m.woodTrim, [0.68, 0.04, 0.72], [6.75, 0.52, 24.7]);
    const gateGuard = makePerson(m, { hood: true, beard: true, scale: 0.98 });
    gateGuard.position.set(3.35, 0, 23.3);
    gateGuard.rotation.y = -0.4;
    this.scene.add(gateGuard);
    this.addLamp(5, 24.4, 3.2, 2.3, true);

    // Familiars' office.
    const officeTable = makeTable(m, 2.2, 0.9);
    officeTable.position.set(5.15, 0, 19.4);
    this.scene.add(officeTable);
    for (const [index, x] of [4.35, 5.95].entries()) {
      const familiarChair = makeChair(m);
      familiarChair.position.set(x, 0, 18.4);
      familiarChair.rotation.y = Math.PI;
      this.scene.add(familiarChair);
      const familiar = makePerson(m, {
        hood: true,
        seated: true,
        face: index === 0 ? "elder" : "secretary",
        beard: index === 0,
        hair: true,
        scale: 0.96,
      });
      familiar.position.set(x, 0, 18.64);
      familiar.rotation.y = Math.PI;
      this.scene.add(familiar);
    }
    addBox(this.scene, m.paper, [0.52, 0.025, 0.36], [5.1, 0.93, 19.2], [0, 0.2, 0]);
    addCylinder(this.scene, m.brass, 0.07, 0.09, 0.13, [5.55, 1, 19.2], [0, 0, 0], 8);
    this.addLamp(5.1, 19.15, 3, 1.8);

    // High-lamp passage.
    for (const z of [8, 12, 15.5]) this.addLamp(5.5, z, 3.42, 1.7);
    for (const z of [7.3, 10.8, 14.2]) {
      addCylinder(this.scene, m.iron, 0.05, 0.05, 0.46, [4.2, 1.15, z], [0, 0, Math.PI / 2], 7);
      const ring = mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 12), m.iron);
      ring.position.set(4.03, 1.15, z);
      ring.rotation.y = Math.PI / 2;
      this.scene.add(ring);
    }

    // Tribunal chamber.
    const longTable = makeTable(m, 2.05, 5.15, true);
    longTable.position.set(17, 0, 7.65);
    this.scene.add(longTable);
    const dais = addBox(this.scene, m.woodTrim, [2.35, 0.18, 1.5], [17, 0.09, 10.15]);
    dais.receiveShadow = true;
    addBox(this.scene, m.wood, [1.9, 0.18, 1.15], [17, 0.27, 10.2]);
    const highChair = makeChair(m, true);
    highChair.position.set(17, 0.37, 10.8);
    highChair.rotation.y = 0;
    this.scene.add(highChair);
    const general = makePerson(m, {
      cap: true,
      cross: true,
      crimsonTassel: true,
      seated: true,
      beard: true,
      face: "mature",
      scale: 1.08,
    });
    general.position.set(17, 0.37, 10.66);
    general.rotation.y = 0;
    this.scene.add(general);

    for (const [i, z] of [5.15, 6.45, 7.75, 9.05].entries()) {
      const chair = makeChair(m);
      chair.position.set(15.38, 0, z);
      chair.rotation.y = -Math.PI / 2;
      this.scene.add(chair);
      const inquisitor = makePerson(m, {
        cap: true,
        seated: true,
        face: i % 3 === 0 ? "elder" : i % 3 === 1 ? "secretary" : "mature",
        beard: i % 2 === 0,
        hair: true,
        scale: 0.92,
      });
      inquisitor.position.set(15.45, 0, z);
      inquisitor.rotation.y = -Math.PI / 2;
      this.scene.add(inquisitor);
      addBox(this.scene, m.paper, [0.42, 0.018, 0.28], [15.95, 0.94, z], [0, -0.05 * i, 0]);
    }
    const secretaryChair = makeChair(m);
    secretaryChair.position.set(17, 0, 4.32);
    secretaryChair.rotation.y = Math.PI;
    this.scene.add(secretaryChair);
    const secretary = makePerson(m, {
      seated: true,
      hair: true,
      face: "secretary",
      scale: 0.9,
      robe: "#1c1511",
    });
    secretary.position.set(17, 0, 4.58);
    secretary.rotation.y = Math.PI;
    this.scene.add(secretary);
    addBox(this.scene, m.paper, [0.8, 0.02, 0.42], [17, 0.94, 5.15]);
    addCylinder(this.scene, m.woodTrim, 0.012, 0.012, 0.55, [17.2, 1.13, 5.12], [0, 0, 0.7], 5);

    const prisoner = makePerson(m, {
      prisoner: true,
      face: "young",
      scale: 1.04,
      robe: "#6b5c4a",
    });
    prisoner.position.set(18.55, 0, 8.65);
    prisoner.rotation.y = Math.PI;
    this.scene.add(prisoner);
    const selette = makeStool(m, true);
    selette.position.set(18.6, 0, 9.65);
    this.scene.add(selette);
    const crucifix = makeCross(m.woodTrim, m.figure, 1);
    crucifix.position.set(17, 0.58, 4.08);
    crucifix.rotation.y = Math.PI;
    this.scene.add(crucifix);

    const inscriptionTexture = makeInscriptionTexture();
    this.disposableTextures.push(inscriptionTexture);
    const inscriptionMaterial = new THREE.MeshStandardMaterial({
      map: inscriptionTexture,
      roughness: 0.95,
      emissive: "#24140b",
      emissiveIntensity: 0.15,
    });
    const inscription = mesh(new THREE.PlaneGeometry(5.1, 0.9), inscriptionMaterial);
    inscription.position.set(17, 3.35, 4.012);
    this.scene.add(inscription);
    for (const x of [11.2, 12.8, 21.2, 22.8]) {
      const cross = makeScarletCross(m.redSilk, 0.48);
      cross.position.set(x, 2.2, 4.015);
      this.scene.add(cross);
    }
    for (const [x, rotation] of [
      [10.012, Math.PI / 2],
      [23.988, -Math.PI / 2],
    ] as const) {
      for (const z of [5.2, 7.4, 9.6]) {
        const cross = makeScarletCross(m.redSilk, 0.44);
        cross.position.set(x, 2.05, z);
        cross.rotation.y = rotation;
        this.scene.add(cross);
      }
      const sideInscription = mesh(new THREE.PlaneGeometry(3.3, 0.58), inscriptionMaterial);
      sideInscription.position.set(x, 3.35, 7.4);
      sideInscription.rotation.y = rotation;
      this.scene.add(sideInscription);
    }
    this.addLamp(17, 7.7, 3.38, 4.1, true);

    // Marcello's cell.
    const marcelloPallet = makePallet(m);
    marcelloPallet.position.set(30.7, 0, 9.25);
    marcelloPallet.rotation.y = Math.PI / 2;
    this.scene.add(marcelloPallet);
    const cellStool = makeStool(m);
    cellStool.position.set(31.65, 0, 6.15);
    this.scene.add(cellStool);
    const muralTexture = makeMuralTexture();
    this.disposableTextures.push(muralTexture);
    // The cell's west wall block spans x 27..28, so its inner face is x = 28.
    // Everything here used to sit at x ~ 27.5, half a metre inside the
    // masonry and invisible from the cell. The wall is also pierced by the
    // doorway at z 7..9, so the panel is centred clear of it.
    const CELL_WEST_FACE = 28.01;
    const mural = mesh(
      new THREE.PlaneGeometry(1.7, 2.48),
      new THREE.MeshStandardMaterial({ map: muralTexture, color: "#8a7264", roughness: 1 }),
    );
    mural.position.set(CELL_WEST_FACE, 2.05, 6.0);
    mural.rotation.y = Math.PI / 2;
    this.scene.add(mural);
    for (const z of [5.12, 6.88]) {
      addBox(this.scene, m.woodTrim, [0.09, 2.65, 0.11], [CELL_WEST_FACE + 0.01, 2.05, z]);
    }
    for (const y of [0.79, 3.31]) {
      addBox(this.scene, m.woodTrim, [0.09, 0.11, 1.88], [CELL_WEST_FACE + 0.01, y, 6.0]);
    }
    for (let i = 0; i < 5; i++) {
      const scratch = addBox(
        this.scene,
        m.scratch,
        [0.014, 0.014, 0.6],
        [CELL_WEST_FACE + 0.015, 0.36 + i * 0.075, 6.0 + (i % 2) * 0.06],
        [0.1, 0, 0.08],
      );
      scratch.castShadow = false;
    }
    this.addLamp(30, 7.15, 2.75, 1.55);

    // Maddalena's cell.
    const maddalenaPallet = makePallet(m);
    maddalenaPallet.position.set(30.7, 0, 17.6);
    maddalenaPallet.rotation.y = Math.PI / 2;
    this.scene.add(maddalenaPallet);
    // North wall block of this cell spans z 13..14, so its inner face is z = 14.
    const goldCross = makeScarletCross(m.brass, 0.35);
    goldCross.position.set(31.6, 1.2, 14.03);
    this.scene.add(goldCross);
    const web = new THREE.Group();
    const webMaterial = new THREE.LineBasicMaterial({ color: "#9b9485", transparent: true, opacity: 0.4 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0)];
      web.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), webMaterial));
    }
    for (const radius of [0.12, 0.24, 0.36]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 36; i++) points.push(new THREE.Vector3(Math.cos((i / 36) * Math.PI * 2) * radius, Math.sin((i / 36) * Math.PI * 2) * radius, 0));
      web.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), webMaterial));
    }
    web.position.set(28.04, 3.2, 14.4);
    web.rotation.y = Math.PI / 2;
    this.scene.add(web);
    this.addLamp(30, 15.8, 2.8, 1.45);

    // Wardrobe and disguise chamber.
    const wardrobe = makeWardrobe(m);
    wardrobe.position.set(10.7, 0, 19.6);
    wardrobe.rotation.y = Math.PI / 2;
    this.scene.add(wardrobe);
    const bench = makeTable(m, 1.6, 0.46);
    bench.position.set(12.65, -0.35, 21.25);
    this.scene.add(bench);
    this.addLamp(12, 20.3, 2.95, 1.7);

    // Password vault.
    const maskedOfficial = makePerson(m, { hood: true, masked: true, scale: 1.1 });
    maskedOfficial.position.set(19.5, 0, 20.25);
    maskedOfficial.rotation.y = Math.PI;
    this.scene.add(maskedOfficial);
    addBox(this.scene, m.woodTrim, [0.75, 0.08, 0.75], [19.5, 0.04, 20.25]);
    const staff = addCylinder(this.scene, m.iron, 0.025, 0.035, 2.1, [19.95, 1.05, 20.28], [0, 0, 0], 8);
    staff.castShadow = true;
    this.addLamp(19.5, 21.8, 3.1, 2.5, true);

    // Non-graphic torture antechamber.
    const grille = makePortcullis(m);
    grille.position.set(24.15, 0, 22);
    grille.rotation.y = Math.PI / 2;
    grille.scale.set(0.76, 1, 1);
    this.scene.add(grille);
    const rack = makeRack(m);
    rack.position.set(27.3, 0, 23.1);
    rack.rotation.y = 0.35;
    this.scene.add(rack);
    const narrowTable = makeTable(m, 1, 2.2);
    narrowTable.position.set(28.9, 0, 24.4);
    narrowTable.rotation.y = 0.5;
    this.scene.add(narrowTable);
    const pulley = mesh(new THREE.TorusGeometry(0.48, 0.09, 8, 18), m.iron);
    pulley.position.set(29.45, 2.45, 20.55);
    pulley.rotation.x = Math.PI / 2;
    this.scene.add(pulley);
    for (const x of [26.4, 28.25]) {
      addCylinder(this.scene, m.iron, 0.018, 0.018, 2.15, [x, 2.55, 24.9], [0, 0, 0], 6);
      const ring = mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 12), m.iron);
      ring.position.set(x, 1.48, 24.9);
      ring.rotation.x = Math.PI / 2;
      this.scene.add(ring);
    }
    this.addLamp(27.2, 22.4, 2.85, 1.35);

    // Moon door and stair.
    for (let i = 0; i < 7; i++) {
      addBox(this.scene, m.stone, [1.55, 0.18, 0.62], [33, 0.09 + i * 0.18, 25.3 - i * 0.48]);
    }
    const moonDoor = addBox(this.scene, m.woodTrim, [1.45, 2.85, 0.18], [33, 2.45, 21.6]);
    moonDoor.castShadow = true;
    for (const x of [-0.48, 0, 0.48]) addBox(moonDoor, m.iron, [0.06, 2.65, 0.05], [x, 0, -0.12]);
    const moonLight = new THREE.SpotLight("#9eb5cd", 3.5, 9, 0.3, 0.55, 1.2);
    moonLight.position.set(33, 4.5, 20.6);
    moonLight.target.position.set(33, 0, 25);
    this.scene.add(moonLight, moonLight.target);
  }

  render(player: PlayerView, time: number) {
    const width = Math.max(1, this.renderer.domElement.clientWidth);
    const height = Math.max(1, this.renderer.domElement.clientHeight);
    const targetWidth = Math.floor(width * Math.min(window.devicePixelRatio || 1, 1.65));
    const targetHeight = Math.floor(height * Math.min(window.devicePixelRatio || 1, 1.65));
    if (this.renderer.domElement.width !== targetWidth || this.renderer.domElement.height !== targetHeight) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }

    const walkBob = Math.sin(time * 0.009) * 0.012;
    this.camera.position.set(player.x, EYE_HEIGHT + walkBob, player.y);
    const lookDistance = 10;
    this.camera.lookAt(
      player.x + Math.cos(player.dir) * lookDistance,
      EYE_HEIGHT + Math.tan(player.pitch) * lookDistance,
      player.y + Math.sin(player.dir) * lookDistance,
    );

    for (const lamp of this.lamps) {
      const flicker =
        0.91 +
        Math.sin(time * 0.0067 + lamp.seed) * 0.07 +
        Math.sin(time * 0.019 + lamp.seed * 2.1) * 0.035;
      lamp.light.intensity = lamp.base * flicker;
      lamp.flame.scale.y = 1.28 + Math.sin(time * 0.015 + lamp.seed) * 0.18;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposableTextures.forEach((texture) => texture.dispose());
    this.scene.traverse((item) => {
      if (item instanceof THREE.Mesh || item instanceof THREE.InstancedMesh) {
        item.geometry?.dispose();
        const materials = Array.isArray(item.material) ? item.material : [item.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.renderer.dispose();
  }
}

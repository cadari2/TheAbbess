import * as THREE from "three";
import {
  NPCS,
  WORLD_MODEL,
  createNpcStates,
  groundHeightAt,
  isScreenAt,
  treadsOf,
  updateNpcs,
  type NpcState,
} from "./world/index.ts";

export type PlayerView = {
  x: number;
  y: number;
  dir: number;
  pitch: number;
};

type Grid = string[][];

const WALL_HEIGHT = 4.2;
const EYE_HEIGHT = 1.62;

export {
  DUNGEON_COLLIDERS,
  PLAYER_RADIUS,
  hitsCollider as hitsDungeonCollider,
  isBlockedAt,
  type DungeonCollider,
} from "./world/colliders.ts";

function standard(
  color: THREE.ColorRepresentation,
  roughness = 0.9,
  metalness = 0,
) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/**
 * The flat fill characters are lit by in place of a physical indirect term.
 *
 * The room's own fill is an AmbientLight of #4c4034 at 1.15 plus a
 * HemisphereLight at 1, which together come to roughly (0.27, 0.19, 0.12) of
 * linear irradiance. Characters take a fraction of that and nothing else: no
 * hemisphere gradient, no environment, no indirect specular. The reference
 * figures are cut by a single source and go genuinely dark on the away side,
 * which is the whole reason they read as carved rather than as photographs.
 *
 * Not zero, though. Zero indirect light against inverse-square point lamps
 * leaves anyone more than two metres from a lamp as a black cutout on a lit
 * wall. This is the one number to turn if characters sit wrong against the
 * architecture: raise it and they flatten toward the room, lower it and they
 * harden toward the reference.
 */
const CHARACTER_FILL = new THREE.Color("#4c4034").multiplyScalar(1.5);

/** How far light wraps past the terminator, 0 being true Lambert. */
const CHARACTER_WRAP = 0.28;

const CHARACTER_VERTEX = /* glsl */ `
  varying vec3 vViewPosition;
  varying vec3 vCharNormal;
  #ifdef CHAR_MAP
    varying vec2 vCharUv;
  #endif

  #include <common>
  #include <fog_pars_vertex>

  void main() {
    #ifdef CHAR_MAP
      vCharUv = uv;
    #endif
    vCharNormal = normalize( normalMatrix * normal );
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    vViewPosition = - mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

/**
 * Characters are shaded by wrapped Lambert against the point lamps and nothing
 * else. There is no specular lobe at any roughness, and no indirect term beyond
 * a flat fill.
 *
 * This exists because MeshStandardMaterial cannot express it. Its
 * RE_Direct_Physical always evaluates BRDF_GGX_Multiscatter and its indirect
 * path always evaluates getAmbientLightIrradiance through an environment BRDF;
 * neither is reachable from roughness or metalness, so no combination of
 * material properties removes the sheen. Leaving the standard material behind
 * is the only way to be rid of it.
 *
 * Shading is smooth. It was flat — one normal per triangle, taken from the
 * derivatives of view position — on the argument that faceting reads as carved.
 * On a body assembled from tapered prisms it does not: every limb becomes a run
 * of hard-edged plates and the figure reads as sheet metal, which is exactly the
 * tin man these were reported as. The lighting model is unchanged; only the
 * normal is, from per-facet to the interpolated vertex normal, so curved volumes
 * shade as curves.
 *
 * Normalisation deliberately mirrors Three's: irradiance is accumulated as
 * colour x attenuation x N.L exactly as lights_physical does, then multiplied
 * by RECIPROCAL_PI at the end the way BRDF_Lambert would. Without that these
 * figures would render PI times brighter than the masonry beside them under the
 * same lamp.
 */
const CHARACTER_FRAGMENT = /* glsl */ `
  uniform vec3 diffuse;
  uniform vec3 fill;
  uniform float wrap;
  uniform float lift;

  #ifdef CHAR_MAP
    uniform sampler2D charMap;
    varying vec2 vCharUv;
  #endif

  varying vec3 vViewPosition;
  varying vec3 vCharNormal;

  #include <common>
  #include <lights_pars_begin>
  #include <fog_pars_fragment>

  // Named apart from Three's getDistanceAttenuation so including
  // lights_pars_begin above cannot collide with it, but numerically identical.
  float charFalloff( const in float dist, const in float cutoff, const in float decay ) {
    float falloff = 1.0 / max( pow( dist, decay ), 0.01 );
    if ( cutoff > 0.0 ) {
      falloff *= pow2( saturate( 1.0 - pow4( dist / cutoff ) ) );
    }
    return falloff;
  }

  void main() {
    vec4 albedo = vec4( diffuse, 1.0 );
    #ifdef CHAR_MAP
      albedo *= texture2D( charMap, vCharUv );
    #endif
    // Raise the black point without touching the white one. A sheet painted as
    // a black habit sits near 0.01 linear, where no lamp recovers a fold, but
    // scaling it up to compensate also scales its pale collar past white and
    // blows it out. This compresses [0,1] into [lift,1] instead, so the cloth
    // lifts off black and anything already bright stays put.
    albedo.rgb = lift + albedo.rgb * ( 1.0 - lift );

    // The interpolated vertex normal, flipped to face the viewer so a volume
    // seen from inside — the far wall of a cowl, the underside of a hem — is not
    // lit as though its back were its front.
    vec3 normal = normalize( vCharNormal );
    if ( ! gl_FrontFacing ) normal = - normal;

    vec3 irradiance = fill;

    #if NUM_POINT_LIGHTS > 0
      vec3 viewPosition = - vViewPosition;
      for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
        vec3 toLight = pointLights[ i ].position - viewPosition;
        float lightDistance = length( toLight );
        vec3 direction = toLight / max( lightDistance, 1e-4 );
        float attenuation = charFalloff(
          lightDistance, pointLights[ i ].distance, pointLights[ i ].decay
        );
        // Wrapped rather than clamped at zero. A hard terminator across facets
        // this large steps the whole side of a face to fill in one edge.
        float lambert = saturate( ( dot( normal, direction ) + wrap ) / ( 1.0 + wrap ) );
        irradiance += pointLights[ i ].color * attenuation * lambert;
      }
    #endif

    gl_FragColor = vec4( albedo.rgb * irradiance * RECIPROCAL_PI, albedo.a );

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/**
 * A character surface: matte, unglossed, lit by the lamps and a flat fill.
 *
 * Shading flat is intrinsic here rather than a material flag, so there is no
 * separate faceting step and no smooth-shaded character surface can be created
 * by accident.
 */
function character(color: THREE.ColorRepresentation, map?: THREE.Texture, lift = 0) {
  const material = new THREE.ShaderMaterial({
    vertexShader: CHARACTER_VERTEX,
    fragmentShader: CHARACTER_FRAGMENT,
    lights: true,
    fog: true,
    defines: map ? { CHAR_MAP: "" } : {},
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
      THREE.UniformsLib.fog,
      {
        diffuse: { value: new THREE.Color() },
        fill: { value: new THREE.Color() },
        wrap: { value: CHARACTER_WRAP },
        lift: { value: lift },
        charMap: { value: null },
      },
    ]),
  });
  // Set after the merge: UniformsUtils.merge clones every value it is given, so
  // assigning a texture inside the literal above would hand the clone a
  // detached copy and the sheet would never reach the shader.
  material.uniforms.diffuse.value = new THREE.Color(color);
  material.uniforms.fill.value = CHARACTER_FILL;
  if (map) material.uniforms.charMap.value = map;
  return material;
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

/**
 * A flat graphic mounted on a wall: an inscription panel, a painted mural.
 *
 * Explicitly not a shadow caster. These sit a centimetre off the masonry so they
 * do not z-fight with it, and a lamp anywhere but straight ahead of one throws
 * that centimetre of separation onto the wall as a hard offset copy of the
 * panel's own outline. The result is a sign with a drop shadow, which is
 * precisely how a decal flush against a wall announces that it is floating in
 * front of it. Nothing is lost by not casting: there is a wall immediately
 * behind, so there is nowhere for the shadow to legitimately fall.
 */
function wallDecal(geometry: THREE.BufferGeometry, material: THREE.Material) {
  const decal = new THREE.Mesh(geometry, material);
  decal.castShadow = false;
  decal.receiveShadow = true;
  return decal;
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
  segments = 14,
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

const reportedLimbs = new Set<string>();

/**
 * Checks that a limb stays visible against the torso, and reports it if not.
 *
 * A limb that intersects the torso is normal and wanted — that is how an arm
 * welds to a body with no rig to skin it. What is never wanted is a limb whose
 * entire cross-section passes inside the torso's surface, because it vanishes
 * for that stretch and re-emerges further along, reading as a detached forearm
 * hanging in front of the chest. That is a silent failure: it looks correct from
 * the one angle the numbers were tuned at, and the numbers here are tuned by
 * hand against a profile that has itself been retuned several times.
 *
 * `exempt` is the fraction of the limb nearest its start that is allowed to be
 * buried, so a shoulder can sit deliberately inside the chest.
 */
function checkLimbClearance(
  label: string,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radiusStart: number,
  radiusEnd: number,
  torsoY: number,
  torsoHeight: number,
  exempt = 0,
) {
  const samples = 21;
  let worst: { at: number; buried: number } | null = null;
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    if (t < exempt) continue;
    const y = start.y + (end.y - start.y) * t;
    if (y < torsoY - torsoHeight / 2 || y > torsoY + torsoHeight / 2) continue;
    const x = start.x + (end.x - start.x) * t;
    const z = start.z + (end.z - start.z) * t;
    const radius = radiusStart + (radiusEnd - radiusStart) * t;
    // Positive means even the limb's outermost surface is inside the torso's.
    const buried = torsoRadiusAt(y, torsoY, torsoHeight) - (Math.hypot(x, z) + radius);
    if (!worst || buried > worst.buried) worst = { at: t, buried };
  }
  if (worst && worst.buried > -0.008 && !reportedLimbs.has(label)) {
    reportedLimbs.add(label);
    console.warn(
      `[dungeon] limb "${label}" is inside the torso at ${(worst.at * 100).toFixed(0)}% of its ` +
        `length (${(worst.buried * 1000).toFixed(0)}mm past the surface). It will read as ` +
        `detached from the body.`,
    );
  }
  return worst;
}

/** A rounded cap at a limb joint so consecutive segments read as continuous. */
function addJoint(
  parent: THREE.Object3D,
  material: THREE.Material,
  at: THREE.Vector3,
  radius: number,
) {
  const item = mesh(new THREE.SphereGeometry(radius, 12, 9), material);
  item.position.copy(at);
  parent.add(item);
  return item;
}

/**
 * A foot: heel, instep and a spread forefoot, pointing along -Z with the body.
 *
 * These were boxes — 105 x 100 x 240mm slabs lying on the floor beneath a robe,
 * with no leg above them. A rectangular block is the single loudest tin-man cue
 * available on a figure, because a real foot has no vertical face anywhere on
 * it, and a foot with no ankle above it cannot be shown to be taking a step.
 */
function addFoot(
  parent: THREE.Object3D,
  material: THREE.Material,
  at: THREE.Vector3,
) {
  const foot = new THREE.Group();
  foot.position.copy(at);

  const heel = mesh(new THREE.SphereGeometry(0.052, 12, 9), material);
  heel.position.set(0, 0.05, 0.032);
  heel.scale.set(0.9, 0.86, 1);
  foot.add(heel);

  // The instep slopes from under the ankle down towards the ball.
  const instep = mesh(new THREE.SphereGeometry(0.05, 12, 9), material);
  instep.position.set(0, 0.044, -0.05);
  instep.scale.set(1.02, 0.8, 1.55);
  foot.add(instep);

  // Wider and flatter than the heel, with the toe rounded off rather than cut.
  const fore = mesh(new THREE.SphereGeometry(0.045, 12, 9), material);
  fore.position.set(0, 0.034, -0.13);
  fore.scale.set(1.2, 0.7, 1.4);
  foot.add(fore);

  parent.add(foot);
  return foot;
}

/**
 * A joint the renderer can rotate: a hip or a shoulder.
 *
 * The body has no skeleton and no skinning, so a limb can only swing if it is
 * built inside its own group with its origin at the joint. `local` rebases a
 * point authored in body space into that group, which keeps the limb numbers
 * readable as body measurements rather than as offsets from a pivot.
 */
function makePivot(parent: THREE.Object3D, at: THREE.Vector3) {
  const pivot = new THREE.Group();
  pivot.position.copy(at);
  parent.add(pivot);
  return {
    pivot,
    local: (point: THREE.Vector3) => point.clone().sub(at),
  };
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
  /** Which garment sheet clothes the figure. Prisoners always take their own. */
  garment?: "official" | "clerk";
  scale?: number;
};

// Head radius before the per-axis skull scaling below. Faces, hoods, caps and
// the neck are all sized from this so they stay locked together.
//
// Measured against the reference figures, which stand 7.5 and 8.1 heads tall.
// At 0.145 these figures were 5.7 heads — a head half again too large for the
// body, which is most of what made them read as toys rather than as people. A
// head is the unit everything else is judged against, so it has to be right
// before any other proportion can be.
const HEAD_RADIUS = 0.112;
const HEAD_SCALE = new THREE.Vector3(0.84, 1.12, 0.9);
const HEAD_HALF_HEIGHT = HEAD_RADIUS * HEAD_SCALE.y;
const HEAD_HALF_WIDTH = HEAD_RADIUS * HEAD_SCALE.x;
const HEAD_HALF_DEPTH = HEAD_RADIUS * HEAD_SCALE.z;
// Horizontal half-angle of the textured face shell. Just past 80 degrees puts
// the seam on the head's silhouette, where it is effectively invisible.
const FACE_HALF_SPAN = 1.45;
/**
 * Where the face shell samples its sheet.
 *
 * The old portraits were front-on photographs floating on a field of flat tan,
 * so this had to crop hard into the middle of the image to keep that field off
 * the head — and even then the field wrapped around the jaw as a pale halo. The
 * sheets are now painted as unwraps: the features sit in the middle, the ears
 * run out to roughly u 0.08 and 0.92, the hair crosses the top, and the neck and
 * chest occupy the bottom third. So U now runs nearly edge to edge, and V starts
 * above the chest rather than at the very bottom of the frame.
 */
const FACE_BOUNDS = { u0: 0.08, u1: 0.92, v0: 0.3, v1: 1 };
/**
 * Where the rear-of-head shell samples its sheet: everything above the nape
 * hairline. Below that line the sheets carry bare neck and shoulder skin, which
 * belongs to the neck cylinder, not to the hair.
 */
const REAR_BOUNDS = { v0: 0.3, v1: 1 };
/** Angular half-span of the rear hair shell, matching makeHead's geometry. */
const REAR_HALF_SPAN = (Math.PI * 2 - FACE_HALF_SPAN * 2 + 0.24) / 2;

/**
 * Where each garment sheet's waist seam falls in V.
 *
 * Measured off the sheets rather than guessed — the strongest horizontal
 * luminance break in each image — because the three of them disagree: the
 * prisoner's gathering seam sits at 0.60, the abbess's at 0.64, the clerk's at
 * 0.50. The torso volume takes the sheet above its own line and the skirt takes
 * everything below, so no sheet hands the torso the top of a skirt.
 */
const GARMENT_WAIST_V: Record<string, number> = {
  prisonerTunic: 0.6,
  officialRobe: 0.64,
  clerkRobe: 0.5,
};
/**
 * Where each sheet stops being plain cloth and becomes collar, neckline and
 * cuffs. All three cross over within a few percent of each other, so one line
 * serves: below it the torso and the shoulder slope, above it the collar ring.
 *
 * Keeping the two apart matters. Handing the collar band to a wide shoulder cone
 * stretched a neckline arc into a pale bib across the chest, and drew it a second
 * time where the torso's own top edge reached the same rows.
 */
const GARMENT_COLLAR_V = 0.82;

// The torso volume's profile. Everything that has to meet the torso — the
// shoulder slope, the sleeve heads, the shoulder and elbow joints — is derived
// from these rather than carrying its own hand-tuned copy of them, because that
// is how the arms and the yoke drifted out of agreement with the body in the
// first place.
// Widest at the chest, narrowest at the waist. It used to be the other way
// round — 0.225 at the top opening out to 0.26 at the bottom — so every figure
// was a barrel that flared downwards, with no waist at all. Against the
// reference figures these were close to twice as wide as they should be: their
// waists measure 0.15 to 0.19 of standing height, where these measured 0.31.
const TORSO_TOP_RADIUS = 0.168;
const TORSO_BOTTOM_RADIUS = 0.14;
// Raised from 10. At ten sides a shoulder is a decagon, and with the shading
// now smooth rather than faceted the silhouette is what gives the polygon count
// away: a torso seen against a lit wall showed its corners.
const TORSO_SEGMENTS = 16;
// Hips pick the waist back up below the belt; a human is not a cone from chest
// to floor. Garment volumes below the waist start here.
const HIP_RADIUS = 0.165;
/**
 * How deep the body is relative to how wide it is.
 *
 * A torso built as a prism around a circle is a tube, and reads as one however
 * carefully it is tapered — which is why these figures still looked like
 * barrels after their proportions were corrected. A human chest is roughly half
 * again wider than it is deep. Flattening front to back is the difference
 * between a person and a length of pipe.
 */
const BODY_DEPTH = 0.72;

/**
 * The radius of the torso's *surface* at a given height.
 *
 * Note the inscribed-radius correction. The torso is a ten-sided prism, not a
 * cylinder, so between two vertices its face lies closer to the axis than the
 * nominal radius by cos(pi/segments) — about 5%. Placing a limb against the
 * nominal radius leaves it floating a few millimetres off the flat of a facet.
 */
function torsoRadiusAt(y: number, torsoY: number, torsoHeight: number) {
  const bottom = torsoY - torsoHeight / 2;
  const fraction = THREE.MathUtils.clamp((y - bottom) / torsoHeight, 0, 1);
  const radius =
    TORSO_BOTTOM_RADIUS + (TORSO_TOP_RADIUS - TORSO_BOTTOM_RADIUS) * fraction;
  return radius * Math.cos(Math.PI / TORSO_SEGMENTS);
}

/**
 * The nominal (vertex, not facet) radius of a tapered volume at a height.
 *
 * A belt has to clear the vertices of whatever it is buckled over, not its flat
 * faces. Sized to the flats it sinks below the corners and survives only as a
 * few dark slivers between them, which is what showed through as tabs on the
 * prisoner's hips — the skirt there is wider than the torso the belt was
 * measured against.
 */
function coneRadiusAt(
  y: number,
  centreY: number,
  height: number,
  radiusTop: number,
  radiusBottom: number,
) {
  const fraction = THREE.MathUtils.clamp((y - (centreY - height / 2)) / height, 0, 1);
  return radiusBottom + (radiusTop - radiusBottom) * fraction;
}

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
 * The same cylindrical unwrap as projectFaceUv, but centred on the back of the
 * head so the rear sheet's crown whorl lands on the crown and its nape lands at
 * the nape. Without this the hair shell samples a sphere's default UVs and the
 * whorl ends up over one ear.
 */
function projectRearUv(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const height = Math.max(1e-5, box.max.y - box.min.y);
  for (let i = 0; i < position.count; i++) {
    // Characters face -Z, so the rear shell is centred on +Z.
    const angle = Math.atan2(position.getX(i), position.getZ(i));
    const u = THREE.MathUtils.clamp(angle / (REAR_HALF_SPAN * 2) + 0.5, 0, 1);
    const v = (position.getY(i) - box.min.y) / height;
    uv.setXY(i, u, REAR_BOUNDS.v0 + v * (REAR_BOUNDS.v1 - REAR_BOUNDS.v0));
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
  depthScale = BODY_DEPTH,
) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1);
  // Cylinder UVs start at +Z and run around, so u = 0.5 lands on -Z: the
  // texture's centred lacing and belt buckle end up on the character's chest.
  remapUv(geometry, 0, 1, uvRange[0], uvRange[1]);
  const item = mesh(geometry, material);
  item.position.set(...position);
  item.scale.z = depthScale;
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
  hairMaterial: THREE.Material,
  options: { hair: boolean; hood: boolean; masked: boolean },
) {
  const head = new THREE.Group();

  // Segment counts are held close to the body's, so no part of a figure reads as
  // a smooth object pasted onto a coarse one. Both have risen together now that
  // shading is smooth: at the old counts a head was a visibly ten-sided ball.
  const skull = mesh(new THREE.SphereGeometry(HEAD_RADIUS, 22, 16), skin);
  head.add(skull);

  const faceShell = new THREE.SphereGeometry(
    HEAD_RADIUS * 1.006,
    26,
    18,
    -Math.PI / 2 - FACE_HALF_SPAN,
    FACE_HALF_SPAN * 2,
    0.2,
    2.36,
  );
  projectFaceUv(faceShell, FACE_HALF_SPAN);
  const face = mesh(faceShell, options.masked ? materials.mask : faceMaterial);
  head.add(face);

  if (options.hair && !options.hood && !options.masked) {
    // Hair covers the rear of the skull; the face sheet already carries the
    // hairline across the front. This used to be flat black, which left the back
    // of every head a featureless dark ball — the bare skull seen from behind in
    // the tribunal. It now carries its own painted sheet with the crown whorl and
    // the nape in the right places.
    const rearStart = -Math.PI / 2 + FACE_HALF_SPAN - 0.12;
    const hairShell = mesh(
      projectRearUv(
        new THREE.SphereGeometry(
          HEAD_RADIUS * 1.012,
          22,
          15,
          rearStart,
          REAR_HALF_SPAN * 2,
          0,
          // Down to the nape. Stopping at 1.85 left a band of bare skull between
          // the hair's rim and the neck, which read as an undercut notch shaved
          // into the back of every head. The sheets paint their own nape hairline,
          // so the shell can run past the equator and let the art end the hair.
          2.12,
        ),
      ),
      hairMaterial,
    );
    head.add(hairShell);
  }

  head.scale.copy(HEAD_SCALE);
  return head;
}

export function makePerson(materials: Record<string, THREE.Material>, options: PersonOptions = {}) {
  const group = new THREE.Group();
  const robe = options.robe ? character(options.robe) : materials.blackCloth;
  // Matched to the portrait sheets' own skin tone so the neck and hands read as
  // the same person as the face.
  const skin = character(options.skin ?? "#9a7659");
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
  // Set so a few centimetres of neck clear the collar. It used to sit low
  // enough that the collar ring's top edge crossed above the chin and the head
  // grew straight out of the shoulders, which is a large part of why these read
  // as tin men: the reference figures all carry the head proud of the collar.
  const headY = collarTopY + HEAD_HALF_HEIGHT - 0.014;
  // The belt line, needed before the lower body is built so each branch can
  // report how wide its skirt is where the belt has to pass over it.
  const beltY = torsoY - torsoHeight / 2;
  let beltClears = torsoRadiusAt(beltY, torsoY, torsoHeight);

  const garmentKey = prisoner
    ? "prisonerTunic"
    : options.garment === "clerk"
      ? "clerkRobe"
      : "officialRobe";
  const garmentMaterial = materials[garmentKey];
  // Each sheet's own waist seam divides torso from skirt.
  const waistV = GARMENT_WAIST_V[garmentKey];

  // Lower body. The garment texture is mapped onto the body volumes
  // themselves; nothing is a flat panel floating in front of the mesh.
  //
  // Standing figures are built leg-first, inside a pivot at each hip, so the
  // renderer can swing them. Everything below is authored in body coordinates
  // and rebased into the pivot by `local`, which keeps these readable as
  // measurements off a body rather than as offsets from a joint.
  const legPivots: THREE.Group[] = [];
  const armPivots: THREE.Group[] = [];
  if (prisoner && !seated) {
    for (const side of [-1, 1]) {
      const thighTop = new THREE.Vector3(side * 0.094, hipY, 0.01);
      const knee = new THREE.Vector3(side * 0.098, 0.46, 0);
      const ankle = new THREE.Vector3(side * 0.1, 0.11, 0);
      const { pivot, local } = makePivot(group, thighTop);
      legPivots.push(pivot);
      addLimb(pivot, materials.prisonerCloth, local(thighTop), local(knee), 0.075, 0.058, 12);
      addJoint(pivot, materials.prisonerCloth, local(knee), 0.058);
      addLimb(pivot, materials.prisonerCloth, local(knee), local(ankle), 0.06, 0.045, 12);
      addFoot(pivot, materials.darkLeather, local(new THREE.Vector3(side * 0.1, 0, -0.005)));
    }
    addGarmentVolume(group, garmentMaterial, HIP_RADIUS, 0.208, 0.34, [0, hipY + 0.04, 0.015], [0, waistV], TORSO_SEGMENTS);
    beltClears = Math.max(beltClears, coneRadiusAt(beltY, hipY + 0.04, 0.34, HIP_RADIUS, 0.208));
  } else if (prisoner) {
    for (const side of [-1, 1]) {
      const thighTop = new THREE.Vector3(side * 0.094, hipY, 0.01);
      const knee = new THREE.Vector3(side * 0.098, 0.51, -0.24);
      const ankle = new THREE.Vector3(side * 0.1, 0.13, -0.32);
      addLimb(group, materials.prisonerCloth, thighTop, knee, 0.075, 0.058, 12);
      addJoint(group, materials.prisonerCloth, knee, 0.058);
      addLimb(group, materials.prisonerCloth, knee, ankle, 0.06, 0.045, 12);
      addFoot(group, materials.darkLeather, new THREE.Vector3(side * 0.1, 0, -0.36));
    }
    addGarmentVolume(group, garmentMaterial, HIP_RADIUS, 0.208, 0.34, [0, hipY + 0.04, 0.015], [0, waistV], TORSO_SEGMENTS);
    beltClears = Math.max(beltClears, coneRadiusAt(beltY, hipY + 0.04, 0.34, HIP_RADIUS, 0.208));
  } else if (seated) {
    addGarmentVolume(group, garmentMaterial, HIP_RADIUS, 0.222, 0.32, [0, 0.81, 0.015], [0, waistV], TORSO_SEGMENTS);
    beltClears = Math.max(beltClears, coneRadiusAt(beltY, 0.81, 0.32, HIP_RADIUS, 0.222));
    for (const side of [-1, 1]) {
      const thighTop = new THREE.Vector3(side * 0.098, hipY, 0);
      const knee = new THREE.Vector3(side * 0.104, 0.5, -0.24);
      const ankle = new THREE.Vector3(side * 0.104, 0.14, -0.31);
      addLimb(group, robe, thighTop, knee, 0.077, 0.06, 12);
      addJoint(group, robe, knee, 0.06);
      addLimb(group, materials.darkLeather, knee, ankle, 0.06, 0.045, 12);
      addFoot(group, materials.darkLeather, new THREE.Vector3(side * 0.104, 0, -0.35));
    }
  } else {
    // A robe falls from the hips and widens to the hem, and stops above the
    // ankle. It used to sweep the floor, which hid the entire lower body: there
    // were no legs at all under it, only two leather boxes lying on the
    // flagstones, and a figure whose feet never appear cannot be shown to be
    // taking steps rather than sliding along on a base.
    addGarmentVolume(group, garmentMaterial, HIP_RADIUS, 0.262, 0.72, [0, 0.56, 0.025], [0, waistV], TORSO_SEGMENTS);
    beltClears = Math.max(beltClears, coneRadiusAt(beltY, 0.56, 0.72, HIP_RADIUS, 0.262));
    for (const side of [-1, 1]) {
      const thighTop = new THREE.Vector3(side * 0.09, hipY - 0.04, 0);
      const knee = new THREE.Vector3(side * 0.096, 0.44, 0.005);
      const ankle = new THREE.Vector3(side * 0.1, 0.1, 0);
      const { pivot, local } = makePivot(group, thighTop);
      legPivots.push(pivot);
      addLimb(pivot, robe, local(thighTop), local(knee), 0.084, 0.064, 12);
      addJoint(pivot, robe, local(knee), 0.064);
      addLimb(pivot, materials.darkLeather, local(knee), local(ankle), 0.063, 0.047, 12);
      addFoot(pivot, materials.darkLeather, local(new THREE.Vector3(side * 0.1, 0, -0.01)));
    }
  }

  // Torso: one tapered volume carrying the garment texture, stopping below the
  // sheet's collar band so the neckline is not drawn here as well as on the ring.
  addGarmentVolume(
    group,
    garmentMaterial,
    TORSO_TOP_RADIUS,
    TORSO_BOTTOM_RADIUS,
    torsoHeight,
    [0, torsoY, 0],
    [waistV, GARMENT_COLLAR_V],
    TORSO_SEGMENTS,
  );
  // Shoulders. This was a 0.19m cone flaring to a radius of 0.264 against a
  // torso top of 0.225, so its rim stood 39mm proud the whole way round: a hard
  // overhanging lip with the head perched above it, which is what made these
  // figures read as lampshades. It is now a shallow slope whose bottom radius is
  // the torso's own radius where the two meet, so there is no lip to catch the
  // light, and it is short enough to read as a shoulder rather than a bell.
  const shoulderSlopeBottom = shoulderTopY - 0.02;
  addGarmentVolume(
    group,
    garmentMaterial,
    0.134,
    torsoRadiusAt(shoulderSlopeBottom, torsoY, torsoHeight) + 0.003,
    0.13,
    [0, shoulderSlopeBottom + 0.065, 0],
    [GARMENT_COLLAR_V - 0.1, GARMENT_COLLAR_V],
    TORSO_SEGMENTS,
  );
  // A short collar ring at the throat, which is what actually wears the collar
  // band the sheets paint across their top edge.
  addGarmentVolume(
    group,
    garmentMaterial,
    0.082,
    0.118,
    0.055,
    [0, collarTopY - 0.055, 0],
    [GARMENT_COLLAR_V, 1],
    TORSO_SEGMENTS,
  );
  // Shoulder caps, so the arms grow out of cloth instead of out of thin air.
  // These were horizontal cylinders, which stuck out either side as hard
  // angular tabs — pauldrons on a suit of armour rather than shoulders. A
  // rounded cap is what the reference figures have: the silhouette runs neck,
  // sloping trapezius, round deltoid, arm, with no corner anywhere along it.
  for (const side of [-1, 1]) {
    const deltoid = mesh(new THREE.SphereGeometry(0.075, 16, 12), garmentMaterial);
    // Confined to the same plain shoulder cloth the slope wears. Default UVs
    // span the sheet's whole height, which drew the pale collar band across
    // each shoulder as a bright wedge.
    remapUv(deltoid.geometry, 0, 1, GARMENT_COLLAR_V - 0.1, GARMENT_COLLAR_V);
    deltoid.position.set(side * 0.165, shoulderTopY - 0.062, 0);
    deltoid.scale.set(1, 0.92, BODY_DEPTH / 0.72 * 0.86);
    deltoid.castShadow = true;
    group.add(deltoid);
  }
  // The belt follows the torso's ten-sided profile. It used to be a 0.48 x 0.31
  // box inside a prism of radius 0.247, so its four corners stood 39mm proud of
  // the cloth and showed through as dark tabs on both hips.
  const beltRadius = beltClears + 0.008;
  addCylinder(
    group,
    materials.darkLeather,
    beltRadius,
    beltRadius,
    0.052,
    [0, beltY, 0],
    [0, 0, 0],
    TORSO_SEGMENTS,
  ).scale.setZ(BODY_DEPTH);
  // Neck bridges the collar opening and the underside of the skull.
  addCylinder(
    group,
    skin,
    HEAD_HALF_WIDTH * 0.5,
    HEAD_HALF_WIDTH * 0.62,
    0.2,
    [0, collarTopY - 0.03, 0.004],
    [0, 0, 0],
    7,
  );

  const faceKey = options.face ?? (prisoner ? "young" : "mature");
  // Face and rear-of-head are always taken as a pair, so nobody wears one
  // person's face over another's hair.
  const sheetKey = faceKey === "young"
    ? "Young"
    : faceKey === "elder"
      ? "Elder"
      : faceKey === "secretary"
        ? "Secretary"
        : "Mature";
  const faceMaterial = materials[`face${sheetKey}`];
  const hairMaterial = materials[`hair${sheetKey}`];
  const head = makeHead(materials, skin, faceMaterial, hairMaterial, {
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
        12,
        8,
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
    addCylinder(
      group,
      robe,
      HEAD_RADIUS * 1.06,
      HEAD_RADIUS * 1.09,
      0.042,
      [0, headY + HEAD_HALF_HEIGHT * 0.66, 0.006],
      [0.28, 0, 0],
      8,
    );
    // Cloth falling from the cowl onto the shoulders. Sized off the torso it
    // lands on; at 0.3 it stood 8cm proud of the body as a hard flared bell.
    addCylinder(
      group,
      robe,
      0.145,
      torsoRadiusAt(shoulderY, torsoY, torsoHeight) + 0.05,
      0.24,
      [0, shoulderY + 0.075, 0.006],
      [0, 0, 0],
      TORSO_SEGMENTS,
    );
  }

  if (options.masked) {
    for (const side of [-1, 1]) {
      addBox(
        group,
        materials.eyeSocket,
        [HEAD_HALF_WIDTH * 0.37, 0.013, 0.01],
        [side * HEAD_HALF_WIDTH * 0.46, headY + HEAD_HALF_HEIGHT * 0.15, -HEAD_HALF_DEPTH * 0.97],
      );
    }
  }

  // Arms start inside the torso volume and carry joint caps at shoulder and
  // elbow, so limbs read as one continuous arm rather than loose sticks.
  if (options.prisoner) {
    // Bound wrists, crossed in front of the belly. The forearms are routed
    // around the outside of the torso rather than straight across to the far
    // side of the body: the earlier chord ran from the elbow through the
    // torso's interior and re-emerged near the wrist, which buried the whole
    // cross-section of the left forearm and left a hand apparently floating in
    // front of the chest with no arm attached to it. Sinking the elbows forward
    // to roughly the depth of the wrists keeps the whole span proud of the
    // cloth. It also brings the forearms back to 28cm from the 40cm they needed
    // to reach across the body.
    const leftShoulder = new THREE.Vector3(-0.186, shoulderY - 0.02, -0.01);
    const rightShoulder = new THREE.Vector3(0.186, shoulderY - 0.02, -0.01);
    const leftElbow = new THREE.Vector3(-0.178, torsoY - 0.07, -0.145);
    const rightElbow = new THREE.Vector3(0.178, torsoY - 0.085, -0.15);
    const leftWrist = new THREE.Vector3(0.028, torsoY - 0.175, -0.222);
    const rightWrist = new THREE.Vector3(-0.028, torsoY - 0.205, -0.246);
    for (const [shoulder, elbow, wrist] of [
      [leftShoulder, leftElbow, leftWrist],
      [rightShoulder, rightElbow, rightWrist],
    ]) {
      addJoint(group, skin, shoulder, 0.05);
      addLimb(group, skin, shoulder, elbow, 0.045, 0.037);
      addJoint(group, skin, elbow, 0.039);
      addLimb(group, skin, elbow, wrist, 0.037, 0.03);
      // The first fifth of the upper arm is meant to be inside the chest.
      checkLimbClearance("prisoner upper arm", shoulder, elbow, 0.045, 0.037, torsoY, torsoHeight, 0.2);
      checkLimbClearance("prisoner forearm", elbow, wrist, 0.037, 0.03, torsoY, torsoHeight);
      // Hands are longer than they are wide and flattened front to back, so a
      // wrist ends in something with a back and a palm rather than in a ball.
      const hand = mesh(new THREE.SphereGeometry(0.043, 12, 9), skin);
      hand.position.copy(wrist);
      hand.scale.set(0.62, 1.25, 0.45);
      group.add(hand);
    }
  } else {
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Vector3(side * 0.19, shoulderY - 0.015, 0);
      const elbow = seated
        ? new THREE.Vector3(side * 0.222, 1.08, -0.07)
        : new THREE.Vector3(side * 0.218, 1.06, 0.01);
      // Raised from 0.91, which is exactly the height of the tables these
      // figures sit at, so a hand laid on the boards was half sunk into them.
      const wrist = seated
        ? new THREE.Vector3(side * 0.158, 0.985, -0.32)
        : new THREE.Vector3(side * 0.206, 0.74, -0.03);
      // Standing arms hang in a shoulder pivot so they can counter-swing against
      // the legs; seated ones are posed and stay put.
      const host = seated ? group : makePivot(group, shoulder).pivot;
      const at = seated
        ? (point: THREE.Vector3) => point
        : (point: THREE.Vector3) => point.clone().sub(shoulder);
      if (!seated) armPivots.push(host as THREE.Group);
      addJoint(host, robe, at(shoulder), 0.064);
      addLimb(host, robe, at(shoulder), at(elbow), 0.061, 0.05, 14);
      addJoint(host, robe, at(elbow), 0.052);
      addLimb(host, robe, at(elbow), at(wrist), 0.05, 0.04, 14);
      const pose = seated ? "seated" : "standing";
      checkLimbClearance(`${pose} upper arm`, shoulder, elbow, 0.061, 0.05, torsoY, torsoHeight, 0.2);
      checkLimbClearance(`${pose} forearm`, elbow, wrist, 0.05, 0.04, torsoY, torsoHeight);
      const hand = mesh(new THREE.SphereGeometry(0.042, 12, 9), skin);
      hand.position.copy(at(wrist));
      hand.scale.set(0.62, 1.25, 0.45);
      host.add(hand);
    }
  }

  if (options.cap) {
    // Sized and placed off the head rather than in absolute metres, so a change
    // to head size cannot leave the cap hovering above it or sunk into it.
    addBox(
      group,
      materials.blackCloth,
      [HEAD_HALF_WIDTH * 2.55, 0.042, HEAD_HALF_DEPTH * 2.22],
      [0, headY + HEAD_HALF_HEIGHT * 0.98, 0.004],
    );
    addBox(
      group,
      materials.blackCloth,
      [HEAD_HALF_WIDTH * 1.85, 0.075, HEAD_HALF_DEPTH * 1.65],
      [0, headY + HEAD_HALF_HEIGHT * 0.75, 0.004],
    );
    const tassel = addCylinder(
      group,
      options.crimsonTassel ? materials.redSilkFaceted : materials.blackCloth,
      0.018,
      0.021,
      0.16,
      [HEAD_HALF_WIDTH * 1.2, headY + HEAD_HALF_HEIGHT * 0.5, 0.015],
      [0, 0, 0.2],
      6,
    );
    tassel.castShadow = false;
  }

  if (!options.prisoner && !options.hood) {
    // Clerical bands at the throat, tucked against the neck rather than
    // hovering in front of it.
    for (const side of [-1, 1]) {
      addBox(
        group,
        materials.paperFaceted,
        [0.042, 0.095, 0.018],
        [side * 0.026, collarTopY - 0.085, -0.058],
        [0.12, 0, side * -0.07],
      );
    }
  }

  if (options.cross) {
    const cross = makeScarletCross(materials.redSilkFaceted, 0.42);
    cross.position.set(0, torsoY + 0.02, -0.25);
    group.add(cross);
  }

  // Characters cast into the lamps' shadow maps but never receive from them.
  // The reference figures are lit by one source with deep, unshadowed fill and
  // carry no shadow cast onto them at all. Sampling a point lamp's cube map
  // across a body this small mostly produced acne and a hard band where a
  // shadow camera cut the torso, which is what put the dark stripe across the
  // prisoner's chest.
  //
  // This also retires the old rule that the head must not cast: a skull could
  // drop a wedge from the chin over the chest only because the chest received.
  // The head can now shadow the room like the rest of the figure.
  group.traverse((item) => {
    const part = item as THREE.Mesh;
    if (!part.isMesh) return;
    part.castShadow = true;
    part.receiveShadow = false;
  });

  group.scale.setScalar(scale);
  // The rig the renderer animates. There is no skeleton and no skinning here —
  // these are the hip and shoulder groups the limbs were built inside, and a
  // walk is four rotations on them. Absent on seated and bound figures, which is
  // why `animateWalk` checks rather than assumes.
  group.userData.rig = { legs: legPivots, arms: armPivots };
  return group;
}

/**
 * Poses a figure's limbs for a point in its stride.
 *
 * `phase` advances with distance travelled rather than with elapsed time. That
 * is the whole fix for foot-slide: a figure that halves its speed halves its
 * cadence, and a figure that stops mid-round stops with its feet where they
 * were, instead of continuing to march on the spot. `blend` fades the swing out
 * as a figure comes to rest so it settles rather than freezing mid-step.
 */
export function animateWalk(figure: THREE.Object3D, phase: number, blend: number) {
  const rig = figure.userData.rig as
    | { legs: THREE.Group[]; arms: THREE.Group[] }
    | undefined;
  if (!rig) return;
  const swing = Math.sin(phase) * 0.52 * blend;
  rig.legs.forEach((leg, index) => {
    leg.rotation.x = index === 0 ? swing : -swing;
  });
  // Arms counter-swing against the legs, and at about half the amplitude: a
  // matched swing reads as a march, and an opposed one at equal amplitude reads
  // as a stage walk.
  rig.arms.forEach((arm, index) => {
    arm.rotation.x = (index === 0 ? -swing : swing) * 0.55;
  });
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
  colour: THREE.ColorRepresentation = "#f0a85a",
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
  const light = new THREE.PointLight(colour, intensity * 8.5, 14, 1.15);
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

/**
 * An empty habit on a rail: shoulders, a fallen cowl, and cloth to the hem.
 *
 * Explicitly not a person. The press used to be filled with three calls to
 * `makePerson`, which was survivable while a robed figure was a cone with two
 * boxes under it and became grotesque the moment robed figures acquired faces
 * and legs: the wardrobe stood open on three men hanging silently in a cupboard.
 * A hanging garment has no head, no hands and no feet, and holds the shape of a
 * shoulder only because there is a wooden crosspiece through it.
 */
function makeHangingGarment(materials: Record<string, THREE.Material>, drop: number) {
  const garment = new THREE.Group();
  // Cloth from the shoulder line down, hanging straighter and narrower than a
  // worn robe because there is nobody inside it to fill it out.
  const body = mesh(new THREE.CylinderGeometry(0.15, 0.23, drop, 14, 1), materials.blackCloth);
  body.position.set(0, drop / 2, 0);
  body.scale.z = 0.62;
  garment.add(body);
  // The yoke over the crosspiece, and the cowl fallen back off it.
  const yoke = mesh(new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), materials.blackCloth);
  yoke.position.set(0, drop, 0);
  yoke.scale.set(1, 0.62, 0.62);
  garment.add(yoke);
  const cowl = mesh(new THREE.SphereGeometry(0.13, 14, 10, 0, Math.PI * 2, 0, 2), materials.blackCloth);
  cowl.position.set(0, drop - 0.05, 0.11);
  cowl.scale.set(1, 0.9, 0.72);
  garment.add(cowl);
  garment.traverse((item) => {
    if ((item as THREE.Mesh).isMesh) (item as THREE.Mesh).castShadow = true;
  });
  return garment;
}

function makeWardrobe(materials: Record<string, THREE.Material>) {
  const group = new THREE.Group();
  addBox(group, materials.wood, [1.45, 2.65, 0.2], [0, 1.35, 0.42]);
  addBox(group, materials.wood, [0.16, 2.75, 0.82], [-0.7, 1.35, 0]);
  addBox(group, materials.wood, [0.16, 2.75, 0.82], [0.7, 1.35, 0]);
  addBox(group, materials.wood, [1.55, 0.16, 0.82], [0, 2.69, 0]);
  addBox(group, materials.wood, [1.55, 0.16, 0.82], [0, 0.08, 0]);
  const rail = 2.34;
  addCylinder(group, materials.iron, 0.025, 0.025, 1.2, [0, rail, 0], [0, 0, Math.PI / 2], 8);
  // Three habits on the rail, and a fourth space with nothing in it. The gap is
  // the point of the room: one is missing, and the player is wearing it.
  for (const x of [-0.42, -0.02, 0.4]) {
    const garment = makeHangingGarment(materials, 1.62);
    garment.position.set(x, rail - 1.62, 0);
    group.add(garment);
  }
  // The bare hook the missing habit hung on.
  addCylinder(group, materials.iron, 0.02, 0.02, 0.1, [0.55, rail - 0.06, 0], [0, 0, 0], 6);
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

/**
 * Bendetta's wall: a demon daubed onto bare stone, and a scratched chronicle.
 *
 * Painted with a transparent ground rather than an opaque one, so the masonry
 * behind shows through everywhere the pigment does not reach. This is the whole
 * difference between what the text describes and what was here before, which was
 * an opaque rectangle in a chestnut frame — a hung picture, and hung pictures are
 * furniture. A prisoner's demon is not furniture. It has no edge, no ground and
 * no border; it is soot, ochre and a nail, worked directly into the wall by
 * somebody who had years and no materials.
 *
 * Everything is therefore drawn crudely on purpose: single strokes that do not
 * close, wavering lines, a mouth that is a scrape, and pigment that thins to
 * nothing at the margins instead of stopping at one.
 */
function makeMuralTexture() {
  return makeCanvasTexture(768, 1024, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    // Deterministic, so the wall is the same wall on every visit. A prisoner's
    // inscription that re-scrambled itself between two viewings would undo the
    // one thing it is for.
    let seed = 20250726;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const soot = (alpha: number) => `rgba(26,18,14,${alpha})`;
    const ochre = (alpha: number) => `rgba(150,74,32,${alpha})`;
    const chalk = (alpha: number) => `rgba(196,178,148,${alpha})`;

    /** A stroke that wavers, thins and does not quite close. */
    const scrawl = (
      points: [number, number][],
      colour: (a: number) => string,
      width: number,
      alpha: number,
    ) => {
      for (let pass = 0; pass < 3; pass++) {
        ctx.strokeStyle = colour(alpha * (0.42 + random() * 0.3));
        ctx.lineWidth = width * (0.6 + random() * 0.7);
        ctx.lineCap = "round";
        ctx.beginPath();
        points.forEach(([x, y], i) => {
          const jx = x + (random() - 0.5) * width * 1.4;
          const jy = y + (random() - 0.5) * width * 1.4;
          if (i === 0) ctx.moveTo(jx, jy);
          else ctx.lineTo(jx, jy);
        });
        ctx.stroke();
      }
    };

    // Smeared ground: pigment rubbed in with a hand, densest at the centre and
    // gone at the margins, so the painting has no edge.
    for (let i = 0; i < 320; i++) {
      const a = random() * Math.PI * 2;
      const r = Math.pow(random(), 0.7);
      const x = w * 0.5 + Math.cos(a) * r * w * 0.42;
      const y = h * 0.44 + Math.sin(a) * r * h * 0.34;
      ctx.fillStyle = random() < 0.6 ? soot(0.05 * (1 - r)) : ochre(0.055 * (1 - r));
      ctx.beginPath();
      ctx.ellipse(x, y, 14 + random() * 40, 10 + random() * 30, a, 0, Math.PI * 2);
      ctx.fill();
    }

    // The demon: horns, a heavy brow, and a body that is mostly shoulders. Drawn
    // as an outline with a partial soot fill, the way a figure is drawn by
    // somebody filling in what they can reach.
    const horns: [number, number][] = [
      [w * 0.29, h * 0.2], [w * 0.36, h * 0.29], [w * 0.44, h * 0.26],
      [w * 0.5, h * 0.235], [w * 0.56, h * 0.26], [w * 0.64, h * 0.29],
      [w * 0.71, h * 0.2],
    ];
    scrawl(horns, soot, 13, 0.85);
    scrawl([[w * 0.36, h * 0.29], [w * 0.34, h * 0.42], [w * 0.42, h * 0.5],
            [w * 0.58, h * 0.5], [w * 0.66, h * 0.42], [w * 0.64, h * 0.29]],
           soot, 12, 0.8);
    // Eyes: the text has them appear to move, so they are the one part given
    // any weight — two ochre discs with a soot centre.
    for (const ex of [0.435, 0.565]) {
      ctx.fillStyle = ochre(0.72);
      ctx.beginPath();
      ctx.ellipse(w * ex, h * 0.355, 20, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = soot(0.85);
      ctx.beginPath();
      ctx.ellipse(w * ex + (random() - 0.5) * 4, h * 0.355, 8, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // A mouth scraped rather than drawn.
    scrawl([[w * 0.42, h * 0.44], [w * 0.5, h * 0.465], [w * 0.58, h * 0.44]], soot, 9, 0.7);
    for (let i = 0; i < 7; i++) {
      const tx = w * (0.43 + i * 0.023);
      scrawl([[tx, h * 0.443], [tx + 3, h * 0.462]], chalk, 4, 0.5);
    }
    // Shoulders and arms, ending before the hands: the wall runs out.
    scrawl([[w * 0.42, h * 0.5], [w * 0.3, h * 0.57], [w * 0.22, h * 0.68]], soot, 14, 0.7);
    scrawl([[w * 0.58, h * 0.5], [w * 0.7, h * 0.57], [w * 0.78, h * 0.68]], soot, 14, 0.7);
    scrawl([[w * 0.42, h * 0.5], [w * 0.45, h * 0.72], [w * 0.55, h * 0.72], [w * 0.58, h * 0.5]], soot, 12, 0.6);

    // The vermin the text lists, as small ochre marks around the figure's feet:
    // serpents, a toad, a scorpion. Read as marks, not as illustrations.
    for (let i = 0; i < 9; i++) {
      const x = w * (0.16 + random() * 0.68);
      const y = h * (0.72 + random() * 0.1);
      scrawl([[x, y], [x + 22, y - 10], [x + 44, y + 6], [x + 62, y - 4]], ochre, 6, 0.55);
    }

    // The chronicle, scratched rather than written: rows of nail-marks with a
    // name still legible at the end and the rest worn to strokes. Drawn as
    // marks, so nothing here has to survive being read closely.
    for (let row = 0; row < 6; row++) {
      const y = h * (0.815 + row * 0.026);
      let x = w * 0.1;
      while (x < w * 0.9) {
        const len = 5 + random() * 16;
        scrawl([[x, y], [x + len, y + (random() - 0.5) * 5]], chalk, 3.2, 0.42);
        x += len + 5 + random() * 9;
      }
    }
    // Scraped away in the middle, as the text has it: the account is officially
    // damaged, not merely old.
    ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.25 + random() * 0.5})`;
      ctx.beginPath();
      ctx.ellipse(w * (0.3 + random() * 0.42), h * (0.83 + random() * 0.1),
                  18 + random() * 40, 7 + random() * 12, random(), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    // The name, cut deeper than anything else and left alone.
    ctx.font = "44px Georgia";
    ctx.textAlign = "center";
    for (let pass = 0; pass < 3; pass++) {
      ctx.fillStyle = chalk(0.3);
      ctx.fillText("BENDETTA CAZZALA · XVII",
                   w / 2 + (random() - 0.5) * 3, h * 0.965 + (random() - 0.5) * 3);
    }
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
  // Character sheets are painted as unwraps rather than as front-on portraits:
  // face wraps with the ears at the edges, rear-of-head sheets with the crown
  // whorl centred, and garments laid out for a cylinder with the neckline at the
  // top and the hem at the bottom. The earlier -rpg.png portraits are gone; they
  // were photographs on a flat field and could not be made to wrap.
  const faceMatureTexture = loadSheet("/textures/mature-irish-woman-cylindrical-face-wrap-512.png");
  const faceYoungTexture = loadSheet("/textures/young-irish-woman-cylindrical-face-wrap-512.png");
  const faceElderTexture = loadSheet("/textures/elder-irish-woman-cylindrical-face-wrap-512.png");
  const faceSecretaryTexture = loadSheet("/textures/secretary-cylindrical-face-wrap-512.png");
  const hairMatureTexture = loadSheet("/textures/mature-irish-woman-rear-head-hair-512.png");
  const hairYoungTexture = loadSheet("/textures/young-irish-woman-rear-head-hair-512.png");
  const hairElderTexture = loadSheet("/textures/elder-irish-woman-rear-head-hair-512.png");
  const hairSecretaryTexture = loadSheet("/textures/secretary-rear-head-hair-512.png");
  const officialRobeTexture = loadSheet("/textures/abbess-senior-religious-garment-512.png");
  const clerkRobeTexture = loadSheet("/textures/secretary-clerk-garment-512.png");
  const prisonerTunicTexture = loadSheet("/textures/young-prisoner-garment-512.png");

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
  const garment = (map: THREE.Texture, color: THREE.ColorRepresentation, lift = 0) =>
    character(color, map, lift);
  const portrait = (map: THREE.Texture) => character("#f2eae0", map);

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
    // Character cloth. The bump map the room's velvet uses is dropped here: at
    // a scale of 0.012 it only ever perturbed the specular lobe, and there is
    // no longer a specular lobe on a person for it to perturb.
    blackCloth: character("#3b322c", clothTexture),
    // The sheets are painted at their intended value now, so the tints are close
    // to neutral and only trim the highlights back. The abbess habit takes a
    // black-point lift instead of a brighter tint: it is painted at a mean of
    // 0.11 sRGB, under 0.011 linear, where no lamp recovers a fold, but it also
    // carries a white neckline that a tint bright enough to fix the cloth would
    // drive well past white.
    officialRobe: garment(officialRobeTexture, "#f4efe6", 0.055),
    clerkRobe: garment(clerkRobeTexture, "#f0e9dd", 0.02),
    prisonerTunic: garment(prisonerTunicTexture, "#f2ead9"),
    // Leg wrappings, untextured. They are cylinders that addLimb leaves with
    // default UVs spanning the sheet's full height, which put the pale collar
    // band at the top of the sheet around the top of each thigh. A flat tone
    // taken from the tunic's own cloth is the honest fix at this scale.
    prisonerCloth: character("#6a5f4a"),
    clothTrim: standard("#191411", 1),
    redSilk: standard("#7d1a24", 0.72),
    darkLeather: character("#40291b"),
    // Dark and rough. A thin vertical bar always turns a fully light-facing
    // sliver toward the lamp, so it takes near-peak irradiance across its whole
    // visible width; anything but a low albedo clips it to a white stripe.
    iron: standard("#22221f", 0.88, 0.2),
    brass: standard("#6e5223", 0.72, 0.28),
    // Carved and painted wood. A light tint here made the corpus on the
    // crucifix read as a stark white mannequin under the tribunal lamp.
    figure: standard("#5d5140", 1),
    faceMature: portrait(faceMatureTexture),
    faceYoung: portrait(faceYoungTexture),
    faceElder: portrait(faceElderTexture),
    faceSecretary: portrait(faceSecretaryTexture),
    hairMature: portrait(hairMatureTexture),
    hairYoung: portrait(hairYoungTexture),
    hairElder: portrait(hairElderTexture),
    hairSecretary: portrait(hairSecretaryTexture),
    eyeSocket: character("#150e0a"),
    eyeWhite: standard("#b7a88f", 1),
    mouth: standard("#4e241e", 1),
    mask: character("#3b352d"),
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

  // Paper dresses both a cleric's throat bands and the documents on the
  // tribunal table; scarlet silk dresses both a chest cross and the crosses
  // mounted along the chestnut walls. Characters take their own character-shaded
  // copies so that shading people matte does not also flatten the room's props.
  materials.paperFaceted = character("#b39a72");
  materials.redSilkFaceted = character("#7d1a24");

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
  private world: Grid;
  private model = WORLD_MODEL;
  private patrols: { id: string; figure: THREE.Group }[] = [];
  /**
   * The figures' own state, owned by the renderer and advanced each frame.
   *
   * It lives here because the simulation is deliberately ignorant of the player
   * and therefore has nothing to be driven by except the clock; exposing it as
   * `npcStates` lets the game read what is being said without the simulation
   * ever learning who is listening.
   */
  readonly npcStates: NpcState[] = createNpcStates(NPCS);
  /** Stride phase per figure, advanced by distance walked rather than by time. */
  private stride = new Map<string, { phase: number; travelled: number; blend: number }>();

  constructor(canvas: HTMLCanvasElement, world: Grid) {
    this.world = world;
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
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // PCFSoftShadowMap is deprecated in this version of Three and silently
    // resolves to PCFShadowMap anyway; naming it outright stops a per-run
    // warning that was burying the dungeon's own diagnostics.

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
    this.buildPatrols();
    this.auditFloatingProps();

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
          // A screened cell keeps its masonry in the collision grid and loses it
          // in the architecture: `buildCellFronts` puts a sill, a lintel and a
          // field of bars there instead. Instancing a stone block here too would
          // wall the bars up from behind.
          if (cell === type && !isScreenAt(this.model, x, z)) positions.push([x, z]);
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

  /**
   * Verifies that a wall-mounted piece has masonry behind it across its whole
   * width, and reports the gaps if it does not.
   *
   * Every room wall here is pierced by at least one doorway. A panel positioned
   * by eye from the middle of a room looks mounted from that one viewpoint and
   * then, from any other, is discovered hanging in the opening with the far
   * room visible behind it. Knowing a decoration's inner face is at the cell
   * boundary is not enough on its own; the cells it spans have to be solid too.
   *
   * `span` runs along `spanAxis`; `facing` is the direction along the other
   * horizontal axis that the piece's front points, so the masonry is sampled
   * just behind it.
   */
  private checkWallBacking(
    label: string,
    x: number,
    z: number,
    spanAxis: "x" | "z",
    span: number,
    facing: 1 | -1,
  ) {
    const samples = 11;
    const gaps: string[] = [];
    for (let i = 0; i < samples; i++) {
      const offset = (i / (samples - 1) - 0.5) * span;
      const sampleX = spanAxis === "x" ? x + offset : x - facing * 0.06;
      const sampleZ = spanAxis === "x" ? z - facing * 0.06 : z + offset;
      const gridX = Math.floor(sampleX);
      const gridZ = Math.floor(sampleZ);
      const solid =
        gridZ >= 0 &&
        gridZ < this.world.length &&
        gridX >= 0 &&
        gridX < this.world[gridZ].length &&
        this.world[gridZ][gridX] !== "0";
      if (!solid) gaps.push(`(${sampleX.toFixed(2)}, ${sampleZ.toFixed(2)})`);
    }
    if (gaps.length > 0) {
      console.warn(
        `[dungeon] "${label}" is unbacked at ${gaps.length}/${samples} sampled points: ` +
          `${gaps.join(" ")}. It will read as floating in the opening.`,
      );
    }
    return gaps.length === 0;
  }

  private addLamp(
    x: number,
    z: number,
    height = 3.25,
    intensity = 2.5,
    castShadow = false,
    colour = "#f0a85a",
  ) {
    const lamp = makeHangingLamp(this.materials, x, z, height, intensity, castShadow, colour);
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
      garment: "clerk",
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
    const inscription = wallDecal(new THREE.PlaneGeometry(5.1, 0.9), inscriptionMaterial);
    inscription.position.set(17, 3.35, 4.012);
    this.scene.add(inscription);
    this.checkWallBacking("tribunal north inscription", 17, 4.012, "x", 5.1, 1);
    for (const x of [11.2, 12.8, 21.2, 22.8]) {
      const cross = makeScarletCross(m.redSilk, 0.48);
      cross.position.set(x, 2.2, 4.015);
      this.scene.add(cross);
      this.checkWallBacking(`north cross x=${x}`, x, 4.015, "x", 0.24, 1);
    }
    // The side walls are pierced: the west one by the passage doorway at z 8-9,
    // the east one by the cell corridor at z 7-8. Both the crosses and the
    // inscriptions used to be spaced evenly down the room's full length, which
    // put one cross and most of each inscription directly across an opening.
    // These positions keep every piece over solid masonry on both walls, so the
    // two sides still read as a matched pair.
    for (const [x, rotation, facing] of [
      [10.012, Math.PI / 2, 1],
      [23.988, -Math.PI / 2, -1],
    ] as const) {
      for (const z of [5.2, 6.4, 10.6]) {
        const cross = makeScarletCross(m.redSilk, 0.44);
        cross.position.set(x, 2.05, z);
        cross.rotation.y = rotation;
        this.scene.add(cross);
        this.checkWallBacking(`side cross x=${x} z=${z}`, x, z, "z", 0.22, facing);
      }
      const sideInscription = wallDecal(new THREE.PlaneGeometry(2.6, 0.58), inscriptionMaterial);
      sideInscription.position.set(x, 3.35, 5.5);
      sideInscription.rotation.y = rotation;
      this.scene.add(sideInscription);
      this.checkWallBacking(`side inscription x=${x}`, x, 5.5, "z", 2.6, facing);
    }
    this.addLamp(17, 7.7, 3.38, 4.1, true);

    // The cell range.
    //
    // Three small cells off one gaoler's corridor, each fronted by iron rather
    // than stone. The lamps are in the corridor only: a cell is lit by what
    // spills through its own bars, so the light in it is barred light and a
    // prisoner standing at the back of one is barely there at all. That is the
    // whole difference between a dim room and a cell.
    const muralTexture = makeMuralTexture();
    this.disposableTextures.push(muralTexture);
    this.buildCellFronts();
    for (const z of [5.5, 8.5, 11.5, 14.5, 17]) {
      this.addLamp(29, z, 2.55, z === 8.5 || z === 14.5 ? 0.62 : 0.95, false, "#8fa2a6");
    }

    // Marcello's cell. Bendetta's wall faces the bars, so it is the first thing
    // seen from the corridor and the last thing he can look away from.
    const marcelloPallet = makePallet(m);
    marcelloPallet.position.set(32.5, 0, 5.5);
    this.scene.add(marcelloPallet);
    const cellStool = makeStool(m);
    cellStool.position.set(33.4, 0, 7.5);
    this.scene.add(cellStool);
    // The cell's east wall block spans x 34..35, so its inner face is x = 34.
    const CELL_EAST_FACE = 33.985;
    const mural = wallDecal(
      new THREE.PlaneGeometry(1.9, 2.7),
      new THREE.MeshStandardMaterial({
        map: muralTexture,
        // Transparent, unlit-flat and slightly darkened, so the pigment sits in
        // the masonry's own light instead of glowing off a panel of its own.
        transparent: true,
        color: "#9c8875",
        roughness: 1,
        depthWrite: false,
      }),
    );
    mural.position.set(CELL_EAST_FACE, 1.9, 6.5);
    mural.rotation.y = -Math.PI / 2;
    this.scene.add(mural);
    this.checkWallBacking("Bendetta's wall", CELL_EAST_FACE, 6.5, "z", 1.9, -1);
    // Nail-scratches cut into the stone below the painting, as relief rather
    // than as texture: the chronicle is scratched, and a scratch has a depth.
    for (let i = 0; i < 9; i++) {
      const scratch = addBox(
        this.scene,
        m.scratch,
        [0.012, 0.012, 0.34 + (i % 3) * 0.12],
        [CELL_EAST_FACE - 0.012, 0.42 + i * 0.062, 6.2 + (i % 2) * 0.22],
        [0.06 * (i % 2 ? 1 : -1), 0, 0.05],
      );
      scratch.castShadow = false;
    }

    // Maddalena's cell: no infernal pictures, a web, and a small gold cross.
    const maddalenaPallet = makePallet(m);
    maddalenaPallet.position.set(32.5, 0, 10.5);
    this.scene.add(maddalenaPallet);
    const goldCross = makeScarletCross(m.brass, 0.35);
    goldCross.position.set(32.6, 1.2, 12.965);
    goldCross.rotation.y = Math.PI;
    this.scene.add(goldCross);
    this.checkWallBacking("maddalena gold cross", 32.6, 12.965, "x", 0.17, -1);
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
    web.position.set(33.96, 3.2, 10.6);
    web.rotation.y = -Math.PI / 2;
    this.scene.add(web);

    // The further cell: a pallet and nothing else entered against it.
    const thirdPallet = makePallet(m);
    thirdPallet.position.set(32.5, 0, 15.5);
    this.scene.add(thirdPallet);

    // Wardrobe and disguise chamber.
    //
    // The press stands against the south wall. It used to stand squarely across
    // the room's own doorway, leaving 0.50 of gap where the player needs 0.56,
    // so the wardrobe could only be entered the long way round through the
    // vault — a room about a disguise, sealed by its own furniture.
    const wardrobe = makeWardrobe(m);
    wardrobe.position.set(12.5, 0, 21.5);
    this.scene.add(wardrobe);
    const bench = makeTable(m, 1.5, 0.46);
    bench.position.set(12.5, 0, 19.6);
    this.scene.add(bench);
    this.addLamp(12.5, 20.5, 2.95, 1.7);

    // Password vault. The masked official standing here is a patrol, not a
    // fixture: there used to be a static figure at his post as well as the
    // patrol that walks it, so the same man stood in two places at once.
    addBox(this.scene, m.woodTrim, [0.75, 0.08, 0.75], [19.6, 0.04, 20.4]);
    this.addLamp(19.5, 21.8, 3.1, 2.5, true);

    // Non-graphic torture antechamber.
    // Hangs raised in the doorway rather than closing it. Lowered, its teeth and
    // its collider sealed the only route into the Chamber of Groans and the Moon
    // Stair beyond, stranding the last two discoveries behind a prop. Raised, it
    // still reads as the institution's barrier — standing open, as everything
    // here stands open to the habit.
    const grille = makePortcullis(m);
    grille.position.set(24.15, 1.95, 22);
    grille.rotation.y = Math.PI / 2;
    grille.scale.set(0.76, 1, 1);
    this.scene.add(grille);
    const rack = makeRack(m);
    rack.position.set(27.3, 0, 23.1);
    rack.rotation.y = 0.35;
    this.scene.add(rack);
    const narrowTable = makeTable(m, 1, 2.2);
    narrowTable.position.set(27.4, 0, 24.9);
    narrowTable.rotation.y = Math.PI / 2 - 0.15;
    this.scene.add(narrowTable);
    // The apparatus hangs from the vault, and now visibly does.
    //
    // Everything in this room used to float. The pulley was a bare torus in mid
    // air with nothing above it; the two rods stood from 1.48 to 3.63 with their
    // tops half a metre short of the ceiling and their bottoms half a metre off
    // the floor, so a pair of iron bars hung in the room supported by nothing at
    // either end; and the rings hung off those. Machinery that floats is not
    // sinister, it is unfinished — and in a room whose whole argument is that the
    // apparatus is real and merely out of sight, that is the worst thing it could
    // read as. Each piece is now carried by something that reaches the vault.
    const beam = addBox(this.scene, m.wood, [0.22, 0.24, 4.4], [28.6, WALL_HEIGHT - 0.14, 22.6]);
    beam.castShadow = true;
    addCylinder(this.scene, m.iron, 0.03, 0.03, 1.42, [28.6, WALL_HEIGHT - 0.97, 20.9], [0, 0, 0], 8);
    const pulley = mesh(new THREE.TorusGeometry(0.34, 0.07, 10, 22), m.iron);
    pulley.position.set(28.6, WALL_HEIGHT - 1.7, 20.9);
    pulley.rotation.x = Math.PI / 2;
    this.scene.add(pulley);
    // The cord over the pulley, hanging to a hook. It ends somewhere.
    addCylinder(this.scene, m.iron, 0.012, 0.012, 1.5, [28.94, WALL_HEIGHT - 2.45, 20.9], [0, 0, 0], 6);
    for (const x of [26.4, 28.25]) {
      // Chains from the beam down to the manacle rings, and the rings hanging on
      // them, rather than rods standing in the air with rings threaded on.
      const drop = WALL_HEIGHT - 0.02 - 1.52;
      addCylinder(this.scene, m.iron, 0.016, 0.016, drop, [x, 1.52 + drop / 2, 24.4], [0, 0, 0], 6);
      const ring = mesh(new THREE.TorusGeometry(0.13, 0.03, 8, 16), m.iron);
      // Hung on the chain's last link, not four centimetres beneath it.
      ring.position.set(x, 1.55, 24.4);
      ring.rotation.x = Math.PI / 2;
      this.scene.add(ring);
    }
    // Two lamps rather than one. This room had a single lamp in a corner and was
    // the darkest space in the building — which was accidental rather than
    // designed: nobody had ever stood in it, because until the doorways were
    // unsealed it could not be entered at all.
    this.addLamp(26.4, 22.2, 2.85, 1.5);
    this.addLamp(28.4, 24.6, 2.7, 1.15);

    // Moon door and stair.
    //
    // The treads are built from the plan's own stair, not beside it, so the step
    // the player sees is the step the player stands on. Previously these were
    // eight boxes drawn on a flat floor: the hidden stair could be walked
    // through at ground level but never climbed, and the moon door sat three
    // metres up a wall with nothing leading to it.
    for (const flight of this.model.stairs) {
      for (const tread of treadsOf(flight)) {
        const width = flight.x2 - flight.x1;
        const step = addBox(
          this.scene,
          m.stone,
          [width, tread.height, tread.depth + 0.02],
          [(flight.x1 + flight.x2) / 2, tread.height / 2, tread.centre],
        );
        step.receiveShadow = true;
        step.castShadow = true;
      }
    }
    for (const level of this.model.landings) {
      const slab = addBox(
        this.scene,
        m.stone,
        [level.x2 - level.x1, level.height, level.y2 - level.y1],
        [(level.x1 + level.x2) / 2, level.height / 2, (level.y1 + level.y2) / 2],
      );
      slab.receiveShadow = true;
    }
    // The door stands on the landing, on the inner face of the north wall.
    const moonDoor = addBox(this.scene, m.woodTrim, [1.5, 2.4, 0.16], [33.5, 2.8, 21.07]);
    moonDoor.castShadow = true;
    for (const x of [-0.5, 0, 0.5]) addBox(moonDoor, m.iron, [0.06, 2.24, 0.05], [x, 0, 0.11]);
    addCylinder(this.scene, m.iron, 0.05, 0.05, 0.16, [34.06, 2.7, 21.02], [Math.PI / 2, 0, 0], 8);
    this.checkWallBacking("moon door", 33.5, 21.0, "x", 1.5, 1);
    // Cold light leaking round the door, against the warm lamps everywhere else.
    // It is the only daylight-coloured thing in the building, and it is what the
    // stair is climbed towards — so it has to be visible from the foot of the
    // flight, which the old single spot aimed along the treads was not.
    const leak = new THREE.PointLight("#a8c0d8", 3.4, 7, 1.25);
    leak.position.set(33.5, 3.1, 21.55);
    this.scene.add(leak);
    const moonLight = new THREE.SpotLight("#9eb5cd", 9, 13, 0.5, 0.7, 1.05);
    moonLight.position.set(33.5, 3.9, 21.3);
    moonLight.target.position.set(33.5, 0, 25.6);
    this.scene.add(moonLight, moonLight.target);
    // The gap itself: a thin cold sliver down each side of the leaf and across
    // its head, so the door reads as shut against something bright rather than
    // as a dark panel at the top of a stair.
    const gap = new THREE.MeshBasicMaterial({ color: "#cfe0f2", fog: false });
    for (const [w, h, x, y] of [
      [0.035, 2.4, -0.77, 2.8],
      [0.035, 2.4, 0.77, 2.8],
      [1.57, 0.035, 0, 4.01],
    ] as const) {
      const sliver = mesh(new THREE.PlaneGeometry(w, h), gap, false);
      sliver.position.set(33.5 + x, y, 21.055);
      sliver.rotation.y = Math.PI;
      this.scene.add(sliver);
    }
    // A lamp partway down the flight, so the treads are legible on the way up.
    this.addLamp(33.5, 24.3, 3.3, 0.85);
  }

  /**
   * Reports scenery that is holding itself up.
   *
   * The torture chamber had a pulley hanging in mid air, and a pair of iron rods
   * whose tops stopped half a metre short of the vault and whose bottoms stopped
   * half a metre above the flagstones, with the manacle rings threaded onto them
   * — three separate objects supported by nothing at all. None of that is visible
   * from the viewpoint each was positioned at, which is exactly why it survived:
   * a number nudged until the piece looked right from one doorway is a number
   * nobody has checked from anywhere else.
   *
   * A piece counts as carried if it reaches the floor, reaches the vault, meets
   * masonry, or sits on something else that does. Everything left over is
   * floating, and is named with its measurements so the fix is a measurement
   * rather than another nudge.
   */
  private auditFloatingProps() {
    const boxes: { name: string; box: THREE.Box3 }[] = [];
    this.scene.updateMatrixWorld(true);
    // The unit is the placed object — a chair, a lamp, a figure, a bare mesh
    // dropped into a room — not each mesh within one. At mesh granularity every
    // chair seat is "unsupported" because its legs are a different mesh, and the
    // real floaters drown in a hundred of those.
    for (const child of this.scene.children) {
      if (child instanceof THREE.Light || child instanceof THREE.Camera) continue;
      if ((child as unknown as THREE.InstancedMesh).isInstancedMesh) continue;
      if (child instanceof THREE.Line) continue;
      const mesh = child as THREE.Mesh;
      // Wall decals and flames carry nothing and are hung, not stood.
      if (mesh.isMesh && !mesh.castShadow) continue;
      const box = new THREE.Box3().setFromObject(child);
      if (!box.isEmpty()) boxes.push({ name: child.userData.label ?? child.type, box });
    }

    const touchesMasonry = (box: THREE.Box3) => {
      for (let x = Math.floor(box.min.x - 0.12); x <= Math.floor(box.max.x + 0.12); x++) {
        for (let z = Math.floor(box.min.z - 0.12); z <= Math.floor(box.max.z + 0.12); z++) {
          if (z < 0 || z >= this.world.length || x < 0 || x >= this.world[z].length) continue;
          if (this.world[z][x] !== "0") return true;
        }
      }
      return false;
    };

    const floating: string[] = [];
    for (const { name, box } of boxes) {
      if (box.min.y <= 0.09) continue;
      if (box.max.y >= WALL_HEIGHT - 0.14) continue;
      if (touchesMasonry(box)) continue;
      // Carried by something that starts lower and reaches up to it.
      const carried = boxes.some(({ box: other }) => {
        if (other === box) return false;
        if (other.min.y >= box.min.y || other.max.y < box.min.y - 0.09) return false;
        return (
          other.max.x > box.min.x && other.min.x < box.max.x &&
          other.max.z > box.min.z && other.min.z < box.max.z
        );
      });
      if (!carried) {
        floating.push(
          `${name} spanning x ${box.min.x.toFixed(2)}..${box.max.x.toFixed(2)}, ` +
            `z ${box.min.z.toFixed(2)}..${box.max.z.toFixed(2)}, ` +
            `y ${box.min.y.toFixed(2)}..${box.max.y.toFixed(2)}`,
        );
      }
    }
    if (floating.length > 0) {
      console.warn(
        `[dungeon] ${floating.length} piece(s) of scenery are supported by nothing:\n  ` +
          floating.join("\n  "),
      );
    }
    return floating;
  }

  /**
   * The iron fronts of the cells: bars where the plan says screen, and a hinged
   * gate standing open where it says gate.
   *
   * Both are read from the model rather than placed by eye. A screen is masonry
   * to the body and nothing to sight or sound, so the architecture has to agree
   * with the collision exactly — bars drawn a cell away from the wall they stand
   * in would be a cell you can see into and walk into, or one you can neither
   * see into nor walk into, depending on which way the error went.
   */
  private buildCellFronts() {
    const m = this.materials;
    for (const front of this.model.screens) {
      for (let y = front.y1; y <= front.y2; y++) {
        for (let x = front.x1; x <= front.x2; x++) {
          const cx = x + 0.5;
          const cz = y + 0.5;
          // Stone sill and lintel, with the bar field between them.
          addBox(this.scene, m.cellStone, [1.01, 0.55, 1.01], [cx, 0.275, cz]);
          addBox(this.scene, m.cellStone, [1.01, 0.75, 1.01], [cx, WALL_HEIGHT - 0.375, cz]);
          for (let i = 0; i < 6; i++) {
            const bar = addCylinder(
              this.scene,
              m.iron,
              0.037,
              0.037,
              WALL_HEIGHT - 1.3,
              [cx, 0.55 + (WALL_HEIGHT - 1.3) / 2, cz - 0.42 + i * 0.168],
              [0, 0, 0],
              8,
            );
            bar.castShadow = true;
          }
          for (const barY of [1.35, 3.05]) {
            addCylinder(this.scene, m.iron, 0.03, 0.03, 1.0, [cx, barY, cz], [Math.PI / 2, 0, 0], 8);
          }
        }
      }
    }
    // The gates themselves, hung open. Nothing in this building is ever locked
    // against her, and a gate standing open is how that is said without a prompt
    // or a keypress: the institution's own barrier, swung back, every time.
    for (const gate of this.model.openings) {
      if (!gate.id.endsWith("-gate")) continue;
      const cz = (gate.y1 + gate.y2 + 1) / 2;
      const leaf = new THREE.Group();
      leaf.position.set(30.02, 0, cz - 0.5);
      leaf.rotation.y = -1.15;
      for (let i = 0; i < 5; i++) {
        addCylinder(leaf, m.iron, 0.032, 0.032, 3.1, [0, 1.62, 0.1 + i * 0.2], [0, 0, 0], 8);
      }
      for (const barY of [0.22, 1.62, 3.02]) {
        addBox(leaf, m.iron, [0.05, 0.075, 1.02], [0, barY, 0.5]);
      }
      leaf.traverse((item) => {
        if ((item as THREE.Mesh).isMesh) (item as THREE.Mesh).castShadow = true;
      });
      this.scene.add(leaf);
    }
  }

  private buildPatrols() {
    for (const npc of NPCS) {
      // Appearance comes from the roster entry, so a figure cannot be given a
      // body by one list and a round by another.
      const figure = makePerson(this.materials, npc.appearance);
      figure.userData.patrol = npc.id;
      this.patrols.push({ id: npc.id, figure });
      this.stride.set(npc.id, { phase: 0, travelled: 0, blend: 0 });
      this.scene.add(figure);
    }
  }

  render(player: PlayerView, time: number, dtMs = 16.7) {
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
    // The eye rides on the floor the plan describes, so the moon stair is
    // climbed rather than walked through at ground level.
    const eye = groundHeightAt(this.model, player.x, player.y) + EYE_HEIGHT + walkBob;
    this.camera.position.set(player.x, eye, player.y);
    const lookDistance = 10;
    this.camera.lookAt(
      player.x + Math.cos(player.dir) * lookDistance,
      eye + Math.tan(player.pitch) * lookDistance,
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

    updateNpcs(this.npcStates, NPCS, dtMs);
    const byId = new Map(this.npcStates.map((state) => [state.id, state]));
    for (const patrol of this.patrols) {
      const state = byId.get(patrol.id);
      if (!state) continue;
      patrol.figure.position.set(
        state.x,
        groundHeightAt(this.model, state.x, state.y),
        state.y,
      );
      // The model faces -Z, and rotating it by t sends that to
      // (-sin t, -cos t). Setting that equal to (cos dir, sin dir) gives
      // t = -PI/2 - dir. It was +PI/2 - dir, which is the same angle turned
      // through half a circle: every figure in the building walked backwards,
      // and had done since patrols were added.
      patrol.figure.rotation.y = -Math.PI / 2 - state.heading;

      const gait = this.stride.get(patrol.id);
      if (!gait) continue;
      // Cadence from distance, not from the clock. One full stride cycle per
      // 0.82m walked, so a figure that stops stops striding — which is the
      // difference between walking and being slid along the floor.
      const moved = state.travelled - gait.travelled;
      gait.travelled = state.travelled;
      gait.phase += (moved / 0.82) * Math.PI * 2;
      // Blend towards a stride when moving and towards stillness when not, so a
      // figure arriving at a post settles instead of freezing mid-step.
      const walking = state.phase === "walk" && moved > 1e-5;
      gait.blend += ((walking ? 1 : 0) - gait.blend) * Math.min(1, dtMs / 160);
      animateWalk(patrol.figure, gait.phase, gait.blend);
      // A trace of vertical carry on the stride, in step with the legs rather
      // than on a timer of its own.
      patrol.figure.position.y += Math.abs(Math.sin(gait.phase)) * 0.014 * gait.blend;
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

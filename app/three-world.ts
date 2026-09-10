import * as THREE from "three";
import {
  CELL_ROWS,
  DOORS,
  LEG_SWING,
  ROBE,
  STRIDE_CYCLE,
  NPCS,
  UPPER_FLOOR,
  WORLD_MODEL,
  createDoorStates,
  createNpcStates,
  groundHeightAt,
  isScreenAt,
  treadsOf,
  updateDoors,
  updateNpcs,
  type DoorState,
  type NpcState,
} from "./world/index.ts";

export type PlayerView = {
  x: number;
  y: number;
  dir: number;
  pitch: number;
};

type Grid = string[][];

/**
 * The vault. Ireland's passages are lofty and his cells narrow *and* lofty;
 * at 4.2 neither was, and a three-metre corridor under a 4.2 ceiling is a
 * culvert. Everything hung from the ceiling reads this rather than a literal.
 */
const WALL_HEIGHT = 5.4;
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

    vec3 viewPosition = - vViewPosition;
    #if NUM_POINT_LIGHTS > 0
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

    // The moon. It reaches the cells through their gratings and the garden
    // through nothing at all, and it is a spot light, which the point-light
    // loop above cannot see: a prisoner standing in a bar of moonlight was
    // lit by the corridor's lamps and nothing else. Same wrapped Lambert, with
    // Three's own cone falloff in front of it.
    #if NUM_SPOT_LIGHTS > 0
      for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
        vec3 toLight = spotLights[ i ].position - viewPosition;
        float lightDistance = length( toLight );
        vec3 direction = toLight / max( lightDistance, 1e-4 );
        float angleCos = dot( direction, spotLights[ i ].direction );
        float cone = smoothstep( spotLights[ i ].coneCos, spotLights[ i ].penumbraCos, angleCos );
        if ( cone > 0.0 ) {
          float attenuation = cone * charFalloff(
            lightDistance, spotLights[ i ].distance, spotLights[ i ].decay
          );
          float lambert = saturate( ( dot( normal, direction ) + wrap ) / ( 1.0 + wrap ) );
          irradiance += spotLights[ i ].color * attenuation * lambert;
        }
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
 * The robe's skirt, and the swing it has to contain, from `app/world/figure.ts`.
 *
 * These are shared with the suite rather than declared here, because the check
 * that matters about them — that a leg swinging LEG_SWING never leaves a
 * garment of these proportions — is arithmetic the renderer cannot perform on
 * itself. Changing one of them in isolation fails `legEscapesRobe` instead of
 * shipping a knee through a cassock.
 */
const ROBE_HEM_RADIUS = ROBE.hemRadius;
const ROBE_HEIGHT = ROBE.height;
const ROBE_CENTRE_Y = ROBE.centreY;

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
    // Sized so the swinging leg stays inside it.
    //
    // The robe was a 0.72m cone from the hips to 0.20, 0.262 wide at the hem,
    // over legs that swing 0.52 radians about a hip at 0.82. At the knee that
    // puts the leg's surface 0.253 from the axis where the cloth is 0.224 — so
    // the knee came out through the front of the garment on every stride, and
    // the shin was outside it for the whole of the lower swing. Cloth is not
    // simulated here and cannot be, so the geometry has to be chosen to make the
    // penetration impossible instead of merely unlikely: a shorter hem, a wider
    // sweep, and a smaller swing, checked against each other by the suite rather
    // than by eye.
    addGarmentVolume(group, garmentMaterial, HIP_RADIUS, ROBE_HEM_RADIUS, ROBE_HEIGHT, [0, ROBE_CENTRE_Y, 0.025], [0, waistV], TORSO_SEGMENTS);
    beltClears = Math.max(beltClears, coneRadiusAt(beltY, ROBE_CENTRE_Y, ROBE_HEIGHT, HIP_RADIUS, ROBE_HEM_RADIUS));
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
  const swing = Math.sin(phase) * LEG_SWING * blend;
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
  // Brighter at the flame and dead sooner. With the ambient term removed these
  // have to do the work themselves, and a lamp that reaches fourteen metres is
  // a lamp with no pool and no edge — the room simply comes up evenly, which is
  // the look the ambient light was already giving away for free.
  const light = new THREE.PointLight(colour, intensity * 13, 9.5, 1.5);
  light.position.set(0, height - 0.2, 0);
  light.castShadow = castShadow;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0015;
  light.shadow.normalBias = 0.02;
  group.add(light);
  return { group, light, flame };
}

/**
 * A straw pallet on a low plank frame.
 *
 * The old one was a slab with fifteen full-length rods laid across it, ends
 * projecting past the slab into the air on both sides: not a bed of straw but a
 * bundle of dowels. Straw is short, it lies in every direction at once, and it
 * is *contained* — so this is a boarded frame with a sagging sack in it and loose
 * stalks scattered inside the frame's own footprint, none of them full length and
 * none of them sticking out over the flagstones.
 */
function makePallet(materials: Record<string, THREE.Material>) {
  const pallet = new THREE.Group();
  // The frame: four boards on edge, with the bed of straw held inside them.
  addBox(pallet, materials.woodTrim, [1.7, 0.1, 0.06], [0, 0.05, -0.36]);
  addBox(pallet, materials.woodTrim, [1.7, 0.1, 0.06], [0, 0.05, 0.36]);
  addBox(pallet, materials.woodTrim, [0.06, 0.1, 0.78], [-0.85, 0.05, 0]);
  addBox(pallet, materials.woodTrim, [0.06, 0.1, 0.78], [0.85, 0.05, 0]);
  addBox(pallet, materials.strawDark, [1.6, 0.1, 0.66], [0, 0.06, 0]);
  // The sack, sagging where a body has lain in it: three overlapping ellipsoids
  // rather than a box, so its top is a surface with a hollow rather than a lid.
  for (const [x, lift, wide] of [[-0.5, 0.145, 0.42], [0.08, 0.12, 0.46], [0.62, 0.15, 0.4]] as const) {
    const bolster = mesh(new THREE.SphereGeometry(0.3, 14, 10), materials.strawLight);
    bolster.scale.set(1.15, lift / 0.3, wide / 0.3);
    bolster.position.set(x, 0.1 + lift * 0.5, 0);
    bolster.castShadow = true;
    pallet.add(bolster);
  }
  // Loose stalks over the sack, short and lying every way, and every one of them
  // inside the frame. They used to be fifteen 1.68m rods laid parallel, ends
  // projecting over the flagstones at both sides — which is what made the bed
  // read as a bundle of canes. Deterministic, so a pallet looks the same each
  // time it is walked past.
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 26; i++) {
    const length = 0.16 + random() * 0.2;
    const straw = addCylinder(
      pallet,
      i % 3 === 0 ? materials.strawLight : materials.straw,
      0.008,
      0.009,
      length,
      [
        (random() - 0.5) * 1.5,
        0.2 + random() * 0.05,
        (random() - 0.5) * 0.58,
      ],
      [0, random() * Math.PI, Math.PI / 2 + (random() - 0.5) * 0.5],
      5,
    );
    straw.castShadow = false;
  }
  // The bolster: a rolled cloak at the head, not a plank of canvas standing on
  // the mattress.
  const bolster = mesh(new THREE.SphereGeometry(0.16, 14, 10), materials.canvas);
  bolster.scale.set(1, 0.72, 1.9);
  bolster.position.set(-0.6, 0.23, 0);
  bolster.castShadow = true;
  pallet.add(bolster);
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

/**
 * The rack: a frame, two windlass rollers, and four legs.
 *
 * The legs are the fix. This was a rectangle of timber lying in the air at a
 * height of 0.40 with nothing whatever beneath it — the single largest object in
 * the Chamber of Groans, floating, in the room the player is most likely to look
 * hard at. It read as a bug rather than as an instrument, which is the worst
 * possible failure for this particular prop: the argument of the room is that
 * the machinery is real and merely not in use.
 */
function makeRack(materials: Record<string, THREE.Material>) {
  const rack = new THREE.Group();
  addBox(rack, materials.wood, [2.2, 0.16, 0.18], [0, 0.48, -0.65]);
  addBox(rack, materials.wood, [2.2, 0.16, 0.18], [0, 0.48, 0.65]);
  addBox(rack, materials.wood, [0.18, 0.16, 1.45], [-1, 0.48, 0]);
  addBox(rack, materials.wood, [0.18, 0.16, 1.45], [1, 0.48, 0]);
  for (const x of [-0.95, 0.95]) {
    for (const z of [-0.6, 0.6]) {
      addBox(rack, materials.woodTrim, [0.15, 0.4, 0.15], [x, 0.2, z]);
    }
  }
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

  // The wall sheet tiles once across a block and 2.1 times up a 4.2 block; the
  // vault is now 5.4, so the vertical repeat rises with it and the courses
  // keep the same size.
  const stoneTexture = load("/textures/stone-wall.png", 1.05, 2.1 * (WALL_HEIGHT / 4.2));
  // Sized off the world rather than typed: the flagstones are 3.3 cells to a
  // repeat, whatever the plan's extent.
  const floorTexture = load("/textures/flagstone-floor.png", WORLD_MODEL.width * 0.3, WORLD_MODEL.height * 0.3);
  const woodTexture = load("/textures/chestnut-panels.png", 1, 1.2 * (WALL_HEIGHT / 4.2));
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

  // Turf for the garden: a mottled dark green, painted rather than loaded,
  // because nothing in the shipped sheets is anything but stone and wood.
  const turfTexture = makeCanvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#2f3a24";
    ctx.fillRect(0, 0, w, h);
    let seed = 91;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 2600; i++) {
      const g = 40 + random() * 40;
      ctx.fillStyle = `rgba(${g * 0.7 | 0},${g | 0},${g * 0.45 | 0},${0.25 + random() * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(random() * w, random() * h, 3 + random() * 9, 2 + random() * 5, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 900; i++) {
      ctx.strokeStyle = `rgba(${60 + random() * 40 | 0},${90 + random() * 50 | 0},${40 + random() * 20 | 0},${0.3 + random() * 0.4})`;
      ctx.lineWidth = 1 + random();
      const x = random() * w;
      const y = random() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (random() - 0.5) * 8, y - 4 - random() * 8);
      ctx.stroke();
    }
  });
  turfTexture.wrapS = turfTexture.wrapT = THREE.RepeatWrapping;
  turfTexture.repeat.set(4, 6);
  textures.push(turfTexture);

  // The night sky: a gradient from a bruised horizon to near-black overhead,
  // with stars. Seen only from the lane and the garden, through the one gap in
  // the vault.
  const skyTexture = makeCanvasTexture(1024, 512, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "#02030a");
    gradient.addColorStop(0.45, "#070b1a");
    gradient.addColorStop(0.72, "#101a30");
    gradient.addColorStop(1, "#1a2436");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    let seed = 7;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 1400; i++) {
      const x = random() * w;
      const y = random() * h * 0.78;
      const r = random() < 0.08 ? 1.6 : 0.8;
      ctx.fillStyle = `rgba(${200 + random() * 55 | 0},${205 + random() * 40 | 0},${230 + random() * 25 | 0},${0.35 + random() * 0.65})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Thin cloud across the lower sky.
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(120,130,160,${0.02 + random() * 0.04})`;
      ctx.beginPath();
      ctx.ellipse(random() * w, h * (0.5 + random() * 0.3), 120 + random() * 200, 8 + random() * 18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  textures.push(skyTexture);

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
      bumpMap: stoneTexture,
      bumpScale: 0.03,
      color: "#8d7869",
      roughness: 1,
    }),
    // Garden walls, the same stone gone grey and cold under the moon.
    gardenStone: new THREE.MeshStandardMaterial({
      map: stoneTexture,
      bumpMap: stoneTexture,
      bumpScale: 0.04,
      color: "#7d8088",
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
      color: "#5c5346",
      roughness: 1,
      side: THREE.DoubleSide,
    }),
    turf: new THREE.MeshStandardMaterial({
      map: turfTexture,
      bumpMap: turfTexture,
      bumpScale: 0.02,
      color: "#9aa58a",
      roughness: 1,
    }),
    gravel: new THREE.MeshStandardMaterial({
      map: floorTexture,
      color: "#8f8a80",
      roughness: 1,
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
    // Cypress foliage and bark: nearly black under the moon, which is what a
    // cypress is for.
    cypress: standard("#182116", 1),
    bark: standard("#2e241a", 1),
    // Still water, the one glossy surface in the building. It is here to hold
    // the moon.
    water: new THREE.MeshStandardMaterial({
      color: "#0d1622",
      roughness: 0.12,
      metalness: 0.4,
      emissive: "#0b1420",
      emissiveIntensity: 0.6,
    }),
    // The sky and the moon are unlit and unfogged: they are the far side of the
    // one opening in the vault, and fog would grey them into the masonry.
    sky: new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, fog: false }),
    moon: new THREE.MeshBasicMaterial({ color: "#e9eefb", fog: false }),
    // What a grating is seen against from inside: a flat cold brightness.
    moonPane: new THREE.MeshBasicMaterial({ color: "#aebfdc", fog: false }),
  };

  // Paper dresses both a cleric's throat bands and the documents on the
  // tribunal table; scarlet silk dresses both a chest cross and the crosses
  // mounted along the chestnut walls. Characters take their own character-shaded
  // copies so that shading people matte does not also flatten the room's props.
  materials.paperFaceted = character("#b39a72");
  materials.redSilkFaceted = character("#7d1a24");

  return { materials, textures };
}

/**
 * A lamp on an iron bracket, fixed to a wall.
 *
 * The hanging lamps are the institution's: they light rooms. A bracket lamp is
 * somebody's — the gaoler's, the watcher's, a prisoner's — and lights the two
 * metres around it and nothing else. `facing` is the direction the bracket
 * projects from the wall.
 */
function makeBracketLamp(
  materials: Record<string, THREE.Material>,
  x: number,
  y: number,
  z: number,
  facing: [number, number],
  intensity: number,
  colour: THREE.ColorRepresentation = "#f0a85a",
) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = Math.atan2(-facing[1], facing[0]);
  // The arm out from the wall, a bracket down to it, the cup, the flame.
  addBox(group, materials.iron, [0.34, 0.03, 0.03], [0.17, 0, 0]);
  addBox(group, materials.iron, [0.03, 0.26, 0.03], [0.02, -0.13, 0]);
  addBox(group, materials.iron, [0.2, 0.03, 0.03], [0.1, -0.22, 0], [0, 0, 0.6]);
  addCylinder(group, materials.iron, 0.07, 0.045, 0.09, [0.3, -0.03, 0], [0, 0, 0], 8);
  const flame = mesh(new THREE.SphereGeometry(0.05, 8, 6), materials.flame, false);
  flame.scale.set(0.7, 1.5, 0.7);
  flame.position.set(0.3, 0.06, 0);
  group.add(flame);
  const light = new THREE.PointLight(colour, intensity * 13, 5.5, 1.6);
  light.position.set(0.3, 0.1, 0);
  group.add(light);
  group.traverse((item) => {
    if ((item as THREE.Mesh).isMesh && item !== flame) (item as THREE.Mesh).castShadow = false;
  });
  return { group, light, flame };
}

/** A long iron key: bow, shaft, bit. Hangs from its bow. */
function makeKey(materials: Record<string, THREE.Material>) {
  const key = new THREE.Group();
  const bow = mesh(new THREE.TorusGeometry(0.045, 0.011, 8, 16), materials.iron);
  key.add(bow);
  addCylinder(key, materials.iron, 0.011, 0.011, 0.2, [0, -0.145, 0], [0, 0, 0], 8);
  addBox(key, materials.iron, [0.035, 0.05, 0.012], [0.02, -0.225, 0]);
  addBox(key, materials.iron, [0.02, 0.025, 0.012], [0.028, -0.19, 0]);
  return key;
}

/**
 * The gaoler's board: six keys on six nails over six cut numbers, and a
 * seventh nail with nothing on it.
 */
function makeKeyBoard(materials: Record<string, THREE.Material>) {
  const board = new THREE.Group();
  addBox(board, materials.woodTrim, [1.2, 0.5, 0.04], [0, 0, 0]);
  for (let i = 0; i < 7; i++) {
    const x = -0.51 + i * 0.17;
    addCylinder(board, materials.iron, 0.008, 0.008, 0.06, [x, 0.14, 0.04], [Math.PI / 2, 0, 0], 6);
    if (i < 6) {
      const key = makeKey(materials);
      key.scale.setScalar(0.75);
      key.position.set(x, 0.1, 0.06);
      key.rotation.z = (i % 2 ? 1 : -1) * 0.08;
      board.add(key);
    }
    // The numbers are strokes cut into the wood, not text: I, II, III...
    const strokes = i < 6 ? i + 1 : 0;
    for (let s = 0; s < strokes; s++) {
      addBox(board, materials.scratch, [0.008, 0.06, 0.006], [x - 0.03 + s * 0.012, -0.17, 0.02]);
    }
  }
  // Under the bare nail, a crescent scratched by somebody who knew what was
  // missing from it.
  const crescent = mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 12, Math.PI * 1.2), materials.scratch);
  crescent.position.set(0.51, -0.17, 0.022);
  crescent.rotation.z = -Math.PI * 0.6;
  board.add(crescent);
  return board;
}

/**
 * A cypress: a trunk and a tapering column of dark foliage, nearly black.
 *
 * Three overlapping ellipsoids rather than a stack of cones. Cones stack into
 * a fir tree with visible tiers; a cypress is one flame-shaped mass with no
 * edge anywhere on it, and reads at night entirely by silhouette.
 */
function makeCypress(materials: Record<string, THREE.Material>, height = 6.5) {
  const tree = new THREE.Group();
  addCylinder(tree, materials.bark, 0.09, 0.14, 0.9, [0, 0.45, 0], [0, 0, 0], 8);
  const parts: [number, number, number, number][] = [
    // centre height as a fraction of the tree, radius, vertical stretch, lean
    [0.34, 0.62, 2.4, 0],
    [0.6, 0.5, 2.6, 0.03],
    [0.86, 0.3, 2.2, -0.02],
  ];
  for (const [at, radius, stretch, lean] of parts) {
    const mass = mesh(new THREE.SphereGeometry(radius, 10, 8), materials.cypress);
    mass.scale.set(1, stretch, 0.92);
    mass.position.set(lean, 0.6 + at * (height - 0.6), 0);
    tree.add(mass);
  }
  const tip = mesh(new THREE.ConeGeometry(0.14, 0.9, 7), materials.cypress);
  tip.position.set(0, height + 0.15, 0);
  tree.add(tip);
  return tree;
}

/** A stone basin with still water in it. */
function makeBasin(materials: Record<string, THREE.Material>) {
  const basin = new THREE.Group();
  addCylinder(basin, materials.gardenStone, 1.1, 1.0, 0.16, [0, 0.08, 0], [0, 0, 0], 16);
  addCylinder(basin, materials.gardenStone, 1.05, 1.1, 0.5, [0, 0.41, 0], [0, 0, 0], 16);
  const rim = mesh(new THREE.TorusGeometry(1.0, 0.08, 8, 24), materials.gardenStone);
  rim.position.set(0, 0.66, 0);
  rim.rotation.x = Math.PI / 2;
  basin.add(rim);
  const water = mesh(new THREE.CircleGeometry(0.94, 24), materials.water, false);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.6, 0);
  basin.add(water);
  // A small pedestal in the middle, for the moon to sit beside.
  addCylinder(basin, materials.gardenStone, 0.1, 0.13, 0.9, [0, 0.9, 0], [0, 0, 0], 8);
  const cup = mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), materials.gardenStone);
  cup.position.set(0, 1.34, 0);
  cup.rotation.x = Math.PI;
  basin.add(cup);
  return basin;
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
 * A soft round sprite for a mote of dust: bright at the centre, gone at the
 * edge, so a point drawn with it reads as a speck rather than a square.
 */
function makeMoteTexture() {
  return makeCanvasTexture(32, 32, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.5)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

/** A gradient for a shaft of light: bright where it enters, gone at the floor. */
function makeShaftTexture() {
  return makeCanvasTexture(8, 128, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.45)");
    gradient.addColorStop(1, "rgba(255,255,255,0.0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

/** A moonlit thing: the window a cell has, the light that comes through it, and the dust it shows. */
type MoonShaft = {
  motes: THREE.Points;
  bounds: { x: number; y: number; z: number; sx: number; sy: number; sz: number };
  velocities: Float32Array;
};

export class DungeonRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private lamps: { light: THREE.PointLight; flame: THREE.Mesh; base: number; seed: number }[] = [];
  private disposableTextures: THREE.Texture[] = [];
  private materials: Record<string, THREE.Material>;

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
  readonly doorStates: DoorState[] = createDoorStates(DOORS);
  private doorLeaves = new Map<string, THREE.Group>();
  /** Stride phase per figure, advanced by distance walked rather than by time. */
  private stride = new Map<string, { phase: number; travelled: number; blend: number }>();
  /** Things that can be taken, by discovery id, so a key can leave its nail. */
  private takeable = new Map<string, THREE.Object3D>();
  private shafts: MoonShaft[] = [];
  /** The demon's pupils, and the cell they watch. */
  private pupils: { mesh: THREE.Mesh; restX: number; restY: number }[] = [];
  private spider: { mesh: THREE.Group; from: THREE.Vector3; to: THREE.Vector3 } | null = null;
  private water: THREE.Mesh | null = null;
  /** The cold slivers round the shut moon door, hidden once it stands open. */
  private doorSlivers: THREE.Mesh[] = [];
  /**
   * Cells of the wall grid that are not instanced as whole blocks because a
   * window is cut through them; `buildMoonWindows` builds their masonry in
   * pieces around the hole.
   */
  private pierced = new Set<string>();
  private frame = 0;

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
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Twelve lights cast shadows now — the moon through six gratings, the moon
    // in the garden, the lane and the door, and three lamps — and each shadow
    // map is a pass over the scene. Nothing that casts moves faster than a
    // walking figure, so the maps are refreshed on alternate frames.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;

    this.scene.background = new THREE.Color("#040403");
    // Linear fog over a fixed range reads like Morrowind's draw distance; the
    // old exponential falloff swallowed the far wall of every room.
    this.scene.fog = new THREE.Fog("#080605", 7, 28);
    // Far enough to see the sky dome from the garden. It was 60, which is a
    // fine draw distance for a cellar and a poor one for the moon.
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 400);

    const built = createDungeonMaterials(this.renderer);
    this.materials = built.materials;
    this.disposableTextures.push(...built.textures);

    // The windows are cut before the walls are laid, so the wall builder knows
    // which blocks not to instance.
    for (const row of CELL_ROWS) {
      this.pierced.add(`45,${row + 1}`);
      this.pierced.add(`46,${row + 1}`);
    }

    this.buildArchitecture(world);
    this.buildSky();
    this.buildRooms();
    this.buildMoonWindows();
    this.buildGarden();
    this.buildPatrols();
    this.auditFloatingProps();

    // Everything that lights this building is something in it: torches,
    // candles, and the moon. What remains besides is a very low, cold floor —
    // the least that keeps unlit stone legible as stone rather than as a hole
    // in the screen.
    this.scene.add(new THREE.AmbientLight("#1a2030", 0.62));
    this.scene.add(this.camera);
  }

  private buildArchitecture(world: Grid) {
    const spanX = this.model.width;
    const spanZ = this.model.height;
    const floor = mesh(new THREE.PlaneGeometry(spanX, spanZ), this.materials.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(spanX / 2, 0, spanZ / 2);
    floor.receiveShadow = true;
    floor.castShadow = false;
    this.scene.add(floor);

    // The ceiling is laid a cell at a time rather than as one plane over the
    // whole world, because the lane and the garden have none: the one thing the
    // stair is climbed for is the sky, and a plane across the world puts a
    // vault over it. Each tile casts, so the moon above the roof cannot reach
    // the rooms beneath it.
    const openAir = new Set<string>();
    for (const room of this.model.rooms) {
      if (!room.openAir) continue;
      for (let y = room.y1; y <= room.y2; y++) {
        for (let x = room.x1; x <= room.x2; x++) openAir.add(`${x},${y}`);
      }
    }
    const tiles: [number, number][] = [];
    world.forEach((row, z) =>
      row.forEach((cell, x) => {
        if (cell === "0" && !openAir.has(`${x},${z}`)) tiles.push([x, z]);
      }),
    );
    const tileGeometry = new THREE.PlaneGeometry(1.002, 1.002);
    tileGeometry.rotateX(Math.PI / 2);
    const ceiling = new THREE.InstancedMesh(tileGeometry, this.materials.ceiling, tiles.length);
    const tileMatrix = new THREE.Matrix4();
    tiles.forEach(([x, z], i) => {
      tileMatrix.makeTranslation(x + 0.5, WALL_HEIGHT, z + 0.5);
      ceiling.setMatrixAt(i, tileMatrix);
    });
    ceiling.castShadow = true;
    ceiling.receiveShadow = false;
    this.scene.add(ceiling);

    const gardenCells = new Set<string>();
    const garden = this.model.rooms.find((room) => room.id === "garden");
    const lanes = this.model.rooms.filter((room) => room.openAir);
    for (const room of lanes) {
      for (let y = room.y1 - 1; y <= room.y2 + 1; y++) {
        for (let x = room.x1 - 1; x <= room.x2 + 1; x++) gardenCells.add(`${x},${y}`);
      }
    }
    void garden;

    const types = ["1", "2", "3", "4", "g"];
    const wallMaterials = [
      this.materials.stone,
      this.materials.woodPanel,
      this.materials.cellStone,
      this.materials.brownStone,
      this.materials.gardenStone,
    ];
    types.forEach((type, typeIndex) => {
      const positions: [number, number][] = [];
      world.forEach((row, z) =>
        row.forEach((cell, x) => {
          // A screened cell keeps its masonry in the collision grid and loses it
          // in the architecture: `buildCellFronts` puts a sill, a lintel and a
          // field of bars there instead. Instancing a stone block here too would
          // wall the bars up from behind. A pierced cell likewise: the window
          // builder lays its masonry in pieces around the hole.
          if (cell === "0") return;
          if (isScreenAt(this.model, x, z) || this.pierced.has(`${x},${z}`)) return;
          // Masonry that bounds the open-air rooms is drawn in the garden's own
          // grey, whatever the plan calls it, so the moonlit walls read as one
          // enclosure.
          const outdoor = gardenCells.has(`${x},${z}`);
          if (type === "g" ? outdoor : cell === type && !outdoor) positions.push([x, z]);
        }),
      );
      if (positions.length === 0) return;
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

    // Transverse ribs under the vault of the larger roofed rooms and along the
    // high-lamp passage, so a 5.4m ceiling reads as built rather than as a lid.
    const ribMaterial = standard("#332a21", 1);
    const rib = (x: number, z: number, length: number, axis: "x" | "z") => {
      const size: [number, number, number] = axis === "x" ? [length, 0.14, 0.18] : [0.18, 0.14, length];
      addBox(this.scene, ribMaterial, size, [x, WALL_HEIGHT - 0.07, z]);
    };
    for (const z of [4.2, 7.1, 10]) rib(22.5, z, 13.6, "x");
    for (const z of [19.5, 22, 24.5, 27]) rib(5.5, z, 2.6, "x");
    for (const x of [6.5, 9]) rib(x, 17, 1.6, "z");
    for (const z of [11, 13.5]) rib(11.5, z, 2.6, "x");
    for (const z of [36.5, 40, 43.5]) rib(31.5, z, 11.6, "x");
    for (const z of [6, 12, 18, 24]) rib(38.5, z, 2.6, "x");
  }

  /** The sky, seen through the one gap in the vault, and the moon in it. */
  private buildSky() {
    const dome = mesh(new THREE.SphereGeometry(140, 32, 18), this.materials.sky, false);
    dome.position.set(this.model.width / 2, 0, this.model.height / 2);
    dome.rotation.y = Math.PI / 2;
    this.scene.add(dome);
    // The moon stands east and high: the cell gratings face east, and the
    // moon is what comes through them.
    const moon = mesh(new THREE.CircleGeometry(4.2, 32), this.materials.moon, false);
    moon.position.set(115, 62, 40);
    moon.lookAt(52, 2, 21);
    this.scene.add(moon);
    const halo = mesh(
      new THREE.CircleGeometry(9, 32),
      new THREE.MeshBasicMaterial({ color: "#7d8db0", transparent: true, opacity: 0.16, fog: false, depthWrite: false }),
      false,
    );
    halo.position.copy(moon.position).add(new THREE.Vector3(-1.5, -0.8, -0.5));
    halo.lookAt(52, 2, 21);
    this.scene.add(halo);
  }

  /**
   * Verifies that a wall-mounted piece has masonry behind it across its whole
   * width, and reports the gaps if it does not.
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

  private addBracket(
    x: number,
    y: number,
    z: number,
    facing: [number, number],
    intensity: number,
    colour = "#f0a85a",
  ) {
    const lamp = makeBracketLamp(this.materials, x, y, z, facing, intensity, colour);
    this.scene.add(this.hang(lamp.group));
    this.lamps.push({ light: lamp.light, flame: lamp.flame, base: lamp.light.intensity, seed: x * 0.91 + z * 1.13 });
  }

  private buildRooms() {
    const m = this.materials;

    // The approach, and the door at the end of it.
    //
    // Six metres of bore with one guttering light in it, and behind the player a
    // shut door that is a real solid and never becomes anything else. It is the
    // first thing in the game and it is deliberately the only thing: no props,
    // no figure, nothing to examine.
    const approachDoor = addBox(this.scene, m.woodTrim, [1.9, 2.8, 0.16], [6, 1.4, 48.92]);
    approachDoor.castShadow = true;
    for (const y of [0.5, 1.4, 2.3]) {
      addBox(approachDoor, m.iron, [1.86, 0.11, 0.06], [0, y - 1.4, -0.11]);
    }
    addCylinder(this.scene, m.iron, 0.06, 0.06, 0.22, [6.62, 1.3, 48.78], [Math.PI / 2, 0, 0], 8);
    this.checkWallBacking("approach door", 6, 49, "x", 1.9, -1);
    this.addLamp(6, 45.4, 3.6, 0.85);

    // The prison gate: the raised portcullis over the way in, the clerk's
    // counter across the hall, and stores against the walls.
    const gate = makePortcullis(m);
    gate.position.set(6, 2.4, 43.6);
    gate.scale.set(0.55, 1, 1);
    this.scene.add(gate);
    // The counter stands across the hall rather than against a wall, so the way
    // from the door to the Office is round it — the shape of the room is the
    // institution's first question, and the player answers it by walking.
    const counter = addBox(this.scene, m.wood, [5.5, 1.05, 0.36], [6.75, 0.525, 40.6]);
    counter.castShadow = true;
    addBox(this.scene, m.woodTrim, [5.66, 0.08, 0.5], [6.75, 1.09, 40.6]);
    // The book of admissions, open, with nothing written in it tonight.
    addBox(this.scene, m.paper, [0.62, 0.05, 0.42], [7.4, 1.16, 40.6], [0, 0.12, 0]);
    addBox(this.scene, m.woodTrim, [0.02, 0.07, 0.42], [7.4, 1.165, 40.6], [0, 0.12, 0]);
    addCylinder(this.scene, m.brass, 0.06, 0.08, 0.12, [5.6, 1.19, 40.6], [0, 0, 0], 8);
    const barrel = makeBarrel(m);
    barrel.position.set(3.2, 0, 38.4);
    this.scene.add(barrel);
    addBox(this.scene, m.wood, [0.86, 0.72, 0.86], [10.6, 0.36, 38.2]);
    addBox(this.scene, m.woodTrim, [0.76, 0.04, 0.76], [10.6, 0.74, 38.2]);
    const gateGuard = makePerson(m, { hood: true, beard: true, scale: 0.98 });
    gateGuard.position.set(5.2, 0, 41.8);
    gateGuard.rotation.y = Math.PI;
    this.scene.add(gateGuard);
    // A halberd leant in the corner by the portcullis.
    addCylinder(this.scene, m.woodTrim, 0.02, 0.025, 2.4, [3.1, 1.2, 42.7], [0.12, 0, 0.08], 6);
    addBox(this.scene, m.iron, [0.16, 0.34, 0.02], [3.19, 2.4, 42.55], [0.12, 0, 0.08]);
    this.addLamp(6.5, 40.2, 3.7, 1.9, true);
    this.addLamp(9.5, 37.5, 3.6, 1.1);
    this.addBracket(2.02, 2.2, 41.5, [1, 0], 0.5);

    // The familiars' office.
    const officeTable = makeTable(m, 2.4, 0.9);
    officeTable.position.set(6, 0, 31.4);
    this.scene.add(officeTable);
    for (const [index, x] of [5.2, 6.8].entries()) {
      const familiarChair = makeChair(m);
      familiarChair.position.set(x, 0, 30.4);
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
      familiar.position.set(x, 0, 30.64);
      familiar.rotation.y = Math.PI;
      this.scene.add(familiar);
    }
    addBox(this.scene, m.paper, [0.52, 0.025, 0.36], [5.95, 0.93, 31.2], [0, 0.2, 0]);
    addCylinder(this.scene, m.brass, 0.07, 0.09, 0.13, [6.6, 1, 31.2], [0, 0, 0], 8);
    // A taper, smoking, in a dish.
    addCylinder(this.scene, m.wax, 0.014, 0.016, 0.22, [5.2, 1.02, 31.35], [0, 0, 0], 6);
    this.addLamp(6, 31.2, 3.4, 1.8);
    // Shelves of ledgers along the west wall.
    for (const y of [1.0, 1.7, 2.4]) {
      this.hang(addBox(this.scene, m.woodTrim, [0.3, 0.04, 2.6], [3.17, y, 32.6]));
      for (let i = 0; i < 9; i++) {
        this.hang(addBox(this.scene, i % 3 === 0 ? m.darkLeather : m.paper, [0.24, 0.32, 0.1], [3.2, y + 0.18, 31.45 + i * 0.28], [0, 0, (i % 2) * 0.03]));
      }
    }
    this.checkWallBacking("office shelves", 3.02, 32.6, "z", 2.6, 1);

    // The passage of high lamps: three legs, five lamps hung under the vault,
    // and a stretch of dark between every two of them.
    for (const z of [26.5, 21.5]) this.addLamp(5, z, 4.6, 1.7);
    this.addLamp(10.5, 16.5, 4.6, 1.5);
    this.addLamp(11, 12, 4.6, 1.6);
    for (const z of [24.2, 19.6]) {
      addCylinder(this.scene, m.iron, 0.05, 0.05, 0.46, [4.2, 1.15, z], [0, 0, Math.PI / 2], 7);
      const ring = mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 12), m.iron);
      ring.position.set(4.03, 1.15, z);
      ring.rotation.y = Math.PI / 2;
      this.scene.add(this.hang(ring));
    }
    // The poniard, dropped at the angle where no lamp reaches, lying against
    // the north wall. A narrow blade and a wrapped grip: it is meant to be
    // found by the line of light along its edge.
    const poniard = new THREE.Group();
    poniard.position.set(8.6, 0.02, 16.2);
    poniard.rotation.y = 0.35;
    addBox(poniard, standard("#9ea3a6", 0.35, 0.8), [0.026, 0.012, 0.34], [0, 0.012, -0.12]);
    addBox(poniard, m.iron, [0.11, 0.02, 0.024], [0, 0.014, 0.06]);
    addCylinder(poniard, m.darkLeather, 0.016, 0.018, 0.13, [0, 0.016, 0.14], [Math.PI / 2, 0, 0], 6);
    addCylinder(poniard, m.brass, 0.022, 0.022, 0.02, [0, 0.016, 0.215], [Math.PI / 2, 0, 0], 6);
    poniard.traverse((item) => {
      if ((item as THREE.Mesh).isMesh) (item as THREE.Mesh).castShadow = false;
    });
    this.scene.add(poniard);
    poniard.userData.label = "poniard";

    // The anteroom: a bench, a row of pegs with nothing on them, and the basin
    // in which the accused is made to wash before he is made to stand.
    const anteBench = makeTable(m, 0.5, 2.0);
    anteBench.position.set(10.4, -0.36, 5.5);
    this.scene.add(anteBench);
    for (let i = 0; i < 5; i++) {
      this.hang(addCylinder(this.scene, m.iron, 0.02, 0.02, 0.14, [11.2 + i * 0.5, 2.05, 3.07], [Math.PI / 2, 0, 0], 6));
    }
    addCylinder(this.scene, m.woodTrim, 0.05, 0.06, 0.8, [13.6, 0.4, 3.6], [0, 0, 0], 8);
    addCylinder(this.scene, m.brass, 0.3, 0.22, 0.14, [13.6, 0.86, 3.6], [0, 0, 0], 12);
    const anteWater = mesh(new THREE.CircleGeometry(0.26, 16), m.water, false);
    anteWater.rotation.x = -Math.PI / 2;
    anteWater.position.set(13.6, 0.9, 3.6);
    this.scene.add(anteWater);
    this.addLamp(12.5, 5.5, 3.9, 1.5);

    // The tribunal chamber.
    //
    // The five-metre table lies along the room's long axis with the bench in
    // one row facing the accused, the General raised at its centre, the
    // secretary at his own desk off the east end, and behind them all, standing
    // on the floor against the north wall, the crucifix the text has nearly
    // touching the vault.
    const TABLE_X = 22.5;
    const TABLE_Z = 6.2;
    const TABLE_WIDTH = 8;
    const TABLE_DEPTH = 1.8;
    /** The working surface: the top slab is 0.16 thick, centred at 0.83. */
    const TABLE_TOP = 0.91;
    const longTable = makeTable(m, TABLE_WIDTH, TABLE_DEPTH, true);
    longTable.position.set(TABLE_X, 0, TABLE_Z);
    longTable.rotation.y = Math.PI;
    this.scene.add(longTable);

    const dais = addBox(this.scene, m.woodTrim, [2.4, 0.2, 1.6], [TABLE_X, 0.1, 4.5]);
    dais.receiveShadow = true;
    const highChair = makeChair(m, true);
    highChair.position.set(TABLE_X, 0.2, 4.45);
    highChair.rotation.y = Math.PI;
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
    general.position.set(TABLE_X, 0.2, 4.58);
    general.rotation.y = Math.PI;
    this.scene.add(general);

    for (const [i, x] of [19, 20.6, 24.4, 26].entries()) {
      const chair = makeChair(m);
      chair.position.set(x, 0, 4.65);
      chair.rotation.y = Math.PI;
      this.scene.add(chair);
      const inquisitor = makePerson(m, {
        cap: true,
        seated: true,
        face: i % 3 === 0 ? "elder" : i % 3 === 1 ? "secretary" : "mature",
        beard: i % 2 === 0,
        hair: true,
        scale: 0.92,
      });
      inquisitor.position.set(x, 0, 4.72);
      inquisitor.rotation.y = Math.PI;
      this.scene.add(inquisitor);
    }
    for (const [i, x] of [19, 20.6, TABLE_X, 24.4, 26].entries()) {
      addBox(
        this.scene,
        m.paper,
        [0.42, 0.018, 0.28],
        [x, TABLE_TOP + 0.009, TABLE_Z - TABLE_DEPTH / 2 + 0.36],
        [0, -0.05 * i, 0],
      );
    }
    // An hourglass at the General's hand, and a small crucifix on the table
    // before the accused.
    addCylinder(this.scene, m.woodTrim, 0.07, 0.07, 0.02, [23.9, TABLE_TOP + 0.01, 5.7], [0, 0, 0], 8);
    addCylinder(this.scene, m.woodTrim, 0.07, 0.07, 0.02, [23.9, TABLE_TOP + 0.23, 5.7], [0, 0, 0], 8);
    addCylinder(this.scene, standard("#c9d3d8", 0.2, 0.1), 0.055, 0.01, 0.1, [23.9, TABLE_TOP + 0.07, 5.7], [0, 0, 0], 8);
    addCylinder(this.scene, standard("#c9d3d8", 0.2, 0.1), 0.01, 0.055, 0.1, [23.9, TABLE_TOP + 0.17, 5.7], [0, 0, 0], 8);
    const tableCross = makeCross(m.woodTrim, m.figure, 0.3);
    tableCross.position.set(TABLE_X, TABLE_TOP, TABLE_Z + 0.5);
    tableCross.rotation.y = Math.PI;
    this.scene.add(tableCross);
    // The great crucifix, on the floor against the north wall, its head a few
    // centimetres under the vault: the text has it nearly touching.
    const crucifix = makeCross(m.woodTrim, m.figure, 2.36);
    crucifix.position.set(TABLE_X, 0, 3.1);
    crucifix.rotation.y = Math.PI;
    this.scene.add(crucifix);

    const secretaryDesk = makeTable(m, 1.3, 0.9);
    secretaryDesk.position.set(27.6, 0, 8.6);
    this.scene.add(secretaryDesk);
    const secretaryChair = makeChair(m);
    secretaryChair.position.set(28.5, 0, 8.6);
    secretaryChair.rotation.y = Math.PI / 2;
    this.scene.add(secretaryChair);
    const secretary = makePerson(m, {
      seated: true,
      hair: true,
      face: "secretary",
      garment: "clerk",
      scale: 0.9,
      robe: "#1c1511",
    });
    secretary.position.set(28.43, 0, 8.6);
    secretary.rotation.y = Math.PI / 2;
    this.scene.add(secretary);
    addBox(this.scene, m.paper, [0.5, 0.02, 0.34], [27.45, TABLE_TOP + 0.01, 8.6]);
    addCylinder(this.scene, m.woodTrim, 0.012, 0.012, 0.55, [27.2, TABLE_TOP + 0.2, 8.75], [0, 0, 0.7], 5);

    // The accused, barefoot, standing in the open with the bench in front and
    // the room empty behind, and the selette he is not yet permitted.
    const prisoner = makePerson(m, {
      prisoner: true,
      face: "young",
      scale: 1.04,
      robe: "#6b5c4a",
    });
    prisoner.position.set(TABLE_X, 0, 9);
    prisoner.rotation.y = 0;
    this.scene.add(prisoner);
    const selette = makeStool(m, true);
    selette.position.set(23.8, 0, 9.4);
    this.scene.add(selette);

    const inscriptionTexture = makeInscriptionTexture();
    this.disposableTextures.push(inscriptionTexture);
    const inscriptionMaterial = new THREE.MeshStandardMaterial({
      map: inscriptionTexture,
      roughness: 0.95,
      emissive: "#24140b",
      emissiveIntensity: 0.15,
    });
    const inscription = wallDecal(new THREE.PlaneGeometry(5.1, 0.9), inscriptionMaterial);
    inscription.position.set(TABLE_X, WALL_HEIGHT - 0.6, 3.012);
    this.scene.add(inscription);
    this.checkWallBacking("tribunal north inscription", TABLE_X, 3.012, "x", 5.1, 1);
    for (const x of [17.4, 19.2, 25.8, 27.6]) {
      const cross = makeScarletCross(m.redSilk, 0.48);
      cross.position.set(x, 2.5, 3.015);
      this.scene.add(this.hang(cross));
      this.checkWallBacking(`north cross x=${x}`, x, 3.015, "x", 0.24, 1);
    }
    // The west wall is pierced at rows 6-7 by the anteroom door and the east
    // wall at rows 4-5 by the bent passage; the crosses and inscriptions keep
    // to the rows that are solid on both sides.
    for (const [x, rotation, facing] of [
      [16.012, Math.PI / 2, 1],
      [29.988, -Math.PI / 2, -1],
    ] as const) {
      for (const z of [8.5, 10.5]) {
        const cross = makeScarletCross(m.redSilk, 0.44);
        cross.position.set(x, 2.3, z);
        cross.rotation.y = rotation;
        this.scene.add(this.hang(cross));
        this.checkWallBacking(`side cross x=${x} z=${z}`, x, z, "z", 0.22, facing);
      }
      const sideInscription = wallDecal(new THREE.PlaneGeometry(2.6, 0.58), inscriptionMaterial);
      sideInscription.position.set(x, 3.6, 9.5);
      sideInscription.rotation.y = rotation;
      this.scene.add(sideInscription);
      this.checkWallBacking(`side inscription x=${x}`, x, 9.5, "z", 2.6, facing);
    }
    // Chestnut panelling wants candles, not lanterns: a pair of standing
    // candelabra flank the dais.
    for (const x of [19.8, 25.2]) {
      addCylinder(this.scene, m.brass, 0.02, 0.03, 1.5, [x, 0.75, 3.6], [0, 0, 0], 6);
      addCylinder(this.scene, m.brass, 0.14, 0.18, 0.05, [x, 0.025, 3.6], [0, 0, 0], 8);
      addCylinder(this.scene, m.brass, 0.09, 0.05, 0.05, [x, 1.52, 3.6], [0, 0, 0], 8);
      for (const dx of [-0.08, 0, 0.08]) {
        addCylinder(this.scene, m.wax, 0.012, 0.014, 0.22, [x + dx, 1.65, 3.6], [0, 0, 0], 6);
      }
      const flame = mesh(new THREE.SphereGeometry(0.035, 8, 6), m.flame, false);
      flame.scale.set(0.7, 1.6, 0.7);
      flame.position.set(x, 1.8, 3.6);
      this.scene.add(flame);
      const light = new THREE.PointLight("#f4b56a", 7, 4.5, 1.6);
      light.position.set(x, 1.85, 3.6);
      this.scene.add(light);
      this.lamps.push({ light, flame, base: 7, seed: x });
    }
    // One lamp over the bench and one over the place the accused stands. The
    // floor between them is the length of the room and is lit by neither.
    this.addLamp(TABLE_X, TABLE_Z, 4.2, 3.4, true);
    this.addLamp(TABLE_X, 9.8, 4.0, 1.5);
    this.addLamp(17.2, 7, 4.1, 0.7);

    // The bent passage: two lamps, one at each turn, and nothing between.
    this.addLamp(32.5, 4.6, 4.4, 1.0);
    this.addLamp(33, 10.4, 4.4, 1.0);

    // The cell range.
    //
    // Six cells off twenty-eight metres of corridor, each fronted by iron
    // rather than stone. The corridor's own lamps are amber and few; what lights
    // a cell is its own weak lamp on a bracket, and the moon.
    const muralTexture = makeMuralTexture();
    this.disposableTextures.push(muralTexture);
    this.buildCellFronts();
    this.buildDoorLeaves();
    for (const z of [6, 12, 18, 24, 29]) {
      this.addLamp(38, z, 3.7, z === 29 ? 1.2 : 0.95);
    }

    for (const [index, row] of CELL_ROWS.entries()) {
      const pallet = makePallet(m);
      pallet.position.set(41.95, 0, row + 2.55);
      this.scene.add(pallet);
      const stool = makeStool(m);
      stool.position.set(44.35, 0, row + 0.45);
      this.scene.add(stool);
      // The weak lamp the text gives each occupied cell, on a bracket on the
      // north wall. The empty cells have none, and are lit by the moon or not
      // at all.
      if (index < 3 || index === 5) {
        this.addBracket(42.6, 2.4, row + 0.06, [0, 1], 0.62, "#e8a25c");
      }
      // A jug and a bowl by the gate.
      addCylinder(this.scene, m.canvas, 0.09, 0.07, 0.24, [41.3, 0.12, row + 0.3], [0, 0, 0], 8);
    }

    // Marcello's cell. Bendetta's wall is the south wall, over his pallet: the
    // first thing seen from the gate, and the last thing he can look away from
    // lying down. The panel of stone that opens stands beside it.
    const CELL_SOUTH_FACE = CELL_ROWS[0] + 3 - 0.015;
    const mural = wallDecal(
      new THREE.PlaneGeometry(1.6, 2.5),
      new THREE.MeshStandardMaterial({
        map: muralTexture,
        transparent: true,
        color: "#9c8875",
        roughness: 1,
        depthWrite: false,
      }),
    );
    mural.position.set(42.05, 2.15, CELL_SOUTH_FACE);
    mural.rotation.y = Math.PI;
    this.scene.add(mural);
    this.checkWallBacking("Bendetta's wall", 42.05, CELL_SOUTH_FACE, "x", 1.6, -1);
    // The demon's pupils: two discs on the wall over the painted eyes, which
    // slide a little toward whoever is standing in the cell. The text has the
    // eyes appear to move, and so they do — by a centimetre, and only when
    // looked at from inside.
    for (const u of [0.435, 0.565]) {
      const pupil = mesh(new THREE.CircleGeometry(0.03, 10), standard("#0b0705", 1), false);
      const x = 42.05 + (0.5 - u) * 1.6;
      const y = 2.15 + 1.25 - 0.355 * 2.5;
      pupil.position.set(x, y, CELL_SOUTH_FACE - 0.006);
      pupil.rotation.y = Math.PI;
      this.scene.add(this.hang(pupil));
      this.pupils.push({ mesh: pupil, restX: x, restY: y });
    }
    // Nail-scratches below the painting, cut into the wall rather than hung in
    // front of it: each straddles the face, mostly buried, a few millimetres
    // proud.
    for (let i = 0; i < 9; i++) {
      const scratch = addBox(
        this.scene,
        m.scratch,
        [0.34 + (i % 3) * 0.12, 0.011, 0.024],
        [41.5 + (i % 2) * 0.22, 0.98 + i * 0.05, CELL_SOUTH_FACE + 0.015],
        [0, 0.05, 0.06 * (i % 2 ? 1 : -1)],
      );
      scratch.castShadow = false;
    }
    // Over the slit, a lintel of stone that fills the wall above the panel, so
    // the slit reads as a doorway cut into a wall rather than a wall missing.
    addBox(this.scene, m.cellStone, [1.0, WALL_HEIGHT - 2.7, 1.0], [43.5, 2.7 + (WALL_HEIGHT - 2.7) / 2, 7.5]);

    // Maddalena's cell: no infernal pictures, a web beside the lamp with its
    // spider on it, and a small gold cross on the wall she prays toward.
    const goldCross = makeScarletCross(m.brass, 0.35);
    goldCross.position.set(42.4, 1.7, CELL_ROWS[1] + 3 - 0.035);
    goldCross.rotation.y = Math.PI;
    this.scene.add(this.hang(goldCross));
    this.checkWallBacking("maddalena gold cross", 42.4, CELL_ROWS[1] + 3 - 0.035, "x", 0.17, -1);
    const web = new THREE.Group();
    const webMaterial = new THREE.LineBasicMaterial({ color: "#a39c8c", transparent: true, opacity: 0.45 });
    const strands: THREE.Vector3[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const end = new THREE.Vector3(Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0);
      strands.push(end);
      web.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), end]), webMaterial));
    }
    for (const radius of [0.1, 0.19, 0.28, 0.37]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        const wobble = radius * (1 + Math.sin(a * 7) * 0.03);
        points.push(new THREE.Vector3(Math.cos(a) * wobble, Math.sin(a) * wobble, 0));
      }
      web.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), webMaterial));
    }
    web.position.set(44.96, 3.0, CELL_ROWS[1] + 0.55);
    web.userData.label = "web";
    web.rotation.y = -Math.PI / 2;
    this.scene.add(this.hang(web));
    // The spider: a body, an abdomen, and eight legs, creeping along a strand
    // and back. It is small, and it moves, which is the whole of what the text
    // gives it.
    const spider = new THREE.Group();
    const spiderMaterial = standard("#1a1410", 1);
    const abdomen = mesh(new THREE.SphereGeometry(0.02, 8, 6), spiderMaterial, false);
    abdomen.scale.set(1, 0.8, 1.3);
    spider.add(abdomen);
    const thorax = mesh(new THREE.SphereGeometry(0.012, 8, 6), spiderMaterial, false);
    thorax.position.set(0, 0, -0.026);
    spider.add(thorax);
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1;
      const k = i % 4;
      const leg = addCylinder(spider, spiderMaterial, 0.002, 0.002, 0.05, [side * 0.028, 0.004, -0.03 + k * 0.014], [0.3 * (k - 1.5), 0, side * 1.1], 4);
      leg.castShadow = false;
    }
    web.add(spider);
    this.spider = { mesh: spider, from: new THREE.Vector3(0, 0, 0), to: strands[2] };

    // The fifth cell is empty, and keeps its tenant's tally: ninety days cut
    // into the north wall by somebody who is no longer in it.
    for (let i = 0; i < 90; i++) {
      const column = Math.floor(i / 18);
      const scratch = addBox(
        this.scene,
        m.scratch,
        [0.008, 0.09, 0.022],
        [42.2 + column * 0.13, 1.35 - (i % 18) * 0.05, CELL_ROWS[4] + 0.0],
        [0, 0, 0.04],
      );
      scratch.castShadow = false;
    }
    // And in the further cell, low on the west jamb where a hand on the floor
    // could reach, two letters and nothing more: B. C.
    for (const [dx, dz, ry] of [[0, 0, 0], [0, 0.09, 0], [0.04, 0.045, Math.PI / 2]] as const) {
      const mark = addBox(this.scene, m.scratch, [0.006, 0.07, 0.016], [44.99, 0.36 + dx, CELL_ROWS[2] + 2.3 + dz], [0, 0, ry * 0.3]);
      mark.castShadow = false;
    }

    // The gaoler's lodge: the board of keys on the west wall, a stool, a jug,
    // and his own lamp.
    const board = makeKeyBoard(m);
    board.position.set(34.03, 1.55, 25.8);
    board.rotation.y = Math.PI / 2;
    this.scene.add(this.hang(board));
    this.checkWallBacking("key board", 34.03, 25.8, "z", 1.2, 1);
    const lodgeStool = makeStool(m);
    lodgeStool.position.set(34.5, 0, 27.3);
    this.scene.add(lodgeStool);
    addCylinder(this.scene, m.canvas, 0.1, 0.08, 0.28, [35.6, 0.14, 24.3], [0, 0, 0], 8);
    this.addBracket(35.98, 2.4, 24.6, [-1, 0], 0.7);

    // The lower passage down to the chamber: one lamp at the turn.
    this.addLamp(34.5, 29.8, 4.2, 0.9);

    // The wardrobe room.
    const wardrobe = makeWardrobe(m);
    wardrobe.position.set(14, 0, 36.5);
    this.scene.add(wardrobe);
    const bench = makeTable(m, 1.5, 0.46);
    bench.position.set(14, 0, 33.6);
    this.scene.add(bench);
    // A folded habit on the bench, and a pair of shoes under it.
    addBox(this.scene, m.blackCloth, [0.5, 0.12, 0.36], [13.7, 0.97, 33.6]);
    addBox(this.scene, m.darkLeather, [0.1, 0.06, 0.26], [14.3, 0.03, 33.5]);
    addBox(this.scene, m.darkLeather, [0.1, 0.06, 0.26], [14.45, 0.03, 33.55], [0, 0.2, 0]);
    this.addLamp(14, 35, 3.6, 1.7);

    // The password vault: the watcher's post under the lamp, and on the west
    // wall his own bracket lamp with the key of the moon door on a nail beside
    // it.
    addBox(this.scene, m.woodTrim, [0.75, 0.08, 0.75], [20.5, 0.04, 33.2]);
    this.addLamp(20.5, 34.2, 3.6, 2.2, true);
    this.addBracket(18.02, 2.5, 31.6, [1, 0], 0.6);
    const nail = addCylinder(this.scene, m.iron, 0.008, 0.008, 0.08, [18.03, 1.55, 32.4], [0, 0, Math.PI / 2], 6);
    this.hang(nail);
    const moonKey = makeKey(m);
    moonKey.position.set(18.07, 1.53, 32.4);
    moonKey.rotation.y = Math.PI / 2;
    moonKey.rotation.z = 0.06;
    this.scene.add(this.hang(moonKey));
    this.takeable.set("moon-key", moonKey);
    // A plaque over the post: the word is not written.
    const plaque = addBox(this.scene, m.woodTrim, [0.9, 0.3, 0.03], [20.5, 3.2, 31.03]);
    this.hang(plaque);
    for (let i = 0; i < 6; i++) {
      this.hang(addBox(this.scene, m.scratch, [0.06 + (i % 3) * 0.02, 0.008, 0.01], [20.15 + i * 0.14, 3.2, 31.045]));
    }

    // The Chamber of Groans, twelve metres by eleven under four piers.
    const grille = makePortcullis(m);
    grille.position.set(25.5, 1.95, 38);
    grille.rotation.y = Math.PI / 2;
    grille.scale.set(0.5, 1, 1);
    this.scene.add(grille);
    for (const [px, pz] of [[29, 37], [34, 37], [29, 41], [34, 41]] as const) {
      const pier = addBox(this.scene, m.brownStone, [0.9, WALL_HEIGHT, 0.9], [px, WALL_HEIGHT / 2, pz]);
      pier.castShadow = true;
      pier.receiveShadow = true;
      addBox(this.scene, m.stone, [1.06, 0.18, 1.06], [px, 0.09, pz]);
      addBox(this.scene, m.stone, [1.06, 0.22, 1.06], [px, WALL_HEIGHT - 0.11, pz]);
    }
    const rack = makeRack(m);
    rack.position.set(31.5, 0, 40);
    rack.rotation.y = 0.35;
    this.scene.add(rack);
    const narrowTable = makeTable(m, 1, 2.2);
    narrowTable.position.set(27.5, 0, 43);
    narrowTable.rotation.y = Math.PI / 2 - 0.15;
    this.scene.add(narrowTable);
    for (const z of [43.6, 35.2]) {
      addCylinder(this.scene, m.iron, 0.4, 0.3, 0.3, [36.4, 0.15, z], [0, 0, 0], 12);
    }
    // Cords coiled on a peg, and the apparatus hanging from a beam under the
    // vault.
    const beam = addBox(this.scene, m.wood, [0.22, 0.24, 4.4], [35.5, WALL_HEIGHT - 0.14, 39.4]);
    beam.castShadow = true;
    addCylinder(this.scene, m.iron, 0.03, 0.03, 1.7, [35.5, WALL_HEIGHT - 0.95, 37.9], [0, 0, 0], 8);
    // The wheel hangs on its rod, upright, with the cord over it.
    const pulley = mesh(new THREE.TorusGeometry(0.34, 0.07, 10, 22), m.iron);
    pulley.position.set(35.5, WALL_HEIGHT - 1.7, 37.9);
    pulley.rotation.y = Math.PI / 2;
    this.scene.add(this.hang(pulley));
    // The cord over the pulley and the rings on the chains hang from what is
    // above them, which the floating audit reads from below; they are declared
    // hung so it does not report a cord for not standing on the floor.
    this.hang(addCylinder(this.scene, m.iron, 0.012, 0.012, 1.5, [35.84, WALL_HEIGHT - 2.45, 37.9], [0, 0, 0], 6));
    for (const z of [40.4, 41.2]) {
      const drop = WALL_HEIGHT - 0.02 - 1.52;
      addCylinder(this.scene, m.iron, 0.016, 0.016, drop, [35.5, 1.52 + drop / 2, z], [0, 0, 0], 6);
      const ring = mesh(new THREE.TorusGeometry(0.13, 0.03, 8, 16), m.iron);
      ring.position.set(35.5, 1.55, z);
      ring.rotation.x = Math.PI / 2;
      this.scene.add(this.hang(ring));
    }
    this.addLamp(29.5, 36, 3.2, 1.3);
    this.addLamp(33.5, 41.5, 3.0, 1.05);
    this.addBracket(26.02, 2.2, 42.4, [1, 0], 0.5);

    // The moon stair: the treads from the plan's own flight, the landing, and
    // the door on it — hung by `buildDoorLeaves`, since it opens.
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
        level.id === "garden-floor" ? m.turf : level.id.startsWith("lane") ? m.gravel : m.stone,
        [level.x2 - level.x1, level.height, level.y2 - level.y1],
        [(level.x1 + level.x2) / 2, level.height / 2, (level.y1 + level.y2) / 2],
      );
      slab.receiveShadow = true;
      slab.userData.label = level.id;
    }
    // A lamp partway down the flight, so the treads are legible on the way up,
    // and cold light leaking round the shut door, so the door reads as shut
    // against something bright rather than as a dark panel at the top of a
    // stair.
    this.addLamp(43, 44.6, 4.0, 0.7);
    const MOON_X = 43;
    const MOON_FACE = 39.0;
    const leak = new THREE.PointLight("#a8c0d8", 5, 8, 1.25);
    leak.position.set(MOON_X, UPPER_FLOOR + 1.7, MOON_FACE + 0.9);
    this.scene.add(leak);
    const gap = new THREE.MeshBasicMaterial({ color: "#cfe0f2", fog: false });
    for (const [w, h, x, y] of [
      [0.035, 2.4, -0.97, UPPER_FLOOR + 1.2],
      [0.035, 2.4, 0.97, UPPER_FLOOR + 1.2],
      [1.97, 0.035, 0, UPPER_FLOOR + 2.41],
    ] as const) {
      const sliver = mesh(new THREE.PlaneGeometry(w, h), gap, false);
      sliver.position.set(MOON_X + x, y, MOON_FACE + 0.07);
      sliver.rotation.y = Math.PI;
      this.scene.add(sliver);
      this.doorSlivers.push(sliver);
    }
    // Moonlight through the doorway: a spot standing in the open air of the
    // lane, aimed down through the door at the flight. The leaf casts, so a
    // shut door holds it back and an opening one lets it in across the treads.
    const doorMoon = new THREE.SpotLight("#b8c9e6", 3.4, 0, 0.26, 0.5, 0);
    doorMoon.position.set(43.6, 14, 24);
    doorMoon.target.position.set(43, UPPER_FLOOR - 1.2, 42);
    doorMoon.castShadow = true;
    doorMoon.shadow.mapSize.set(1024, 1024);
    doorMoon.shadow.bias = -0.0008;
    doorMoon.shadow.normalBias = 0.03;
    this.scene.add(doorMoon, doorMoon.target);
  }

  /**
   * The gratings, and the moon through them.
   *
   * Each cell's east wall is pierced at 3.4m by a window a metre wide and 0.6
   * high. The wall block is built in pieces around the hole — a sill block, a
   * head block and two jambs — so that the hole is a real hole, and the block
   * behind it is left out altogether: a light well one cell square, open to
   * the sky, with the night painted on its far side. The moon is a spot light
   * standing over the well, aimed down through the hole at the far side of the
   * cell floor. It is held back by every piece of stone and by nothing else,
   * and what it throws on the flagstones is the grating.
   *
   * The geometry is what decides where the light lands, and it is less
   * forgiving than it looks. The wall is a metre thick, so a ray gets through
   * only if it is inside the opening at *both* faces of the block: a window
   * 0.6 high admits nothing steeper than thirty degrees, and at thirty degrees
   * the light from a sill at 3.4m lands six metres away, beyond the far wall.
   * Two attempts failed exactly so — one with the light in a tunnel behind
   * the bars, whose only passing rays were the level ones that lit the wall
   * opposite, and one with a taller light over the well, whose every ray
   * clipped the underside of the head block on the way in. The window is
   * therefore 1.3m tall, which admits fifty-two degrees, and the moon stands
   * three and a half metres out and a metre above the wall top, at a slope
   * of forty-six: what comes through lands on the west half of the floor,
   * where a prisoner walks.
   *
   * The shaft itself is two crossed translucent planes from the window to the
   * floor, and a handful of motes drifting in it.
   */
  private buildMoonWindows() {
    const m = this.materials;
    const moteTexture = makeMoteTexture();
    const shaftTexture = makeShaftTexture();
    this.disposableTextures.push(moteTexture, shaftTexture);
    const SILL = 3.0;
    const HEAD = 4.3;
    const shaftMaterial = new THREE.MeshBasicMaterial({
      map: shaftTexture,
      color: "#6d84ad",
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const moteMaterial = new THREE.PointsMaterial({
      map: moteTexture,
      color: "#c6d4ea",
      size: 0.045,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    for (const row of CELL_ROWS) {
      const z = row + 1.5;
      const cx = 45.5;
      // Sill and head, full width; jambs either side of the hole.
      addBox(this.scene, m.cellStone, [1.002, SILL, 1.002], [cx, SILL / 2, z]);
      addBox(this.scene, m.cellStone, [1.002, WALL_HEIGHT - HEAD, 1.002], [cx, HEAD + (WALL_HEIGHT - HEAD) / 2, z]);
      for (const side of [-1, 1]) {
        addBox(this.scene, m.cellStone, [1.002, HEAD - SILL, 0.05], [cx, (SILL + HEAD) / 2, z + side * 0.475]);
      }
      // The bars stand near the cell face, so their shadow is thrown long
      // across the floor.
      for (let i = 0; i < 4; i++) {
        const bar = addCylinder(this.scene, m.iron, 0.026, 0.026, HEAD - SILL, [45.12, (SILL + HEAD) / 2, z - 0.3 + i * 0.2], [0, 0, 0], 6);
        this.hang(bar);
      }
      for (const barY of [SILL + 0.42, HEAD - 0.42]) {
        this.hang(addCylinder(this.scene, m.iron, 0.022, 0.022, 0.9, [45.12, barY, z], [Math.PI / 2, 0, 0], 6));
      }
      // The night on the far side of the well, and the well's own floor, so
      // that looking down through the bars finds stone and not the void.
      const pane = mesh(new THREE.PlaneGeometry(1.0, WALL_HEIGHT), m.moonPane, false);
      pane.position.set(46.98, WALL_HEIGHT / 2, z);
      pane.rotation.y = -Math.PI / 2;
      this.scene.add(pane);
      addBox(this.scene, m.cellStone, [1.002, SILL - 0.3, 1.002], [46.5, (SILL - 0.3) / 2, z]);
      // The moon, out beyond the well and above the wall top, at the slope the
      // window admits. The cone is narrow — the opening as seen from the light
      // is twelve degrees tall — so nothing of it spills onto the garden.
      const moon = new THREE.SpotLight("#c2d2ee", 7.5, 0, 0.24, 0.3, 0);
      moon.position.set(48.5, 6.4, z + 0.05);
      moon.target.position.set(42.5, 0.1, z - 0.2);
      moon.castShadow = true;
      moon.shadow.mapSize.set(1024, 1024);
      moon.shadow.bias = -0.0006;
      moon.shadow.normalBias = 0.02;
      moon.shadow.camera.near = 1;
      moon.shadow.camera.far = 16;
      this.scene.add(moon, moon.target);

      // The visible shaft: from the window to where the light lands.
      const from = new THREE.Vector3(45.0, (SILL + HEAD) / 2, z);
      const to = new THREE.Vector3(41.9, 0.05, z - 0.25);
      const length = from.distanceTo(to);
      for (const roll of [0, Math.PI / 2]) {
        const plane = new THREE.PlaneGeometry(1.0, length);
        // The texture runs bright at +v; put +v at the window end.
        const shaft = mesh(plane, shaftMaterial, false);
        shaft.position.copy(from).add(to).multiplyScalar(0.5);
        shaft.lookAt(to);
        shaft.rotateX(Math.PI / 2);
        shaft.rotateY(roll);
        shaft.renderOrder = 2;
        this.scene.add(shaft);
      }
      // Motes in the shaft, drifting.
      const count = 70;
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);
      const bounds = { x: 43.7, y: 1.9, z, sx: 1.3, sy: 1.8, sz: 0.5 };
      for (let i = 0; i < count; i++) {
        positions[i * 3] = bounds.x + (Math.random() - 0.5) * bounds.sx * 2;
        positions[i * 3 + 1] = bounds.y + (Math.random() - 0.5) * bounds.sy * 2;
        positions[i * 3 + 2] = bounds.z + (Math.random() - 0.5) * bounds.sz * 2;
        velocities[i * 3] = (Math.random() - 0.5) * 0.04;
        velocities[i * 3 + 1] = -0.01 - Math.random() * 0.03;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.03;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const motes = new THREE.Points(geometry, moteMaterial);
      motes.renderOrder = 3;
      this.scene.add(motes);
      this.shafts.push({ motes, bounds, velocities });
    }
  }

  /**
   * The lane and the garden: what the moon door opens onto.
   *
   * Everything here stands on the raised floor at UPPER_FLOOR and under no
   * ceiling. The moon lights it from a spot high in the east with shadows on,
   * so the cypresses lie across the turf and the walls throw their own dark.
   */
  private buildGarden() {
    const m = this.materials;
    const G = UPPER_FLOOR;

    // The lane: a gutter along one side and three brackets with nothing in
    // them — the lamps went with whoever last walked it.
    for (const [x, z, facing] of [[41.98, 36, [1, 0]], [46, 31.98, [0, 1]], [51.98, 29.5, [-1, 0]]] as const) {
      const bracket = new THREE.Group();
      bracket.position.set(x, G + 2.2, z);
      bracket.rotation.y = Math.atan2(-facing[1], facing[0]);
      addBox(bracket, m.iron, [0.3, 0.03, 0.03], [0.15, 0, 0]);
      addCylinder(bracket, m.iron, 0.07, 0.045, 0.09, [0.28, -0.03, 0], [0, 0, 0], 8);
      this.scene.add(this.hang(bracket));
    }
    // Weeds along the foot of the lane walls, where the gutter runs.
    for (let i = 0; i < 18; i++) {
      const along = 42.5 + i * 0.5;
      const tuft = mesh(new THREE.SphereGeometry(0.12 + (i % 3) * 0.05, 7, 5), m.cypress);
      tuft.scale.set(1.3, 0.8, 1);
      tuft.position.set(along, G + 0.08, i % 2 ? 32.2 : 33.8);
      this.scene.add(tuft);
    }

    // The garden: a gravel walk from the south door to the basin and on to the
    // north gate, cypresses along both walls, the basin with the moon in it,
    // a bench, and in the west wall, low, the gaol's own three windows.
    const walk = addBox(this.scene, m.gravel, [1.9, 0.02, 12.6], [52, G + 0.01, 20.7]);
    walk.receiveShadow = true;
    for (const [x, z] of [[49, 16], [49, 19.5], [49, 23], [55, 16], [55, 19.5], [55, 23]] as const) {
      const tree = makeCypress(m, 6.2 + ((x + z) % 3) * 0.5);
      tree.position.set(x, G, z);
      tree.rotation.y = x + z;
      this.scene.add(tree);
    }
    const basin = makeBasin(m);
    basin.position.set(52, G, 20.5);
    this.scene.add(basin);
    this.water = basin.children.find((child) => (child as THREE.Mesh).material === m.water) as THREE.Mesh;
    // The moon's reflection: a disc of light on the water, and a faint upward
    // glow so the rim of the basin catches it.
    const reflection = mesh(new THREE.CircleGeometry(0.19, 20), new THREE.MeshBasicMaterial({ color: "#e6ecfa", fog: false }), false);
    reflection.rotation.x = -Math.PI / 2;
    reflection.position.set(52.35, G + 0.605, 20.3);
    this.scene.add(reflection);
    const basinGlow = new THREE.PointLight("#9fb2d4", 1.6, 4, 2);
    basinGlow.position.set(52.3, G + 0.9, 20.4);
    this.scene.add(basinGlow);
    // A bench against the east wall.
    const bench = makeTable(m, 1.6, 0.5);
    bench.position.set(54.6, G - 0.36, 25.6);
    this.scene.add(bench);
    // Low shrubs along the walls.
    for (let i = 0; i < 14; i++) {
      const west = i % 2 === 0;
      const shrub = mesh(new THREE.SphereGeometry(0.35 + (i % 3) * 0.1, 8, 6), m.cypress);
      shrub.scale.set(1.3, 0.7, 1);
      shrub.position.set(west ? 48.5 : 55.5, G + 0.2, 14.8 + i * 0.85);
      this.scene.add(shrub);
    }
    // The further gate in the north wall, which does not open. Oak, iron, and
    // a lock with no key anywhere in the building.
    const northGate = addBox(this.scene, m.woodTrim, [1.7, 2.6, 0.14], [52, G + 1.3, 14.08]);
    northGate.castShadow = true;
    for (const y of [0.5, 1.3, 2.1]) addBox(northGate, m.iron, [1.66, 0.1, 0.05], [0, y - 1.3, 0.09]);
    for (const x of [-0.5, 0, 0.5]) addBox(northGate, m.iron, [0.06, 2.5, 0.05], [x, 0, 0.1]);
    addBox(this.scene, m.iron, [0.16, 0.22, 0.06], [52.55, G + 1.15, 14.18]);
    addBox(this.scene, m.gardenStone, [2.3, 0.3, 0.3], [52, G + 2.75, 14.15]);
    this.checkWallBacking("garden north gate", 52, 14.0, "x", 1.7, 1);
    // The gaol's windows, seen from outside: three barred slits in the west
    // wall, each with a little of a cell's lamplight behind it. Their rows are
    // the fourth, fifth and sixth cells', two metres above the garden floor.
    for (const row of CELL_ROWS.slice(3)) {
      const z = row + 1.5;
      const glow = mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshBasicMaterial({ color: "#3d2a14", fog: false }), false);
      glow.position.set(48.02, 3.7, z);
      glow.rotation.y = Math.PI / 2;
      this.scene.add(glow);
      for (let i = 0; i < 4; i++) {
        this.hang(addCylinder(this.scene, m.iron, 0.022, 0.022, 0.6, [48.05, 3.7, z - 0.3 + i * 0.2], [0, 0, 0], 6));
      }
      for (const [dy, dz, w, h] of [[0.36, 0, 0.09, 0.1], [-0.36, 0, 0.09, 0.1], [0, 0.5, 0.09, 0.82], [0, -0.5, 0.09, 0.82]] as const) {
        const jamb = addBox(this.scene, m.gardenStone, dz === 0 ? [w, h, 1.1] : [w, h, 0.1], [48.02, 3.7 + dy, z + dz]);
        jamb.castShadow = false;
        this.hang(jamb);
      }
    }
    // The moon over the garden and over the lane: two spots, high and to the
    // east, with the shadows on.
    const gardenMoon = new THREE.SpotLight("#b6c6e4", 2.3, 0, 0.32, 0.5, 0);
    gardenMoon.position.set(76, 48, 40);
    gardenMoon.target.position.set(52, G, 20.5);
    gardenMoon.castShadow = true;
    gardenMoon.shadow.mapSize.set(2048, 2048);
    gardenMoon.shadow.bias = -0.0006;
    gardenMoon.shadow.normalBias = 0.04;
    gardenMoon.shadow.camera.near = 20;
    gardenMoon.shadow.camera.far = 90;
    this.scene.add(gardenMoon, gardenMoon.target);
    const laneMoon = new THREE.SpotLight("#b6c6e4", 2.0, 0, 0.3, 0.5, 0);
    laneMoon.position.set(66, 44, 56);
    laneMoon.target.position.set(46.5, G, 34);
    laneMoon.castShadow = true;
    laneMoon.shadow.mapSize.set(1024, 1024);
    laneMoon.shadow.bias = -0.0006;
    laneMoon.shadow.normalBias = 0.04;
    laneMoon.shadow.camera.near = 15;
    laneMoon.shadow.camera.far = 80;
    this.scene.add(laneMoon, laneMoon.target);
    // Skylight fill, unshadowed and faint, so the shadowed side of a cypress is
    // blue-black rather than black.
    const fill = new THREE.SpotLight("#3c4c6e", 0.6, 0, 0.5, 0.6, 0);
    fill.position.set(30, 52, 4);
    fill.target.position.set(50, G, 24);
    this.scene.add(fill, fill.target);
  }

  /**
   * Declares a piece to be hung on a wall rather than stood on the floor.
   *
   * Anything fixed to masonry sits a centimetre or two proud of it to keep its
   * faces out of the wall's own, so it can never satisfy a "does it reach the
   * floor or the stone" test — and `checkWallBacking` already asks the question
   * that actually matters about it, which is whether there is any masonry
   * behind it at all.
   */
  private hang<T extends THREE.Object3D>(item: T) {
    item.userData.hung = true;
    return item;
  }

  /**
   * Reports scenery that is holding itself up.
   *
   * A piece counts as carried if it reaches the floor, reaches the vault, meets
   * masonry, or sits on something else that does. Everything left over is
   * floating, and is named with its measurements so the fix is a measurement
   * rather than another nudge.
   */
  private auditFloatingProps() {
    const boxes: { name: string; box: THREE.Box3 }[] = [];
    this.scene.updateMatrixWorld(true);
    for (const child of this.scene.children) {
      if (child instanceof THREE.Light || child instanceof THREE.Camera) continue;
      if ((child as unknown as THREE.InstancedMesh).isInstancedMesh) continue;
      if (child instanceof THREE.Line || child instanceof THREE.Points) continue;
      const mesh = child as THREE.Mesh;
      // Wall decals, flames, the sky and the shafts carry nothing and are hung,
      // not stood.
      if (mesh.isMesh && !mesh.castShadow) continue;
      if (child.userData.hung) continue;
      const box = new THREE.Box3().setFromObject(child);
      if (!box.isEmpty()) boxes.push({ name: child.userData.label ?? child.type, box });
    }

    const touchesMasonry = (box: THREE.Box3) => {
      for (let x = Math.floor(box.min.x); x <= Math.floor(box.max.x); x++) {
        for (let z = Math.floor(box.min.z); z <= Math.floor(box.max.z); z++) {
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
   * The iron fronts of the cells: bars where the plan says screen.
   *
   * Read from the model rather than placed by eye. A screen is masonry to the
   * body and nothing to sight or sound, so the architecture has to agree with
   * the collision exactly.
   */
  private buildCellFronts() {
    const m = this.materials;
    for (const front of this.model.screens) {
      for (let y = front.y1; y <= front.y2; y++) {
        for (let x = front.x1; x <= front.x2; x++) {
          const cx = x + 0.5;
          const cz = y + 0.5;
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
          for (const barY of [1.35, 3.05, 4.4]) {
            addCylinder(this.scene, m.iron, 0.03, 0.03, 1.0, [cx, barY, cz], [Math.PI / 2, 0, 0], 8);
          }
        }
      }
    }
  }

  /**
   * Every door that moves, built at its hinge so `turnDoors` can swing it.
   *
   * Each leaf is built with its length running out along the door's `along`
   * axis from a group standing on the hinge, so the whole group can be turned
   * to whatever the door state says without the geometry knowing where it is.
   */
  private buildDoorLeaves() {
    const m = this.materials;
    for (const door of DOORS) {
      if (door.leaf === "shut-door") continue;
      const leaf = new THREE.Group();
      const floor = door.floor ?? 0;
      leaf.position.set(door.hinge[0], floor, door.hinge[1]);
      // Rotate the group so its local +Z runs along the door's `along`.
      leaf.rotation.y = Math.atan2(door.along[0], door.along[1]);
      const w = door.width;
      if (door.leaf === "iron-gate") {
        const spacing = w / 5;
        for (let i = 0; i < 5; i++) {
          addCylinder(leaf, m.iron, 0.032, 0.032, 3.4, [0, 1.75, spacing * (i + 0.5)], [0, 0, 0], 8);
        }
        for (const barY of [0.22, 1.75, 3.3]) {
          addBox(leaf, m.iron, [0.05, 0.075, w], [0, barY, w / 2]);
        }
        addCylinder(leaf, m.iron, 0.055, 0.055, 3.5, [0, 1.75, 0], [0, 0, 0], 8);
        // Over the gate, more bars to the vault: the doorway is 5.4 high and
        // the leaf 3.5, and what is above it is not a way out either.
        for (let i = 0; i < 5; i++) {
          addCylinder(leaf, m.iron, 0.032, 0.032, WALL_HEIGHT - 3.55, [0, 3.55 + (WALL_HEIGHT - 3.55) / 2, spacing * (i + 0.5)], [0, 0, 0], 6);
        }
      } else if (door.leaf === "stone-panel") {
        // Inside the slit, its face a hand's breadth back from the cell wall,
        // so from Marcello's side it is a recess of stone and not a door.
        const slab = addBox(leaf, m.cellStone, [0.16, 2.66, w], [-0.08, 1.33, w / 2]);
        slab.receiveShadow = true;
        addCylinder(leaf, m.iron, 0.03, 0.03, 0.1, [-0.08, 2.7, 0.04], [0, 0, 0], 6);
      } else if (door.leaf === "moon-door") {
        // The leaf hangs on the stair side of its hinge line, flush with the
        // wall face, straps and lock toward the stair: that is the side it is
        // seen from until it opens, and the side the key goes in.
        const plank = addBox(leaf, m.woodTrim, [0.12, 2.4, w], [-0.06, 1.2, w / 2]);
        plank.receiveShadow = true;
        for (const y of [0.4, 1.2, 2.0]) addBox(leaf, m.iron, [0.05, 0.1, w - 0.06], [-0.13, y, w / 2]);
        for (const along of [0.3, w / 2, w - 0.3]) addBox(leaf, m.iron, [0.05, 2.3, 0.06], [-0.13, 1.2, along]);
        addBox(leaf, m.iron, [0.06, 0.26, 0.18], [-0.14, 1.1, w - 0.22]);
        addCylinder(leaf, m.iron, 0.045, 0.045, 0.14, [-0.14, 1.1, w - 0.2], [0, 0, Math.PI / 2], 8);
        addBox(leaf, m.iron, [0.03, 0.05, 0.02], [-0.18, 1.1, w - 0.2]);
      }
      leaf.traverse((item) => {
        if ((item as THREE.Mesh).isMesh) (item as THREE.Mesh).castShadow = true;
      });
      this.doorLeaves.set(door.id, leaf);
      this.scene.add(leaf);
    }
  }

  private buildPatrols() {
    for (const npc of NPCS) {
      const figure = makePerson(this.materials, npc.appearance);
      figure.userData.patrol = npc.id;
      this.patrols.push({ id: npc.id, figure });
      this.stride.set(npc.id, { phase: 0, travelled: 0, blend: 0 });
      this.scene.add(figure);
    }
  }

  /**
   * Turn each leaf to wherever its door has got to.
   *
   * The leaf group's local +Z runs along `along`. Turning the group by t about
   * Y turns that toward -X for positive t; the model's positive swing turns the
   * free end anticlockwise in the x/y plane, which is the same sense. So the
   * group's rotation is the negative of the model's angle, and that sign is the
   * one value that keeps the iron the player can see in the same place as the
   * iron the player collides with.
   */
  private turnDoors() {
    for (const state of this.doorStates) {
      const leaf = this.doorLeaves.get(state.id);
      const door = DOORS.find((entry) => entry.id === state.id);
      if (!leaf || !door) continue;
      leaf.rotation.y = Math.atan2(door.along[0], door.along[1]) - door.swing * state.open;
      // The light round the edges of a shut door is the light through an open
      // one, and cannot also be drawn as edges once the leaf has moved.
      if (state.id === "moon-door") {
        for (const sliver of this.doorSlivers) sliver.visible = state.open < 0.04;
      }
    }
  }

  /** Takes a thing off its hook: the renderer's half of picking up a key. */
  take(id: string) {
    const item = this.takeable.get(id);
    if (!item) return false;
    item.visible = false;
    this.takeable.delete(id);
    return true;
  }

  render(player: PlayerView, time: number, dtMs = 16.7, held: ReadonlySet<string> = new Set()) {
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

    // The doors *are* given the player, and the NPCs are not. That asymmetry is
    // the whole access model: the fabric of the building yields to her and the
    // people in it never register that she is there.
    updateDoors(this.doorStates, DOORS, player.x, player.y, dtMs, held);
    this.turnDoors();

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
      // t = -PI/2 - dir.
      patrol.figure.rotation.y = -Math.PI / 2 - state.heading;

      const gait = this.stride.get(patrol.id);
      if (!gait) continue;
      const moved = state.travelled - gait.travelled;
      gait.travelled = state.travelled;
      gait.phase += (moved / STRIDE_CYCLE) * Math.PI * 2;
      const walking = state.phase === "walk" && moved > 1e-5;
      gait.blend += ((walking ? 1 : 0) - gait.blend) * Math.min(1, dtMs / 160);
      animateWalk(patrol.figure, gait.phase, gait.blend);
      patrol.figure.position.y += Math.abs(Math.sin(gait.phase)) * 0.014 * gait.blend;
    }

    // The motes drift down the shaft and are put back at the top.
    for (const shaft of this.shafts) {
      const attribute = shaft.motes.geometry.getAttribute("position") as THREE.BufferAttribute;
      const array = attribute.array as Float32Array;
      const seconds = dtMs / 1000;
      for (let i = 0; i < array.length; i += 3) {
        array[i] += (shaft.velocities[i] + Math.sin(time * 0.0007 + i) * 0.01) * seconds;
        array[i + 1] += shaft.velocities[i + 1] * seconds;
        array[i + 2] += (shaft.velocities[i + 2] + Math.cos(time * 0.0009 + i) * 0.008) * seconds;
        const b = shaft.bounds;
        if (array[i + 1] < b.y - b.sy || Math.abs(array[i] - b.x) > b.sx || Math.abs(array[i + 2] - b.z) > b.sz) {
          array[i] = b.x + (Math.random() - 0.5) * b.sx * 2;
          array[i + 1] = b.y + b.sy;
          array[i + 2] = b.z + (Math.random() - 0.5) * b.sz * 2;
        }
      }
      attribute.needsUpdate = true;
    }

    // The demon's eyes. Inside Marcello's cell they follow, by a little; from
    // anywhere else they are paint.
    const inMarcello = player.x > 41 && player.x < 45 && player.y > 4 && player.y < 7;
    for (const pupil of this.pupils) {
      const targetX = inMarcello ? THREE.MathUtils.clamp((player.x - pupil.restX) * 0.02, -0.018, 0.018) : 0;
      const targetY = inMarcello ? THREE.MathUtils.clamp((EYE_HEIGHT - pupil.restY) * 0.02, -0.012, 0.012) : 0;
      pupil.mesh.position.x += (pupil.restX + targetX - pupil.mesh.position.x) * 0.04;
      pupil.mesh.position.y += (pupil.restY + targetY - pupil.mesh.position.y) * 0.04;
    }
    if (this.spider) {
      const t = (Math.sin(time * 0.00021) + 1) / 2;
      const eased = t * t * (3 - 2 * t);
      this.spider.mesh.position.lerpVectors(this.spider.from, this.spider.to, eased);
      this.spider.mesh.rotation.z = Math.atan2(this.spider.to.y, this.spider.to.x) + (Math.cos(time * 0.00021) > 0 ? 0 : Math.PI);
    }
    if (this.water) {
      this.water.position.y = 0.6 + Math.sin(time * 0.0013) * 0.004;
    }

    // Shadows on alternate frames, starting with the first: see the
    // constructor. The first frame *must* run the shadow pass, because that is
    // where the maps are allocated — without it every shadow sampler in the
    // building is bound to an empty texture for a frame, and WebGL says so
    // several hundred times.
    this.frame += 1;
    this.renderer.shadowMap.needsUpdate = this.frame % 2 === 1;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposableTextures.forEach((texture) => texture.dispose());
    this.scene.traverse((item) => {
      if (item instanceof THREE.Mesh || item instanceof THREE.InstancedMesh || item instanceof THREE.Points) {
        item.geometry?.dispose();
        const materials = Array.isArray(item.material) ? item.material : [item.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.renderer.dispose();
  }
}

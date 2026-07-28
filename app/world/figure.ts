/**
 * The measurements of a walking figure, kept where a test can reach them.
 *
 * These live outside the renderer because the thing that needs checking about
 * them is arithmetic, not appearance: a robe is a cone and a swinging leg is a
 * rotation, and whether the second stays inside the first is a question with an
 * exact answer. Answering it by eye is what produced the fault this module
 * exists to prevent — legs passing through the front of every cassock in the
 * building on every stride, in a game whose figures are almost all robed.
 *
 * Nothing here imports Three. The renderer builds its geometry from these.
 */

/** Hip height of a standing figure. */
export const HIP_Y = 0.82;
/** Hip, knee and ankle heights, and the limb radius at each. */
export const LEG = {
  hipY: 0.82,
  kneeY: 0.44,
  ankleY: 0.1,
  thighRadius: 0.084,
  kneeRadius: 0.064,
  shinRadius: 0.063,
  ankleRadius: 0.047,
} as const;

/** Radians the hip pivot turns at the extreme of a stride. */
export const LEG_SWING = 0.4;

/** The robe's skirt: a cone from the hips out to the hem. */
export const ROBE = {
  topRadius: 0.165,
  hemRadius: 0.3,
  height: 0.58,
  centreY: 0.63,
} as const;

/**
 * How far a figure travels per complete stride cycle.
 *
 * Derived, not chosen. The foot hangs `hipY` below the pivot, so a swing of
 * LEG_SWING carries it `hipY * sin(LEG_SWING)` forward of centre; a step is
 * twice that, and a cycle is two steps. Set by hand to 0.82 it was roughly half
 * the distance the legs actually cover, so every figure's feet skated forward
 * over the flagstones at exactly the rate of the error.
 */
export const STRIDE_CYCLE = 4 * LEG.hipY * Math.sin(LEG_SWING);

/** The robe's surface radius at a height, or null above or below the garment. */
export function robeRadiusAt(y: number) {
  const bottom = ROBE.centreY - ROBE.height / 2;
  const top = ROBE.centreY + ROBE.height / 2;
  if (y < bottom || y > top) return null;
  const fraction = (y - bottom) / ROBE.height;
  return ROBE.hemRadius + (ROBE.topRadius - ROBE.hemRadius) * fraction;
}

/**
 * How far the leg's surface protrudes through the robe at full stride, in metres.
 *
 * Zero or less means contained. The leg is treated as a rigid body rotating
 * about the hip — which is what `animateWalk` does to it — and sampled down its
 * length; at each sample the point's height after rotation decides which part of
 * the cone it has to fit inside, and its horizontal displacement plus the limb's
 * own radius decides whether it does.
 *
 * Only heights still within the garment count. A leg below the hem is not
 * through the cloth, it is out from under it, which is what a hem is for.
 */
export function legEscapesRobe(swing = LEG_SWING, samples = 240) {
  const sin = Math.sin(swing);
  const cos = Math.cos(swing);
  let worst = -Infinity;
  // From the hip down to the sole, in body coordinates.
  for (let i = 0; i <= samples; i++) {
    const drop = (i / samples) * LEG.hipY;
    const y = LEG.hipY - drop * cos;
    const reach = Math.abs(drop * sin) + limbRadiusAt(LEG.hipY - drop);
    const cloth = robeRadiusAt(y);
    if (cloth === null) continue;
    worst = Math.max(worst, reach - cloth);
  }
  return worst;
}

/** The limb's radius at an unrotated height, tapering hip to ankle. */
function limbRadiusAt(y: number) {
  if (y >= LEG.kneeY) {
    const t = (y - LEG.kneeY) / (LEG.hipY - LEG.kneeY);
    return LEG.kneeRadius + (LEG.thighRadius - LEG.kneeRadius) * t;
  }
  const t = Math.max(0, (y - LEG.ankleY) / (LEG.kneeY - LEG.ankleY));
  return LEG.ankleRadius + (LEG.shinRadius - LEG.ankleRadius) * t;
}

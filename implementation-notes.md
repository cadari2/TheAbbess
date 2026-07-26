# Implementation notes

Working record for the dungeon narrative redesign. Ordered by the risk-first
stages agreed before implementation, not by the original seven-step numbering.

## Agreed constraints

Settled during the pre-implementation interview. These are cross-cutting; every
stage is answerable to them.

1. **The player is the cloaked figure** — the unnamed guide from Volume II, a
   solid, complicit human insider. Full world collision; no NPC collision.
   NPCs neither avoid her nor collide with her, and interpenetration is the
   accepted visual tell.
2. **Doors yield silently on approach.** No prompt, no keypress, no HUD. Real
   collision while shut. Nothing in the institution is ever locked to her.
3. **Character fidelity target is Morrowind** — already satisfied by the
   existing `makePerson` segmented rigid-figure builder and its committed
   texture sheets. No skinning, no imported models, no external assets.
4. **NPCs are a stateful fixed-step simulation** — `walk → dwell → turn →
   speak`, stride phase driven by distance travelled, routes validated against
   the collider set at build time.
5. **There is no escape and no ending.** The moon door opens onto a walled
   moonlit garden with a further door that never opens. The player explores the
   labyrinth as an Inquisition insider; Bertocci's escape is retrospect, not a
   depicted event.
6. **NPCs never acknowledge the player**, under any condition. This is enforced
   structurally: the NPC simulation receives no player state at all.
7. **Overheard dialogue is logged** to the journal rather than lost.
8. **Progress persists** across sessions; NPC positions do not.

## Verification policy

What can be machine-checked, and what cannot, stated per stage rather than
claimed wholesale at the end.

- **Machine-verifiable:** TypeScript build, ESLint, the Node test suite,
  and — as of Stage A — behavioural assertions against the world model as pure
  functions (reachability, grid/zone agreement, route validity, opening
  integrity).
- **Not fully machine-verifiable:** mouse-look feel, audio mix, and touch
  ergonomics. Scripted headless traversal and screenshots can show that a space
  renders and is walkable; they cannot show that it plays well. Any claim
  resting on inference rather than execution is labelled as such.

## Baseline before any change

Recorded on the unmodified branch so later failures are attributable.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | clean |
| `npx tsc --noEmit` | **exit 1** — 3 pre-existing errors, all in `db/index.ts` and `worker/index.ts` (missing Cloudflare ambient types). Zero errors in `app/` or `preview/`. |
| `pnpm lint` | clean |
| `pnpm test` | 3/3 pass |

`package-lock.json` is stale — `three` and `@types/three` are declared in
`package.json` but absent from it, so `npm ci` fails. `pnpm-lock.yaml` is
current and pnpm is the working package manager.

## Stage A — unified world model

`app/world/` is now the single description of the building. Everything spatial
derives from one ordered plan in `plan.ts`: the collision grid, room labels, map
regions, prop colliders, reachability, and the validation of NPC routes against
all of them.

| Module | Holds |
| --- | --- |
| `model.ts` | Types for rooms, openings, plan steps, derived world |
| `plan.ts` | The authored plan, in build order, plus the spawn |
| `derive.ts` | Grid derivation, labels, reachability, line of sight, validators |
| `colliders.ts` | Prop volumes, player collision, clearance-aware reachability |
| `discoveries.ts` | The ten places, each bound to a room and checked against it |

`app/world-data.ts` remains as a compatibility facade so existing importers keep
their shape. It no longer contains a hand-typed grid or a zone list.

### What the unification found

The three duplicate coordinate lists had drifted, and the drift was not
cosmetic. Every item below was a live defect in the shipped game, found by the
new validators rather than by reading:

1. **Five doorways were sealed by masonry.** Rooms were laid *after* the openings
   that pierced them, so each room's wall ring paved its own doorway shut.
2. **Two rooms and two discoveries were unreachable.** The Chamber of Groans and
   the Moon Stair formed an isolated pocket. The game advertised "10 PLACES
   RECORDED" and "THE RECORD IS COMPLETE" but could reach at most eight, and the
   moon door — the end of the whole sequence — had never been enterable.
3. **A portcullis collider barred an interior doorway.** Even with the masonry
   opened, a lowered portcullis and its collision volume sealed the only route
   into the Chamber of Groans.
4. **The surgeon's table sealed the room's other exit**, leaving a 0.18 gap where
   the player needs 0.56.
5. **Two of four patrol routes walked through walls**, both on the closing
   segment of the cycle — the leg from the last waypoint back to the first.
6. **Holding forward at the start walked into a wall.** A one-cell doorway is 1.0
   wide and the player is 0.56 across, so only x 5.30–5.70 passes through the
   gate door; the spawn sat at x 5.0, dead centre of the blocked zone.
7. **Standing in any doorway blanked the location label** to "THE SUBTERRANEAN
   MAZE", because doorways belong to no room region.

Fixes 1 and 7 are structural — openings are cut after all masonry, and
`roomNameAt` resolves thresholds — so those classes cannot recur. The rest were
data corrections, each enumerated in `REOPENED_BY_ORDER_FIX` or commented at the
site.

### Verification

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean in `app/` and `preview/`; the 3 pre-existing `db/`+`worker/` errors are unchanged |
| `pnpm lint` | clean |
| `pnpm test` | 18/18 pass (was 3/3, of which 2 were source-text greps) |
| `node tests/walkthrough.mjs` | 10/10 checks, no console errors or uncaught exceptions |
| Visual review | Chamber of Groans and Moon Stair render and both discoveries are examinable for the first time |

The old suite asserted source text — exact `position.set(...)` literals, the
presence of identifiers. It passed against a dungeon that could not be finished,
and would have failed on any behaviour-preserving refactor. It is replaced by
behavioural assertions against the model; the two checks worth keeping (server
render, no placeholder scaffolding) were retained.

**Verified by execution:** grid derivation, reachability with real player
clearance, doorway traversal, room labelling, route validity, line of sight,
discovery placement, page boot, WebGL context, lit render, input reaching the
game, map and journal opening, discovery examination.

**Not verified by execution:** mouse-look feel, audio mix, and touch ergonomics.
Also note that headless software WebGL renders this scene at **0.66–1.24 fps**,
and movement is `dt`-capped at 0.04, so a held key advances ~0.09 units per
frame. Long in-browser traversals are impractical there; correctness of movement
and collision is settled deterministically in `world-model.test.mjs` instead. One
manual long-hold traverse was run to confirm the gate doorway is passable in the
real browser.

## Deviations

Deviations from the agreed plan, with reasoning. Where an edge case forced a
choice, the more conservative option was taken.

### A1. Stage A was to be behaviour-preserving; it changes reachability

The plan for Stage A was to give the building one description without altering
it, and a fixture pins the derived grid against the shipped one to prove that.
Ten cells differ.

Leaving them would have meant carrying a dungeon whose last two rooms cannot be
entered through every later stage — building NPC routes, discovery layering, and
"production ready" verification against a broken graph, and being unable to
verify any of the work in those rooms. The intent was also unambiguous: each
sealed cell was authored *as* a doorway, both stranded rooms have complete
journal entries, and the completion counter already counted them.

Taken as restoring intent rather than changing scope. The conservative element is
that the change is enumerated cell by cell in `REOPENED_BY_ORDER_FIX` and
asserted in both directions, so it is a reviewable diff rather than a silent
rewrite.

### A2. Geometry was moved, which belongs to a later stage

Raising the portcullis and re-seating the surgeon's table are environmental
changes, and environmental work is a later stage. They are here because without
them the Chamber of Groans and the Moon Stair stay sealed by props even with the
masonry corrected, which would leave deviation A1 half-finished. Both changes
move mesh and collider together, and both are the minimum that restores passage.

### A3. `allowImportingTsExtensions` was enabled in `tsconfig.json`

Not in the plan. Node's native type stripping cannot resolve extensionless
relative imports, so without explicit `.ts` specifiers the world model is not
loadable outside the bundler and the test suite would have had to keep grepping
source text. The flag only permits the extension; existing extensionless imports
elsewhere are untouched. Verified that the production build still succeeds.

### A4. Playwright was added as a dev dependency

Not in the plan, and it adds a dependency. It is the only way to make any claim
about the running game rather than about its source, and the browser it drives is
already present in the environment. `tests/walkthrough.mjs` is deliberately kept
out of `pnpm test`, since it needs a running dev server.

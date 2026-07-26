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

## Stage B — the inhabitants, and eight reported defects

Stage B was the NPC simulation. It arrived alongside eight defects reported from
play, most of which are not NPC work at all; they are implemented here rather
than deferred, and the ones that reach into later stages are logged below.

### The simulation

| Module | Holds |
| --- | --- |
| `npcs.ts` | Route nodes, figure state, the fixed-step advance, route validation |
| `roster.ts` | Who walks the building and the rounds they walk |
| `earshot.ts` | What is audible from a position, resolved outside the simulation |

Patrols were previously `npcPosition(npc, timeMs)` — closed-form, stateless, and
therefore incapable of ever pausing, because a pause is a fact about what has
happened rather than about what time it is. Figures are now advanced by
`updateNpcs(states, definitions, dtMs)` through `walk → turn → dwell → speak`,
and a route node carries how long to stand, which way to face while standing,
and what is said on arrival.

**The simulation is never given the player.** `updateNpcs` takes no player
argument and `npcs.ts` contains no reference to one outside its own comments,
which the suite asserts against the stripped source. The agreed premise — she is
never noticed, never challenged, never stopped — is therefore not a rule anyone
has to remember. Overhearing is resolved in `earshot.ts` from a read-only view of
NPC state, so a line is spoken whether or not she is there, and she walks into
and out of it.

Three prisoners were added as figures with rounds of two paces and long
stillnesses. A cell with someone motionless in it reads as a diorama.

### The eight reported defects

1. **Every figure walked backwards.** The model faces −Z; rotating it by *t*
   sends that to (−sin *t*, −cos *t*), so matching a heading needs
   `-PI/2 - dir`. It was `+PI/2 - dir` — the same angle turned through half a
   circle. Every patrol in the building had walked backwards since patrols were
   added.
2. **Rounds crossed furniture.** Routes were validated against masonry only, so
   the gaoler walked the length of his prisoner's pallet. `routeObstructions`
   now checks props too, at the figure's own girth, and every round is
   re-authored against the replanned building.
3. **Figures read as tin men.** Three causes, all fixed: shading was flat by
   design (one normal per triangle, from screen-space derivatives), which turns
   a body of tapered prisms into sheet metal; tessellation was low enough that
   silhouettes showed their corners; and robed figures **had no legs at all** —
   a floor-length cone with two leather boxes lying on the flagstones under it.
   Shading is now smooth, counts are up, and every figure has a thigh, a shin,
   an ankle and a shaped foot, with the hem stopped above it so the walk is
   visible. Limbs are built inside hip and shoulder pivots and swung by
   `animateWalk`, with **cadence taken from distance travelled rather than from
   the clock** — which is what keeps a foot planted and stops the walk-on-the-
   spot when a figure pauses.
4. **Scenery floated.** The torture chamber's pulley hung in mid-air; its two
   iron rods stopped half a metre short of the vault *and* half a metre above
   the floor, with the manacle rings threaded onto them. Rather than nudge them,
   `auditFloatingProps` now walks the scene at boot and reports anything that
   does not reach the floor, reach the vault, meet masonry, or rest on something
   that does. It found the rest, and the walkthrough asserts a clean boot.
5. **The hidden stair could not be climbed.** The treads were eight boxes drawn
   on a flat floor. `Stair` and `Landing` are now plan entities: the renderer
   builds the treads from them and the player's eye rides `groundHeightAt`, so
   the step seen is the step stood on. The doorway was also moved off the middle
   of the flight, where it had stepped the player a metre into the air.
6. **The press stood across its own doorway**, leaving 0.50 of gap where the
   player is 0.56 across — so the wardrobe room, a room about a disguise, could
   only be entered the long way round through the vault. Moved to the south
   wall, and every opening is now measured at its narrowest by the suite.
7. **The cells were rooms.** Two 5×5 chambers with solid doors, each larger than
   the tribunal's dais. They are now three small cells off one gaoler's
   corridor, reached down a four-metre bore through the rock, and fronted with
   **iron screens rather than masonry**: a new plan entity that is solid to the
   body and transparent to sight and sound, so a prisoner is visible and audible
   from the corridor and cannot leave. Lamps are in the corridor only, so the
   light inside a cell is barred light.
8. **Bendetta's wall was a hung picture** — an opaque panel in a chestnut frame.
   It is now painted with a transparent ground so the masonry shows through
   everywhere the pigment does not reach, drawn in soot and ochre with strokes
   that waver and do not close, scraped away in the middle as the text has it,
   and cut into the stone below with real scratch relief. The frame is gone.

Also found and fixed while working: the masked official existed twice, once as a
static figure and once as the patrol that walks his post, so the same man stood
in two places at once; and the wardrobe's hanging habits were three calls to
`makePerson`, which was survivable while a robed figure was a cone and became
grotesque the moment robed figures acquired faces and legs.

### Verification

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean in `app/` and `preview/`; the 3 pre-existing `db/`+`worker/` errors are unchanged |
| `pnpm lint` | clean |
| `pnpm test` | 26/26 pass (was 18/18) |
| `node tests/walkthrough.mjs` | see below |
| Visual review | screenshots of the cell range, Bendetta's wall, the moon stair, the wardrobe, the tribunal and the outer office |

**Verified by execution:** every round is unobstructed by masonry *and* props at
the figure's girth; two minutes of simulation never puts a figure in a wall;
every authored line is reached by its round; a figure accrues no stride distance
while standing; voices carry through iron and not through stone; the moon stair
rises monotonically and its doorway opens on level floor; every opening is
passable at its narrowest; the scene boots with nothing floating and nothing
unbacked.

**Not verified by execution:** that the walk *looks* right. Stride length,
cadence and swing amplitude are judged from stills, and headless software WebGL
runs this scene at about 1fps, so no scripted check watches a figure walk. The
same limits as Stage A apply to mouse-look feel, audio mix, and touch.

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

### B1. Five of the eight reported defects belong to later stages

Layout, lighting, environmental storytelling and the cell range are Stages D and
F. Items 4 through 8 above are all of that kind, and Stage B was to be the NPC
core only.

They are done here because they were reported from play and because deferring
them would have made Stage B unverifiable in the places it matters most: the
gaoler's round is the round past the cells, and there was no point authoring it
against a cell block that was about to be replanned. The conservative element is
that each is the narrowest change that answers the report — the layout revision
is confined to the cell range and the stair chamber, and the loops, service
circulation and compression-release work of Stage D is untouched.

### B2. The shipped-grid fixture was retired

Stage A pinned the derived grid against the grid the game originally shipped,
with the ten differing cells enumerated. That comparison stopped being
meaningful once the cell range was deliberately replanned: keeping it would have
meant asserting that the layout must stay as it was. It is replaced by
`tests/fixtures/plan-grid.txt`, a snapshot of the current derived grid,
regenerated deliberately whenever the plan is revised. Drift is still caught;
the baseline is now the plan rather than the first release.

### B3. Character shading was changed from flat to smooth

The flat-shading path was argued for at length in the source: one normal per
triangle, on the grounds that faceting reads as carved. It does not read as
carved on a body assembled from tapered prisms, and the figures were reported as
robots. The lighting model is otherwise untouched — same wrapped Lambert, same
flat fill, same absence of any specular lobe — so this is a change of normal
only, from per-facet to interpolated.

### B4. Earshot was shortened after tuning

Set at 7.5 metres on the reasoning that too short is worse than too long. In
play that carried the outer office's lines into the wardrobe room through an
open door, which reads as a voice following the player rather than as
overhearing. Reduced to 5.6.

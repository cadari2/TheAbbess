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

## Stage C (brought forward) — access, layout, light, and eleven more reports

A second round of play produced eleven reports across three messages. Six are
defects; five are changes, one of which was posed as a question. They are done
as one unit because they are one unit: the map had to grow to hold a Chamber of
Groans four times its old size and a gaol with six cells in it, and growing the
map is also the answer to the sightline question.

### The modules

| Module | What it is |
| --- | --- |
| `app/world/doors.ts` | Doors as entities with a state, a leaf, and an arc. Given the player; the NPC simulation still is not. |
| `app/world/figure.ts` | The body's measurements — hip, knee, ankle, robe, swing — with no dependency on Three, so the suite can do the arithmetic the renderer cannot do on itself. |

### The defects

**Legs through skirts.** The robe was a 0.72m cone from the hips down to 0.20,
0.262 wide at the hem, over legs swinging 0.52 radians about a hip at 0.82. At
the knee that puts the leg's surface 0.253 from the axis where the cloth is
0.224; below the knee the shin is outside the garment for the whole of the lower
swing. Cloth is not simulated here and cannot be, so the fix is to choose
geometry that makes the penetration impossible: hem out to 0.30, garment
shortened to 0.58 so it ends at 0.34, swing reduced to 0.40. `legEscapesRobe`
re-derives the containment from the constants and the suite asserts it, so a
later change to any one of the four fails a test instead of putting a knee
through a cassock again.

**Feet skating.** Found while fixing the above rather than reported. Cadence is
driven from distance travelled — correctly — but against a stride cycle of
0.82m that was chosen by hand, where the geometry gives 4·0.82·sin(swing) =
1.28m. Every figure's feet slid forward at the difference. `STRIDE_CYCLE` is now
derived from the swing and the leg length, and asserted against them.

**Papers off the table.** They sat at x 15.95 on a table whose west edge was
15.975, so over half of each sheet hung out over the void, and 21mm above a
surface they were resting on. Both faults came of eye-positioning from one
viewpoint. They are now placed from the table's own width, depth and top height.

**A floating chair.** The Inquisitor-General's high chair stood on a dais whose
south edge was at z 10.90 with the chair's back legs at 11.02 — two corners
resting on nothing. The dais is now sized so all four legs stand on it.

**A floating rack.** The largest object in the Chamber of Groans had no legs at
all: a frame of timber at a height of 0.40 with nothing whatever underneath.
Given four.

**A floating crucifix.** Not reported, found by tightening the audit: it stood
0.58 above the flagstones on the tribunal's north wall. It now stands on the
tribunal table, which is where a crucifix in a tribunal belongs anyway — between
the bench and the accused, at the height of a seated man's face.

**Sticks floating off the wall.** The nail-scratches below Bendetta's wall were
12mm rods centred 27mm clear of the masonry: nine dowels hanging in the air
beside the mural. A scratch is not an object near a wall, it is a disturbance of
one, so each now straddles the wall face — mostly buried, a few millimetres
proud — and cannot come away from it however the mural later moves.

**A barrel in the wall.** At x 3.25 with a radius of 0.42 it reached to 2.83,
and the gate hall's floor began at 3.0.

**Rough beds.** The pallet was a slab with fifteen 1.68m rods laid across it,
ends projecting past the slab into the air on both sides, and a canvas box for a
pillow: a bundle of dowels, not a bed. It is now a boarded frame with a sagging
sack in it, short stalks scattered inside the frame's own footprint, and a rolled
cloak at the head.

**The audit that let four of these through.** `auditFloatingProps` counted a
piece as supported if any masonry cell fell within 0.12 of its bounding box,
which meant anything standing *near* a wall was exempt — including a crucifix
hovering six centimetres off one. The margin is gone; masonry now supports a
piece only where the piece actually reaches it.

Removing the margin immediately flagged twelve wall-fixed decorations, correctly:
anything hung on masonry sits a centimetre or two proud of it to keep its faces
out of the wall's own, so it can never satisfy a "does it reach the floor or the
stone" test. The two audits now divide the work explicitly. `hang()` declares a
piece wall-fixed and exempts it from the floating audit, and `checkWallBacking`
— which already existed — asks the question that actually matters about a hung
piece, which is whether there is any masonry behind it at all. What must not
happen is a piece being neither, and that is exactly what the crucifix was: the
old margin excused it as wall-fixed and nothing had ever declared it hung.

### The changes

**Doors that yield.** The cell gates were built hung permanently open at a fixed
-1.15 radians. That said the thing the premise wants said — nothing here is
locked against her — but said it as scenery, once. They are now shut: shut in
the plan, shut in the collision model, shut on screen, and a player who walks at
one walks into iron until they are close enough, at which point it swings. No
prompt and no keypress, because a premise stated by an interaction is a premise
the player has to agree to perform, and a premise stated by a door already
moving when they reach it is something that happens to them.

The approach door is the exception that fixes the meaning of the rule:
`yieldsWithin: null`, and it never opens however long she stands at it. The
building is not indifferent to her because nothing is locked. It is indifferent
because she is not who it is locked against.

**The tribunal, turned.** The room is fifteen metres east to west and nine north
to south; the five-metre table lay across the *short* axis with the whole bench
queued down one flank of it, each judge's elbow a metre from the west wall and
the room's entire width empty behind them. The table now lies along the room's
long axis with the bench in one row facing the accused, the General raised at its
centre, the secretary at his own desk off the east end, and the accused standing
in open floor with nothing to either side.

**A way in.** The game used to begin inside itself: the player spawned in the
gate hall with no account of how they got there, in a room whose every wall led
further in. There is now six metres of bore with one guttering light in it and a
shut door behind, and the gate hall is three times its old floor.

**The Chamber of Groans, four times over.** 5×5 to 10×10, with four piers
carrying the vault. The size and the darkness are one decision: a hall this big
lit as the old one was would simply be a bigger lit room, and what the name
promises is that the far end is somewhere you have to go to find out about.

**Six cells, and light that is not the institution's.** Three cells is a set of
rooms that happen to hold people; what a gaol has that rooms do not is
repetition. Twenty-four metres of corridor, six identical iron fronts, five lamps
between them. Three of the six have a grate to the hillside at 3.1m in a 4.2m
room — high enough to be no use, which is the point of a window in a cell — and
what comes through it is the wrong colour for everything else in the building.

**Light only from things in the building.** What was here before: an AmbientLight
at 1.15, a HemisphereLight at 1 — a *sky* term, forty feet underground — and a
4.6-intensity point light parented to the camera, following the player
everywhere. Between them they supplied most of the illumination, which is why no
room was ever dark and why the lamps read as decoration rather than as the reason
anything was visible. The head lamp was the worst of the three: the cloaked
stranger carries no light, so a lantern tracking her was the renderer
contradicting the fiction in every frame. All three are gone. What remains is a
very low cold floor — the least that keeps unlit stone legible as stone rather
than as a hole in the screen — and then torches, candles, the grates and the
moon. Lamp intensity is up by half and lamp reach is down by a third, so a torch
makes a pool with an edge instead of raising the room evenly.

### Sightlines, and the labyrinth question

Measured rather than judged: the longest clear straight run in the old plan was
29 cells along row 8 — the tribunal's west door, the tribunal, the bore, the
corridor and the inside of Maddalena's cell, five compartments on one line, in a
building whose entire argument is compartmented secrecy.

Four changes, each of which is the same move: never let two doorways share a
rank.

- The bore to the cells is **bent**. It goes east, turns south for four metres,
  then east again into the gaol. Nothing along it sees anything else along it.
- The gate–office doorway moved off the high-lamp passage's column, which had
  been showing a visitor 22 metres of the building's spine before they had taken
  a step into it.
- The office–wardrobe and wardrobe–vault doorways were level with each other,
  opening one line through the three rooms whose whole point is that each is a
  secret kept from the last. Dropped a row apart.
- The vault–groans doorway moved a row off the wardrobe–vault doorway.
- The eastern range stops a column short of the corridor, so the two meet at a
  doorway instead of merging into one 19-metre room with a kink in it.

Longest run now: 20 cells, and every run over 15 lies inside a single room. The
suite asserts it, with the gaoler's corridor exempted by name — its length is the
one place where seeing all six identical fronts at once is the effect wanted.

### Verification

| What | Result |
| --- | --- |
| `node --test tests/world-model.test.mjs` | 28 pass (was 23) |
| `tests/walkthrough.mjs` | see run log |
| `npx tsc --noEmit` | clean in `app/`; `db/` and `worker/` unchanged pre-existing |
| Reachability | every room, and every discovery, reachable from the new spawn |
| Routes | all seven rounds clear of masonry and props at the figure's own girth |

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

### C1. The map was replanned, which was posed as a question

"How would you rearrange the map layout" invites a proposal, and a full replan
on my own authority would answer a question with a fait accompli. What is done
here is the narrow version: the five doorway offsets and the bent passage above,
which are the specific fix for the specific measured fault, plus the room
enlargements that were asked for outright. The building's *topology* is
unchanged — same rooms, same connections, same order of discovery. A labyrinth
proper wants loops, dead ends, and more than one way between two places, and
that is a larger change to make deliberately rather than in passing.

### C2. Stage C was brought forward, and Stages D and F further raided

Doors are Stage C and were planned next, so that much is in order. The layout
work, the lighting model and the cell range are Stages D and F. The reasoning is
the same as B1 and so is the mitigation: each change is the narrowest one that
answers a report, and the loops-and-circulation work of Stage D is untouched.

### C3. Two cells stand empty on purpose

Six cells, four occupied. The empty two are not unfinished: a gaol in which every
cell has a named prisoner in it is a cast list, and the point of the repetition
is that most of the slots are just slots. One of them carries a tally of ninety
days cut by somebody who is no longer in it.

# The Holy Office

A first-person gothic exploration of the prison described in the final chapters
of W. H. Ireland's *The Abbess*, Volume II. You inhabit the unnamed cloaked guide
who led Duca Bertocci to freedom: officials recognize the habit rather than the
person beneath it while patrols circulate and speak around you. Ten layered
places connect the gate, offices, tribunal, cells and concealed escape route.

Built with React and [three.js](https://threejs.org/) on
[vinext](https://github.com/cloudflare/vinext).

The building is a circuit: gate, office, the passage of high lamps and its
angles, the anteroom, the tribunal, the bent passage, six cells off the gaoler's
corridor, the lower passage, the Chamber of Groans, the password vault, the
wardrobe. Off the chamber, the hidden stair climbs to a locked door. The key
hangs at the masked watcher's post; taken, it opens the door on a lane and a
walled garden under the moon.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
```

There is no standalone `index.html` in this project. It renders through Node.js.
After `npm run dev`, open the local URL printed in the terminal (normally
`http://localhost:3000`).

## Rendering

Shared layout, room, discovery and patrol data lives in `app/world-data.ts`.
`app/three-world.ts` builds and animates the scene; `app/InquisitionGame.tsx`
owns movement, collision, overheard dialogue, the survey, journal and HUD, and
drives `DungeonRenderer` once per frame. `docs/textual-evidence.md` records what
comes from the romance and what the adaptation invents.

The look targets an early-2000s console RPG: low polygon counts, hand-painted
texture sheets, and a substantial flat ambient term so surfaces away from a lamp
still show their texture. A few rules keep it coherent.

- **Characters are single volumes, not stacks of decals.** Faces are a curved
  shell welded to the skull and unwrapped onto a portrait sheet (`makeHead` /
  `projectFaceUv`); garments are mapped onto the body geometry itself
  (`addGarmentVolume`). Nothing is a flat card floating in front of a mesh.
- **Collar, neck and head chain off the top of the torso**, so no pose can open
  a gap of bare background under a chin.
- **Metal stays dark and rough.** A thin vertical bar turns a fully
  light-facing sliver toward a lamp along its whole length; with a bright albedo
  it clips to a white stripe.
- **Tiled world textures use maximum anisotropy.** These corridors are narrow
  enough that walls are routinely seen at grazing angles, where a low setting
  collapses the tiling into a blank bright band.
- **Wall blocks span whole grid cells.** A room's inner wall face is at the
  cell boundary, not its centre — decoration placed half a metre short of that
  disappears inside the masonry.
- **The ceiling is laid a cell at a time**, and not at all over a room the plan
  marks `openAir`. The lane and the garden have sky; everything else has vault.
- **The moon is a spot light with shadows.** Through a cell's grating it stands
  outside the wall at the slope the window admits — a metre-thick wall passes
  nothing steeper than its opening's height allows — and what it throws on the
  floor is the bars. Shadow maps refresh on alternate frames, starting with the
  first.

### Inspecting the world

`preview/` is a development-only harness that loads the same
`app/three-world.ts` without the React app, HUD or pointer lock:

```bash
npx vite --config preview/vite.config.mts
```

- `/` renders the dungeon. The URL hash is the camera pose, `#x,z,yaw,pitch`,
  so `#38.3,9.4,0,0.16` looks through the bars into Maddalena's cell and
  `#52,24,-1.5708,0` stands in the garden.
- `/lab.html` lines every character up on a neutral lit turntable. Call
  `setView(orbit, distance, height)` and `focus(index)` from the console.

Both pages expose `probe(yawOffset, pitch)` and `near(x, y, z, radius)` in the
console, for identifying exactly which mesh and material produced a given pixel.

## cPanel / Passenger

This project can run on a cPanel account only if the host provides Node.js and
Passenger/Application Manager. Use Node.js 22 or newer, because that is the
version required by the project.

1. Upload and extract the project outside `public_html`, for example
   `/home/USERNAME/holy-office`.
2. Open cPanel → **Software → Application Manager** (or **Setup Node.js App**
   on CloudLinux).
3. Create an application using Node.js 22+, set the application root to the
   extracted folder, and set the startup file to `cpanel-app.js`.
4. Open cPanel Terminal in that folder and run:

   ```bash
   npm install
   npm run build
   ```

5. Return to Application Manager and enable/install dependencies, then restart
   the application. Point the domain or subdomain at the Node application.

Do not upload only `public/`, and do not try to open `app/page.tsx` directly.
The `cpanel-app.js` adapter serves the generated `dist/` files through
Passenger. If Application Manager is missing, ask the hosting provider to
enable Node.js 22 and Passenger; ordinary shared Apache-only hosting cannot run
this package as-is.

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

# HH Goa 2026 — Tide Pass

A builder ID generator for Hacker House Goa 2026. Drop a photo, fill four
fields, get a branded pass — download it or share it to X. No login, no crop
tool, no waiting.

The card is **lenticular**: tilt left for sunrise, right for blacklight. The
blacklight face carries a line of text that exists nowhere else, so the only way
to read your own secret is to tilt the card.

> **Live:** _pending deploy — see [Deploying](#deploying)_
> **Format:** B (Builder ID Card) · **Tag:** `#FrameInGoa`

---

## Try it in 30 seconds

1. Open the link on a **phone** — that's where it's meant to be seen.
2. Drop any photo. Portrait, landscape, off-centre, HEIC straight off an iPhone.
3. Type a name. Everything else has a sensible default.
4. **Tilt the phone.** Left is dawn, right is after dark.
5. `DOWNLOAD` writes a real PNG. `SHARE TO X` opens a pre-filled tweet whose
   link preview is the card itself.

On desktop, move the cursor across the card instead of tilting.

## How it meets the brief

| Requirement | Where it lands |
|---|---|
| Photo upload, jpg/png/**HEIC** | Native decode first, wasm decoder lazily for browsers that can't |
| Handles real photos | EXIF rotation + subject-aware crop, so off-centre faces stay in frame |
| Name + a couple of fun fields | Name, X handle, **role**, **stack** |
| Generated title | **Builder class** — deterministic from what you typed, printed on the card |
| Near-instant generation | Canvas, entirely client-side; no server round-trip to see your card |
| Real downloadable file | PNG via `toBlob` → `a[download]`, no screenshot, no right-click-save |
| Share to X, caption pre-filled | X web intent + `#FrameInGoa` |
| OG preview shows the graphic | `/id/[slug]` serves `og:image` + `twitter:card: summary_large_image` |
| No login wall | There is no auth anywhere in the codebase |
| Mobile-friendly | Built phone-first; regression-tested on Pixel 7 and iPhone 13 viewports |
| On-brand | Card is built on the actual illustrated designs, not an approximation |

## What's on the card

Typed by you: **name**, **role**, **stack**, **X handle**.

Derived from those, by hash: **builder class** (e.g. `ANJUNA NIGHT-COMPILER`, one
of 900 combinations), the **pass number**, and the **blacklight secret**.

Same inputs always mint the same card. That's deliberate — the pass has to
survive a reload, and two people comparing screenshots should see a stable
identity rather than a slot machine. `REROLL` bumps a salt if you want a
different draw.

---

## How it fits together

**Canvas is the only renderer.** `src/lib/card/draw.ts` draws all three layers;
the tilt UI composites those same canvases, and the download exports from them.
There is no second implementation of the art, so the card you tilt and the image
you post cannot drift apart.

| Path | What it does |
|---|---|
| `src/lib/card/draw.ts` | The card — one skeleton, three printings |
| `src/lib/card/layout.ts` | Every coordinate, measured off the designs rather than eyeballed |
| `src/lib/card/scene.ts` | 16:9 share composition (X crops portrait in-timeline) |
| `src/lib/card/assets.ts` | Loads the three plates + the गोवा badge |
| `src/lib/builder.ts` | Deterministic builder class, pass no., seat, secret |
| `src/hooks/useTilt.ts` | Tilt input → two normalised axes |
| `src/components/TidePass.module.css` | The lenticular optics |
| `src/lib/photo.ts` | HEIC, EXIF rotation, subject-aware cropping |
| `src/lib/store.ts` | Vercel Blob, falling back to the local filesystem |

### The plates

The three faces started as three independently produced illustrations, so
nothing about them lined up — photo windows differed by up to 26px of offset and
10% of scale, and so did the cards' own printed edges.

`scripts/plates.ts` normalises them. The key decision: they're registered on the
**card's border**, not on the photo window. A scale-and-translate has exactly
enough freedom to pin one rectangle across all three, so you get to choose which
one — and the border is what the eye tracks. Anchoring the window instead (the
first attempt) left the card visibly resizing mid-tilt while the photo sat
perfectly still, which is the more distracting of the two failures by a wide
margin. The cost is that each layer prints its window slightly differently, so
the photo shifts a few pixels behind a frame that no longer moves.

### The lenticular effect

A real lenticular card interlaces two images into vertical strips behind a lens
array. That's reproduced literally: the hidden layers carry a striped mask whose
**duty cycle** is driven by the tilt, so they sweep across in strips instead of
crossfading. Only one hidden layer shows at a time, so both masks share a phase
and interlace against the day layer rather than against each other.

Tilt values are published as CSS custom properties from inside a rAF loop and
never enter React state — a `setState` per frame would re-render the studio at
60fps. Everything animated is transform / opacity / mask geometry, so the
compositor handles it without repainting the canvases.

Input is cursor on desktop, `DeviceOrientation` on mobile (iOS needs an explicit
tap — that's the `ENABLE TILT` button), drag as a fallback, and a slider under
`prefers-reduced-motion` so the secret is always reachable. There's also a
hands-free playback button for anyone who just wants to watch it happen.

### Photos

`createImageBitmap(file, { imageOrientation: "from-image" })` applies EXIF
rotation, which is what stops portrait iPhone shots landing sideways. HEIC tries
native decode first (Safari can) and lazily pulls in a wasm decoder otherwise, so
the ~1.5MB only loads for people who actually need it.

For framing: Chrome's native `FaceDetector` when present, otherwise a saliency
pass that scores edge energy plus skin-likeness on a 128px thumbnail and crops to
that centroid. A plain centre crop shoves off-centre subjects against the edge —
the exact case the brief warns about.

### Sharing

`POST /api/publish` stores the rendered PNG and returns a slug. `/id/[slug]`
carries `og:image` and `twitter:card: summary_large_image`, so the link preview
is the real graphic rather than a default thumbnail.

Photos only leave the device on an explicit share — **download is entirely
local**, no network round-trip.

---

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

To exercise tilt on a real phone you need HTTPS (`DeviceOrientation` is
secure-context only):

```bash
npm run dev:https          # or tunnel: cloudflared tunnel --url http://localhost:3000
```

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 ·
TypeScript. Fonts are Bodoni Moda (display) and Roboto Mono, self-hosted.

## Deploying

Runs on Vercel as-is. For persistent storage, create a Blob store and set:

```
BLOB_READ_WRITE_TOKEN=...
```

Without that token the app falls back to writing under `.blob-store/` on the
local filesystem, which is fine for development but **will not persist on
serverless** — set the token before sharing links publicly.

```bash
npx vercel login          # interactive, has to be run by a human
npx vercel --prod
```

## Dev scripts

Run with [Bun](https://bun.sh). The browser-driving ones need `npm run dev`
going in another shell.

```bash
npm run check:mobile                # 15 pixel assertions on Pixel 7 + iPhone 13
bun run scripts/preview.ts          # render layers + share scene to .preview/
bun run scripts/shoot.ts            # screenshot the studio at five tilt angles
bun run scripts/flow.ts photo.jpg   # upload → download, checks the PNG decodes
bun run scripts/share.ts photo.jpg  # publish → verify OG tags resolve
```

Asset pipeline — only needed if the designs change:

```bash
bun run scripts/plates.ts           # normalise raw designs onto the card border
bun run scripts/measure.ts          # recover text positions from the originals
bun run scripts/fit.ts              # assert the three borders actually agree
bun run scripts/crop.ts x y w h     # cut the same region from all three, to eyeball
bun run scripts/badge.ts            # extract the गोवा badge as a separate layer
```

### Why the tests read pixels

`mobile.ts` and `flow.ts` assert on decoded image data, not on the DOM. Both
exist because of bugs that screenshots couldn't catch:

- The studio looked correct in every screenshot while the card rendered
  **completely blank** on a real phone — a screenshot of a green card on a green
  page looks like a green card.
- Two separate bugs put **transparency** into the export (`destination-out` cuts
  through the card background, not just the shape it's masking), and transparent
  regions render as white bars on X. `flow.ts` asserts zero transparent pixels.

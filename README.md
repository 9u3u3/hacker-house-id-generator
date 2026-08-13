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
| Share to X, caption pre-filled | X web intent + `#FrameInGoa`, opened on the click so popup blockers don't eat it |
| **Teammates in one combined frame** | **CREW mode — 2–3 people, one landscape pass, shared through the same link** |
| OG preview shows the graphic | `/id/[slug]` serves `og:image` + `twitter:card: summary_large_image` |
| No login wall | There is no auth anywhere in the codebase |
| Mobile-friendly | Built phone-first; regression-tested on Pixel 7 and iPhone 13 viewports |
| On-brand | Card is built on the actual illustrated designs, not an approximation |

## What's on the card

Typed by you: **name**, **role**, **stack**, **X handle**.

Derived from those, by hash: **builder class** (e.g. `ANJUNA NIGHT-COMPILER`, one
of 900 combinations), the **rarity tier**, the **pass number**, and the
**blacklight secret**.

Same inputs always mint the same card. That's deliberate — the pass has to
survive a reload, and two people comparing screenshots should see a stable
identity rather than a slot machine. `REROLL` bumps a salt if you want a
different draw.

### Rarity

Every draw buckets into **COMMON / RARE / MYTHIC** — 78 / 18 / 4 — from its own
labelled hash, not the one that picks the class. Sharing a draw would have tied
a tier to a class permanently, so `ANJUNA SHIPPER` would be MYTHIC for everyone
who ever rolled it and the rest would be unreachable.

Rare pulls get a foil: a raking sheen and a coloured keyline, composited over the
finished card the way a laminate sits over a print. COMMON gets nothing at all,
because a treatment every card has is just a filter.

## CREW mode

The event's own task brief asks you to *"use that same generator to bring your
teammates into one combined frame"* — so `SOLO` / `CREW` switches the same
pipeline to a combined pass for 2–3 people. Each member keeps the builder class
and tier their own name mints; the crew gets one team name and one serial.

It's landscape and already 16:9, unlike the portrait solo card. The plates print
a single photo window 333×499, which does not divide between three people
without banding faces into letterbox strips — and a card that's already 16:9
needs no compositing step to be postable. Tiles are cut at the same aspect the
solo window uses, so crew photos go through the identical subject-aware crop.

The lenticular tilt stays on the solo pass. Switching to CREW carries your photo
and name across as the first member.

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

### The animated reveal

The tilt is the product, and the thing that gets posted was a static PNG — so the
best part of the card was invisible in the artifact being scored. `▶ RECORD THE
REVEAL` captures a 5s loop of the sweep as MP4 (WebM where MP4 recording isn't
available), which autoplays in the timeline.

The obstacle was that the interlace lived in CSS while every export path is
canvas, and `MediaRecorder` can only capture a canvas or a stream, never a DOM
element. So `src/lib/card/sweep.ts` ports the mask maths rather than
approximating it with a crossfade: same 3px pitch, same duty cycle, same
`max(0,v)^1.7` ramp, same `-sin(2πt)` path. That file is the one place those
numbers are duplicated from the stylesheet and `useTilt`.

The three plates and the static chrome are rendered once and each frame just
composites them — drawing the card three times per frame doesn't hold 30fps.
Recording runs in real time, because `MediaRecorder` timestamps from the wall
clock and rendering faster produces a file whose duration doesn't match its
content.

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

The tab is claimed **synchronously on the click** and redirected once the slug
resolves. Browsers only honour `window.open` while the click's user activation is
live, and rendering plus uploading first spends it — which is why the button used
to do nothing at all on Safari and Chrome-Android. The composed intent is also
always on screen as a real link, with copy buttons, for anything that blocks the
tab regardless. On phones, `navigator.share` attaches the actual PNG rather than
waiting on a crawler to resolve the OG tag.

If publishing fails the flow still opens the composer pointed at the generator,
and the error reports the real status code — a 502 (no blob store on the deploy)
and a 429 (rate limited) need different answers.

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
local filesystem. That is fine in development, but a serverless filesystem is
**read-only** — the write throws and `/api/publish` answers `502 storage
unavailable`, so every published link 502s and the share preview never resolves.
**Check the token is set before trusting the deploy:**

```bash
npx vercel login          # interactive, has to be run by a human
npx vercel env ls         # BLOB_READ_WRITE_TOKEN must be listed
npx vercel --prod
```

Sharing degrades rather than dead-ends if it isn't — the composer still opens on
the generator link — but the card won't be in the preview, which is the whole
point of publishing.

## Dev scripts

Run with [Bun](https://bun.sh). The browser-driving ones need `npm run dev`
going in another shell.

```bash
npm run check:mobile                # 15 pixel assertions on Pixel 7 + iPhone 13
bun run scripts/preview.ts          # render layers + share scene to .preview/
bun run scripts/shoot.ts            # screenshot the studio at five tilt angles
bun run scripts/flow.ts photo.jpg   # upload → download, checks the PNG decodes
bun run scripts/share.ts photo.jpg  # publish → verify OG tags resolve
bun run scripts/crew.ts photo.jpg   # CREW roster → download, same pixel assertions
bun run scripts/intent.ts photo.jpg # SHARE TO X opens on the click, and degrades
bun run scripts/reveal.ts photo.jpg # records the animated reveal, checks it moves
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
  regions render as white bars on X. `flow.ts` and `crew.ts` assert zero
  transparent pixels.
- `intent.ts` exists for the same reason in a different medium: **SHARE TO X
  looked completely fine and did nothing**, because `window.open` fired after
  the click's user activation had already been spent. Nothing you can see in a
  screenshot, so it asserts the tab starts at `about:blank` and is redirected
  afterwards.

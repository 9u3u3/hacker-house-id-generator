# HH Goa 2026 — Tide Pass

A builder ID generator for Hacker House Goa 2026. Drop a photo, get a branded
pass, download it or share it to X.

The card is lenticular: **tilt left for sunrise, right for blacklight.** Only the
flat day face is ever exported, so the tweet shows a clean card and the hidden
faces stay on the site.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## How it fits together

**Canvas is the only renderer.** `src/lib/card/draw.ts` draws all three layers;
the tilt UI composites those same canvases and the download exports from them.
There is no second implementation of the art, so the card you tilt and the image
you post cannot drift apart.

| Path | What it does |
|---|---|
| `src/lib/card/draw.ts` | The card itself — one skeleton, three sets of inks |
| `src/lib/card/scene.ts` | 16:9 share composition (X crops portrait in-timeline) |
| `src/lib/card/artifacts.ts` | Cartoon beach clutter, picked per pass |
| `src/lib/builder.ts` | Deterministic builder class, seat, serial, secret |
| `src/hooks/useTilt.ts` | Tilt input → two normalised axes |
| `src/components/TidePass.module.css` | The lenticular optics |
| `src/lib/photo.ts` | HEIC, EXIF rotation, subject-aware cropping |

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
tap, which is the "ENABLE TILT" button), drag as a fallback, and a slider under
`prefers-reduced-motion` so the secret is always reachable.

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
is the real graphic rather than a default thumbnail. The X intent opens
pre-filled with `#FrameInGoa`.

Photos only leave the device on an explicit share — **download is entirely
local**, no network round-trip.

## Deploying

Runs on Vercel as-is. For persistent storage, create a Blob store and set:

```
BLOB_READ_WRITE_TOKEN=...
```

Without that token the app falls back to writing under `.blob-store/` on the
local filesystem, which is fine for development but **will not persist on
serverless** — set the token before sharing links publicly.

```bash
npx vercel --prod
```

## Dev scripts

These need `npm run dev` running in another shell.

```bash
bun run scripts/preview.ts          # render card layers + share scene to .preview/
bun run scripts/shoot.ts            # screenshot the studio at five tilt angles
bun run scripts/flow.ts photo.jpg   # upload → download, checks the PNG decodes
bun run scripts/share.ts photo.jpg  # publish → verify OG tags resolve
```

`flow.ts` also asserts the export has zero transparent pixels. Two separate bugs
put transparency into the card — `destination-out` used for artifact linework and
for the sun's bands cuts through the card background, not just the shape — and
transparent regions render as white bars on X.

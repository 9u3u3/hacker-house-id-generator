# HH Goa 2026 — List of Fixes

The master list. Research, everything considered, what we committed to, what we
cut and why, and how the work splits between John and Sai.

**Per-person lists:** [`john_work.md`](./john_work.md) · [`sai_work.md`](./sai_work.md)

---

## Context

This repo (`9u3u3/hacker-house-id-generator`, live at
`hacker-house-id-generator.vercel.app`) is the team's submission for **HH Goa 2026
Open Trial Task #1 — Frame / ID Card Generator**. Deadline **11:59pm, 13 Aug 2026**.

Per `HHGoa26_Selection_Criteria.pdf`, selection is per-team but *every member
submits their own work* and a team passes only if all members pass — so this is a
substantive contribution on top of the existing "Tide Pass" build, not a rewrite.

Three things forced this work: the studio page sits on a flat green void with no
HH Goa artwork, the ticker repeats `#FrameInGoa` to the point of noise, and
**Share to X is broken**. Research into hhgoa.com then turned up a fourth, bigger
problem — see Findings.

---

## Research findings (hhgoa.com, /radar, site CSS)

These changed the priorities and are worth reading before touching code.

**1. The website's task brief is stricter than the PDF.** hhgoa.com's "Build This
→ Task #1" panel says:

> "Design your own HH Goa 2026 themed photo frame generator. **Use that same
> generator to bring your teammates into one combined frame.** Post it on X with a
> quick how-to on generating your own #FrameInGoa post using your generator."

The combined/team frame appears **nowhere in the PDF**. The current app is
single-person only, so we are missing a stated requirement.

**2. Submissions are publicly ranked on a live leaderboard.** `hhgoa.com/radar`
lists **137 teams** with columns for X-post **Views** and **Score** (top = 100).
Reach on the X post is part of the ranking, so the share flow being broken is not
a polish bug — it's a scoring bug.

**3. Official brand assets are downloadable and we're approximating them.**
- Fonts (from their compiled CSS): **Imbue** (display) + **Victor Mono** (mono).
  We currently ship Bodoni Moda + Roboto Mono.
- Colors already match: `#0b6839` green, `#fee101` yellow, `#ff0080` pink,
  `#fffbe8` paper.
- Illustrations at `hhgoa.com/assets/`: **`hackers.png`** (five hackers at a long
  table with laptops, Goan house + palms — 1440×804), **`Sun rise.png`**
  (1440×1438 beach sunrise), **`footer trees.png`**, `goa_hindi.svg`,
  `Hacker house.png`, `2-47.svg`. Flat line-art, brand palette. `hackers.png` is
  literally the "hacker artwork" the background needs.
- Brand kit: `drive.google.com/file/d/11aAIBCdhngT0QWLPBNc2bJGLqXhghN3H/view`
- Socials: `x.com/247pmstudio`, `t.me/twofourtysevenpm`

**4. The homepage serves no OG tags at all.** `curl` on the live deploy returns
only `<meta name="description">` — no `og:image`, no `twitter:card`. The task
requires posting the *generator link* with a how-to, so that post currently
renders a blank preview. `src/app/layout.tsx:24` sets title/description only.

---

## VERY VERY IMPORTANT — must ship, no matter what

### V1. Hacker artwork background for the studio → **John**

The page is flat `bg-green` with the card floating in a void
(`src/components/Studio.tsx:140`). Build a layered background from the **official**
hhgoa.com illustrations so it reads as the event, not a green rectangle.

- Vendor `hackers.png`, `Sun rise.png`, `footer trees.png` into
  `public/scene/`, **converted to WebP/AVIF** — the raws are 2.0MB / 3.2MB /
  2.3MB and would wreck the "seconds from upload to output" requirement. Target
  <150KB each, two widths (mobile/desktop).
- New `src/components/Backdrop.tsx`: fixed, `-z-10`, `aria-hidden`.
  - Sunrise band anchored bottom, full-bleed.
  - `hackers.png` as the mid band behind the form column.
  - Footer trees along the bottom edge.
  - Green scrim (`--hh-green` at ~0.82) + vignette over the top so the card and
    form text keep contrast. Verify the card never loses legibility.
- Optional (cheap, high impact): a slow parallax tied to the **existing tilt
  signal** — `useTilt` already publishes normalised axes as CSS custom properties
  in a rAF loop (`src/hooks/useTilt.ts`), so the backdrop can read the same vars
  with zero new state and no re-renders. Respect `prefers-reduced-motion`.
- A faint terminal/scanline or code-rain texture layer is fine *on top of* the
  illustrations, but the illustrations are the source of "hacker", not a generic
  Matrix effect.

### V2. Rebuild the ticker with real Hacker House content → **John**

`Studio.tsx:300` is one string repeated six times:
`"LESS NOISE. MORE SIGNAL. · #FrameInGoa · 247 SEATS · "`. `#FrameInGoa` appears
~12× across the strip — that's the "too much Frame thing" the feedback flags.

Replace with a rotating set of real event facts scraped from hhgoa.com:

- `GOA, INDIA · 28–31 OCT 2026`
- `247 SEATS`
- `4 DAYS. ONE RHYTHM. EVERYTHING INTENTIONAL.`
- `DAY 01 — GENESIS DAY` / `DAY 02 — DAY OF TRIANGLE` /
  `DAY 03 — BUILD DAY · HEADS DOWN. SHIP OR SHIP` / `DAY 04 — LAUNCH DAY · THE WORLD WATCHES`
- `LESS NOISE. MORE SIGNAL.`
- `NO FLUFF. NO USELESS NETWORKING.`
- `THE OCEAN AT YOUR DOORSTEP`
- `2:47 PM STUDIO`
- `#FrameInGoa` — **once per cycle**, not every third token

Presentation: alternate yellow/pink/paper per token, separate with the `✳` glyph
already used on the card, and run a **second row scrolling the opposite way** with
the day-by-day agenda. Keep the existing CSS marquee animation and the duplicated
`<span>` seam trick.

### V3. Fix Share to X → **Sai**

Three distinct defects; fix all three.

**(a) Popup blocked — the likely user-visible failure.**
`Studio.tsx:96-135` awaits font loading, canvas render, and a `fetch` to
`/api/publish` *before* calling `window.open` at line 129. Browsers only honour
`window.open` inside the user-gesture task; after `await` the activation is gone,
so Safari and Chrome-Android silently swallow it and desktop Chrome often does
too. Fix: open the tab **synchronously on click**
(`const w = window.open("about:blank", "_blank")`), then set `w.location.href`
once the slug resolves; close it on failure.

**(b) No fallback when the popup is blocked anyway.** Always render the composed
intent URL as a real `<a target="_blank">` plus a **Copy link** and **Copy
caption** button, so the flow completes by hand. Today `shareUrl` renders only
after a *successful* publish (`Studio.tsx:270`).

**(c) Publish can 502 on Vercel — unconfirmed, must be checked first.**
`src/lib/store.ts:41` falls back to `writeFile` under `.blob-store/` when
`BLOB_READ_WRITE_TOKEN` is unset — serverless filesystems are read-only, so
`putImage` throws and `api/publish/route.ts:64` returns `502 storage unavailable`.
If the token is missing, the share flow has **never** worked in production and (a)
alone won't fix it.

Determine this first. In order:
1. `npx vercel env ls` against the linked project (needs an interactive
   `npx vercel login` first, run by a human).
2. If unavailable, deploy the branch as a Vercel **preview** and POST a real
   render at it, reading the status code — a preview keeps the production store
   clean while exercising the identical code path. The live production endpoint
   was deliberately not POSTed to during research.
3. If the token is absent: create a Blob store and set it, per README:151.

Regardless of the answer, degrade gracefully: on publish failure still open the
intent with the caption + generator URL so the user gets *a* tweet instead of a
dead button, and surface the real status code rather than today's generic
"couldn't publish — try again".

Add mobile-native sharing on top: `navigator.share({ files: [png] })` where
supported attaches the **actual image** to the post rather than relying on a link
preview — strictly better on phones, which is where most people will use this.

---

## Also in scope

### F1. CREW mode — a combined team pass → **Sai** — *the biggest gap*
Directly required by hhgoa.com's task text and entirely absent today. Let the user
add **2–3 people** (photo + name each) and render **one combined pass** from the
same canvas pipeline, sharable as a single image.

*On the wording:* hhgoa.com says "bring your teammates into one combined **frame**",
but it uses "frame" as a generic word for the generated graphic — the same panel
lists "Personalized: name, stack, a generated builder class", which is Format B
language, and the task itself is titled "Frame / ID Card Generator". We built
Format B (Builder ID Card), which the PDF explicitly sanctions, so this is a
**combined team ID card** — several people on one pass. It is *not* a PFP
frame/overlay, and Format A stays out of scope.

- Ship as a `SOLO` / `CREW` toggle so the existing single-card flow is untouched
  and cannot regress.
- Reuse `loadPhoto` / `computeCrop` (`src/lib/photo.ts`) once per slot — the
  subject-aware crop matters more here, since three photos of different aspect
  ratios have to sit side by side without one face landing off-centre.
- New layout entry in `src/lib/card/layout.ts` + a crew draw path in `draw.ts`,
  keeping the "canvas is the only renderer" rule so the tilt view and the export
  can't drift.
- `mint()` (`src/lib/builder.ts`) is per-person; the crew pass needs one shared
  header (team name) plus per-slot builder class. Extend `mint` rather than fork it.
- `/api/publish` + `/id/[slug]` already store an arbitrary PNG + a metadata
  record, so the crew image shares through the existing path — the `PassRecord`
  type in `src/lib/store.ts:18` needs an optional members array.

### F2. Homepage OG image → **John**
Static branded 1200×630 in `layout.tsx` metadata (`og:image`, `twitter:card:
summary_large_image`, `metadataBase`). Makes the required how-to post render a
real preview instead of a blank card. Direct effect on views.

### F3. Swap to the official fonts → **John**
Imbue + Victor Mono replace Bodoni Moda + Roboto Mono in `layout.tsx` and
`src/lib/card/fonts.ts`. Self-host both (as the current setup already does) so the
canvas renderer and the DOM agree. **Caution:** every coordinate in
`src/lib/card/layout.ts` was measured against the current faces, so the card text
must be re-checked after the swap — `bun run scripts/preview.ts` and
`scripts/measure.ts` exist for exactly this. If the card layout breaks badly,
apply the new fonts to the page chrome only and leave the card faces alone.

---

## Additional features (ranked by payoff)

Two scoring realities drive this ranking: the Radar ranks on **X-post views**, and
the judges' own bullets are *instantly recognizable identity · 1-click download +
share · works on any photo · personalized · seconds from upload to output*.

### A1. Animated reveal export — MP4/GIF of the tilt ★ highest payoff — *stretch*
The entire product gimmick is the lenticular tilt, and **the shared artifact is a
static PNG** — so the best thing about the card is invisible in the post that gets
scored. Export a 2–3s seamless loop sweeping sunrise → day → night.

- The motion path already exists and is cleanly parametric: `playSweep`
  (`src/hooks/useTilt.ts:341`) drives `x = -sin(2πt)` over 4600ms, so frames can be
  generated deterministically at fixed timesteps rather than captured in real time.
- **The catch, and it is the real cost:** the lenticular interlace lives in
  **CSS**, not canvas — `TidePass.module.css` does the striped mask and duty
  cycle, while the export path (`src/lib/card/scene.ts:191`) is pure canvas
  `toBlob`. `MediaRecorder` can only capture a canvas/stream, never a DOM element,
  so a true animated export means **porting the mask maths into canvas**. Budget
  half a day, not an hour.
- **Cheaper fallback:** a 3-frame flip (sunrise → day → night) crossfaded as
  WebM/GIF. No mask maths — it composes the three scenes `scene.ts` already
  renders. Less faithful, still animated, still stops the scroll.

### A2. Crop nudge — expose controls that already exist → **Sai** ★ cheapest real win
`computeCrop` already accepts `{ zoom, offsetX, offsetY }` (`src/lib/photo.ts:240`)
and **the UI never passes them** — `Studio.tsx:38` calls it with defaults only.
Dead capability. Add pinch/drag on the photo window plus a zoom slider, auto-crop
still the default. The brief says "don't assume users will crop first"; auto-crop
handles that, but when it guesses wrong the user is currently stuck with it.

### A3. Rarity tiers on the builder class → **Sai** ★ drives the reroll → post loop
`mint()` already derives a stable class from a hash (`src/lib/builder.ts:175`).
Bucket the draw into COMMON / RARE / MYTHIC by hash range, print the tier on the
card, and give rare pulls a foil/holo treatment. People reroll for a good one and
post the good one — precisely the metric being ranked.

Originally John's — reassigned to Sai since it touches the exact same files
(`builder.ts`, `draw.ts`) as CREW mode, and CREW restructures `mint()`'s shape
first regardless. Doing both on one branch avoids a cross-branch handoff.

### A7. Downscale guard for huge photos → **Sai**
A 48MP HEIC decoded at full size on a mid-range Android will OOM the tab —
`decodeImage` (`src/lib/photo.ts:88`) decodes at native resolution and the card
window is a few hundred px. Cap the long edge (~2000px) at decode. Costs nothing
visually and removes a crash that only shows up on the cheap phones most entrants
will be using.

### A8. Guard rails on `/api/publish` → **Sai**
The endpoint takes 8MB uploads from anyone with no rate limit
(`src/app/api/publish/route.ts:12`). One script fills the blob store and the share
flow dies mid-competition. Add a per-IP limit and reject non-PNG earlier.

### A9. First-paint speed → **John**
The three plates are ~700KB combined and gate the first card render
(`src/lib/card/assets.ts` loads them via `new Image()` with no preload). Preload in
the document head and decode off the main thread. "Seconds from upload to
shareable output" is an explicit criterion.

---

## Cut deliberately

So that everything committed reads as a meaningful commit rather than filler:

- **PFP frame output (Format A)** — we built Format B; out of scope.
- **A4 QR code on the card** — needs a two-pass render (publish, then redraw with
  the slug), entangling the draw path with the network path for a decorative gain.
- **A5 live card on `/id/[slug]`** — half a day, and it requires uploading the
  **photo** rather than just the flat render. That contradicts the current privacy
  posture ("download is entirely local", README:127) and isn't worth reversing
  under deadline.
- **A6 URL-encoded fields** — genuinely useful, but invisible to a judge.
- **Subject cutout** (head breaking out of the card) — striking, but in-browser
  segmentation is heavy and two days is not the time to find out.
- Caption/how-to helper, recently-minted gallery, "pick your printing" — filler.

---

## The split

All 14 commits in this repo are Harsh's; neither John nor Sai has touched the
code, so **the split is by file ownership to avoid merge conflicts**, not by
familiarity. Each track carries one of the mandatory fixes, so neither person is a
single point of failure for the must-ship work.

### Shared prep — one commit, before either track starts
This is what makes single ownership possible afterwards:

1. `npm install` (node_modules is absent), read the Next 16 guides under
   `node_modules/next/dist/docs/` per `AGENTS.md`.
2. **Extract `Marquee` out of `Studio.tsx:300`** into `src/components/Marquee.tsx`.
3. **Extract the share logic out of `Studio.tsx:96-135`** into `src/lib/share.ts`.
4. Mount `<Backdrop />` and `<Marquee />` in `Studio.tsx` as stubs.

After this commit `Studio.tsx` has one owner (Sai) and John never reopens it —
the point, since it is otherwise the collision hotspot for the ticker, the share
flow, and CREW mode all at once. It lands as the first commit on branch `john`;
Sai branches from that commit rather than from `main`.

### John — Identity & Surface (~9.5h) — done, all items shipped
| # | Item | Est |
|---|---|---|
| 1 | **V1 backdrop** (mandatory) | ~4h |
| 2 | **V2 ticker** (mandatory) | ~1.5h |
| 3 | F2 homepage OG image | ~1h |
| 4 | A9 first-paint speed | ~1h |
| 5 | F3 official fonts — **last**, it perturbs card metrics | ~2h |

**Owns:** `src/components/Backdrop.tsx` (new), `src/components/Marquee.tsx` (new),
`public/scene/*`, `public/fonts/*`, `src/app/globals.css`, `src/app/layout.tsx`,
`src/lib/card/fonts.ts`, `src/lib/card/assets.ts`.

`layout.tsx` is John's alone — fonts, OG metadata and asset preload all live
there, so one owner avoids three-way conflicts in one file.

### Sai — Flow & Reach (~14h)
| # | Item | Est |
|---|---|---|
| 1 | **V3 share to X**, incl. the blob-token check (mandatory) | ~3h |
| 2 | A7 downscale guard | ~1h |
| 3 | A8 publish guards | ~1h |
| 4 | A2 crop nudge | ~1.5h |
| 5 | F1 CREW mode — the headline feature | ~6h |
| 6 | A3 rarity tiers + foil — moved from John's list, see below | ~1.5h |
| 7 | A1 animated export — **stretch only** | ~4h |

**Owns:** `src/lib/share.ts` (new), `src/components/Studio.tsx`,
`src/lib/photo.ts`, `src/lib/store.ts`, `src/app/api/publish/route.ts`,
`src/app/api/blob/[key]/route.ts`, `src/app/id/[slug]/page.tsx`,
`src/lib/card/layout.ts`, `src/lib/card/scene.ts`, `src/lib/builder.ts`,
`src/lib/card/draw.ts`, `src/lib/card/foil.ts` (new).

**On A3, and why it moved:** `builder.ts`/`draw.ts` were originally going to be
shared — Sai for CREW's per-member minting and crew draw path, John for rarity's
tier derivation and foil treatment, with John rebasing on top once CREW landed.
That handoff added a wait-then-rebase step for no real benefit, since both
pieces of work sit in the same two files regardless. Simpler to give Sai full
ownership of both files and fold rarity into his list right after CREW — no
cross-branch coordination needed at all now. Do CREW first; rarity builds on
the shape it leaves `mint()` in.

---

## Verification

1. `npm install && npm run dev` — studio renders with the backdrop, card stays legible.
2. `npm run check:mobile` — the existing 15 pixel assertions on Pixel 7 + iPhone 13
   must still pass after the backdrop lands (they assert on decoded pixels, and a
   background change is exactly what could break them).
3. `bun run scripts/flow.ts photo.jpg` — upload → download, asserts the PNG decodes
   with zero transparent pixels.
4. `bun run scripts/share.ts photo.jpg` — publish → OG tags resolve.
5. **Share-to-X by hand**, the bug being fixed: desktop Chrome *and* a real phone.
   Confirm the X composer opens with caption + link, and that the link preview
   shows the card. Re-check `/` now previews too.
6. Lighthouse on mobile — the backdrop must not regress the "near-instant" bar.
7. Deploy a Vercel **preview** before merging; verify `BLOB_READ_WRITE_TOKEN` is
   present and publish returns 200, not 502.

# Sai's work — Flow & Reach

Track: the photo → render → publish → share pipeline.
Master list with full research: [`listOfFixes.md`](./listOfFixes.md)

Item 1 is **mandatory** and lands first. Item 6 (CREW mode) is the headline
feature of the whole branch. Item 7 (rarity tiers) was originally John's — it's
here now because it shares CREW's files, see the note there. Item 8 is stretch —
only if 1–7 are green.

---

## Why these items (the short version)

Two research findings drive this track:

- **hhgoa.com's task brief is stricter than the PDF we were given.** Their
  "Build This → Task #1" panel says: *"Design your own HH Goa 2026 themed photo
  frame generator. **Use that same generator to bring your teammates into one
  combined frame.** Post it on X with a quick how-to..."* The combined team frame
  appears **nowhere in the PDF**, and the app is single-person only. That's item 6.
- **Submissions are ranked publicly** at `hhgoa.com/radar` — 137 teams, with
  columns for X-post **Views** and **Score**. The share button being broken is a
  *scoring* bug, not a polish bug. That's item 1.

---

## Before starting

`node_modules` is **not installed**. Run `npm install` first, and read the Next 16
guides under `node_modules/next/dist/docs/` as `AGENTS.md` requires — this is not
the Next.js you remember.

**Branch from the first commit on `john`**, not from `main`. That commit does a
shared extraction which both tracks depend on:

- `Marquee` pulled out of `Studio.tsx:300` → `src/components/Marquee.tsx`
- the share logic pulled out of `Studio.tsx:96-135` → `src/lib/share.ts`

After it, **`Studio.tsx` is yours** — John never reopens it. It was otherwise the
collision point for the ticker, the share flow and CREW mode all at once.

---

## 1. V3 — Fix Share to X ★ MANDATORY

Three distinct defects. Fix all three.

**(a) Popup blocked — the likely user-visible failure.**
`Studio.tsx:96-135` awaits font loading, canvas render, and a `fetch` to
`/api/publish` *before* calling `window.open` at line 129. Browsers only honour
`window.open` inside the user-gesture task; after `await` the activation is gone,
so Safari and Chrome-Android silently swallow it, and desktop Chrome often does
too.

Fix: open the tab **synchronously on click** —
`const w = window.open("about:blank", "_blank")` — then set `w.location.href` once
the slug resolves, and close it on failure.

**(b) No fallback when the popup is blocked anyway.** Always render the composed
intent URL as a real `<a target="_blank">`, plus **Copy link** and **Copy caption**
buttons, so the flow can be completed by hand. Today `shareUrl` renders only after
a *successful* publish (`Studio.tsx:270`).

**(c) Publish can 502 on Vercel — unconfirmed, check this first.**
`src/lib/store.ts:41` falls back to `writeFile` under `.blob-store/` when
`BLOB_READ_WRITE_TOKEN` is unset. Serverless filesystems are read-only, so
`putImage` throws and `api/publish/route.ts:64` returns `502 storage unavailable`.
**If the token is missing, the share flow has never worked in production and (a)
alone will not fix it.**

To determine it, in order:
1. `npx vercel env ls` against the linked project — needs an interactive
   `npx vercel login` first, run by a human.
2. If unavailable, deploy a Vercel **preview** and POST a real render at it,
   reading the status code. A preview keeps the production store clean while
   exercising the identical code path. *The live production endpoint was
   deliberately not POSTed to during research, so this is still unknown.*
3. If the token is absent: create a Blob store and set it, per README:151.

**Regardless of the answer,** degrade gracefully: on publish failure still open the
intent with the caption + generator URL so the user gets *a* tweet instead of a
dead button, and surface the real status code rather than today's generic
"couldn't publish — try again".

**Then add mobile-native sharing:** `navigator.share({ files: [png] })` where
supported attaches the **actual image** to the post rather than relying on a link
preview. Strictly better on phones, which is where most people will use this.

## 2. A7 — Downscale guard for huge photos

A 48MP HEIC decoded at full size on a mid-range Android will OOM the tab.
`decodeImage` (`src/lib/photo.ts:88`) decodes at native resolution and the card's
photo window is a few hundred px. Cap the long edge at ~2000px during decode.

Costs nothing visually, and removes a crash that only shows up on the cheap phones
most entrants will actually be using — i.e. one you will never see in testing.

## 3. A8 — Guard rails on `/api/publish`

The endpoint accepts 8MB uploads from anyone with no rate limit
(`src/app/api/publish/route.ts:12`). One script fills the blob store and the share
flow dies mid-competition. Add a per-IP limit and reject non-PNG earlier than the
current check.

## 4. A2 — Crop nudge (cheapest real win on the list)

`computeCrop` **already accepts** `{ zoom, offsetX, offsetY }`
(`src/lib/photo.ts:240`) and the UI never passes them — `Studio.tsx:38` calls it
with defaults only. Dead capability, already written and tested.

Add pinch/drag on the photo window plus a zoom slider, with the existing
subject-aware auto-crop still the default. The brief says "don't assume users will
crop first" — auto-crop handles that, but when it guesses wrong the user is
currently stuck with the result.

## 5. Field opacity — legibility over the backdrop

The `Field` component (`Studio.tsx`, the NAME/X HANDLE/ROLE/STACK inputs) renders
at `bg-green-deep/50` — 50% opacity. That was fine against a flat green page, but
now that John's backdrop (V1) puts real artwork behind the studio, the
translucency lets it bleed through the fields themselves — the sunrise scene's
"COA BEACH" signage is visible inside the X HANDLE and STACK boxes in testing,
competing with the placeholder text.

Bump the input background to something more opaque — `bg-green-deep/80` or
higher — so the fields read as solid UI chrome sitting on top of the backdrop,
not another translucent layer fighting it for attention. Same idea applies to the
BUILDER CLASS chip container (`bg-green-deep/40`) if it shows the same bleed-
through; worth a glance while you're in there, but the four input fields are the
actual complaint. Quick, isolated, `Field`'s className is the only thing to touch.

## 6. F1 — CREW mode: a combined team pass ★ the headline feature

Let the user add **2–3 people** (photo + name each) and render **one combined
pass** from the same canvas pipeline, sharable as a single image.

*On the wording:* hhgoa.com says "one combined **frame**", but it uses "frame" as a
generic word for the generated graphic — the same panel lists "Personalized: name,
stack, a generated builder class", which is Format B language, and the task is
titled "Frame / ID Card Generator". We built Format B, which the PDF explicitly
sanctions. So this is a **combined team ID card**, several people on one pass —
*not* a PFP frame/overlay.

- Ship as a **`SOLO` / `CREW` toggle** so the existing single-card flow is
  untouched and cannot regress.
- Reuse `loadPhoto` / `computeCrop` (`src/lib/photo.ts`) once per slot. The
  subject-aware crop matters more here — three photos of different aspect ratios
  have to sit side by side without one face landing off-centre.
- New layout entry in `src/lib/card/layout.ts` + a crew draw path in `draw.ts`.
  Keep the "canvas is the only renderer" rule so the tilt view and the export
  can't drift apart.
- `mint()` (`src/lib/builder.ts`) is per-person; the crew pass needs one shared
  header (team name) plus a per-slot builder class. **Extend `mint` rather than
  forking it.**
- `/api/publish` + `/id/[slug]` already store an arbitrary PNG plus a metadata
  record, so the crew image shares through the existing path — `PassRecord`
  (`src/lib/store.ts:18`) just needs an optional members array.

**On rarity tiers (item 7, next):** that item was originally John's, blocked on
this exact restructure of `mint()`. Rather than have him wait idle and rebase on
top afterward, it's moved to this list — you now own `builder.ts`/`draw.ts`
outright, no handoff needed. Do CREW first; rarity builds on the shape it leaves
`mint()` in.

## 7. A3 — Rarity tiers on the builder class

`mint()` already derives a stable class from a hash (`src/lib/builder.ts:175`) —
after CREW, check that hash derivation still applies cleanly per-member. Bucket
the draw into COMMON / RARE / MYTHIC by hash range, print the tier on the card,
and give rare pulls a foil/holo treatment. People reroll for a good one and post
the good one — which is exactly what the Radar ranks.

Keep the foil treatment in a new `src/lib/card/foil.ts` and touch `draw.ts` at a
single call site, same as any other draw-path addition — no coordination needed
now that both files are yours.

## 8. A1 — Animated MP4/GIF export — **stretch only**

Highest payoff on the whole list, and the reason it's stretch is an honest cost.

The product's gimmick is the lenticular tilt, and **the shared artifact is a static
PNG** — so the best thing about the card is invisible in the post being scored. A
2–3s loop sweeping sunrise → day → night would autoplay in-timeline on X.

- The motion path is already parametric: `playSweep` (`src/hooks/useTilt.ts:341`)
  drives `x = -sin(2πt)` over 4600ms, so frames can be generated deterministically
  at fixed timesteps rather than captured in real time.
- **The catch:** the lenticular interlace lives in **CSS** —
  `TidePass.module.css` does the striped mask and duty cycle — while the export
  path (`src/lib/card/scene.ts:191`) is pure canvas `toBlob`. `MediaRecorder` can
  only capture a canvas/stream, never a DOM element. So a faithful animated export
  means **porting the mask maths into canvas**. Half a day, not an hour.
- **Cheaper fallback:** a 3-frame flip (sunrise → day → night) crossfaded as
  WebM/GIF. No mask maths — it composes the three scenes `scene.ts` already
  renders. Less faithful, still animated, still stops the scroll.

Offer it as **DOWNLOAD MP4** beside the PNG; on mobile,
`navigator.share({ files: [video] })` attaches it directly.

---

## Files you own outright

`src/lib/share.ts` (new) · `src/components/Studio.tsx` · `src/lib/photo.ts` ·
`src/lib/store.ts` · `src/app/api/publish/route.ts` ·
`src/app/api/blob/[key]/route.ts` · `src/app/id/[slug]/page.tsx` ·
`src/lib/card/layout.ts` · `src/lib/card/scene.ts` · `src/lib/builder.ts` ·
`src/lib/card/draw.ts` · `src/lib/card/foil.ts` (new)

`builder.ts`/`draw.ts` were originally shared with John (rarity tiers); that item
moved here (see item 7), so they're fully yours now — no handoff, no rebase.

**Never touch:** `src/app/layout.tsx`, `src/app/globals.css`,
`src/components/Marquee.tsx`, `src/components/Backdrop.tsx` — all John's.

---

## Verification

1. `bun run scripts/flow.ts photo.jpg` — upload → download, asserts the PNG decodes
   with **zero transparent pixels** (transparency renders as white bars on X).
2. `bun run scripts/share.ts photo.jpg` — publish → verify OG tags resolve.
3. **Share-to-X by hand — this is the bug being fixed, so test it manually** on
   desktop Chrome *and* a real phone. Confirm the X composer opens with caption +
   link, and that the link preview shows the card.
4. `npm run check:mobile` — 15 pixel assertions on Pixel 7 + iPhone 13, after CREW
   mode lands.
5. Test with a genuinely large HEIC straight off an iPhone (item 2) and a photo
   with an off-centre subject (item 4).
6. Deploy a Vercel **preview** before merging; verify `BLOB_READ_WRITE_TOKEN` is
   present and publish returns 200, not 502.

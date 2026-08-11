# John's work — Identity & Surface

Branch: **`john`** · Track: the page chrome and the card's art direction.
Master list with full research: [`listOfFixes.md`](./listOfFixes.md)

Items 1 and 2 are **mandatory** and land first. If time runs out, what gets
dropped is the tail of this list, never those two.

---

## Why these items (the short version)

Three research findings justify this track:

- **hhgoa.com ships the artwork we should be using.** Official flat line-art
  illustrations sit at `hhgoa.com/assets/` — `hackers.png` (five hackers at a long
  table with laptops, Goan house + palms), `Sun rise.png` (beach sunrise),
  `footer trees.png`. Our studio page currently renders none of it.
- **We're approximating their type.** Their compiled CSS uses **Imbue** (display)
  and **Victor Mono** (mono). We ship Bodoni Moda + Roboto Mono.
- **Submissions are ranked publicly** at `hhgoa.com/radar` — 137 teams, scored
  partly on X-post **views**. So "instantly recognizable HH Goa identity" and a
  link preview that isn't blank are scoring criteria, not polish.

Brand palette (already correct in `globals.css`): `#0b6839` green, `#fee101`
yellow, `#ff0080` pink, `#fffbe8` paper.
Brand kit: `drive.google.com/file/d/11aAIBCdhngT0QWLPBNc2bJGLqXhghN3H/view`

---

## Before starting

`node_modules` is **not installed**. Run `npm install` first, and read the Next 16
guides under `node_modules/next/dist/docs/` as `AGENTS.md` requires — this is not
the Next.js you remember, and the file structure differs.

**First commit on `john` is the shared extraction** (done once, benefits both
tracks):

1. Extract `Marquee` out of `Studio.tsx:300` into `src/components/Marquee.tsx`.
2. Extract the share logic out of `Studio.tsx:96-135` into `src/lib/share.ts`.
3. Mount `<Backdrop />` and `<Marquee />` in `Studio.tsx` as stubs.

After that commit **you never reopen `Studio.tsx`** — it belongs to Sai, who is
building CREW mode and the share fix in it. Sai branches from this commit.

---

## 1. V1 — Hacker artwork background ★ MANDATORY

The page is flat `bg-green` with the card floating in a void
(`src/components/Studio.tsx:140`). Build a layered background from the official
hhgoa.com illustrations so it reads as the event, not a green rectangle.

**Assets.** Vendor `hackers.png`, `Sun rise.png`, `footer trees.png` into
`public/scene/`, **converted to WebP/AVIF first** — the raws are 2.0MB / 3.2MB /
2.3MB and would wreck the "seconds from upload to output" requirement. Target
<150KB each, two widths (mobile/desktop).

**Component.** New `src/components/Backdrop.tsx`: fixed, `-z-10`, `aria-hidden`.

```
┌─ ticker ─────────────────────┐
│  ░░ sunrise glow (top-right) ░░ │
│  ┌─────┐      MINT YOUR       │
│  │CARD │      TIDE PASS      │
│  │     │   [drop a photo]    │
│  └─────┘   [name] [handle]   │
│ ▓▓ hackers-at-table, 18% ▓▓▓▓▓ │
│ ███ footer trees █████████████ │
└─────────────────────────────┘
```

- Sunrise band anchored bottom, full-bleed.
- `hackers.png` as the mid band behind the form column.
- Footer trees along the bottom edge.
- Green scrim (`--hh-green` at ~0.82) + vignette over the top so the card and form
  text keep contrast. **Verify the card never loses legibility** — it is the hero.

**Optional parallax, cheap.** `useTilt` already publishes normalised axes as CSS
custom properties from inside a rAF loop (`src/hooks/useTilt.ts`), so the backdrop
can read the same vars with zero new state and no re-renders. Respect
`prefers-reduced-motion`.

A faint scanline/code-rain texture is fine *on top of* the illustrations, but the
illustrations are the source of "hacker" here — not a generic Matrix effect.

**After this lands, immediately run `npm run check:mobile`.** Those 15 pixel
assertions read decoded image data, and a background change is exactly what breaks
them.

## 2. V2 — Rebuild the ticker ★ MANDATORY

`Studio.tsx:300` (now `Marquee.tsx`) is one string repeated six times:
`"LESS NOISE. MORE SIGNAL. · #FrameInGoa · 247 SEATS · "`. `#FrameInGoa` appears
~12× across the strip — that's the "too much Frame thing" in the feedback.

Replace with real event facts taken from hhgoa.com:

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
already used on the card, and add a **second row scrolling the opposite way** with
the day-by-day agenda. Keep the existing CSS marquee animation and the duplicated
`<span>` seam trick that makes the loop seamless.

## 3. F2 — Homepage OG image

The live homepage serves **zero** `og:` tags — `curl` returns only
`<meta name="description">`. `src/app/layout.tsx:24` sets title/description and
nothing else. The task requires posting the *generator link* with a how-to, so
that post currently renders a blank preview on X.

Add a static branded 1200×630 plus `og:image`, `twitter:card:
summary_large_image`, and `metadataBase` in `layout.tsx` metadata.

## 4. A9 — First-paint speed

The three plates are ~700KB combined and gate the first card render.
`src/lib/card/assets.ts` loads them with `new Image()` behind a shared promise
cache — good, but there's no `<link rel="preload">`, so the browser doesn't start
them until the module runs. Preload in the document head and decode off the main
thread. "Seconds from upload to shareable output" is an explicit judging criterion.

> **A3 (rarity tiers) has moved to `sai_work.md`.** It was blocked here on
> Sai's CREW-mode restructure of `mint()` — same files he was already
> touching — so rather than John waiting idle and then rebasing on top, Sai
> now owns it outright as the item right after CREW lands. Nothing left on
> this list depends on Sai's work, so this track has no more blocked items.

## 5. F3 — Official fonts — **do this last**

Imbue + Victor Mono replace Bodoni Moda + Roboto Mono in `layout.tsx` and
`src/lib/card/fonts.ts`. Self-host both, as the current setup already does, so the
canvas renderer and the DOM agree exactly.

**Why last:** every coordinate in `src/lib/card/layout.ts` was measured against the
current faces, so the card text must be re-checked after the swap.
`bun run scripts/preview.ts` and `scripts/measure.ts` exist for exactly this. If
the card layout breaks badly, apply the new fonts to the **page chrome only** and
leave the card faces alone — it's the easiest item here to partially revert.

---

## Files you own outright

`src/components/Backdrop.tsx` (new) · `src/components/Marquee.tsx` (new) ·
`public/scene/*` · `public/fonts/*` · `src/app/globals.css` · `src/app/layout.tsx` ·
`src/lib/card/fonts.ts` · `src/lib/card/assets.ts`

`layout.tsx` is yours alone — fonts, OG metadata and asset preload all live there,
so one owner avoids three-way conflicts in a single file.

**Never touch:** `src/components/Studio.tsx` after the extraction commit,
`src/lib/builder.ts`, `src/lib/card/draw.ts` — all Sai's now that A3 moved to
his list.

---

## Verification

1. `npm run dev` — studio renders with the backdrop; card and form text stay legible.
2. `npm run check:mobile` — 15 pixel assertions on Pixel 7 + iPhone 13. Run after
   the backdrop and again after the font swap.
3. `bun run scripts/preview.ts` — renders layers + share scene to `.preview/`;
   the check that the font swap didn't wreck the card.
4. Lighthouse on mobile — the backdrop must not regress the "near-instant" bar.
5. Confirm `/` now shows a real link preview (paste it into a card validator).

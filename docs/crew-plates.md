# Crew plates

The crew pass has three illustrated printings — day, sunrise, blacklight — the
way the solo card does, so it tilts and hides a secret like the solo card does.

They are **generated, not hand-drawn**, from the event's own artwork:

```bash
curl -o public/plates/crew/incoming/raw/sunrise.png \
  "https://hhgoa.com/assets/Sun%20rise.png"

bun run scripts/crewart.ts      # compose the three moods -> incoming/*.png
bun run scripts/crewplates.ts   # encode -> public/plates/crew/*.webp
bun run scripts/crew.ts photo.jpg
```

`crewart.ts` crops `Sun rise.png` to the card's 16:9 and grades it three ways.
That is the same relationship the solo plates have to each other — one scene
under three lights — and it keeps the crew pass on the actual brand
illustrations rather than an approximation of them.

## What the grading has to solve

**The three have to be obviously different.** The first attempt used a
`soft-light` pass, which is close to a no-op against flat saturated colour —
sunrise came out indistinguishable from day, which defeats the point of a
lenticular card. It now split-tones: `multiply` pulls the greens toward the
mood's shadow colour, `screen` lifts the sun and the line work. Sunrise also
gets a screened wash over the upper sky, because multiplying orange into green
gives olive, which is a real dusk colour but not a dawn one.

**The bottom third is white villas, and cream type lands on it.** The member
names and footer sit exactly there. A gradient takes that band down hard; it
reads as dusk rather than as a fix. `crewplates.ts` reports mean luma and warns
past 165 — a background too bright to hold cream is the one contrast failure the
renderer cannot correct.

## What the plates deliberately do not contain

**No text, no photo windows, no card border.** Every word, the three photo
tiles, the keyline and the badge are drawn in code.

Two reasons. `scripts/plates.ts` spends most of its length compensating for
three independently produced solo designs putting *one* photo window in three
slightly different places; printing three windows would triple that problem.
And a printed window fixes the team size — a two-person crew would show one
empty frame. Drawing the tiles in code means one set of plates serves both
sizes, the tiles are pixel-identical across all three printings, and the photo
cannot drift against its own frame mid-tilt.

That is also why `crewplates.ts` only checks geometry and encodes: there is
nothing between the three that can fail to line up, so there is nothing to
register.

## Replacing them with custom art

If someone draws proper crew plates later, drop them in and skip `crewart.ts`:

| | |
|---|---|
| **Size** | **2400 × 1350** (16:9) |
| **Files** | `crew-day.png`, `crew-sunrise.png`, `crew-night.png` |
| **Location** | `public/plates/crew/incoming/` |

Full-bleed background only — no text, no windows, no border, per above. Keep
these bands calm, since code draws over them. Coordinates are on a 1200 × 675
grid; double them for the file.

| Band | Region | What lands there |
|---|---|---|
| Header left | x 46–950, y 40–190 | Kicker + team name |
| Header right | x 1014–1154, y 60–156 | The गोवा badge |
| **Centre** | **x 274–926, y 208–496** | **The photo tiles — keep clearest** |
| Names | x 274–926, y 500–580 | Names + builder classes |
| Secret | centred, y ≈ 620 | Blacklight line, night plate only |
| Footer | x 46–1154, y 600–652 | Rule, pass number, `#FrameInGoa` |

Then `bun run scripts/crewplates.ts`, which encodes them and flips
`CREW_PLATES_AVAILABLE`.

## The availability flag

`src/lib/card/crewPlatesManifest.ts` is written by `crewplates.ts` and committed
with the images. The loader reads it instead of discovering the art by
requesting it: a miss on a static asset logs a 404 on every visit, which is
noise in production and makes a genuinely broken asset indistinguishable from
the expected empty state in the checks that treat console errors as failures.

With the flag false, `drawCrewCard` falls back to a composed background and
ignores the layer, so all three canvases render the same image — the tilt does
nothing visible and nothing breaks.

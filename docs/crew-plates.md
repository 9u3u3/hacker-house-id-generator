# Crew plates

The crew pass has three illustrated printings — day, sunrise, blacklight — the
way the solo card does, so it tilts and hides a secret like the solo card does.

They are **hand-drawn art, dropped in whole**. The plate *is* the card: it prints
the border, the lanyard slot, the RESIDENT kicker, the LESS NOISE / MORE SIGNAL
motto, the HH stamp, the CODE / BUILD / CHAI / REPEAT column and the dated
footer. The renderer draws only what changes.

```bash
# drop crew-day.png / crew-sunrise.png / crew-night.png into
# public/plates/crew/incoming/ then:

bun run scripts/crewfit.ts       # measure the art before trusting it
bun run scripts/crewplates.ts    # encode -> public/plates/crew/*.webp
bun run scripts/crewpreview.ts   # render 2- and 3-member crews, all 3 layers
```

| | |
|---|---|
| **Size** | **1536 × 1024** (3:2) |
| **Files** | `crew-day.png`, `crew-sunrise.png`, `crew-night.png` |
| **Location** | `public/plates/crew/incoming/` |

## Why the card is 3:2 and not 16:9

The earlier composed plates were 16:9, and the crew card was sized to match so it
could be posted with no compositing step. The illustrated art is 3:2, and
cropping it back to 16:9 takes ~160px off the height — which is exactly where the
kicker and the dated footer live.

So the card takes the art's shape, and `scene.ts` composites it into a 16:9 field
for sharing, the way it already does for the portrait solo card. The export is
still 2400 × 1350, so `/id/[slug]` can keep declaring one `og:image` size for
every pass it serves.

## What the renderer draws, and why it draws it on mounts

Only the crew's own content: the team nameplate, the गोवा badge, the photo tiles,
each member's name and builder class, the pass number, `#FrameInGoa`, and the
blacklight secret.

All of it sits on **printed cream mounts with a pink keyline**, never straight
onto the illustration. `scripts/crewfit.ts` prints a calm grid — mean luma and
gradient energy per cell, worst case across the three plates — and the same cell
swings from luma 19 to 217 between the night and day printings. No ink, light or
dark, stays legible across that. The solo card hit the same wall with its
builder-class chip and solved it the same way.

The mounts have a second benefit: because they are opaque, the type can be drawn
at identical coordinates on all three layers without regard to what is underneath,
so nothing swims while the illustration changes mid-tilt.

Member names live *inside* the tile mount rather than under it, for the same
reason — under it, they would be back on bare illustration.

## Registration

Not needed, unlike the solo plates. `crewfit.ts` reports all three at 1537×1023
with the card full-bleed, so there is nothing between them that can fail to line
up.

The one thing it does catch: each plate prints its own **corner radius** against a
dark surround — ~44px on day and night, ~60px on sunrise. `CREW.radius` is set to
62, above the roundest of the three, because a clip squarer than the art leaves
that dark corner showing as a sliver inside the card.

## Reserved bands

`CREW.reserved` in `layout.ts` records what the art already prints. Anything the
renderer draws has to clear it.

| Band | Region (1536 × 1024) | What the plate prints there |
|---|---|---|
| Top | y < 150 | Kicker, globe, lanyard slot, dashed rule, HH stamp |
| Left | x < 195, y 180–420 | ✳ and the motto, with its gold rule |
| Right | x > 1370, y 340–760 | CODE / BUILD / CHAI / REPEAT |
| Bottom | y > 935 | Gold rules and `28 – 31 OCT 2026` |

Which leaves x 200–1360, y 165–930 for the nameplate, the tile row and the
footer strip, in that order.

## The availability flag

`src/lib/card/crewPlatesManifest.ts` is written by `crewplates.ts` and committed
with the images. The loader reads it instead of discovering the art by
requesting it: a miss on a static asset logs a 404 on every visit, which is
noise in production and makes a genuinely broken asset indistinguishable from
the expected empty state in the checks that treat console errors as failures.

With the flag false, `drawCrewCard` falls back to the solo day plate and ignores
the layer, so all three canvases render the same background — the tilt does
nothing visible and nothing breaks.

## `scripts/crewart.ts`

Superseded. It composed plates from three of the event's own illustrations when
there was no crew art; it is kept only because it documents that fallback. Do not
run it against the current plates — it writes to the same `incoming/` filenames
and would overwrite them.

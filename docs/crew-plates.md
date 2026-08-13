# Crew plate spec

What to generate for the CREW pass, so it gets three real illustrated printings
like the solo card instead of a blurred reuse of the day plate.

**Generate 6 images. 3 ship, 3 are reference.**

---

## The three that ship — blank plates

| | |
|---|---|
| **Size** | **2400 × 1350** (16:9). Larger is fine at the same ratio; smaller is not. |
| **Format** | PNG (converted to WebP on the way in) |
| **Filenames** | `crew-day.png`, `crew-sunrise.png`, `crew-night.png` |
| **Put them in** | `public/plates/crew/incoming/` |

**Full-bleed illustrated background. Nothing else.**

- **No text.** Not the team name, not "HACKER HOUSE GOA", not a hashtag. Every
  word on the card is drawn by code, in the real fonts, so it stays sharp and
  correct at any size.
- **No photo windows.** No printed frames, no empty boxes, no placeholder
  people. The code draws 2 or 3 photo tiles with the cream fill and pink keyline
  the solo card uses. This is what lets one set of plates serve both team sizes.
- **No card border or keyline.** Art goes edge to edge. The border is drawn by
  code, so the three plates can never disagree about where the card's edge is —
  which is the exact problem `scripts/plates.ts` exists to fix on the solo card.

### The three moods

They must be the same scene under three lights — the way the solo plates are one
card in three printings, not three different cards.

| Plate | Light | Palette |
|---|---|---|
| `crew-day` | Midday | Bottle green `#0b6839`, cream `#fffbe8`, yellow `#fee101`, pink `#ff0080` |
| `crew-sunrise` | Dawn | Warm oranges and pinks over the same scene, sun low |
| `crew-night` | Blacklight / after dark | Purples, cyans, holographic — lit windows, moon |

Style: the same flat Goan line-art as the existing plates and the hhgoa.com
illustrations — palms, Portuguese villa, tiled roofs, beach, sea.

### Keep these areas calm

The code draws over the plate, so busy detail in these bands fights the type.
Quiet gradient or open sky/sand is ideal; detail belongs at the edges.

Coordinates are given for a **1200 × 675** design grid — multiply by 2 for a
2400 × 1350 file.

| Band | Region (1200×675) | What lands there |
|---|---|---|
| Header left | x 46–950, y 40–190 | Kicker line + big team name |
| Header right | x 1014–1154, y 60–156 | The गोवा badge |
| **Centre** | **x 260–940, y 208–500** | **The 2–3 photo tiles — keep this clearest** |
| Names | x 260–940, y 500–580 | Member names + builder classes |
| Footer | x 46–1154, y 590–650 | Rule, pass number, `#FrameInGoa` |

Contrast matters more than detail: the type is cream and yellow, so those bands
want to stay **mid-to-dark**. A bright sky behind cream text is the one failure
mode that can't be fixed in code.

---

## The three that don't ship — layout reference

Same three scenes, but **with** placeholder text and 3 placeholder photo boxes,
so the intended layout is legible.

- **Filenames** `crew-day-ref.png`, `crew-sunrise-ref.png`, `crew-night-ref.png`
- **Put them in** `docs/crew-reference/`

These are never loaded by the app. They exist so the layout constants in
`src/lib/card/layout.ts` can be matched against what the designer intended,
rather than guessed.

---

## Once they're in place

```bash
bun run scripts/crewplates.ts     # converts incoming/ -> public/plates/crew/*.webp
bun run scripts/crew.ts photo.jpg # asserts the crew export still decodes clean
```

The renderer checks for the crew plates at startup and uses them when all three
load. If any are missing it falls back to the current canvas-composed
background, so an incomplete drop can't break crew mode.

## Why no printed windows

The solo card prints one photo window, and `scripts/plates.ts` spends most of
its length compensating for the fact that three independently produced designs
put that window in three slightly different places.

Printing three windows on a crew plate would triple that problem, and it would
also fix the team size at exactly three — a two-person crew would show one
empty printed frame. Drawing the tiles in code means one set of plates covers
both sizes, the tiles are pixel-identical across all three printings, and the
photo can never drift against its own frame mid-tilt.

/**
 * Geometry of the illustrated card, in plate pixels.
 *
 * Every number here was measured off the original designs rather than eyeballed
 * — see `scripts/plates.ts` (which normalises them onto a shared card border)
 * and `scripts/measure.ts` (which recovers where the designer put the text).
 * Re-run both if the plates are ever regenerated.
 */

import type { LayerName } from "./theme";

export const PLATE_W = 963;
export const PLATE_H = 1485;

/**
 * The printed photo window, per layer.
 *
 * The plates are registered on the card's border, not on this window, because
 * the border is what the eye tracks — see the note in `scripts/plates.ts`. The
 * cost is that each layer prints its window a little differently, so the photo
 * is drawn into whichever window belongs to the layer being rendered.
 */
export const WINDOWS: Record<LayerName, { x: number; y: number; w: number; h: number }> = {
  day: { x: 311, y: 577, w: 333, h: 499 },
  sunrise: { x: 320, y: 612, w: 318, h: 484 },
  night: { x: 295, y: 583, w: 355, h: 515 },
};

/**
 * What the uploaded photo is cropped to. The three windows differ by a few
 * percent of aspect; the crop targets the reference layer and each layer then
 * covers its own window, so the difference costs a sliver of edge rather than
 * a visible stretch.
 */
export const PHOTO_ASPECT = WINDOWS.day.w / WINDOWS.day.h;

/**
 * The two-line name lockup. Line one is bottle green, line two hot pink, and
 * the badge straddles the gap between them.
 */
export const NAME = {
  left: 161,
  right: 902,
  /** cap-height boxes measured from the original headline */
  line1: { top: 148, bottom: 318 },
  line2: { top: 328, bottom: 480 },
};

export const BADGE = { x: 421, y: 255, w: 167, h: 115 };

/**
 * The generated builder title, on a printed chip in the band between the photo
 * window and the data panel.
 *
 * It gets a chip rather than bare text because that band is illustration on all
 * three plates — a beach at sunset, a Portuguese villa, the same villa under
 * blacklight — and no single ink colour stays legible across them. The chip
 * borrows the photo window's own treatment (cream fill, pink keyline) so it
 * reads as part of the printed card rather than something dropped on top.
 */
export const CLASS_CHIP = {
  centerY: 1150,
  height: 64,
  maxWidth: 810,
  padX: 32,
  size: 34,
};

/**
 * The data panel: STACK / ROLE / PASS NO.
 *
 * The panel is printed at a different height on each plate — day 1218,
 * sunrise 1220, night 1241 — so the row is set to clear the lowest of the
 * three. Drawing at identical coordinates on every layer is what stops the text
 * drifting while the art changes underneath it; the alternative, a per-layer
 * offset, would make the row swim mid-tilt.
 *
 * Columns are weighted rather than equal: a stack list runs long and a pass
 * number never does.
 */
export const ROW = {
  columns: [243, 567, 827],
  dividers: [416, 719],
  labelBaseline: 1284,
  valueBaseline: 1342,
  labelSize: 22,
  valueSize: 40,
  ruleTop: 1262,
  ruleBottom: 1352,
  /** per-column width budget for values, before they start shrinking */
  widths: [316, 273, 186],
};

/** Only drawn on the night plate — the payoff for tilting. */
export const SECRET = { y: 1212, size: 27 };

export const INK = {
  green: "#0d3b2e",
  pink: "#e01f68",
  cream: "#f2e6cf",
  gold: "#e2a90f",
};

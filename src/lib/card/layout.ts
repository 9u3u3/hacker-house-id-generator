/**
 * Geometry of the illustrated card, in plate pixels.
 *
 * Every number here was measured off the original designs by
 * `scripts/measure.ts` after warping them onto the shared window anchor, so it
 * describes where the designer actually put things rather than where it looked
 * about right. Re-run that script if the plates are ever regenerated.
 */

export const PLATE_W = 948;
export const PLATE_H = 1477;

/** The printed photo window. Normalised to be identical on all three plates. */
export const WINDOW = { x: 300, y: 577, w: 333, h: 499 };

/** What the uploaded photo has to be cropped to — the window, not the card. */
export const PHOTO_ASPECT = WINDOW.w / WINDOW.h;

/**
 * The two-line name lockup. Line one is bottle green, line two hot pink, and
 * the badge straddles the gap between them.
 */
export const NAME = {
  left: 150,
  right: 912,
  /** cap-height boxes measured from the original headline */
  line1: { top: 148, bottom: 318 },
  line2: { top: 328, bottom: 480 },
};

export const BADGE = { x: 410, y: 255, w: 167, h: 115 };

/**
 * The STACK / SEAT / GATE strip. The cleaned plates have the labels and rules
 * removed as well as the values, so all of it is drawn.
 */
/*
 * The strip sits higher than the original design placed it. Each plate prints
 * its own palm-and-date block, and those landed at different heights across the
 * three (day ~1385, sunrise ~1350, night ~1320), so a row at the designed
 * baseline collided with two of them. The row clears the highest of the three
 * instead of being offset per layer — text drawn at identical coordinates on
 * every layer is what stops it drifting while the art changes underneath.
 */
export const ROW = {
  columns: [200, 472, 770],
  dividers: [352, 646],
  labelBaseline: 1248,
  valueBaseline: 1300,
  labelSize: 24,
  valueSize: 42,
  ruleTop: 1218,
  ruleBottom: 1312,
  /** per-column width budget for values, before they start shrinking */
  widths: [288, 250, 200],
};

/** Only drawn on the night plate — the payoff for tilting. */
export const SECRET = { y: 1150, size: 30 };

export const INK = {
  green: "#0d3b2e",
  pink: "#e01f68",
  cream: "#f2e6cf",
  gold: "#e2a90f",
};

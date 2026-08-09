/**
 * The tilt axis is the sun. Left is dawn, flat is midday, right is after dark.
 * Each layer is the same card printed with a different set of inks.
 */

export type LayerName = "sunrise" | "day" | "night";

export type LayerTheme = {
  /** top and bottom of the card's background wash */
  bgTop: string;
  bgBottom: string;
  /** primary text */
  ink: string;
  /** dimmed text — rails, labels, microtext */
  inkSoft: string;
  /** the loud colour: pills, rules, the builder class */
  accent: string;
  /** text sitting on top of `accent` */
  onAccent: string;
  /** hairlines, guilloché, borders */
  line: string;
  /** glow colour, or null for layers that don't glow */
  glow: string | null;
};

export const THEMES: Record<LayerName, LayerTheme> = {
  sunrise: {
    bgTop: "#ffd27a",
    bgBottom: "#e0561f",
    ink: "#4a1f05",
    inkSoft: "rgba(74,31,5,0.55)",
    accent: "#4a1f05",
    onAccent: "#ffd27a",
    line: "rgba(74,31,5,0.30)",
    glow: null,
  },
  day: {
    bgTop: "#0e7a43",
    bgBottom: "#074a28",
    ink: "#fffbe8",
    inkSoft: "rgba(255,251,232,0.58)",
    accent: "#fee101",
    onAccent: "#04301a",
    line: "rgba(255,251,232,0.22)",
    glow: null,
  },
  night: {
    bgTop: "#10032b",
    bgBottom: "#05010f",
    ink: "#f2d9ff",
    inkSoft: "rgba(176,38,255,0.65)",
    accent: "#ff0080",
    onAccent: "#05010f",
    line: "rgba(176,38,255,0.35)",
    glow: "#b026ff",
  },
};

/** Design-space dimensions. Everything is authored against this, then scaled. */
export const CARD_W = 620;
export const CARD_H = 980;
export const CARD_RADIUS = 30;

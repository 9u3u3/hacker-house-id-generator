import type { MintedCrew, MintedPass, Tier } from "@/lib/builder";
import type { CardAssets } from "./assets";
import type { CrewPlates } from "./crewAssets";
import {
  BADGE,
  CLASS_CHIP,
  CREW,
  CREW_TILE_W,
  INK,
  NAME,
  PLATE_H,
  PLATE_W,
  ROW,
  SECRET,
  TIER_CHIP,
  WINDOWS,
} from "./layout";
import { drawFoil, foilStyle } from "./foil";
import type { LayerName } from "./theme";

export type Fonts = { display: string; mono: string };

export type PhotoSource = {
  image: CanvasImageSource;
  /** source-space crop chosen by the face-centering pass */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

/* ------------------------------------------------------------------ */
/* text helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Canvas has `ctx.letterSpacing` now, but support is uneven enough that tracked
 * text silently collapsing would wreck the layout. Drawing glyph by glyph costs
 * nothing at this scale and renders identically everywhere.
 */
export function tracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: "left" | "center" | "right" = "left",
) {
  const chars = [...text];
  const total =
    chars.reduce((sum, c) => sum + ctx.measureText(c).width, 0) +
    spacing * Math.max(0, chars.length - 1);

  let cursor = align === "left" ? x : align === "center" ? x - total / 2 : x - total;
  const prev = ctx.textAlign;
  ctx.textAlign = "left";
  for (const c of chars) {
    ctx.fillText(c, cursor, y);
    cursor += ctx.measureText(c).width + spacing;
  }
  ctx.textAlign = prev;
  return total;
}

export function trackedWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  spacing: number,
) {
  const chars = [...text];
  return (
    chars.reduce((sum, c) => sum + ctx.measureText(c).width, 0) +
    spacing * Math.max(0, chars.length - 1)
  );
}

/**
 * The design's headline is a condensed didone: measured against the original,
 * "ANONYMOUS" occupied 768px at a 170px cap height. Bodoni Moda Black is more
 * than twice that wide at the same cap height, so it gets squeezed
 * horizontally to sit at the designed proportions.
 *
 * Squeezing a didone thins its vertical stems while leaving the horizontal
 * hairlines alone, which flattens the contrast the face is built on — so the
 * squeeze is allowed to tighten only so far before the type gives up height
 * instead.
 */
const CONDENSE = 0.72;
const CONDENSE_MIN = 0.58;

type FittedLine = { size: number; squeeze: number; width: number };

/**
 * Fit a line of caps into a box: hold the cap height, condense to taste, and
 * only shed height once condensing has gone as far as it should.
 */
function fitLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  capHeight: number,
  maxWidth: number,
): FittedLine {
  /* Bodoni's cap height is about 0.72em; start there, then correct by measure */
  let size = capHeight / 0.72;
  ctx.font = `900 ${size}px ${family}`;
  const cap = ctx.measureText(text).actualBoundingBoxAscent;
  if (cap > 0) size *= capHeight / cap;

  ctx.font = `900 ${size}px ${family}`;
  const natural = ctx.measureText(text).width;

  let squeeze = CONDENSE;
  if (natural * squeeze > maxWidth) {
    squeeze = Math.max(CONDENSE_MIN, maxWidth / natural);
  }
  if (natural * squeeze > maxWidth) {
    size *= maxWidth / (natural * squeeze);
    ctx.font = `900 ${size}px ${family}`;
  }

  const width = ctx.measureText(text).width * squeeze;
  return { size, squeeze, width };
}

/** Draw a fitted line, applying its horizontal condensation about `x`. */
function drawFitted(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  baseline: number,
  fit: FittedLine,
) {
  ctx.save();
  ctx.translate(x, baseline);
  ctx.scale(fit.squeeze, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* pieces                                                              */
/* ------------------------------------------------------------------ */

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * The photo, inside the printed window.
 *
 * The window belongs to the layer, not to the card — each plate prints it in a
 * slightly different place (see `WINDOWS`). Inset so the plate's own pink
 * keyline stays visible: the photo sits *within* the frame rather than covering
 * it.
 */
function drawPhoto(
  ctx: CanvasRenderingContext2D,
  photo: PhotoSource | null,
  layer: LayerName,
) {
  const win = WINDOWS[layer];
  const inset = 9;
  const x = win.x + inset;
  const y = win.y + inset;
  const w = win.w - inset * 2;
  const h = win.h - inset * 2;

  ctx.save();
  roundRectPath(ctx, x, y, w, h, 18);
  ctx.clip();

  if (photo) {
    /* The crop was chosen for the reference window's aspect, and this one may
       differ by a few percent. Cover rather than stretch: losing a sliver off
       an edge is invisible, a squashed face is not. */
    const scale = Math.max(w / photo.sw, h / photo.sh);
    const dw = photo.sw * scale;
    const dh = photo.sh * scale;
    ctx.drawImage(
      photo.image,
      photo.sx,
      photo.sy,
      photo.sw,
      photo.sh,
      x + (w - dw) / 2,
      y + (h - dh) / 2,
      dw,
      dh,
    );

    /* pull the portrait toward each plate's light so it belongs to the scene,
       but gently — heavy blending turns a face into a silhouette */
    if (layer === "sunrise") {
      ctx.globalCompositeOperation = "soft-light";
      const warm = ctx.createLinearGradient(0, y, 0, y + h);
      warm.addColorStop(0, "rgba(255,186,80,0.75)");
      warm.addColorStop(1, "rgba(226,74,32,0.65)");
      ctx.fillStyle = warm;
      ctx.fillRect(x, y, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(255,150,40,0.10)";
      ctx.fillRect(x, y, w, h);
    }
    if (layer === "night") {
      ctx.globalCompositeOperation = "soft-light";
      ctx.fillStyle = "rgba(120,40,190,0.85)";
      ctx.fillRect(x, y, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(90,30,160,0.22)";
      ctx.fillRect(x, y, w, h);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.restore();
}

/**
 * The name, set as the design sets it: first name in bottle green over surname
 * in pink, with the badge landing in the gap.
 */
function splitName(name: string): [string, string] {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ["ANONYMOUS", "BUILDER"];
  if (parts.length === 1) return [parts[0].toUpperCase(), ""];
  return [
    parts.slice(0, -1).join(" ").toUpperCase(),
    parts[parts.length - 1].toUpperCase(),
  ];
}

function drawName(
  ctx: CanvasRenderingContext2D,
  pass: MintedPass,
  layer: LayerName,
  fonts: Fonts,
) {
  const [first, last] = splitName(pass.name);
  const glow = layer === "night";

  /* line two is indented like the design, so its box is correspondingly
     narrower — measuring both against the same width overran the card edge */
  const line2Left = NAME.left + 20;
  const maxW1 = NAME.right - NAME.left;
  const maxW2 = NAME.right - line2Left;

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const fit1 = fitLine(ctx, first, fonts.display, NAME.line1.bottom - NAME.line1.top, maxW1);
  ctx.fillStyle = layer === "night" ? "#08261f" : INK.green;
  if (glow) {
    ctx.shadowColor = "rgba(140,255,225,0.30)";
    ctx.shadowBlur = 16;
  }
  drawFitted(ctx, first, NAME.left, NAME.line1.bottom, fit1);
  ctx.shadowBlur = 0;

  if (last) {
    const fit2 = fitLine(ctx, last, fonts.display, NAME.line2.bottom - NAME.line2.top, maxW2);
    ctx.fillStyle = INK.pink;
    if (glow) {
      ctx.shadowColor = "rgba(255,0,128,0.55)";
      ctx.shadowBlur = 26;
    }
    drawFitted(ctx, last, line2Left, NAME.line2.bottom, fit2);
  }
  ctx.restore();
}

/**
 * The generated builder title, on its own printed chip.
 *
 * Identical on all three layers, which is deliberate: it's the one field that
 * says who the holder is, so it should sit still while the weather changes
 * behind it.
 */
function drawClassChip(
  ctx: CanvasRenderingContext2D,
  pass: MintedPass,
  fonts: Fonts,
) {
  const title = pass.builderClass;

  ctx.save();
  ctx.textBaseline = "alphabetic";

  /* size the title to fit the chip, then size the chip to the title */
  let size = CLASS_CHIP.size;
  ctx.font = `700 ${size}px ${fonts.mono}`;
  const inner = CLASS_CHIP.maxWidth - CLASS_CHIP.padX * 2;
  while (trackedWidth(ctx, title, 2) > inner && size > 16) {
    size -= 1;
    ctx.font = `700 ${size}px ${fonts.mono}`;
  }

  const w = trackedWidth(ctx, title, 2) + CLASS_CHIP.padX * 2;
  const h = CLASS_CHIP.height;
  const x = (PLATE_W - w) / 2;
  const y = CLASS_CHIP.centerY - h / 2;

  /* the chip borrows the photo window's treatment so it reads as printed */
  roundRectPath(ctx, x, y, w, h, 14);
  ctx.fillStyle = "rgba(244,235,216,0.96)";
  ctx.fill();
  ctx.strokeStyle = INK.pink;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  /* centred on the cap height, not the em box — a mono's descender space would
     otherwise push the line visibly high in the chip */
  const cap = ctx.measureText(title).actualBoundingBoxAscent || size * 0.72;
  ctx.textAlign = "center";
  ctx.fillStyle = INK.green;
  tracked(ctx, title, PLATE_W / 2, CLASS_CHIP.centerY + cap / 2, 2, "center");

  ctx.restore();
}

/**
 * STACK / ROLE / PASS NO. — labels, values and rules, none of which the plates
 * carry.
 *
 * These are the fields an ID card actually has to answer. The boarding-pass
 * seat and gate that used to live here were set dressing borrowed from a
 * different document, and read as filler on a card whose job is to say what
 * someone builds.
 */
function drawDataRow(
  ctx: CanvasRenderingContext2D,
  pass: MintedPass,
  fonts: Fonts,
) {
  const labels = ["STACK", "ROLE", "PASS NO."];
  const values = [
    pass.stack.toUpperCase(),
    pass.role.toUpperCase(),
    pass.passNo,
  ];

  /* all three plates print a light bottom panel (measured luma 211/203/170),
     so the strip is dark ink on every layer — night included */
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  for (const [i, label] of labels.entries()) {
    const cx = ROW.columns[i];

    ctx.fillStyle = "rgba(13,59,46,0.70)";
    ctx.font = `500 ${ROW.labelSize}px ${fonts.mono}`;
    tracked(ctx, label, cx, ROW.labelBaseline, 3.4, "center");

    /* the pass number is the one the design sets in pink */
    ctx.fillStyle = i === 2 ? INK.pink : INK.green;
    const maxW = ROW.widths[i];
    let size = ROW.valueSize;
    ctx.font = `700 ${size}px ${fonts.mono}`;
    while (trackedWidth(ctx, values[i], 1.5) > maxW && size > 15) {
      size -= 1;
      ctx.font = `700 ${size}px ${fonts.mono}`;
    }
    tracked(ctx, values[i], cx, ROW.valueBaseline, 1.5, "center");
  }

  ctx.strokeStyle = "rgba(13,59,46,0.30)";
  ctx.lineWidth = 2;
  for (const x of ROW.dividers) {
    ctx.beginPath();
    ctx.moveTo(x, ROW.ruleTop);
    ctx.lineTo(x, ROW.ruleBottom);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The rarity tier, printed like a stamped clearance level.
 *
 * COMMON gets the same muted treatment the rest of the header strip has; RARE
 * and MYTHIC take their colour from `foil.ts`, so the chip and the sheen can
 * never disagree about what tier a card is.
 */
function drawTierChip(
  ctx: CanvasRenderingContext2D,
  pass: MintedPass,
  fonts: Fonts,
) {
  const style = foilStyle(pass.tier);

  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${TIER_CHIP.size}px ${fonts.mono}`;

  const label = pass.tier;
  const w = trackedWidth(ctx, label, 4) + TIER_CHIP.padX * 2;
  const h = TIER_CHIP.height;
  const x = TIER_CHIP.centerX - w / 2;
  const y = TIER_CHIP.centerY - h / 2;

  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = style?.chipFill ?? "rgba(13,59,46,0.10)";
  ctx.fill();
  ctx.strokeStyle = style ? style.chipFill : "rgba(13,59,46,0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const cap = ctx.measureText(label).actualBoundingBoxAscent || TIER_CHIP.size * 0.72;
  ctx.fillStyle = style?.chipInk ?? "rgba(13,59,46,0.65)";
  tracked(ctx, label, TIER_CHIP.centerX, TIER_CHIP.centerY + cap / 2, 4, "center");

  ctx.restore();
}

/** The line that only exists under blacklight. Never leaves the site. */
function drawSecret(
  ctx: CanvasRenderingContext2D,
  pass: MintedPass,
  fonts: Fonts,
) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${SECRET.size}px ${fonts.mono}`;
  ctx.fillStyle = "#ffd9f2";
  ctx.shadowColor = "#ff0080";
  ctx.shadowBlur = 26;
  tracked(ctx, pass.secret, PLATE_W / 2, SECRET.y, 3, "center");
  ctx.shadowBlur = 12;
  tracked(ctx, pass.secret, PLATE_W / 2, SECRET.y, 3, "center");
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* entry point                                                         */
/* ------------------------------------------------------------------ */

export function drawCard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: {
    pass: MintedPass;
    photo: PhotoSource | null;
    layer: LayerName;
    fonts: Fonts;
    assets: CardAssets;
  },
) {
  const { pass, photo, layer, fonts, assets } = opts;

  ctx.save();
  ctx.scale(width / PLATE_W, height / PLATE_H);

  /* the illustration */
  ctx.drawImage(assets.plates[layer], 0, 0, PLATE_W, PLATE_H);

  drawPhoto(ctx, photo, layer);
  drawName(ctx, pass, layer, fonts);

  /* the badge straddles the name, so it paints after it */
  ctx.drawImage(assets.badge, BADGE.x, BADGE.y, BADGE.w, BADGE.h);

  drawTierChip(ctx, pass, fonts);
  drawClassChip(ctx, pass, fonts);
  drawDataRow(ctx, pass, fonts);
  if (layer === "night") drawSecret(ctx, pass, fonts);

  /* the finish goes on last, over everything, exactly like a laminate */
  drawFoil(ctx, PLATE_W, PLATE_H, pass.tier);

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* crew                                                                */
/* ------------------------------------------------------------------ */

/**
 * The crew pass is the same printed object as the solo card, laid out
 * landscape: cream stock, dashed rules, a stamp, printed photo windows on an
 * illustrated band, and a labelled data row.
 *
 * The first version stacked a headline over three tiles on a full-bleed photo
 * background. It read as a social banner rather than as a document, which is
 * the one thing the solo card never does. Landscape cannot stack the solo
 * card's bands top to bottom, so it splits them instead — an identity stub on
 * the left, the crew on the right, divided by a perforation, the way a
 * boarding pass does.
 */

/** Per-printing palette. The card changes stock, not just its lighting. */
type CrewInk = {
  paper: string;
  /** paper edge, a shade darker, so the card has a printed border */
  edge: string;
  ink: string;
  soft: string;
  accent: string;
  /** the window mount and the class chip */
  mount: string;
  glow: boolean;
};

const CREW_INK: Record<LayerName, CrewInk> = {
  day: {
    paper: "#f4ecd8",
    edge: "#dcd0b4",
    ink: "#0d3b2e",
    soft: "rgba(13,59,46,0.55)",
    accent: "#e01f68",
    mount: "#fbf5e6",
    glow: false,
  },
  sunrise: {
    paper: "#fae1c6",
    edge: "#e6c3a0",
    ink: "#5e2a12",
    soft: "rgba(94,42,18,0.55)",
    accent: "#d93b18",
    mount: "#fff1de",
    glow: false,
  },
  /* the solo night plate is holographic pastel, not black — so is this */
  night: {
    paper: "#d5c8f2",
    edge: "#b3a2dd",
    ink: "#23104a",
    soft: "rgba(35,16,74,0.55)",
    accent: "#ff0080",
    mount: "#efe7ff",
    glow: true,
  },
};

/** Greedy wrap to at most `maxLines`, shedding characters from the last. */
function wrapTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  spacing: number,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && trackedWidth(ctx, next, spacing) > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);

  const last = lines.length - 1;
  if (last >= 0) {
    while (lines[last].length > 1 && trackedWidth(ctx, lines[last], spacing) > maxWidth) {
      lines[last] = lines[last].slice(0, -1);
    }
  }
  return lines;
}

/** Set a mono line at the largest size that fits. */
function fitMono(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: number,
  size: number,
  spacing: number,
  maxWidth: number,
  minSize: number,
): number {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (trackedWidth(ctx, text, spacing) > maxWidth && s > minSize) {
    s -= 1;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

/** Fill a box with an image, cropping the overflow rather than stretching it. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const iw =
    (image as HTMLImageElement).naturalWidth || (image as HTMLCanvasElement).width || w;
  const ih =
    (image as HTMLImageElement).naturalHeight || (image as HTMLCanvasElement).height || h;

  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A dashed rule, the way the solo card scores its top strip. */
function dashedLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Text around a circle, for the stamp.
 *
 * `flip` is what makes the lower half readable. Rotating each glyph by
 * `angle + 90°` is correct along the top of a circle and upside down along the
 * bottom, so the bottom arc rotates the other way and runs its characters in
 * reverse to keep the reading order.
 */
function arcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  sweep: number,
  flip = false,
) {
  const chars = flip ? [...text].reverse() : [...text];
  const step = sweep / Math.max(1, chars.length - 1);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [i, c] of chars.entries()) {
    const a = startAngle + i * step;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.rotate(flip ? a - Math.PI / 2 : a + Math.PI / 2);
    ctx.fillText(c, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

/**
 * The LET'S BUILD TOGETHER stamp the solo card prints top-right.
 *
 * Drawn rather than lifted off the plate, because the crew card's stock changes
 * colour per printing and a bitmap stamp would carry the day plate's cream with
 * it onto the violet night stock.
 */
function drawStamp(ctx: CanvasRenderingContext2D, ink: CrewInk, fonts: Fonts) {
  const { cx, cy, r } = CREW.stamp;

  ctx.save();
  ctx.strokeStyle = ink.ink;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 7, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = ink.ink;
  ctx.font = `700 9px ${fonts.mono}`;
  arcText(ctx, "LET'S BUILD", cx, cy, r - 16, Math.PI * 1.30, Math.PI * 0.40);
  arcText(ctx, "TOGETHER", cx, cy, r - 16, Math.PI * 0.32, Math.PI * 0.36, true);

  ctx.font = `900 24px ${fonts.display}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("HH", cx, cy + 1);
  ctx.restore();
}

/**
 * One member's photo, in a printed window.
 *
 * Same treatment as the solo card's window — a cream mount with a pink keyline,
 * photo inset so the keyline survives — because a crew window is the same
 * printed object, just smaller and repeated. Without a photo it prints
 * initials, so the row doesn't collapse into a hole while someone uploads.
 */
function drawCrewWindow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  photo: PhotoSource | null,
  initials: string,
  tier: Tier,
  ink: CrewInk,
  fonts: Fonts,
) {
  ctx.save();

  /* the mount sits proud of the photo, like a printed matte */
  roundRectPath(ctx, x, y, w, h, CREW.window.radius);
  ctx.fillStyle = ink.mount;
  ctx.fill();

  ctx.save();
  roundRectPath(ctx, x + 8, y + 8, w - 16, h - 16, CREW.window.radius - 4);
  ctx.clip();

  if (photo) {
    const iw = w - 16;
    const ih = h - 16;
    const scale = Math.max(iw / photo.sw, ih / photo.sh);
    const dw = photo.sw * scale;
    const dh = photo.sh * scale;
    ctx.drawImage(
      photo.image,
      photo.sx,
      photo.sy,
      photo.sw,
      photo.sh,
      x + 8 + (iw - dw) / 2,
      y + 8 + (ih - dh) / 2,
      dw,
      dh,
    );
  } else {
    ctx.fillStyle = "rgba(13,59,46,0.10)";
    ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
    ctx.fillStyle = "rgba(13,59,46,0.45)";
    ctx.font = `900 ${Math.round(h * 0.28)}px ${fonts.display}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials, x + w / 2, y + h / 2);
  }
  ctx.restore();

  roundRectPath(ctx, x, y, w, h, CREW.window.radius);
  ctx.strokeStyle = ink.accent;
  ctx.lineWidth = 3;
  ctx.stroke();

  /* the tier rides in the corner, the way a trading card prints it */
  const style = foilStyle(tier);
  if (style) {
    ctx.font = `700 12px ${fonts.mono}`;
    const cw = trackedWidth(ctx, tier, 2.5) + 18;
    roundRectPath(ctx, x + 10, y + h - 32, cw, 22, 11);
    ctx.fillStyle = style.chipFill;
    ctx.fill();
    ctx.fillStyle = style.chipInk;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    tracked(ctx, tier, x + 10 + cw / 2, y + h - 21, 2.5, "center");
  }

  ctx.restore();
}

export function drawCrewCard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: {
    crew: MintedCrew;
    photos: (PhotoSource | null)[];
    fonts: Fonts;
    assets: CardAssets;
    /** the crew's own illustrated plates, when the art has been dropped in */
    plates?: CrewPlates | null;
    /** which printing to use */
    layer?: LayerName;
  },
) {
  const { crew, photos, fonts, assets, plates } = opts;
  const layer = opts.layer ?? "day";
  const ink = CREW_INK[layer];

  ctx.save();
  ctx.scale(width / CREW.W, height / CREW.H);

  /* ---- the stock ---- */
  /* opaque and never cut back into: transparency in an export renders as white
     bars on X, which is what scripts/flow.ts asserts against */
  ctx.fillStyle = ink.edge;
  ctx.fillRect(0, 0, CREW.W, CREW.H);

  roundRectPath(ctx, 6, 6, CREW.W - 12, CREW.H - 12, CREW.radius);
  ctx.fillStyle = ink.paper;
  ctx.fill();

  ctx.save();
  roundRectPath(ctx, 6, 6, CREW.W - 12, CREW.H - 12, CREW.radius);
  ctx.clip();

  /* ---- top strip ---- */
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ink.accent;
  ctx.font = `700 15px ${fonts.mono}`;
  tracked(ctx, "RESIDENT CREW", CREW.stub.x, CREW.topStrip.baseline, 4.5, "left");

  /* the lanyard slot, punched like the solo card's */
  roundRectPath(
    ctx,
    CREW.W / 2 - CREW.lanyard.w / 2,
    CREW.lanyard.y,
    CREW.lanyard.w,
    CREW.lanyard.h,
    CREW.lanyard.h / 2,
  );
  ctx.fillStyle = ink.ink;
  ctx.fill();

  drawStamp(ctx, ink, fonts);
  dashedLine(ctx, CREW.stub.x, CREW.topStrip.ruleY, 1010, CREW.topStrip.ruleY, ink.soft);

  /* ---- the perforation between stub and crew ---- */
  dashedLine(
    ctx,
    CREW.perforation.x,
    CREW.perforation.top,
    CREW.perforation.x,
    CREW.perforation.bottom,
    ink.soft,
  );

  /* ---- left stub: the motto column ---- */
  ctx.fillStyle = ink.accent;
  ctx.font = `700 22px ${fonts.mono}`;
  ctx.fillText("✳", CREW.motto.x, CREW.motto.y - 30);

  ctx.fillStyle = ink.ink;
  ctx.font = `500 13px ${fonts.mono}`;
  for (const [i, line] of ["LESS", "NOISE.", "MORE", "SIGNAL."].entries()) {
    tracked(ctx, line, CREW.motto.x, CREW.motto.y + i * CREW.motto.leading, 2, "left");
  }
  ctx.strokeStyle = "#e2a90f";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(CREW.motto.x, CREW.motto.y + 34);
  ctx.lineTo(CREW.motto.x + 58, CREW.motto.y + 34);
  ctx.stroke();

  /* ---- left stub: the team name, set like the solo card's ---- */
  const parts = crew.team.toUpperCase().trim().split(/\s+/).filter(Boolean);
  const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] || "CREW";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";

  const fit1 = fitLine(ctx, first, fonts.display, CREW.team.line1.cap, CREW.stub.maxWidth);
  ctx.fillStyle = ink.ink;
  if (ink.glow) {
    ctx.shadowColor = "rgba(140,255,225,0.35)";
    ctx.shadowBlur = 14;
  }
  drawFitted(ctx, first, CREW.stub.x, CREW.team.line1.baseline, fit1);
  ctx.shadowBlur = 0;

  if (last) {
    const fit2 = fitLine(ctx, last, fonts.display, CREW.team.line2.cap, CREW.stub.maxWidth);
    ctx.fillStyle = ink.accent;
    if (ink.glow) {
      ctx.shadowColor = "rgba(255,0,128,0.55)";
      ctx.shadowBlur = 22;
    }
    drawFitted(ctx, last, CREW.stub.x, CREW.team.line2.baseline, fit2);
    ctx.shadowBlur = 0;
  }

  ctx.drawImage(assets.badge, CREW.badge.x, CREW.badge.y, CREW.badge.w, CREW.badge.h);

  /* ---- left stub: the pass number ---- */
  ctx.fillStyle = ink.soft;
  ctx.font = `500 12px ${fonts.mono}`;
  tracked(ctx, "PASS NO.", CREW.stub.x, CREW.passLabelBaseline, 3.4, "left");

  ctx.fillStyle = ink.accent;
  ctx.font = `700 38px ${fonts.mono}`;
  tracked(ctx, crew.passNo, CREW.stub.x, CREW.passValueBaseline, 2, "left");

  ctx.fillStyle = ink.soft;
  ctx.font = `500 12px ${fonts.mono}`;
  tracked(
    ctx,
    `${crew.members.length} BUILDERS · ONE FRAME`,
    CREW.stub.x,
    CREW.crewOfBaseline,
    2.4,
    "left",
  );

  /* ---- right: the illustrated band ---- */
  ctx.save();
  roundRectPath(ctx, CREW.band.x, CREW.band.y, CREW.band.w, CREW.band.h, CREW.band.radius);
  ctx.clip();
  if (plates) {
    drawCover(ctx, plates[layer], CREW.band.x, CREW.band.y, CREW.band.w, CREW.band.h);
  } else {
    /* fallback while the crew art isn't in the checkout: the solo day plate */
    drawCover(ctx, assets.plates.day, CREW.band.x, CREW.band.y, CREW.band.w, CREW.band.h);
  }
  ctx.restore();

  roundRectPath(ctx, CREW.band.x, CREW.band.y, CREW.band.w, CREW.band.h, CREW.band.radius);
  ctx.strokeStyle = ink.ink;
  ctx.lineWidth = 2;
  ctx.stroke();

  /* ---- the printed windows, on the band ---- */
  const n = crew.members.length;
  const total = n * CREW_TILE_W + (n - 1) * CREW.window.gap;
  let x = CREW.band.x + (CREW.band.w - total) / 2;

  for (const [i, member] of crew.members.entries()) {
    drawCrewWindow(
      ctx,
      x,
      CREW.window.y,
      CREW_TILE_W,
      CREW.window.h,
      photos[i] ?? null,
      initialsOf(member.name),
      member.tier,
      ink,
      fonts,
    );

    const cx = x + CREW_TILE_W / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = ink.ink;
    fitMono(ctx, member.name.toUpperCase(), fonts.mono, 700, 21, 1.5, CREW_TILE_W, 12);
    tracked(ctx, member.name.toUpperCase(), cx, CREW.memberNameBaseline, 1.5, "center");

    /* the class runs long — two lines beats shrinking it into illegibility */
    ctx.fillStyle = ink.accent;
    ctx.font = `500 13px ${fonts.mono}`;
    const lines = wrapTracked(ctx, member.builderClass, 1.4, CREW_TILE_W, 2);
    for (const [li, line] of lines.entries()) {
      tracked(
        ctx,
        line,
        cx,
        CREW.memberClassBaseline + li * CREW.memberClassLeading,
        1.4,
        "center",
      );
    }

    x += CREW_TILE_W + CREW.window.gap;
  }

  /* ---- footer ---- */
  ctx.strokeStyle = "#e2a90f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CREW.band.x, CREW.ruleY);
  ctx.lineTo(CREW.W - 52, CREW.ruleY);
  ctx.stroke();

  const footerCx = CREW.band.x + CREW.band.w / 2;

  if (layer === "night") {
    /* the blacklight line takes the date's place — the payoff for tilting, and
       the reason the crew pass earns three printings rather than one */
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 19px ${fonts.mono}`;
    ctx.fillStyle = "#ff2d9b";
    ctx.shadowColor = "#ff0080";
    ctx.shadowBlur = 20;
    tracked(ctx, crew.secret, footerCx, CREW.footerBaseline, 3, "center");
    ctx.shadowBlur = 8;
    tracked(ctx, crew.secret, footerCx, CREW.footerBaseline, 3, "center");
    ctx.shadowBlur = 0;
  } else {
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `500 15px ${fonts.mono}`;
    ctx.fillStyle = ink.soft;
    tracked(ctx, "✳  28 – 31 OCT 2026  ✳", footerCx, CREW.footerBaseline, 3, "center");
  }

  ctx.textAlign = "right";
  ctx.fillStyle = ink.accent;
  ctx.font = `700 17px ${fonts.mono}`;
  tracked(ctx, "#FrameInGoa", CREW.W - 52, CREW.footerBaseline, 1.6, "right");

  ctx.restore();
  ctx.restore();
}

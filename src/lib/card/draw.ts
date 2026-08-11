import type { MintedPass } from "@/lib/builder";
import type { CardAssets } from "./assets";
import { BADGE, INK, NAME, PLATE_H, PLATE_W, ROW, SECRET, WINDOW } from "./layout";
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
 * Inset so the plate's own pink keyline stays visible — the photo sits *within*
 * the frame rather than covering it.
 */
function drawPhoto(
  ctx: CanvasRenderingContext2D,
  photo: PhotoSource | null,
  layer: LayerName,
) {
  const inset = 9;
  const x = WINDOW.x + inset;
  const y = WINDOW.y + inset;
  const w = WINDOW.w - inset * 2;
  const h = WINDOW.h - inset * 2;

  ctx.save();
  roundRectPath(ctx, x, y, w, h, 18);
  ctx.clip();

  if (photo) {
    ctx.drawImage(photo.image, photo.sx, photo.sy, photo.sw, photo.sh, x, y, w, h);

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

/** STACK / SEAT / GATE, labels and values both — the plates carry neither. */
function drawDataRow(
  ctx: CanvasRenderingContext2D,
  pass: MintedPass,
  layer: LayerName,
  fonts: Fonts,
) {
  const values =
    layer === "sunrise"
      ? [pass.stack.toUpperCase(), "HH 247", pass.gate]
      : layer === "night"
        ? [pass.stack.toUpperCase(), `${pass.seat} / 247`, "UV"]
        : [pass.stack.toUpperCase(), `${pass.seat} / 247`, pass.gate];

  const labels =
    layer === "sunrise" ? ["STACK", "FLIGHT", "GATE"] : layer === "night"
      ? ["STACK", "SEAT", "CLEARANCE"]
      : ["STACK", "SEAT", "GATE"];

  /* all three plates print a light bottom panel (measured luma 211/203/170),
     so the strip is dark ink on every layer — night included */
  const ink = INK.green;
  const accent = INK.pink;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  for (const [i, label] of labels.entries()) {
    const cx = ROW.columns[i];

    ctx.fillStyle = "rgba(13,59,46,0.72)";
    ctx.font = `700 ${ROW.labelSize}px ${fonts.mono}`;
    tracked(ctx, label, cx, ROW.labelBaseline, 3.4, "center");

    /* the middle column is the one the design sets in pink */
    ctx.fillStyle = i === 1 ? accent : ink;
    const maxW = ROW.widths[i];
    let size = ROW.valueSize;
    ctx.font = `700 ${size}px ${fonts.mono}`;
    while (trackedWidth(ctx, values[i], 1.5) > maxW && size > 16) {
      size -= 1;
      ctx.font = `700 ${size}px ${fonts.mono}`;
    }
    tracked(ctx, values[i], cx, ROW.valueBaseline, 1.5, "center");
  }

  ctx.strokeStyle = "rgba(13,59,46,0.32)";
  ctx.lineWidth = 2;
  for (const x of ROW.dividers) {
    ctx.beginPath();
    ctx.moveTo(x, ROW.ruleTop);
    ctx.lineTo(x, ROW.ruleBottom);
    ctx.stroke();
  }
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

  drawDataRow(ctx, pass, layer, fonts);
  if (layer === "night") drawSecret(ctx, pass, fonts);

  ctx.restore();
}

import type { MintedCrew, MintedPass, Tier } from "@/lib/builder";
import type { CardAssets } from "./assets";
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

/** Greedy wrap to at most `maxLines`, ellipsising whatever won't fit. */
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

  /* the last line still has to fit — shed characters rather than overrun */
  const last = lines.length - 1;
  if (last >= 0) {
    while (lines[last].length > 1 && trackedWidth(ctx, lines[last], spacing) > maxWidth) {
      lines[last] = lines[last].slice(0, -1);
    }
  }
  return lines;
}

/** Set a mono line at the largest size that fits, then centre it. */
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

/**
 * One member's photo, in the printed tile.
 *
 * Same treatment as the solo window — cream ground, pink keyline, photo inset so
 * the keyline survives — because a crew tile is the same object as a solo photo
 * window, just smaller and repeated. Without a photo the tile prints initials,
 * which keeps the row from collapsing into a hole while someone is still
 * uploading.
 */
function drawCrewTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  photo: PhotoSource | null,
  initials: string,
  tier: Tier,
  fonts: Fonts,
) {
  ctx.save();

  roundRectPath(ctx, x, y, w, h, CREW.tile.radius);
  ctx.fillStyle = "rgba(242,230,207,0.94)";
  ctx.fill();

  ctx.save();
  roundRectPath(ctx, x + 6, y + 6, w - 12, h - 12, CREW.tile.radius - 4);
  ctx.clip();

  if (photo) {
    const iw = w - 12;
    const ih = h - 12;
    const scale = Math.max(iw / photo.sw, ih / photo.sh);
    const dw = photo.sw * scale;
    const dh = photo.sh * scale;
    ctx.drawImage(
      photo.image,
      photo.sx,
      photo.sy,
      photo.sw,
      photo.sh,
      x + 6 + (iw - dw) / 2,
      y + 6 + (ih - dh) / 2,
      dw,
      dh,
    );
  } else {
    ctx.fillStyle = "rgba(13,59,46,0.12)";
    ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
    ctx.fillStyle = "rgba(13,59,46,0.55)";
    ctx.font = `900 ${Math.round(h * 0.26)}px ${fonts.display}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials, x + w / 2, y + h / 2);
  }
  ctx.restore();

  /* the tier rides in the corner of the tile, the way a trading card prints it
     — there is no room for a chip between the tile and the name below it */
  const style = foilStyle(tier);
  if (style) {
    ctx.font = `700 13px ${fonts.mono}`;
    const label = tier;
    const cw = trackedWidth(ctx, label, 2.5) + 20;
    roundRectPath(ctx, x + 10, y + h - 34, cw, 24, 12);
    ctx.fillStyle = style.chipFill;
    ctx.fill();
    ctx.fillStyle = style.chipInk;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    tracked(ctx, label, x + 10 + cw / 2, y + h - 21, 2.5, "center");
  }

  roundRectPath(ctx, x, y, w, h, CREW.tile.radius);
  ctx.strokeStyle = style?.edge ?? INK.pink;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.restore();
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The combined team pass.
 *
 * hhgoa.com's task text asks for the generator to "bring your teammates into one
 * combined frame", which the single-person card cannot do. This is that card:
 * one header, one serial, one image, with each member keeping the builder class
 * their own inputs mint.
 *
 * It draws from the same canvas pipeline and the same plate art as the solo
 * card, so there is still exactly one renderer and the export cannot drift from
 * what's on screen.
 */
export function drawCrewCard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: {
    crew: MintedCrew;
    photos: (PhotoSource | null)[];
    fonts: Fonts;
    assets: CardAssets;
  },
) {
  const { crew, photos, fonts, assets } = opts;

  ctx.save();
  ctx.scale(width / CREW.W, height / CREW.H);

  /* ---- ground ---- */
  /* opaque first and never cut back into: transparency in an export renders as
     white bars on X, which is what scripts/flow.ts asserts against */
  ctx.fillStyle = "#08281d";
  ctx.fillRect(0, 0, CREW.W, CREW.H);

  ctx.save();
  ctx.globalAlpha = 0.26;
  /* Blurred, unlike the solo share scene's version of this backdrop. There the
     card covers the left half and hides the plate's own printed words; here
     nothing does, and at 2.6x they come through as legible text rather than
     texture. Safari before 17 ignores ctx.filter, which just leaves the
     unblurred art — the same thing scene.ts already ships. */
  ctx.filter = "blur(9px)";
  const coverH = CREW.H * 2.6;
  const coverW = coverH * (PLATE_W / PLATE_H);
  ctx.drawImage(
    assets.plates.day,
    (CREW.W - coverW) / 2,
    CREW.H * 0.5 - coverH * 0.42,
    coverW,
    coverH,
  );
  ctx.restore();

  ctx.fillStyle = "rgba(8,40,29,0.58)";
  ctx.fillRect(0, 0, CREW.W, CREW.H);

  ctx.strokeStyle = "rgba(242,230,207,0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(14, 14, CREW.W - 28, CREW.H - 28, 12);
  ctx.stroke();

  /* ---- header ---- */
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "rgba(242,230,207,0.75)";
  ctx.font = `700 13px ${fonts.mono}`;
  tracked(
    ctx,
    `HACKER HOUSE GOA · 28–31 OCT 2026 · CREW OF ${crew.members.length}`,
    CREW.margin,
    CREW.kickerBaseline,
    3.4,
    "left",
  );

  const team = crew.team.toUpperCase();
  const fit = fitLine(ctx, team, fonts.display, CREW.team.capHeight, CREW.team.maxWidth);
  ctx.fillStyle = "#f2e6cf";
  drawFitted(ctx, team, CREW.margin, CREW.team.baseline, fit);

  ctx.drawImage(assets.badge, CREW.badge.x, CREW.badge.y, CREW.badge.w, CREW.badge.h);

  /* ---- the roster ---- */
  const n = crew.members.length;
  const total = n * CREW_TILE_W + (n - 1) * CREW.tile.gap;
  let x = (CREW.W - total) / 2;

  for (const [i, member] of crew.members.entries()) {
    drawCrewTile(
      ctx,
      x,
      CREW.tile.top,
      CREW_TILE_W,
      CREW.tile.height,
      photos[i] ?? null,
      initialsOf(member.name),
      member.tier,
      fonts,
    );

    const cx = x + CREW_TILE_W / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f2e6cf";
    fitMono(ctx, member.name.toUpperCase(), fonts.mono, 700, 24, 1.5, CREW_TILE_W, 13);
    tracked(ctx, member.name.toUpperCase(), cx, CREW.memberNameBaseline, 1.5, "center");

    /* the class runs long — two lines beats shrinking it into illegibility */
    ctx.fillStyle = "#fee101";
    ctx.font = `500 15px ${fonts.mono}`;
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

    x += CREW_TILE_W + CREW.tile.gap;
  }

  /* ---- footer ---- */
  ctx.strokeStyle = "rgba(242,230,207,0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CREW.margin, CREW.ruleY);
  ctx.lineTo(CREW.W - CREW.margin, CREW.ruleY);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(242,230,207,0.6)";
  ctx.font = `400 15px ${fonts.mono}`;
  tracked(
    ctx,
    `PASS ${crew.serial} · ${n} BUILDERS · ONE FRAME`,
    CREW.margin,
    CREW.footerBaseline,
    2,
    "left",
  );

  ctx.textAlign = "right";
  ctx.fillStyle = "#fee101";
  ctx.font = `700 22px ${fonts.mono}`;
  tracked(ctx, "#FrameInGoa", CREW.W - CREW.margin, CREW.footerBaseline, 2, "right");

  ctx.restore();
}

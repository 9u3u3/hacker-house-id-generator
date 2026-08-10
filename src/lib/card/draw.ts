import type { MintedPass } from "@/lib/builder";
import { ARTIFACTS, drawArtifact } from "./artifacts";
import { drawSigil } from "./sigil";
import { bgAt, CARD_H, CARD_RADIUS, CARD_W, THEMES, type LayerName } from "./theme";

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
/* primitives                                                          */
/* ------------------------------------------------------------------ */

export function roundRect(
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
 * Canvas has `ctx.letterSpacing` now, but support is uneven enough that a
 * tracked headline silently collapsing would wreck the layout. Drawing glyph by
 * glyph costs nothing at this scale and renders identically everywhere.
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

  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (const c of chars) {
    ctx.fillText(c, cursor, y);
    cursor += ctx.measureText(c).width + spacing;
  }
  ctx.textAlign = prevAlign;
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

/** Shrink until it fits. Long names are the common case, not the edge case. */
export function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: string,
  startPx: number,
  maxWidth: number,
  minPx = 14,
) {
  let size = startPx;
  for (;;) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth || size <= minPx) break;
    size -= 1;
  }
  return size;
}

export function hairline(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y: number,
  x2: number,
  color: string,
  width = 1,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y + 0.5);
  ctx.lineTo(x2, y + 0.5);
  ctx.stroke();
  ctx.restore();
}

/**
 * Security engraving. Two summed sine families traced as one continuous path —
 * the same trick banknotes use, and it reads as "official" instantly while
 * being impossible to eyeball-forge in a screenshot.
 */
export function guilloche(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  seed: number,
) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 6);
  ctx.clip();

  ctx.strokeStyle = color;
  ctx.lineWidth = 0.7;

  const midY = y + h / 2;
  const a1 = 1.6 + (seed % 5) * 0.3;
  const a2 = 3.1 + ((seed >> 3) % 7) * 0.4;
  const phase = (seed % 360) * (Math.PI / 180);

  for (let band = 0; band < 9; band++) {
    const amp = (h / 2) * (0.32 + band * 0.07);
    const drift = band * 0.22;
    ctx.beginPath();
    for (let px = 0; px <= w; px += 2) {
      const t = (px / w) * Math.PI * 2;
      const yy =
        midY +
        Math.sin(t * a1 + phase + drift) * amp * 0.6 +
        Math.sin(t * a2 - phase * 1.7 + drift) * amp * 0.4;
      if (px === 0) ctx.moveTo(x + px, yy);
      else ctx.lineTo(x + px, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Repeated micro-printing. Illegible by design until you zoom — like real stock. */
function microtext(
  ctx: CanvasRenderingContext2D,
  phrase: string,
  x: number,
  y: number,
  w: number,
  fonts: Fonts,
  color: string,
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `400 6px ${fonts.mono}`;
  ctx.textBaseline = "middle";
  const unit = `${phrase}  ·  `;
  const unitW = ctx.measureText(unit).width;
  const reps = Math.ceil(w / unitW) + 1;
  ctx.save();
  roundRect(ctx, x, y - 5, w, 10, 0);
  ctx.clip();
  ctx.fillText(unit.repeat(reps), x, y);
  ctx.restore();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* scenery                                                             */
/* ------------------------------------------------------------------ */

/** Low sun sitting on the horizon, banded like the site's Sun rise asset. */
export function sunDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  bandGap = 9,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = color;

  /* solid above the band line */
  ctx.fillRect(cx - r, cy - r, r * 2, r * 0.85);

  /*
   * Paint the bands rather than erasing the gaps between them. `destination-out`
   * would cut straight through the card background as well as the sun, leaving
   * genuinely transparent stripes in the exported PNG — which X renders as
   * white bars across the card.
   */
  let yy = cy - r * 0.15;
  let gap = bandGap * 0.5;
  while (yy < cy + r) {
    const gapEnd = yy + gap * 0.62;
    const nextStart = yy + gap;
    ctx.fillRect(cx - r, gapEnd, r * 2, Math.max(0, nextStart - gapEnd));
    yy = nextStart;
    gap *= 1.16;
  }
  ctx.restore();
}

/** Palm silhouettes along the bottom edge — the site's footer trees, redrawn. */
export function palms(
  ctx: CanvasRenderingContext2D,
  baseY: number,
  color: string,
  seed: number,
  scale = 1,
) {
  const trees = [
    { x: 46, h: 112, lean: -0.17 },
    { x: 112, h: 78, lean: 0.12 },
    { x: 508, h: 122, lean: 0.15 },
    { x: 572, h: 84, lean: -0.1 },
  ];

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  for (const [i, t] of trees.entries()) {
    const h = t.h * scale;
    const topX = t.x + t.lean * h;
    const topY = baseY - h;

    /* Trunk: thick at the sand, thin at the crown. A near-constant width read
       as bamboo rather than palm. */
    const baseHalf = h * 0.036;
    const topHalf = h * 0.011;
    const bendX = t.x + t.lean * h * 0.45;
    ctx.beginPath();
    ctx.moveTo(t.x - baseHalf, baseY);
    ctx.quadraticCurveTo(bendX - topHalf * 2, baseY - h * 0.55, topX - topHalf, topY);
    ctx.lineTo(topX + topHalf, topY);
    ctx.quadraticCurveTo(bendX + baseHalf, baseY - h * 0.55, t.x + baseHalf, baseY);
    ctx.closePath();
    ctx.fill();

    /* Fronds: long, and they droop. The control point sits above the chord and
       the tip below it, which is what gives a palm its arc. */
    const fronds = 9;
    for (let f = 0; f < fronds; f++) {
      const spread = Math.PI * 1.55;
      const a = -Math.PI / 2 - spread / 2 + (spread / (fronds - 1)) * f;
      const wob = ((seed + i * 7 + f * 13) % 5) * 0.035;
      const len = h * (0.62 + wob);

      const dirX = Math.cos(a);
      const dirY = Math.sin(a);
      const tipX = topX + dirX * len;
      const tipY = topY + dirY * len * 0.55 + len * 0.34; /* gravity */
      const midX = topX + dirX * len * 0.5;
      const midY = topY + dirY * len * 0.72 - len * 0.05;

      const thick = Math.max(2, h * 0.05);
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.quadraticCurveTo(midX, midY, tipX, tipY);
      ctx.quadraticCurveTo(midX, midY + thick, topX, topY + thick);
      ctx.closePath();
      ctx.fill();
    }

    /* crown knot */
    ctx.beginPath();
    ctx.arc(topX, topY + 2, h * 0.028, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Horizon lines that stand in for surf. */
export function waves(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  color: string,
  rows = 5,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  for (let r = 0; r < rows; r++) {
    const yy = y + r * 9;
    const amp = 3 + r * 0.6;
    ctx.beginPath();
    for (let px = 0; px <= w; px += 3) {
      const yyy = yy + Math.sin((px / w) * Math.PI * 6 + r * 1.1) * amp;
      if (px === 0) ctx.moveTo(x + px, yyy);
      else ctx.lineTo(x + px, yyy);
    }
    ctx.globalAlpha = 1 - r * 0.14;
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* the card                                                            */
/* ------------------------------------------------------------------ */

const PAD = 46;
const PHOTO = { x: 140, y: 150, w: 340, h: 364 };

/**
 * All scenery lives in the band around the portrait window and stops at the
 * horizon. Everything below that line is typography on a flat wash — when
 * palms and micro-printing ran under the MRZ they read as dirt, not detail.
 */
const SCENE = { top: 118, horizon: 528 };

/** Two pieces of beach clutter, one per margin, picked from the pass seed. */
function drawArtifacts(
  ctx: CanvasRenderingContext2D,
  layer: LayerName,
  seed: number,
  color: string,
) {
  const left = ARTIFACTS[seed % ARTIFACTS.length];
  /* co-prime stride so the right side never repeats the left */
  const right = ARTIFACTS[(seed + 3 + (seed % 7)) % ARTIFACTS.length];

  /* interior detail is painted in the background colour at the sand line */
  const hole = bgAt(layer, SCENE.horizon / CARD_H);

  drawArtifact(ctx, left, 76, SCENE.horizon, 62, color, hole);
  drawArtifact(ctx, right === left ? "shell" : right, 546, SCENE.horizon, 62, color, hole);
}

function drawScenery(
  ctx: CanvasRenderingContext2D,
  layer: LayerName,
  seed: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, SCENE.top, CARD_W, SCENE.horizon - SCENE.top);
  ctx.clip();

  if (layer === "sunrise") {
    sunDisc(ctx, CARD_W / 2, 384, 190, "rgba(255,255,255,0.50)");
    waves(ctx, 0, 468, CARD_W, "rgba(74,31,5,0.20)", 5);
    palms(ctx, SCENE.horizon, "rgba(74,31,5,0.52)", seed, 1.7);
    drawArtifacts(ctx, "sunrise", seed, "rgba(74,31,5,0.74)");
  }

  if (layer === "day") {
    sunDisc(ctx, CARD_W / 2, 384, 190, "rgba(254,225,1,0.11)");
    waves(ctx, 0, 468, CARD_W, "rgba(255,251,232,0.16)", 5);
    palms(ctx, SCENE.horizon, "rgba(4,48,26,0.45)", seed, 1.7);
    drawArtifacts(ctx, "day", seed, "rgba(4,48,26,0.7)");
  }

  if (layer === "night") {
    /* moon instead of sun — same disc, no bands */
    ctx.save();
    ctx.fillStyle = "rgba(176,38,255,0.16)";
    ctx.beginPath();
    ctx.arc(CARD_W / 2, 384, 190, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    waves(ctx, 0, 468, CARD_W, "rgba(176,38,255,0.34)", 5);
    palms(ctx, SCENE.horizon, "rgba(255,0,128,0.58)", seed, 1.7);
    drawArtifacts(ctx, "night", seed, "rgba(255,0,128,0.8)");
  }

  ctx.restore();

  hairline(ctx, 0, SCENE.horizon, CARD_W, THEMES[layer].line, 1);
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  layer: LayerName,
  seed: number,
) {
  const t = THEMES[layer];

  const g = ctx.createLinearGradient(0, 0, 0, CARD_H);
  g.addColorStop(0, t.bgTop);
  g.addColorStop(1, t.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  if (layer === "night") {
    const halo = ctx.createRadialGradient(CARD_W / 2, 400, 40, CARD_W / 2, 400, 460);
    halo.addColorStop(0, "rgba(176,38,255,0.30)");
    halo.addColorStop(0.6, "rgba(176,38,255,0.09)");
    halo.addColorStop(1, "rgba(176,38,255,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  }

  drawScenery(ctx, layer, seed);

  /* engraving sits only under the lower data block, where it reads as security
     printing rather than as noise behind the portrait */
  const engrave =
    layer === "night"
      ? "rgba(255,0,128,0.22)"
      : layer === "sunrise"
        ? "rgba(74,31,5,0.10)"
        : "rgba(255,251,232,0.085)";
  guilloche(ctx, -30, 738, CARD_W + 60, 152, engrave, seed);
}

function drawLanyardSlot(ctx: CanvasRenderingContext2D, t: (typeof THEMES)[LayerName]) {
  const w = 132;
  const h = 20;
  const x = (CARD_W - w) / 2;
  const y = 40;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = t.line;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawTopRail(
  ctx: CanvasRenderingContext2D,
  layer: LayerName,
  fonts: Fonts,
) {
  const t = THEMES[layer];
  const y = 104;

  ctx.save();
  ctx.textBaseline = "middle";
  ctx.font = `700 13px ${fonts.mono}`;
  ctx.fillStyle = t.ink;
  tracked(ctx, "HACKER HOUSE", PAD, y, 3.4, "left");

  ctx.fillStyle = t.accent;
  const label = layer === "sunrise" ? "GENESIS" : layer === "night" ? "AFTER DARK" : "RESIDENT";
  tracked(ctx, label, CARD_W - PAD, y, 3.4, "right");
  ctx.restore();

  hairline(ctx, PAD, y + 18, CARD_W - PAD, THEMES[layer].line);
}

function drawPhoto(
  ctx: CanvasRenderingContext2D,
  photo: PhotoSource | null,
  layer: LayerName,
  fonts: Fonts,
) {
  const t = THEMES[layer];
  const { x, y, w, h } = PHOTO;

  ctx.save();
  /* notched corners: the window is cut, not just rounded */
  const n = 26;
  ctx.beginPath();
  ctx.moveTo(x + n, y);
  ctx.lineTo(x + w - n, y);
  ctx.lineTo(x + w, y + n);
  ctx.lineTo(x + w, y + h - n);
  ctx.lineTo(x + w - n, y + h);
  ctx.lineTo(x + n, y + h);
  ctx.lineTo(x, y + h - n);
  ctx.lineTo(x, y + n);
  ctx.closePath();

  ctx.save();
  ctx.clip();
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(x, y, w, h);

  if (photo) {
    ctx.drawImage(photo.image, photo.sx, photo.sy, photo.sw, photo.sh, x, y, w, h);

    /* Tint the portrait toward each layer's light, but keep it a face. Blend
       modes at full strength turned it into a flat silhouette, which killed the
       one thing the card is actually about. */
    if (layer === "sunrise") {
      ctx.globalCompositeOperation = "soft-light";
      const warm = ctx.createLinearGradient(0, y, 0, y + h);
      warm.addColorStop(0, "rgba(255,196,92,0.85)");
      warm.addColorStop(1, "rgba(224,86,31,0.75)");
      ctx.fillStyle = warm;
      ctx.fillRect(x, y, w, h);

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(255,150,40,0.14)";
      ctx.fillRect(x, y, w, h);
    }
    if (layer === "night") {
      ctx.globalCompositeOperation = "soft-light";
      ctx.fillStyle = "rgba(120,20,200,0.9)";
      ctx.fillRect(x, y, w, h);

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(90,20,160,0.30)";
      ctx.fillRect(x, y, w, h);
    }
    ctx.globalCompositeOperation = "source-over";
  } else {
    ctx.fillStyle = t.inkSoft;
    ctx.font = `400 13px ${fonts.mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    tracked(ctx, "NO PHOTO", x + w / 2, y + h / 2, 3, "center");
    ctx.textAlign = "left";
  }
  ctx.restore();

  ctx.strokeStyle = t.line;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  /* registration brackets — L-shapes at all four corners. Single strokes read
     as stray characters floating next to the photo. */
  ctx.save();
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "square";
  const off = 12;
  const arm = 22;
  const bx = x - off;
  const by = y - off;
  const bw = w + off * 2;
  const bh = h + off * 2;
  const brackets: [number, number, number, number][] = [
    [bx, by, 1, 1],
    [bx + bw, by, -1, 1],
    [bx, by + bh, 1, -1],
    [bx + bw, by + bh, -1, -1],
  ];
  for (const [px, py, dx, dy] of brackets) {
    ctx.beginPath();
    ctx.moveTo(px + dx * arm, py);
    ctx.lineTo(px, py);
    ctx.lineTo(px, py + dy * arm);
    ctx.stroke();
  }
  ctx.restore();
}

function drawIdentity(
  ctx: CanvasRenderingContext2D,
  pass: MintedPass,
  layer: LayerName,
  fonts: Fonts,
) {
  const t = THEMES[layer];
  const cx = CARD_W / 2;
  const maxW = CARD_W - PAD * 2;

  /* name — the hero, in Imbue */
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const nameUpper = pass.name.toUpperCase();
  fitFont(ctx, nameUpper, fonts.display, "700", 74, maxW, 26);
  ctx.fillStyle = t.ink;
  if (layer === "night" && t.glow) {
    ctx.shadowColor = t.glow;
    ctx.shadowBlur = 22;
  }
  ctx.fillText(nameUpper, cx, 602);
  ctx.restore();

  /* builder class — the generated title, in a pill */
  ctx.save();
  ctx.font = `700 15px ${fonts.mono}`;
  const clsW = trackedWidth(ctx, pass.builderClass, 2.6);
  const pillW = Math.min(clsW + 44, maxW);
  const pillH = 34;
  const pillX = cx - pillW / 2;
  const pillY = 622;

  ctx.fillStyle = t.accent;
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  if (layer === "night" && t.glow) {
    ctx.shadowColor = t.accent;
    ctx.shadowBlur = 18;
  }
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.save();
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.clip();
  ctx.fillStyle = t.onAccent;
  ctx.textBaseline = "middle";
  tracked(ctx, pass.builderClass, cx, pillY + pillH / 2 + 1, 2.6, "center");
  ctx.restore();
  ctx.restore();

  /* stack */
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.fillStyle = t.inkSoft;
  ctx.font = `400 11px ${fonts.mono}`;
  tracked(ctx, "STACK", cx, 690, 3, "center");

  ctx.fillStyle = t.ink;
  const stackUpper = pass.stack.toUpperCase();
  fitFont(ctx, stackUpper, fonts.mono, "400", 17, maxW - 20, 10);
  tracked(ctx, stackUpper, cx, 714, 1.6, "center");
  ctx.restore();
}

/** The three-up data strip. Its middle column is what changes per layer. */
function drawDataRow(
  ctx: CanvasRenderingContext2D,
  pass: MintedPass,
  layer: LayerName,
  fonts: Fonts,
) {
  const t = THEMES[layer];
  const y = 762;

  /* a null value means "draw the sigil here instead of text" */
  const cells: [string, string | null][] =
    layer === "sunrise"
      ? [
          ["FLIGHT", "HH 247"],
          ["ROUTE", "BLR → GOI"],
          ["GATE", pass.gate],
        ]
      : layer === "night"
        ? [
            ["SEAT", pass.seat],
            ["CLEARANCE", "UV"],
            ["SIGIL", null],
          ]
        : [
            ["SERIAL", pass.serial.replace("HHG-", "")],
            ["SEAT", `${pass.seat} / 247`],
            ["GATE", pass.gate],
          ];

  hairline(ctx, PAD, y - 14, CARD_W - PAD, t.line);

  const colW = (CARD_W - PAD * 2) / 3;
  ctx.save();
  ctx.textBaseline = "middle";
  for (const [i, [label, value]] of cells.entries()) {
    const cx = PAD + colW * i + colW / 2;

    ctx.fillStyle = t.inkSoft;
    ctx.font = `400 9.5px ${fonts.mono}`;
    tracked(ctx, label, cx, y + 6, 2.4, "center");

    if (value === null) {
      drawSigil(ctx, pass.sigil, cx, y + 30, 26, t.ink, t.glow);
    } else {
      ctx.fillStyle = i === 1 ? t.accent : t.ink;
      ctx.font = `700 17px ${fonts.mono}`;
      tracked(ctx, value, cx, y + 30, 1.4, "center");
    }

    if (i < 2) {
      ctx.save();
      ctx.strokeStyle = t.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD + colW * (i + 1) + 0.5, y - 2);
      ctx.lineTo(PAD + colW * (i + 1) + 0.5, y + 40);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();

  hairline(ctx, PAD, y + 52, CARD_W - PAD, t.line);
}

/**
 * The slot that pays off the tilt. On day it's micro-printed hashtag filler; on
 * night the blacklight brings up the line that was hiding in it.
 */
function drawSecretSlot(
  ctx: CanvasRenderingContext2D,
  pass: MintedPass,
  layer: LayerName,
  fonts: Fonts,
) {
  const t = THEMES[layer];
  const y = 846;

  if (layer === "night") {
    ctx.save();
    ctx.textBaseline = "middle";
    ctx.fillStyle = t.ink;
    ctx.font = `700 15px ${fonts.mono}`;
    if (t.glow) {
      ctx.shadowColor = t.glow;
      ctx.shadowBlur = 16;
    }
    tracked(ctx, pass.secret, CARD_W / 2, y, 2.2, "center");
    ctx.restore();
    return;
  }

  if (layer === "sunrise") {
    ctx.save();
    ctx.textBaseline = "middle";
    ctx.fillStyle = t.inkSoft;
    ctx.font = `400 12px ${fonts.mono}`;
    tracked(ctx, "BOARDING 28 OCT 2026 · 05:47 IST", CARD_W / 2, y, 2, "center");
    ctx.restore();
    return;
  }

  /* The secret is literally hiding in here: on the day layer this slot is just
     micro-printed hashtag filler, and the blacklight brings the line up out of
     it. One row, not two — stacked microtext read as a smudge. */
  microtext(
    ctx,
    "#FrameInGoa",
    PAD,
    y,
    CARD_W - PAD * 2,
    fonts,
    "rgba(255,251,232,0.34)",
  );
}

/** Passport-shaped machine-readable zone along the bottom edge. */
function drawMrz(
  ctx: CanvasRenderingContext2D,
  pass: MintedPass,
  layer: LayerName,
  fonts: Fonts,
) {
  const t = THEMES[layer];
  const y = 886;
  const h = 56;

  ctx.save();
  ctx.fillStyle =
    layer === "night" ? "rgba(176,38,255,0.12)" : "rgba(0,0,0,0.18)";
  roundRect(ctx, PAD - 10, y - 8, CARD_W - PAD * 2 + 20, h, 8);
  ctx.fill();

  ctx.textBaseline = "middle";
  ctx.fillStyle = t.ink;
  const size = fitFont(
    ctx,
    pass.mrz[0],
    fonts.mono,
    "400",
    13,
    CARD_W - PAD * 2,
    8,
  );
  ctx.globalAlpha = 0.85;
  ctx.font = `400 ${size}px ${fonts.mono}`;
  ctx.fillText(pass.mrz[0], PAD, y + 12);
  ctx.fillText(pass.mrz[1], PAD, y + 34);
  ctx.restore();
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  layer: LayerName,
  fonts: Fonts,
) {
  const t = THEMES[layer];
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.fillStyle = t.inkSoft;
  ctx.font = `400 10px ${fonts.mono}`;
  tracked(ctx, "GOA, INDIA · 28–31 OCT 2026", CARD_W / 2, 962, 2.6, "center");
  ctx.restore();
}

/** Edge treatment: a bright inner keyline so the card reads as laminated stock. */
function drawEdge(ctx: CanvasRenderingContext2D, layer: LayerName) {
  const t = THEMES[layer];
  ctx.save();
  roundRect(ctx, 1, 1, CARD_W - 2, CARD_H - 2, CARD_RADIUS - 1);
  ctx.strokeStyle = t.accent;
  ctx.globalAlpha = layer === "night" ? 0.9 : 0.55;
  ctx.lineWidth = 2;
  ctx.stroke();

  roundRect(ctx, 9, 9, CARD_W - 18, CARD_H - 18, CARD_RADIUS - 8);
  ctx.globalAlpha = layer === "night" ? 0.35 : 0.22;
  ctx.lineWidth = 1;
  ctx.stroke();
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
  },
) {
  const { pass, photo, layer, fonts } = opts;
  const seed = [...pass.serial].reduce((a, c) => a + c.charCodeAt(0), 0);

  /* Deliberately no clearRect: this also draws into the share scene, where
     wiping the card's bounding box would punch a transparent rectangle
     through the backdrop. Callers rendering onto a reused standalone canvas
     clear it themselves. */
  ctx.save();
  ctx.scale(width / CARD_W, height / CARD_H);

  /* everything is authored inside the rounded card silhouette */
  roundRect(ctx, 0, 0, CARD_W, CARD_H, CARD_RADIUS);
  ctx.clip();

  drawBackground(ctx, layer, seed);
  drawLanyardSlot(ctx, THEMES[layer]);
  drawTopRail(ctx, layer, fonts);
  drawPhoto(ctx, photo, layer, fonts);
  drawIdentity(ctx, pass, layer, fonts);
  drawDataRow(ctx, pass, layer, fonts);
  drawSecretSlot(ctx, pass, layer, fonts);
  drawMrz(ctx, pass, layer, fonts);
  drawFooter(ctx, layer, fonts);
  drawEdge(ctx, layer);

  ctx.restore();
}

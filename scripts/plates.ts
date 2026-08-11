/**
 * Turns the raw design exports into normalised plates the renderer can use.
 *
 * The three designs were produced independently, so nothing about them lines
 * up: photo windows differ by up to 26px of offset and 10% of scale, and so do
 * the cards' own printed edges.
 *
 * Only one of those can be made exact, because a scale-and-translate has just
 * enough freedom to pin one rectangle. Registering on the photo window was the
 * wrong call: it left each card's border at a different size, which is the one
 * mismatch nobody can miss — the sunrise border scaled past the canvas and got
 * cropped, the night one sat 23px inside it, and tilting between them visibly
 * resized the whole card.
 *
 * So the border is the anchor, and the window is what gives. The renderer gets
 * a per-layer window rect and draws the photo into whichever one it's on, so
 * the photo still sits correctly inside its printed frame on every plate; what
 * moves instead is a few pixels of photo position mid-tilt, behind a frame that
 * no longer moves at all.
 *
 *   bun run scripts/plates.ts
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(new URL(".", import.meta.url).pathname, "..");
const IN = join(ROOT, "public/plates/incoming");
const OUT = join(ROOT, "public/plates");

/** Reference first: everything is normalised onto the day plate's geometry. */
const SOURCES = [
  { name: "day", file: "upload-03" },
  { name: "sunrise", file: "upload-02" },
  { name: "night", file: "upload-01" },
] as const;

type Rect = { x: number; y: number; w: number; h: number };

function ctxOf(img: Image, w: number, h: number) {
  const c = createCanvas(w, h);
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, w, h);
  return { canvas: c, g, data: g.getImageData(0, 0, w, h).data };
}

function luma(data: Uint8ClampedArray, w: number, h: number) {
  const l = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    l[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return l;
}

/**
 * Locate the printed photo window.
 *
 * Colour-based detection fails on the holographic plate, where the pink border
 * washes out against pastel. Edge energy is colour-agnostic: the window's
 * borders are the strongest straight lines in the middle of the card.
 */
function findWindow(data: Uint8ClampedArray, W: number, H: number): Rect {
  const l = luma(data, W, H);

  const vx = new Float64Array(W);
  for (let y = Math.round(H * 0.34); y < Math.round(H * 0.76); y++) {
    for (let x = 2; x < W - 2; x++) vx[x] += Math.abs(l[y * W + x + 2] - l[y * W + x - 2]);
  }
  const hy = new Float64Array(H);
  for (let x = Math.round(W * 0.36); x < Math.round(W * 0.64); x++) {
    for (let y = 2; y < H - 2; y++) hy[y] += Math.abs(l[(y + 2) * W + x] - l[(y - 2) * W + x]);
  }

  const peak = (arr: Float64Array, lo: number, hi: number) => {
    let bi = lo;
    let bv = -1;
    for (let i = lo; i < hi; i++) if (arr[i] > bv) [bv, bi] = [arr[i], i];
    return bi;
  };

  const L = peak(vx, Math.round(W * 0.25), Math.round(W * 0.45));
  const R = peak(vx, Math.round(W * 0.55), Math.round(W * 0.75));
  const T = peak(hy, Math.round(H * 0.32), Math.round(H * 0.48));
  const B = peak(hy, Math.round(H * 0.64), Math.round(H * 0.80));
  return { x: L, y: T, w: R - L, h: B - T };
}

/** The artwork sits on a dark surround; find where it starts. */
function findCard(data: Uint8ClampedArray, W: number, H: number) {
  const dark = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return data[i] + data[i + 1] + data[i + 2] < 150;
  };
  const rowFrac = (y: number) => {
    let d = 0;
    for (let x = 0; x < W; x += 2) if (dark(x, y)) d++;
    return d / (W / 2);
  };
  const colFrac = (x: number) => {
    let d = 0;
    for (let y = 0; y < H; y += 2) if (dark(x, y)) d++;
    return d / (H / 2);
  };
  const LIMIT = 0.9;
  let top = 0;
  while (top < H * 0.1 && rowFrac(top) > LIMIT) top++;
  let bottom = H - 1;
  while (bottom > H * 0.9 && rowFrac(bottom) > LIMIT) bottom--;
  let left = 0;
  while (left < W * 0.1 && colFrac(left) > LIMIT) left++;
  let right = W - 1;
  while (right > W * 0.9 && colFrac(right) > LIMIT) right--;
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

/* ------------------------------------------------------------------ */

const plates = await Promise.all(
  SOURCES.map(async (s) => {
    const img = await loadImage(join(IN, `${s.file}.png`));
    const { data } = ctxOf(img, img.width, img.height);
    return {
      ...s,
      img,
      W: img.width,
      H: img.height,
      card: findCard(data, img.width, img.height),
      win: findWindow(data, img.width, img.height),
    };
  }),
);

for (const p of plates) {
  console.log(
    `${p.name.padEnd(8)} ${p.W}x${p.H}  card=${p.card.w}x${p.card.h}@${p.card.x},${p.card.y}  window=${p.win.w}x${p.win.h}@${p.win.x},${p.win.y}`,
  );
}

/* Canonical space = the day plate's card, at its own pixel size. Every plate is
   mapped onto it, so all three fill the output exactly and the border is
   identical across layers by construction. */
const ref = plates[0];
const OUT_W = ref.card.w;
const OUT_H = ref.card.h;
console.log(`\ncanonical plate ${OUT_W}x${OUT_H} (from the ${ref.name} card border)`);

const windows: Record<string, Rect> = {};

for (const p of plates) {
  const sx = OUT_W / p.card.w;
  const sy = OUT_H / p.card.h;
  const tx = -p.card.x * sx;
  const ty = -p.card.y * sy;

  const out = createCanvas(OUT_W, OUT_H);
  const g = out.getContext("2d");
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(p.img, tx, ty, p.W * sx, p.H * sy);

  /* WebP, not PNG: these are photographic illustrations, and three lossless
     plates came to 7.7MB — far too heavy to ship to a phone. Quality 82 puts
     them around 5% of that with no visible difference at card size. */
  const webp = out.toBuffer("image/webp", 82);
  writeFileSync(join(OUT, `${p.name}.webp`), webp);

  windows[p.name] = {
    x: Math.round(p.win.x * sx + tx),
    y: Math.round(p.win.y * sy + ty),
    w: Math.round(p.win.w * sx),
    h: Math.round(p.win.h * sy),
  };

  console.log(
    `  ${p.name.padEnd(8)} scale ${sx.toFixed(4)}x${sy.toFixed(4)} ` +
      `${(webp.length / 1024).toFixed(0)}KB`,
  );
}

/* What the renderer needs: the plate size, and where each layer prints its
   window. The spread across layers is the price of anchoring on the border. */
console.log(`\nPLATE_W = ${OUT_W}; PLATE_H = ${OUT_H};`);
console.log("WINDOWS = {");
for (const [name, w] of Object.entries(windows)) {
  console.log(`  ${name}: { x: ${w.x}, y: ${w.y}, w: ${w.w}, h: ${w.h} },`);
}
console.log("};");

const xs = Object.values(windows);
const spread = (k: keyof Rect) =>
  Math.max(...xs.map((w) => w[k])) - Math.min(...xs.map((w) => w[k]));
console.log(
  `\nwindow spread across layers: x±${spread("x")} y±${spread("y")} ` +
    `w±${spread("w")} h±${spread("h")}`,
);

/**
 * Reads the original (un-cleaned) designs to recover where every piece of text
 * sat, expressed in normalised plate coordinates.
 *
 * The cleaned plates have the text removed, so the originals are the only
 * record of the intended layout. They're warped through the same
 * window-anchored transform as the plates, so measurements land in the same
 * coordinate space the renderer draws in.
 *
 *   bun run scripts/measure.ts
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(new URL(".", import.meta.url).pathname, "..");
const IN = join(ROOT, "public/plates/incoming");

/* must match scripts/plates.ts */
const PLATE_W = 948;
const PLATE_H = 1477;
const WIN = { x: 300, y: 577, w: 333, h: 499 };

type Rect = { x: number; y: number; w: number; h: number };

function luma(d: Uint8ClampedArray, w: number, h: number) {
  const l = new Float32Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    l[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  return l;
}

function findWindow(data: Uint8ClampedArray, W: number, H: number): Rect {
  const l = luma(data, W, H);
  const vx = new Float64Array(W);
  for (let y = Math.round(H * 0.34); y < Math.round(H * 0.76); y++)
    for (let x = 2; x < W - 2; x++) vx[x] += Math.abs(l[y * W + x + 2] - l[y * W + x - 2]);
  const hy = new Float64Array(H);
  for (let x = Math.round(W * 0.36); x < Math.round(W * 0.64); x++)
    for (let y = 2; y < H - 2; y++) hy[y] += Math.abs(l[(y + 2) * W + x] - l[(y - 2) * W + x]);
  const peak = (a: Float64Array, lo: number, hi: number) => {
    let bi = lo;
    let bv = -1;
    for (let i = lo; i < hi; i++) if (a[i] > bv) [bv, bi] = [a[i], i];
    return bi;
  };
  const L = peak(vx, Math.round(W * 0.25), Math.round(W * 0.45));
  const R = peak(vx, Math.round(W * 0.55), Math.round(W * 0.75));
  const T = peak(hy, Math.round(H * 0.32), Math.round(H * 0.48));
  const B = peak(hy, Math.round(H * 0.64), Math.round(H * 0.80));
  return { x: L, y: T, w: R - L, h: B - T };
}

/** Warp an original into the normalised plate space, anchored on its window. */
async function normalise(file: string) {
  const img = await loadImage(join(IN, `${file}.png`));
  const probe = createCanvas(img.width, img.height);
  const pg = probe.getContext("2d");
  pg.drawImage(img, 0, 0);
  const win = findWindow(
    pg.getImageData(0, 0, img.width, img.height).data,
    img.width,
    img.height,
  );

  const sx = WIN.w / win.w;
  const sy = WIN.h / win.h;
  const tx = WIN.x - win.x * sx;
  const ty = WIN.y - win.y * sy;

  const out = createCanvas(PLATE_W, PLATE_H);
  const g = out.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(img, tx, ty, img.width * sx, img.height * sy);
  return { canvas: out, g, data: g.getImageData(0, 0, PLATE_W, PLATE_H).data };
}

/** Bounding box of pixels passing a colour test, inside a search band. */
function bbox(
  data: Uint8ClampedArray,
  test: (r: number, g: number, b: number) => boolean,
  band: { x0: number; x1: number; y0: number; y1: number },
  minCount = 40,
): Rect | null {
  let minX = 1e9;
  let minY = 1e9;
  let maxX = -1;
  let maxY = -1;
  let n = 0;
  for (let y = band.y0; y < band.y1; y++) {
    for (let x = band.x0; x < band.x1; x++) {
      const i = (y * PLATE_W + x) * 4;
      if (test(data[i], data[i + 1], data[i + 2])) {
        n++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (n < minCount) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

const pct = (r: Rect) =>
  `x ${((r.x / PLATE_W) * 100).toFixed(2)}%  y ${((r.y / PLATE_H) * 100).toFixed(2)}%  ` +
  `w ${((r.w / PLATE_W) * 100).toFixed(2)}%  h ${((r.h / PLATE_H) * 100).toFixed(2)}%`;

const show = (label: string, r: Rect | null) =>
  console.log(
    r
      ? `${label.padEnd(16)} ${String(r.x).padStart(4)},${String(r.y).padStart(4)} ` +
        `${String(r.w).padStart(4)}x${String(r.h).padStart(4)}   ${pct(r)}`
      : `${label.padEnd(16)} not found`,
  );

/* ------------------------------------------------------------------ */

const day = await normalise("upload-06"); /* original, cream/day */
const d = day.data;

const band = (y0: number, y1: number, x0 = 0, x1 = PLATE_W) => ({
  x0,
  x1,
  y0: Math.round(PLATE_H * y0),
  y1: Math.round(PLATE_H * y1),
});

/* the headline: dark bottle-green over cream */
const darkGreen = (r: number, g: number, b: number) =>
  r < 90 && g < 110 && b < 100 && g >= r - 10 && Math.max(r, g, b) - Math.min(r, g, b) < 70;
/* BUILDER and the accents: hot pink */
const pink = (r: number, g: number, b: number) =>
  r > 150 && g < 100 && b > 70 && b < 190 && r - g > 70;
/* the गोवा badge: saturated gold */
const gold = (r: number, g: number, b: number) =>
  r > 175 && g > 130 && b < 110 && r - b > 90 && g - b > 50;

/* the left column ("LESS NOISE. MORE SIGNAL." and its gold rule) is the same
   ink as the headline, so start the search past it */
const HEAD_X0 = 140;
const line1 = bbox(d, darkGreen, band(0.10, 0.215, HEAD_X0));
const line2 = bbox(d, pink, band(0.20, 0.325, HEAD_X0));
const badge = bbox(d, gold, band(0.14, 0.28, HEAD_X0));
const rowAll = bbox(
  d,
  (r, g, b) => darkGreen(r, g, b) || pink(r, g, b),
  band(0.855, 0.935),
);

show("headline line1", line1);
show("headline line2", line2);
show("goa badge", badge);
show("bottom row all", rowAll);
show("row labels", bbox(d, darkGreen, band(0.855, 0.888)));
show("row values", bbox(d, (r, g, b) => darkGreen(r, g, b) || pink(r, g, b), band(0.888, 0.935)));
show("seat value", bbox(d, pink, band(0.888, 0.935)));
show("window (anchor)", WIN);

/* annotated overlay so the numbers can be eyeballed */
const g = day.g;
g.strokeStyle = "#00ffff";
g.lineWidth = 2;
for (const r of [line1, line2, badge, rowAll, WIN]) {
  if (r) g.strokeRect(r.x, r.y, r.w, r.h);
}
writeFileSync(join(ROOT, ".preview/measured.png"), day.canvas.toBuffer("image/png"));
console.log("\nwrote .preview/measured.png");

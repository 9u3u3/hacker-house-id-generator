/**
 * Cuts the गोवा badge out of the original design so it can be composited above
 * the name lockup.
 *
 * It has to be a separate asset: in the design it overlaps the headline, so it
 * must paint after the name, and the cleaned plates therefore have it removed.
 *
 * The badge is a scalloped gold shape — a rectangular crop would show a slab of
 * cream around it. So the background is removed by flooding inward from the
 * crop border: anything reachable from the edge that stays close to the
 * background colour becomes transparent, which follows the scallops exactly
 * without needing to model the shape.
 *
 *   bun run scripts/badge.ts
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(new URL(".", import.meta.url).pathname, "..");
const IN = join(ROOT, "public/plates/incoming");

/* plate space, matching scripts/plates.ts */
const PLATE_W = 948;
const PLATE_H = 1477;
const WIN = { x: 300, y: 577, w: 333, h: 499 };

/* measured badge box, with a little air around it */
const BOX = { x: 398, y: 243, w: 192, h: 140 };

function luma(d: Uint8ClampedArray, w: number, h: number) {
  const l = new Float32Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    l[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  return l;
}

function findWindow(data: Uint8ClampedArray, W: number, H: number) {
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
  return {
    x: peak(vx, Math.round(W * 0.25), Math.round(W * 0.45)),
    y: peak(hy, Math.round(H * 0.32), Math.round(H * 0.48)),
    w: peak(vx, Math.round(W * 0.55), Math.round(W * 0.75)) - peak(vx, Math.round(W * 0.25), Math.round(W * 0.45)),
    h: peak(hy, Math.round(H * 0.64), Math.round(H * 0.80)) - peak(hy, Math.round(H * 0.32), Math.round(H * 0.48)),
  };
}

/* ---- normalise the original into plate space ---- */
const img = await loadImage(join(IN, "upload-06.png"));
const probe = createCanvas(img.width, img.height);
const pg = probe.getContext("2d");
pg.drawImage(img, 0, 0);
const win = findWindow(pg.getImageData(0, 0, img.width, img.height).data, img.width, img.height);

const sx = WIN.w / win.w;
const sy = WIN.h / win.h;
const plate = createCanvas(PLATE_W, PLATE_H);
const plateG = plate.getContext("2d");
plateG.imageSmoothingQuality = "high";
plateG.drawImage(img, WIN.x - win.x * sx, WIN.y - win.y * sy, img.width * sx, img.height * sy);

/* ---- crop and key out the background ---- */
const out = createCanvas(BOX.w, BOX.h);
const og = out.getContext("2d");
og.drawImage(plate, BOX.x, BOX.y, BOX.w, BOX.h, 0, 0, BOX.w, BOX.h);

const imgData = og.getImageData(0, 0, BOX.w, BOX.h);
const d = imgData.data;
const W = BOX.w;
const H = BOX.h;

/*
 * Keying against the background does not work here: the badge sits on top of
 * the headline, so the pixels around it are a mix of cream and dark green
 * letterforms with no single background colour to flood from.
 *
 * Instead, key on the badge itself. Its body is a saturated gold nothing else
 * nearby shares; the Devanagari inside it and its outline are dark, so those
 * come back by filling the enclosed holes and dilating a couple of pixels.
 */
const isGold = (i: number) =>
  d[i] > 165 && d[i + 1] > 120 && d[i + 2] < 125 && d[i] - d[i + 2] > 80 && d[i + 1] - d[i + 2] > 40;

const mask = new Uint8Array(W * H);
for (let p = 0; p < W * H; p++) if (isGold(p * 4)) mask[p] = 1;

/* fill enclosed holes: flood the non-gold region from the border, anything
   unreached is inside the badge (its text) and belongs to it */
const outside = new Uint8Array(W * H);
const stack: number[] = [];
for (let x = 0; x < W; x++) stack.push(x, 0, x, H - 1);
for (let y = 0; y < H; y++) stack.push(0, y, W - 1, y);
while (stack.length) {
  const y = stack.pop()!;
  const x = stack.pop()!;
  if (x < 0 || y < 0 || x >= W || y >= H) continue;
  const p = y * W + x;
  if (outside[p] || mask[p]) continue;
  outside[p] = 1;
  stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
}
for (let p = 0; p < W * H; p++) if (!outside[p]) mask[p] = 1;

/* grow by 2px to take in the badge's dark keyline */
for (let pass = 0; pass < 2; pass++) {
  const grown = mask.slice();
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (mask[p]) continue;
      if (mask[p - 1] || mask[p + 1] || mask[p - W] || mask[p + W]) grown[p] = 1;
    }
  }
  mask.set(grown);
}

let kept = 0;
for (let p = 0; p < W * H; p++) {
  if (mask[p]) kept++;
  else d[p * 4 + 3] = 0;
}

/* feather the boundary so it doesn't alias against the artwork */
for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    const p = y * W + x;
    if (!mask[p]) continue;
    let open = 0;
    if (!mask[p - 1]) open++;
    if (!mask[p + 1]) open++;
    if (!mask[p - W]) open++;
    if (!mask[p + W]) open++;
    if (open) d[p * 4 + 3] = Math.round(255 * (1 - open / 6));
  }
}

og.putImageData(imgData, 0, 0);
writeFileSync(join(ROOT, "public/plates/goa-badge.png"), out.toBuffer("image/png"));

console.log(
  `badge ${W}x${H} from plate @ ${BOX.x},${BOX.y}  kept ${((kept / (W * H)) * 100).toFixed(1)}% opaque`,
);

/* preview it against a mid grey so the cut edge is visible */
const chk = createCanvas(W * 3, H * 3);
const cg = chk.getContext("2d");
cg.fillStyle = "#888";
cg.fillRect(0, 0, W * 3, H * 3);
cg.imageSmoothingEnabled = false;
cg.drawImage(out, 0, 0, W * 3, H * 3);
writeFileSync(join(ROOT, ".preview/badge.png"), chk.toBuffer("image/png"));
console.log("wrote .preview/badge.png");

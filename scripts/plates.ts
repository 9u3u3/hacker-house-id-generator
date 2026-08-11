/**
 * Turns the raw design exports into normalised plates the renderer can use.
 *
 * The three designs were produced independently, so their printed photo windows
 * are not in the same place or the same size — measured at up to 26px of offset
 * and 10% of scale. That matters because the renderer draws the user's photo at
 * a single rect: on two of three plates it would sit misaligned inside the
 * printed frame, and mid-tilt the interlace would show a doubled edge across
 * someone's face.
 *
 * So each plate is warped so its own window lands on a canonical rect, taken
 * from the day plate (the layer that exports, so it stays undistorted). The
 * surrounding artwork differs between plates by design, so a few percent of
 * scale on it costs nothing.
 *
 * Text is not a concern here: the renderer draws it at identical coordinates on
 * every layer, so it registers across layers by construction.
 *
 *   bun run scripts/plates.ts
 */
import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
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

/* Canonical space = the day plate cropped to its card. */
const ref = plates[0];
const OUT_W = ref.card.w;
const OUT_H = ref.card.h;
const canonWin: Rect = {
  x: ref.win.x - ref.card.x,
  y: ref.win.y - ref.card.y,
  w: ref.win.w,
  h: ref.win.h,
};
console.log(
  `\ncanonical plate ${OUT_W}x${OUT_H}, window ${canonWin.w}x${canonWin.h} @ ${canonWin.x},${canonWin.y}`,
);

/* Solve each plate's scale+translate so its window matches canonical, then work
   out how much of the output each one actually covers. */
const warps = plates.map((p) => {
  const sx = canonWin.w / p.win.w;
  const sy = canonWin.h / p.win.h;
  const tx = canonWin.x - p.win.x * sx;
  const ty = canonWin.y - p.win.y * sy;
  return { p, sx, sy, tx, ty, left: tx, top: ty, right: tx + p.W * sx, bottom: ty + p.H * sy };
});

/* A plate scaled down leaves a gap at the edges. Crop every plate to the region
   all of them cover, so no plate shows blank border. */
const inset = {
  left: Math.max(0, ...warps.map((w) => Math.ceil(w.left))),
  top: Math.max(0, ...warps.map((w) => Math.ceil(w.top))),
  right: Math.min(OUT_W, ...warps.map((w) => Math.floor(w.right))),
  bottom: Math.min(OUT_H, ...warps.map((w) => Math.floor(w.bottom))),
};
const cropW = inset.right - inset.left;
const cropH = inset.bottom - inset.top;
console.log(
  `common coverage: ${cropW}x${cropH} (inset l=${inset.left} t=${inset.top} r=${OUT_W - inset.right} b=${OUT_H - inset.bottom})`,
);

for (const w of warps) {
  const staged = createCanvas(OUT_W, OUT_H);
  const sg = staged.getContext("2d");
  sg.imageSmoothingEnabled = true;
  sg.imageSmoothingQuality = "high";
  sg.drawImage(w.p.img, w.tx, w.ty, w.p.W * w.sx, w.p.H * w.sy);

  const out = createCanvas(cropW, cropH);
  const og = out.getContext("2d");
  og.drawImage(
    staged as unknown as Image,
    inset.left,
    inset.top,
    cropW,
    cropH,
    0,
    0,
    cropW,
    cropH,
  );

  /* WebP, not PNG: these are photographic illustrations, and three lossless
     plates came to 7.7MB — far too heavy to ship to a phone. Quality 82 puts
     them around 5% of that with no visible difference at card size. */
  const webp = out.toBuffer("image/webp", 82);
  writeFileSync(join(OUT, `${w.p.name}.webp`), webp);
  console.log(
    `  ${w.p.name.padEnd(8)} scale ${w.sx.toFixed(4)}x${w.sy.toFixed(4)} ` +
      `offset ${w.tx.toFixed(1)},${w.ty.toFixed(1)}  ${(webp.length / 1024).toFixed(0)}KB`,
  );
}

/* Window position in the final cropped plate — the renderer needs this. */
const finalWin: Rect = {
  x: canonWin.x - inset.left,
  y: canonWin.y - inset.top,
  w: canonWin.w,
  h: canonWin.h,
};
console.log(`\nPLATE ${cropW}x${cropH}`);
console.log(
  `WINDOW ${finalWin.w}x${finalWin.h} @ ${finalWin.x},${finalWin.y}  ` +
    `(${((finalWin.x / cropW) * 100).toFixed(2)}%, ${((finalWin.y / cropH) * 100).toFixed(2)}%, ` +
    `${((finalWin.w / cropW) * 100).toFixed(2)}%, ${((finalWin.h / cropH) * 100).toFixed(2)}%)`,
);

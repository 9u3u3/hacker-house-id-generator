/**
 * Where does each new crew plate's card actually sit, and where is it calm
 * enough to print on?
 *
 * The three crew illustrations were generated independently, exactly like the
 * solo designs were, so the same two questions apply: does the printed card
 * land in the same place on all three (or the card resizes mid-tilt), and which
 * regions are quiet enough to hold type.
 *
 * Unlike the solo plates these bake in their own chrome — kicker, motto, stamp,
 * lanyard slot, the date footer — so this also locates those, because the
 * renderer has to draw *around* them rather than over them.
 *
 *   bun run scripts/crewfit.ts
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { join } from "node:path";

const ROOT = join(new URL(".", import.meta.url).pathname, "..");
const IN = join(ROOT, "public/plates/crew/incoming");
const LAYERS = ["day", "sunrise", "night"] as const;

type Px = { r: number; g: number; b: number; a: number };

function at(data: Uint8ClampedArray, W: number, x: number, y: number): Px {
  const i = (y * W + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

const dist = (a: Px, b: Px) =>
  Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);

for (const layer of LAYERS) {
  const img = await loadImage(join(IN, `crew-${layer}.png`));
  const W = img.width;
  const H = img.height;
  const c = createCanvas(W, H);
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const { data } = g.getImageData(0, 0, W, H);

  /* The surround is whatever the extreme corner is. A rounded card always
     leaves its corners showing, so (2,2) is background by construction. */
  const bg = at(data, W, 2, 2);

  /* Walk in along the centre lines until the surround stops. */
  const midY = Math.floor(H / 2);
  const midX = Math.floor(W / 2);
  const THRESH = 40;

  let x0 = 0;
  while (x0 < W - 1 && dist(at(data, W, x0, midY), bg) < THRESH) x0++;
  let x1 = W - 1;
  while (x1 > 0 && dist(at(data, W, x1, midY), bg) < THRESH) x1--;
  let y0 = 0;
  while (y0 < H - 1 && dist(at(data, W, midX, y0), bg) < THRESH) y0++;
  let y1 = H - 1;
  while (y1 > 0 && dist(at(data, W, midX, y1), bg) < THRESH) y1--;

  console.log(
    `${layer.padEnd(8)} ${W}x${H}  card x${x0}..${x1} y${y0}..${y1} ` +
      `(${x1 - x0 + 1}x${y1 - y0 + 1})  aspect ${((x1 - x0 + 1) / (y1 - y0 + 1)).toFixed(4)}`,
  );

  /* The lanyard slot is the darkest run along the top strip, and it is the one
     landmark printed identically on all three — a good registration check. */
  let slotL = -1;
  let slotR = -1;
  const slotY = Math.round(H * 0.066);
  for (let x = Math.round(W * 0.35); x < Math.round(W * 0.65); x++) {
    const p = at(data, W, x, slotY);
    const luma = 0.299 * p.r + 0.587 * p.g + 0.114 * p.b;
    if (luma < 70) {
      if (slotL < 0) slotL = x;
      slotR = x;
    }
  }
  console.log(`         lanyard slot y=${slotY} x${slotL}..${slotR}`);
}

/**
 * Calmness: mean luma and gradient energy over a coarse grid, worst-case across
 * the three plates. Type has to survive all three printings, so a band is only
 * usable if every layer agrees it is quiet.
 */
console.log("\ncalm grid — max gradient energy across all three layers");
console.log("(lower = flatter = safer to print on; luma range shows ink choice)\n");

const COLS = 12;
const ROWS = 8;
const energy: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
const lumaMin: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(255));
const lumaMax: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

for (const layer of LAYERS) {
  const img = await loadImage(join(IN, `crew-${layer}.png`));
  const W = img.width;
  const H = img.height;
  const c = createCanvas(W, H);
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const { data } = g.getImageData(0, 0, W, H);

  const cw = Math.floor(W / COLS);
  const ch = Math.floor(H / ROWS);

  for (let ry = 0; ry < ROWS; ry++) {
    for (let cx = 0; cx < COLS; cx++) {
      let sum = 0;
      let grad = 0;
      let n = 0;
      for (let y = ry * ch; y < (ry + 1) * ch; y += 3) {
        for (let x = cx * cw; x < (cx + 1) * cw; x += 3) {
          const p = at(data, W, x, y);
          const l = 0.299 * p.r + 0.587 * p.g + 0.114 * p.b;
          sum += l;
          if (x + 3 < W && y + 3 < H) {
            const px = at(data, W, x + 3, y);
            const py = at(data, W, x, y + 3);
            const lx = 0.299 * px.r + 0.587 * px.g + 0.114 * px.b;
            const ly = 0.299 * py.r + 0.587 * py.g + 0.114 * py.b;
            grad += Math.abs(l - lx) + Math.abs(l - ly);
          }
          n++;
        }
      }
      const meanL = sum / n;
      energy[ry][cx] = Math.max(energy[ry][cx], grad / n);
      lumaMin[ry][cx] = Math.min(lumaMin[ry][cx], meanL);
      lumaMax[ry][cx] = Math.max(lumaMax[ry][cx], meanL);
    }
  }
}

const ref = await loadImage(join(IN, "crew-day.png"));
const cw = Math.floor(ref.width / COLS);
const ch = Math.floor(ref.height / ROWS);

let header = "     ";
for (let cx = 0; cx < COLS; cx++) header += String(cx * cw).padStart(6);
console.log(header);

for (let ry = 0; ry < ROWS; ry++) {
  let line = String(ry * ch).padStart(5);
  for (let cx = 0; cx < COLS; cx++) line += energy[ry][cx].toFixed(1).padStart(6);
  console.log(line);
}

console.log("\nluma range per cell (min..max across layers)");
for (let ry = 0; ry < ROWS; ry++) {
  let line = String(ry * ch).padStart(5);
  for (let cx = 0; cx < COLS; cx++) {
    line += `${Math.round(lumaMin[ry][cx])}-${Math.round(lumaMax[ry][cx])}`.padStart(9);
  }
  console.log(line);
}

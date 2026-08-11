/**
 * Crop a region out of each plate so it can be eyeballed at full resolution.
 *
 *   bun run scripts/crop.ts <x> <y> <w> <h> [scale]
 */
import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(new URL(".", import.meta.url).pathname, "..");
const OUT = join(ROOT, ".preview");
mkdirSync(OUT, { recursive: true });

const [x, y, w, h] = process.argv.slice(2, 6).map(Number);
const scale = Number(process.argv[6] ?? 1);

for (const name of ["day", "sunrise", "night"]) {
  const img = await loadImage(join(ROOT, `public/plates/${name}.webp`));
  const c = createCanvas(w * scale, h * scale);
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(img as unknown as Image, x, y, w, h, 0, 0, w * scale, h * scale);
  writeFileSync(join(OUT, `crop-${name}.png`), c.toBuffer("image/png"));
}
console.log(`cropped ${w}x${h} @ ${x},${y} x${scale}`);

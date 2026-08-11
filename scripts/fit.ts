/**
 * Where does each normalised plate's own card border actually land?
 *
 * The plates were registered on the photo window, which guarantees the photo
 * sits right but says nothing about the card's printed edge. If those edges
 * disagree, the card visibly changes size mid-tilt.
 *
 *   bun run scripts/fit.ts
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { join } from "node:path";

const ROOT = join(new URL(".", import.meta.url).pathname, "..");

for (const name of ["day", "sunrise", "night"]) {
  const img = await loadImage(join(ROOT, `public/plates/${name}.webp`));
  const W = img.width;
  const H = img.height;
  const c = createCanvas(W, H);
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;

  /* the card sits on a dark surround; walk in until a scanline stops being dark */
  const dark = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return d[i] + d[i + 1] + d[i + 2] < 220;
  };
  const colDark = (x: number) => {
    let n = 0;
    for (let y = Math.round(H * 0.2); y < Math.round(H * 0.8); y++) if (dark(x, y)) n++;
    return n / (H * 0.6);
  };
  const rowDark = (y: number) => {
    let n = 0;
    for (let x = Math.round(W * 0.2); x < Math.round(W * 0.8); x++) if (dark(x, y)) n++;
    return n / (W * 0.6);
  };

  let left = 0;
  while (left < W * 0.15 && colDark(left) > 0.6) left++;
  let right = W - 1;
  while (right > W * 0.85 && colDark(right) > 0.6) right--;
  let top = 0;
  while (top < H * 0.15 && rowDark(top) > 0.6) top++;
  let bottom = H - 1;
  while (bottom > H * 0.85 && rowDark(bottom) > 0.6) bottom--;

  console.log(
    `${name.padEnd(8)} ${W}x${H}  card x${left}..${right} y${top}..${bottom}  ` +
      `(${right - left + 1}x${bottom - top + 1})`,
  );
}

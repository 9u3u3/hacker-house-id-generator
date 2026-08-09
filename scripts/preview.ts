/**
 * Renders the three card layers to PNGs so the art can be iterated on without
 * booting the app. Not part of the build — dev tooling only.
 *
 *   bun run scripts/preview.ts
 */
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { mint } from "../src/lib/builder";
import { drawCard } from "../src/lib/card/draw";
import { CARD_H, CARD_W, type LayerName } from "../src/lib/card/theme";

const root = join(new URL(".", import.meta.url).pathname, "..");
GlobalFonts.registerFromPath(join(root, "public/fonts/Imbue.ttf"), "Imbue");
GlobalFonts.registerFromPath(join(root, "public/fonts/VictorMono.ttf"), "Victor Mono");

const pass = mint({
  name: "Harsh Gaonkar",
  stack: "TypeScript · Rust · WebGL",
  handle: "harshg",
  salt: 0,
});

const fonts = { display: "Imbue", mono: "Victor Mono" };
const scale = 1.5;
const out = join(root, ".preview");

/* a stand-in portrait so the photo window isn't empty while iterating */
function stubPhoto() {
  const c = createCanvas(600, 600);
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 600, 600);
  grad.addColorStop(0, "#8fb6c9");
  grad.addColorStop(1, "#3d5a6c");
  g.fillStyle = grad;
  g.fillRect(0, 0, 600, 600);
  g.fillStyle = "#e8c9a8";
  g.beginPath();
  g.arc(300, 250, 120, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(300, 560, 210, 200, 0, 0, Math.PI * 2);
  g.fill();
  return c;
}

const photoCanvas = stubPhoto();

for (const layer of ["sunrise", "day", "night"] as LayerName[]) {
  const canvas = createCanvas(CARD_W * scale, CARD_H * scale);
  const ctx = canvas.getContext("2d");
  drawCard(ctx as unknown as CanvasRenderingContext2D, CARD_W * scale, CARD_H * scale, {
    pass,
    layer,
    fonts,
    photo: {
      image: photoCanvas as unknown as CanvasImageSource,
      sx: 0,
      sy: 0,
      sw: 600,
      sh: 600,
    },
  });
  writeFileSync(join(out, `${layer}.png`), canvas.toBuffer("image/png"));
  console.log(`wrote ${layer}.png`);
}

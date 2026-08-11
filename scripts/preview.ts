/**
 * Renders the three card layers and the share scene to PNGs so the art can be
 * iterated on without booting the app. Dev tooling only.
 *
 *   bun run scripts/preview.ts [photo.jpg]
 */
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mint } from "../src/lib/builder";
import type { CardAssets } from "../src/lib/card/assets";
import { drawCard } from "../src/lib/card/draw";
import { drawShareScene, SCENE_H, SCENE_W } from "../src/lib/card/scene";
import { PHOTO_ASPECT } from "../src/lib/card/layout";
import { CARD_H, CARD_W, type LayerName } from "../src/lib/card/theme";

const root = join(new URL(".", import.meta.url).pathname, "..");
const out = join(root, ".preview");
mkdirSync(out, { recursive: true });

GlobalFonts.registerFromPath(join(root, "public/fonts/BodoniModa-Black.ttf"), "Bodoni Moda");
GlobalFonts.registerFromPath(join(root, "public/fonts/VictorMono.ttf"), "Victor Mono");

const fonts = { display: "Bodoni Moda", mono: "Victor Mono" };

const assets: CardAssets = {
  plates: {
    day: (await loadImage(join(root, "public/plates/day.webp"))) as unknown as CanvasImageSource,
    sunrise: (await loadImage(join(root, "public/plates/sunrise.webp"))) as unknown as CanvasImageSource,
    night: (await loadImage(join(root, "public/plates/night.webp"))) as unknown as CanvasImageSource,
  },
  badge: (await loadImage(join(root, "public/plates/goa-badge.png"))) as unknown as CanvasImageSource,
};

const pass = mint({
  name: process.env.NAME ?? "Harsh Gaonkar",
  stack: process.env.STACK ?? "TypeScript · Rust",
  handle: "harshg",
  salt: 0,
});

/* optional real portrait, else the window is left empty */
const photoPath = process.argv[2];
const photo = photoPath
  ? await (async () => {
      /* napi's loadImage wants a buffer for local paths, not a bare path */
      const img = await loadImage(readFileSync(photoPath));
      /* biggest window-shaped crop that fits, biased up for headroom */
      const aspect = PHOTO_ASPECT;
      const sw = Math.min(img.width, img.height * aspect);
      const sh = sw / aspect;
      return {
        image: img as unknown as CanvasImageSource,
        sx: (img.width - sw) / 2,
        sy: Math.max(0, Math.min(img.height - sh, img.height * 0.42 - sh / 2)),
        sw,
        sh,
      };
    })()
  : null;

const scale = 1;
for (const layer of ["sunrise", "day", "night"] as LayerName[]) {
  const canvas = createCanvas(CARD_W * scale, CARD_H * scale);
  const ctx = canvas.getContext("2d");
  drawCard(ctx as unknown as CanvasRenderingContext2D, CARD_W * scale, CARD_H * scale, {
    pass,
    layer,
    fonts,
    photo,
    assets,
  });
  writeFileSync(join(out, `${layer}.png`), canvas.toBuffer("image/png"));
  console.log(`wrote ${layer}.png`);
}

{
  const s = 1.5;
  const canvas = createCanvas(SCENE_W * s, SCENE_H * s);
  const ctx = canvas.getContext("2d");
  drawShareScene(ctx as unknown as CanvasRenderingContext2D, SCENE_W * s, SCENE_H * s, {
    pass,
    fonts,
    photo,
    assets,
  });
  writeFileSync(join(out, "scene.png"), canvas.toBuffer("image/png"));
  console.log("wrote scene.png");
}

console.log(`\n${pass.name} — ${pass.builderClass} — seat ${pass.seat} — ${pass.secret}`);

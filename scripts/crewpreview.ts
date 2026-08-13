/**
 * Renders the crew card at both team sizes on all three printings, without
 * booting the app.
 *
 * The crew layout has two shapes, not one — a two-tile row is a different
 * composition from a three-tile row — and a plate that reads well behind three
 * mounts can be crowded behind two. Six images is the whole space.
 *
 *   bun run scripts/crewpreview.ts [photo.jpg]
 */
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mintCrew } from "../src/lib/builder";
import type { CardAssets } from "../src/lib/card/assets";
import type { CrewPlates } from "../src/lib/card/crewAssets";
import { drawCrewCard } from "../src/lib/card/draw";
import { CREW, PHOTO_ASPECT } from "../src/lib/card/layout";
import { drawCrewScene, SCENE_H, SCENE_W } from "../src/lib/card/scene";
import type { LayerName } from "../src/lib/card/theme";

const root = join(new URL(".", import.meta.url).pathname, "..");
const out = join(root, ".preview/crew");
mkdirSync(out, { recursive: true });

GlobalFonts.registerFromPath(join(root, "public/fonts/BodoniModa-Black.ttf"), "Bodoni Moda");
GlobalFonts.registerFromPath(join(root, "public/fonts/RobotoMono.ttf"), "Roboto Mono");

const fonts = { display: "Bodoni Moda", mono: "Roboto Mono" };

const load = async (p: string) =>
  (await loadImage(join(root, p))) as unknown as CanvasImageSource;

const assets: CardAssets = {
  plates: {
    day: await load("public/plates/day.webp"),
    sunrise: await load("public/plates/sunrise.webp"),
    night: await load("public/plates/night.webp"),
  },
  badge: await load("public/plates/goa-badge.png"),
};

const plates: CrewPlates = {
  day: await load("public/plates/crew/day.webp"),
  sunrise: await load("public/plates/crew/sunrise.webp"),
  night: await load("public/plates/crew/night.webp"),
};

const photoPath = process.argv[2];
const photo = photoPath
  ? await (async () => {
      const img = await loadImage(readFileSync(photoPath));
      const sw = Math.min(img.width, img.height * PHOTO_ASPECT);
      const sh = sw / PHOTO_ASPECT;
      return {
        image: img as unknown as CanvasImageSource,
        sx: (img.width - sw) / 2,
        sy: Math.max(0, Math.min(img.height - sh, img.height * 0.42 - sh / 2)),
        sw,
        sh,
      };
    })()
  : null;

/* Long names and long builder classes on purpose: the caption band is the part
   most likely to overflow, and a roster of short names would never show it. */
const ROSTER = [
  { name: "Harsh Gaonkar", role: "Design Engineer", stack: "TypeScript", handle: "harshg" },
  { name: "Sai Salelkar", role: "Backend", stack: "Rust · Go", handle: "sai" },
  { name: "John Fernandes", role: "ML", stack: "Python", handle: "john" },
];

for (const size of [2, 3]) {
  const crew = mintCrew({
    team: process.env.TEAM ?? "Tide Runners",
    members: ROSTER.slice(0, size).map((m) => ({ ...m, salt: 0 })),
    salt: 0,
  });

  for (const layer of ["day", "sunrise", "night"] as LayerName[]) {
    const canvas = createCanvas(CREW.W, CREW.H);
    const ctx = canvas.getContext("2d");
    drawCrewCard(ctx as unknown as CanvasRenderingContext2D, CREW.W, CREW.H, {
      crew,
      photos: crew.members.map(() => photo),
      fonts,
      assets,
      plates,
      layer,
    });
    const name = `crew-${size}-${layer}.png`;
    writeFileSync(join(out, name), canvas.toBuffer("image/png"));
    console.log(`wrote ${name}`);
  }

  /* the 16:9 field the card is actually posted in */
  {
    const canvas = createCanvas(SCENE_W, SCENE_H);
    const ctx = canvas.getContext("2d");
    drawCrewScene(ctx as unknown as CanvasRenderingContext2D, SCENE_W, SCENE_H, {
      crew,
      photos: crew.members.map(() => photo),
      fonts,
      assets,
      plates,
    });
    const name = `crew-${size}-scene.png`;
    writeFileSync(join(out, name), canvas.toBuffer("image/png"));
    console.log(`wrote ${name}`);
  }

  console.log(`  ${size}: ${crew.team} — pass ${crew.passNo} — ${crew.secret}`);
  for (const m of crew.members) console.log(`     ${m.name} — ${m.builderClass} — ${m.tier}`);
}

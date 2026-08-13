/**
 * Converts the raw crew designs into the plates the renderer loads.
 *
 * Far less work than `scripts/plates.ts`, and deliberately so. That script
 * exists because the three solo designs each print a photo window and a card
 * border in slightly different places, and one of those has to be pinned while
 * the other gives. The crew plates print neither — they are full-bleed
 * backgrounds, with the tiles, the keyline and every word drawn in code — so
 * there is nothing between the three that can fail to line up, and nothing to
 * register. See `docs/crew-plates.md`.
 *
 * All this does is check the geometry, warn about anything that will look
 * wrong, and encode.
 *
 *   drop crew-day.png / crew-sunrise.png / crew-night.png into
 *   public/plates/crew/incoming/ then:
 *
 *   bun run scripts/crewplates.ts
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(new URL(".", import.meta.url).pathname, "..");
const IN = join(ROOT, "public/plates/crew/incoming");
const OUT = join(ROOT, "public/plates/crew");

/** The card's own aspect. Sources are expected to match it. */
const TARGET_W = 2400;
const TARGET_H = 1350;
const ASPECT = TARGET_W / TARGET_H;

const LAYERS = ["day", "sunrise", "night"] as const;

if (!existsSync(IN)) {
  console.error(`nothing to do — ${IN} does not exist`);
  console.error("see docs/crew-plates.md for what to put there");
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

let wrote = 0;
const missing: string[] = [];

for (const layer of LAYERS) {
  const src = join(IN, `crew-${layer}.png`);
  if (!existsSync(src)) {
    missing.push(`crew-${layer}.png`);
    continue;
  }

  const img = await loadImage(src);
  const aspect = img.width / img.height;

  console.log(`${layer.padEnd(8)} ${img.width}x${img.height}  aspect ${aspect.toFixed(4)}`);

  if (Math.abs(aspect - ASPECT) > 0.02) {
    console.log(
      `         ! aspect is ${aspect.toFixed(3)}, wanted ${ASPECT.toFixed(3)} — it will be centre-cropped`,
    );
  }
  if (img.width < TARGET_W) {
    console.log(
      `         ! only ${img.width}px wide; upscaling to ${TARGET_W} will soften it`,
    );
  }

  /* cover, so a slightly-off source loses a sliver rather than squashing */
  const canvas = createCanvas(TARGET_W, TARGET_H);
  const g = canvas.getContext("2d");
  const scale = Math.max(TARGET_W / img.width, TARGET_H / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  g.drawImage(img, (TARGET_W - dw) / 2, (TARGET_H - dh) / 2, dw, dh);

  /* the type sits on cream and yellow, so flag a background too bright to
     hold it — the one failure that can't be corrected in the renderer */
  const { data } = g.getImageData(0, 0, TARGET_W, TARGET_H);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const meanLuma = sum / (data.length / 4);
  console.log(`         mean luma ${meanLuma.toFixed(0)}`);
  if (meanLuma > 165) {
    console.log("         ! bright enough that cream type may not hold contrast");
  }

  const out = join(OUT, `${layer}.webp`);
  writeFileSync(out, canvas.toBuffer("image/webp", 82));
  wrote++;
}

/* Flip the manifest the loader reads. Written rather than hand-edited so the
   art and the flag that enables it can never disagree. */
const manifest = join(ROOT, "src/lib/card/crewPlatesManifest.ts");
const available = wrote === LAYERS.length;
const current = readFileSync(manifest, "utf8");
const next = current.replace(
  /export const CREW_PLATES_AVAILABLE = (true|false);/,
  `export const CREW_PLATES_AVAILABLE = ${available};`,
);
if (next === current && !new RegExp(`= ${available};`).test(current)) {
  console.log("\n! could not update crewPlatesManifest.ts — set it by hand");
} else if (next !== current) {
  writeFileSync(manifest, next);
  console.log(`\nCREW_PLATES_AVAILABLE = ${available}`);
}

if (missing.length) {
  console.log(`\nmissing from ${IN}:`);
  for (const m of missing) console.log(`  ${m}`);
  console.log("\nthe renderer needs all three, and falls back to the composed");
  console.log("background until it has them — crew mode keeps working meanwhile");
}

console.log(`\nwrote ${wrote}/${LAYERS.length} plates to public/plates/crew/`);

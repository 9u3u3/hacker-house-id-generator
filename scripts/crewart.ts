/**
 * Composes the three crew plates from the official hhgoa.com illustrations.
 *
 * The crew card needed its own three printings — day, sunrise, blacklight — the
 * way the solo card has them, instead of faking a background by blurring the
 * solo day plate up to fill a landscape frame.
 *
 * Rather than inventing artwork, this builds them from the event's own
 * `Sun rise.png`: one scene, cropped to the card's 16:9, graded three ways. That
 * is the same relationship the solo plates have to each other — one card under
 * three lights — and it keeps the crew pass on the actual brand illustrations
 * rather than an approximation of them.
 *
 * Two things the crop has to solve:
 *
 * - The illustration's lower third is white villas and beach, and the member
 *   names and footer sit exactly there in cream. White under cream is the one
 *   contrast failure the renderer cannot correct, so a bottom scrim takes that
 *   band down hard. It reads as dusk rather than as a fix.
 * - The top is flat green sky, which is where the big team-name lockup lands.
 *   That is already the calmest part of the picture, so the crop is positioned
 *   to keep it.
 *
 *   bun run scripts/crewart.ts
 *   bun run scripts/crewplates.ts
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(new URL(".", import.meta.url).pathname, "..");
const RAW = join(ROOT, "public/plates/crew/incoming/raw");
const OUT = join(ROOT, "public/plates/crew/incoming");

const W = 2400;
const H = 1350;

/**
 * Three different illustrations, not one recoloured three times.
 *
 * The solo card's three faces started as three independently produced
 * artworks, and the crew card should match that. Grading a single scene three
 * ways reads as a filter; three real scenes read as a card.
 *
 * They also tell the event's own arc — dawn on the beach, the crew heads-down
 * at the table, then after dark — which is what the four days are.
 *
 * `crop` is the band of the source that becomes the card, as fractions of its
 * height, chosen so the busy part lands behind the photo tiles and the calm
 * part under the team name.
 */
const SOURCES = {
  sunrise: { file: "sunrise.png", crop: [0.39, 0.95] },
  /* five hackers at a long table in front of a Goan house — the one official
     illustration that is literally a crew, and already 1.79:1 */
  day: { file: "hackers.png", crop: [0.0, 1.0] },
  /* palms framing an open centre, which is exactly a card's shape */
  night: { file: "trees.png", crop: [0.0, 1.0] },
} as const;

mkdirSync(OUT, { recursive: true });

for (const { file } of Object.values(SOURCES)) {
  if (existsSync(join(RAW, file))) continue;
  console.error(`missing ${join(RAW, file)}`);
  console.error("fetch the three from https://hhgoa.com/assets/ — see docs/crew-plates.md");
  process.exit(1);
}

/**
 * Split-tone grade: multiply tints the darks, screen tints the lights.
 *
 * A soft-light pass was the first attempt and it barely moved the picture —
 * the illustration is flat saturated green, and soft-light against a saturated
 * mid-tone is close to a no-op, so sunrise came out indistinguishable from day.
 * That defeats the point: these are three printings of one scene and the whole
 * value is that you can tell instantly which one you're looking at.
 *
 * Multiplying the greens toward the mood's shadow colour and screening the
 * highlights toward its light colour moves the hue properly while keeping the
 * line art readable.
 */
type Grade = {
  /** flat wash under everything, so nothing shows through as raw white */
  base: string;
  /** multiplied in — pulls the greens toward the time of day */
  shadow: string;
  /** screened on — lifts the sun, the sea foam and the line work */
  highlight: string;
  /** overall scrim strength on top */
  scrim: string;
  /**
   * Optional screened wash over the upper sky.
   *
   * Multiplying orange into green gives olive, which is a real dusk colour but
   * not a dawn one — the sunrise sky needs lifting back toward pink rather than
   * just darkening. Only the top band, so the sea stays the sea.
   */
  sky?: [string, string];
};

const GRADES: Record<string, Grade> = {
  /* midday at the table. hackers.png is mostly white house and cream tabletop,
     which cream type cannot sit on, so this grades far harder than the others */
  day: {
    base: "#0b6839",
    shadow: "rgba(155,210,175,1)",
    highlight: "rgba(255,245,190,0.05)",
    scrim: "rgba(8,40,29,0.30)",
  },
  /* dawn: warm all the way through, the sun doing the work */
  sunrise: {
    base: "#8a3f14",
    shadow: "rgba(255,150,70,1)",
    highlight: "rgba(255,160,60,0.20)",
    scrim: "rgba(80,28,10,0.24)",
    sky: ["rgba(255,90,120,0.30)", "rgba(255,150,40,0.02)"],
  },
  /* blacklight: matching the solo night plate's violet rather than inventing a
     third mood, so the two cards read as the same system */
  night: {
    base: "#2a1650",
    shadow: "rgba(120,105,215,1)",
    highlight: "rgba(120,60,220,0.18)",
    scrim: "rgba(18,8,44,0.30)",
  },
};

for (const [name, grade] of Object.entries(GRADES)) {
  const canvas = createCanvas(W, H);
  const g = canvas.getContext("2d");

  const source = SOURCES[name as keyof typeof SOURCES];
  const scene = await loadImage(join(RAW, source.file));

  /* ---- the scene, cropped to the card ---- */
  const sy = scene.height * source.crop[0];
  const sh = scene.height * (source.crop[1] - source.crop[0]);
  const sw = scene.width;

  g.fillStyle = grade.base;
  g.fillRect(0, 0, W, H);

  /* cover: the crop is close to 16:9 but not exact, so lose a sliver rather
     than stretch the horizon */
  const scale = Math.max(W / sw, H / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  g.drawImage(scene, 0, sy, sw, sh, (W - dw) / 2, (H - dh) / 2, dw, dh);

  /* ---- grade to the time of day ---- */
  g.globalCompositeOperation = "multiply";
  g.fillStyle = grade.shadow;
  g.fillRect(0, 0, W, H);

  g.globalCompositeOperation = "screen";
  g.fillStyle = grade.highlight;
  g.fillRect(0, 0, W, H);

  if (grade.sky) {
    const sky = g.createLinearGradient(0, 0, 0, H * 0.55);
    sky.addColorStop(0, grade.sky[0]);
    sky.addColorStop(1, grade.sky[1]);
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H * 0.55);
  }

  g.globalCompositeOperation = "source-over";

  g.fillStyle = grade.scrim;
  g.fillRect(0, 0, W, H);

  /* ---- take the villas down so the names can sit on them ---- */
  const floor = g.createLinearGradient(0, H * 0.52, 0, H);
  floor.addColorStop(0, "rgba(8,40,29,0)");
  floor.addColorStop(0.45, "rgba(8,40,29,0.62)");
  floor.addColorStop(1, "rgba(6,30,22,0.94)");
  g.fillStyle = floor;
  g.fillRect(0, H * 0.52, W, H * 0.48);

  /* ---- and deepen the sky behind the team-name lockup ---- */
  const roof = g.createLinearGradient(0, 0, 0, H * 0.34);
  roof.addColorStop(0, "rgba(6,30,22,0.55)");
  roof.addColorStop(1, "rgba(6,30,22,0)");
  g.fillStyle = roof;
  g.fillRect(0, 0, W, H * 0.34);

  /* ---- corner vignette, so the printed keyline has something to sit on ---- */
  const vig = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.42)");
  g.fillStyle = vig;
  g.fillRect(0, 0, W, H);

  const { data } = g.getImageData(0, 0, W, H);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const meanLuma = sum / (data.length / 4);

  writeFileSync(join(OUT, `crew-${name}.png`), canvas.toBuffer("image/png"));
  console.log(`crew-${name}.png  ${W}x${H}  mean luma ${meanLuma.toFixed(0)}`);
}

/* A contact sheet, so the three can be judged against each other rather than
   one at a time — "is sunrise actually different from day" is the question. */
const sheet = createCanvas(900, 507 * 3 + 24);
const sg = sheet.getContext("2d");
sg.fillStyle = "#000";
sg.fillRect(0, 0, sheet.width, sheet.height);
for (const [i, name] of Object.keys(GRADES).entries()) {
  const img = await loadImage(join(OUT, `crew-${name}.png`));
  sg.drawImage(img, 0, i * (507 + 12), 900, 507);
}
mkdirSync(join(ROOT, ".preview"), { recursive: true });
writeFileSync(join(ROOT, ".preview/crew-grades.png"), sheet.toBuffer("image/png"));
console.log("contact sheet -> .preview/crew-grades.png");

console.log("\nnow run: bun run scripts/crewplates.ts");

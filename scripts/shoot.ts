/**
 * Drives the running dev server in a real browser and screenshots the studio at
 * several tilt positions. Dev tooling — the tilt effect can only be judged in a
 * browser, since it's CSS masks and 3D transforms rather than canvas output.
 *
 *   npm run dev &   bun run scripts/shoot.ts
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = ".preview/web";
const URL_ = process.env.URL ?? "http://localhost:3000";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

/* ---------- desktop ---------- */
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 2,
});

const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto(URL_, { waitUntil: "networkidle" });

/* optional photo, so the tilt captures show a real portrait */
const PHOTO = process.argv[2];
if (PHOTO) await page.setInputFiles('input[type="file"]', PHOTO);

await page.getByPlaceholder("your name").fill("Harsh Gaonkar");
await page.getByPlaceholder("@you").fill("@harshg");
await page.getByPlaceholder("design engineer").fill("Design Engineer");
await page.getByPlaceholder("typescript · rust").fill("TypeScript · Rust");

/* let the canvases redraw with fonts resolved */
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/studio.png`, fullPage: false });

/*
 * Drive the tilt with real cursor movement rather than pinning the CSS custom
 * properties: the rAF loop republishes them every frame, so anything written
 * by hand is erased within ~16ms. Moving the mouse exercises the actual path.
 */
const tiltEl = page.locator('[class*="tilt"]').first();
const box = await tiltEl.boundingBox();
if (!box) throw new Error("tilt element has no box");

const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

for (const [label, tx] of [
  ["left-sunrise", -1],
  ["mid-left", -0.45],
  ["flat", 0],
  ["mid-right", 0.45],
  ["right-night", 1],
] as const) {
  /* invert useTilt's mapping: tx = (clientX - cx) / (width * 0.9) */
  await page.mouse.move(cx + tx * box.width * 0.9, cy);
  /* the easing is a 0.14 lerp per frame, so ~40 frames to settle */
  await page.waitForTimeout(800);
  await tiltEl.screenshot({ path: `${OUT}/tilt-${label}.png` });

  const vars = await tiltEl.evaluate((el) => {
    const s = (el as HTMLElement).style;
    return {
      tx: s.getPropertyValue("--tx"),
      left: s.getPropertyValue("--reveal-left"),
      right: s.getPropertyValue("--reveal-right"),
    };
  });
  console.log(`${label.padEnd(13)} tx=${vars.tx} L=${vars.left} R=${vars.right}`);
}

/* ---------- mobile ---------- */
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
await mobile.goto(URL_, { waitUntil: "networkidle" });
if (PHOTO) await mobile.setInputFiles('input[type="file"]', PHOTO);
await mobile.getByPlaceholder("your name").fill("Harsh Gaonkar");
await mobile.waitForTimeout(1000);
await mobile.screenshot({ path: `${OUT}/mobile.png`, fullPage: true });

await browser.close();

if (errors.length) {
  console.log("PAGE ERRORS:");
  for (const e of errors) console.log("  " + e);
} else {
  console.log("no page errors");
}
console.log(`screenshots -> ${OUT}`);

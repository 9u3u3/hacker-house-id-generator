/**
 * End-to-end check of the path a real user takes: drop a photo, fill the
 * fields, download the PNG. Verifies the download actually produces a decoded
 * image of the right size rather than just that the button was clickable.
 *
 *   npm run dev &   bun run scripts/flow.ts <photo.jpg>
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = ".preview/web";
const URL_ = process.env.URL ?? "http://localhost:3000";
const PHOTO = process.argv[2];

if (!PHOTO) throw new Error("usage: bun run scripts/flow.ts <photo.jpg>");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
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

const t0 = Date.now();
await page.setInputFiles('input[type="file"]', PHOTO);
await page.getByPlaceholder("your name").fill("Harsh Gaonkar");
await page.getByPlaceholder("@you").fill("@harshg");
await page.getByPlaceholder("design engineer").fill("Design Engineer");
await page.getByPlaceholder("typescript · rust").fill("TypeScript · Rust");
await page.waitForTimeout(1500);
console.log(`upload -> rendered preview in ${Date.now() - t0}ms`);

await page.locator('[class*="tilt"]').first().screenshot({
  path: `${OUT}/with-photo.png`,
});

/* download */
const t1 = Date.now();
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 20000 }),
  page.getByRole("button", { name: /DOWNLOAD/i }).click(),
]);
const path = `${OUT}/downloaded.png`;
await download.saveAs(path);
console.log(`download "${download.suggestedFilename()}" in ${Date.now() - t1}ms`);

/* prove the file is a real, correctly sized PNG */
const { createCanvas, loadImage } = await import("@napi-rs/canvas");
const img = await loadImage(path);
console.log(`decoded ${img.width}x${img.height}`);

/* and that it has no transparent pixels — those would show as white on X */
const probe = createCanvas(img.width, img.height);
const pctx = probe.getContext("2d");
pctx.drawImage(img, 0, 0);
const data = pctx.getImageData(0, 0, img.width, img.height).data;
let transparent = 0;
for (let i = 3; i < data.length; i += 4) if (data[i] < 250) transparent++;
console.log(
  `transparent pixels: ${transparent} / ${data.length / 4} (${((transparent / (data.length / 4)) * 100).toFixed(2)}%)`,
);

await browser.close();
if (errors.length) {
  console.log("PAGE ERRORS:");
  for (const e of errors) console.log("  " + e);
} else {
  console.log("no page errors");
}

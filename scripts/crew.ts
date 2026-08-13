/**
 * End-to-end check of CREW mode: fill the roster, download the combined pass,
 * and assert the PNG decodes at the share dimensions with no transparency.
 *
 * The crew card is a second `toBlob` path, so it needs the same assertion
 * `flow.ts` makes about the solo one — transparent regions render as white bars
 * on X, and two separate bugs have put them into an export before.
 *
 *   npm run dev &   bun run scripts/crew.ts <photo.jpg>
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = ".preview/crew";
const URL_ = process.env.URL ?? "http://localhost:3000";
const PHOTO = process.argv[2];

if (!PHOTO) throw new Error("usage: bun run scripts/crew.ts <photo.jpg>");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 2,
});

const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto(URL_, { waitUntil: "networkidle" });

const t0 = Date.now();
await page.getByRole("tab", { name: /CREW/i }).click();
await page.getByPlaceholder("tide runners").fill("Tide Runners");

/* three people is the interesting case — two tiles centre trivially */
await page.getByRole("button", { name: /ADD A THIRD BUILDER/i }).click();

/* every member takes the solo card's own fields, so fill them: the long ones
   are what push the name/meta/class stack under a tile into the footer rule */
const roster = [
  ["Sai Salelkar", "@sai", "Design Engineer", "TypeScript · Rust"],
  ["John Fernandes", "@johnf", "Infrastructure", "Go · Postgres · k8s"],
  ["Harsh Gaonkar", "@harshg", "ML", "Python"],
];
for (const [i, [name, handle, role, stack]] of roster.entries()) {
  await page.getByPlaceholder("their name").nth(i).fill(name);
  await page.getByPlaceholder("@them").nth(i).fill(handle);
  await page.getByPlaceholder("design engineer").nth(i).fill(role);
  await page.getByPlaceholder("typescript · rust").nth(i).fill(stack);
}

/* the class is generated per member, from those fields — three different
   people must not mint the same title */
const classes = await page
  .locator("[data-member-class]")
  .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ""));
if (classes.length !== 3) throw new Error(`expected 3 builder classes, saw ${classes.length}`);
if (new Set(classes).size !== 3) {
  throw new Error(`builder classes are not distinct: ${classes.join(" / ")}`);
}
console.log(`builder classes: ${classes.join(" · ")}`);

const files = page.locator('input[type="file"]');
const slots = await files.count();
if (slots !== 3) throw new Error(`expected 3 photo slots, saw ${slots}`);
for (let i = 0; i < slots; i++) {
  await files.nth(i).setInputFiles(PHOTO);
  await page.waitForTimeout(500);
}
await page.waitForTimeout(1500);
console.log(`roster of 3 filled and rendered in ${Date.now() - t0}ms`);

await page.locator("canvas[aria-label*='crew pass']").screenshot({
  path: `${OUT}/preview.png`,
});

const t1 = Date.now();
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 25000 }),
  page.getByRole("button", { name: /DOWNLOAD PNG/i }).click(),
]);
const path = `${OUT}/crew.png`;
await download.saveAs(path);
console.log(`download "${download.suggestedFilename()}" in ${Date.now() - t1}ms`);

const { createCanvas, loadImage } = await import("@napi-rs/canvas");
const img = await loadImage(path);
console.log(`decoded ${img.width}x${img.height}`);
if (img.width !== 2400 || img.height !== 1350) {
  throw new Error("crew export must match the solo share dimensions");
}

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
  process.exit(1);
}
if (transparent > 0) {
  console.log("FAIL: the crew export carries transparency");
  process.exit(1);
}
console.log("no page errors");

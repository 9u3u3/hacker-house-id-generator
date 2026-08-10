/**
 * Verifies the share path the way an X crawler would see it: publish a pass,
 * then fetch the resulting page and check that the OG/Twitter tags point at an
 * image that actually exists and decodes.
 *
 *   npm run dev &   bun run scripts/share.ts <photo.jpg>
 */
import { chromium } from "playwright";

const URL_ = process.env.URL ?? "http://localhost:3000";
const PHOTO = process.argv[2];
if (!PHOTO) throw new Error("usage: bun run scripts/share.ts <photo.jpg>");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await ctx.newPage();

const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(URL_, { waitUntil: "networkidle" });
await page.setInputFiles('input[type="file"]', PHOTO);
await page.getByPlaceholder("your name").fill("Harsh Gaonkar");
await page.getByPlaceholder("@you").fill("@harshg");
await page.getByPlaceholder("typescript · rust · webgl").fill("TypeScript · Rust");
await page.waitForTimeout(1200);

const t0 = Date.now();

/* The intent opens a tab on x.com. Scope the capture to this click rather than
   listening on the context — a context-level handler also fires for the crawler
   tab we open below, which starts life as about:blank. */
const intentTab = page.waitForEvent("popup", { timeout: 5000 }).catch(() => null);
await page.getByRole("button", { name: /SHARE TO X/i }).click();
void intentTab.then((p) => p?.close().catch(() => {}));
await page.waitForSelector("text=live link:", { timeout: 20000 });
const shareUrl = await page.locator("a[href*='/id/']").first().getAttribute("href");
console.log(`published in ${Date.now() - t0}ms -> ${shareUrl}`);
if (!shareUrl) throw new Error("no share url rendered");

/* now look at it the way a crawler does */
const crawler = await ctx.newPage();
await crawler.goto(shareUrl, { waitUntil: "networkidle" });

const meta = await crawler.evaluate(() => {
  const get = (sel: string) =>
    document.querySelector(sel)?.getAttribute("content") ?? null;
  return {
    ogTitle: get('meta[property="og:title"]'),
    ogImage: get('meta[property="og:image"]'),
    ogW: get('meta[property="og:image:width"]'),
    ogH: get('meta[property="og:image:height"]'),
    twCard: get('meta[name="twitter:card"]'),
    twImage: get('meta[name="twitter:image"]'),
  };
});
console.log(meta);

if (meta.twCard !== "summary_large_image") {
  throw new Error(`twitter:card is "${meta.twCard}", expected summary_large_image`);
}
if (!meta.ogImage) throw new Error("no og:image");

const imgUrl = new URL(meta.ogImage, shareUrl).toString();
const res = await crawler.request.get(imgUrl);
const body = await res.body();
console.log(
  `og:image -> ${res.status()} ${res.headers()["content-type"]} ${(body.length / 1024).toFixed(0)}KB`,
);
if (!res.ok()) throw new Error("og:image did not resolve");

const { loadImage } = await import("@napi-rs/canvas");
const img = await loadImage(body);
console.log(`og:image decodes as ${img.width}x${img.height}`);

await crawler.screenshot({ path: ".preview/web/share-page.png", fullPage: true });

await browser.close();
console.log(errors.length ? `PAGE ERRORS:\n  ${errors.join("\n  ")}` : "no page errors");

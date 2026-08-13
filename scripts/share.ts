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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await ctx.newPage();

const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(URL_, { waitUntil: "networkidle" });

/**
 * CREW publishes a different render through the same endpoint, so "the preview
 * shows the generated graphic" has to be true of both cards, not just the solo
 * one. It's the easier of the two to get wrong — the crew pass is drawn at 3:2
 * on its own plates and composited into the 16:9 share field, so a mistake
 * there surfaces as a preview that is the right size and the wrong picture.
 */
if (process.argv.includes("--crew")) {
  await page.getByRole("tab", { name: /CREW/i }).click();
  await page.getByPlaceholder("tide runners").fill("Tide Runners");
  await page.getByPlaceholder("their name").nth(0).fill("Harsh Gaonkar");
  await page.getByPlaceholder("their name").nth(1).fill("Sai Salelkar");
  await page.getByPlaceholder("design engineer").nth(0).fill("Design Engineer");
  await page.getByPlaceholder("typescript · rust").nth(0).fill("TypeScript · Rust");
  const files = page.locator('input[type="file"]');
  await files.nth(0).setInputFiles(PHOTO);
  await files.nth(1).setInputFiles(PHOTO);
} else {
  await page.setInputFiles('input[type="file"]', PHOTO);
  await page.getByPlaceholder("your name").fill("Harsh Gaonkar");
  await page.getByPlaceholder("@you").fill("@harshg");
  await page.getByPlaceholder("design engineer").fill("Design Engineer");
  await page.getByPlaceholder("typescript · rust").fill("TypeScript · Rust");
}
await page.waitForTimeout(1500);

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
    ogDesc: get('meta[property="og:description"]'),
  };
});
console.log(meta);

if (meta.twCard !== "summary_large_image") {
  throw new Error(`twitter:card is "${meta.twCard}", expected summary_large_image`);
}
if (!meta.ogImage) throw new Error("no og:image");
if (!meta.ogDesc?.includes("#FrameInGoa")) {
  throw new Error(`og:description is missing the hashtag: ${meta.ogDesc}`);
}
/* the crawler must be pointed at the same image both ways round — X reads
   twitter:image in preference to og:image, and a stale one is how a preview
   ends up showing something other than the card that was just made */
if (meta.twImage !== meta.ogImage) {
  throw new Error(`twitter:image ${meta.twImage} disagrees with og:image ${meta.ogImage}`);
}

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

/* A declared size that doesn't match the bytes is one of the ways a preview
   renders as a blank or letterboxed thumbnail — the crawler lays out the box
   from the tag and then paints an image that doesn't fill it. */
if (String(img.width) !== meta.ogW || String(img.height) !== meta.ogH) {
  throw new Error(
    `og:image is ${img.width}x${img.height} but declares ${meta.ogW}x${meta.ogH}`,
  );
}

/* a default thumbnail is a small file; the generated card never is */
if (body.length < 80_000) {
  throw new Error(`og:image is only ${(body.length / 1024).toFixed(0)}KB — is that the real card?`);
}

const tag = process.argv.includes("--crew") ? "crew" : "solo";
await crawler.screenshot({ path: `.preview/web/share-page-${tag}.png`, fullPage: true });

await browser.close();
console.log(errors.length ? `PAGE ERRORS:\n  ${errors.join("\n  ")}` : "no page errors");

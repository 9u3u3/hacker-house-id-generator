/**
 * Guards the two things SHARE TO X actually has to do.
 *
 * 1. Claim the tab **on the click**. Browsers only honour `window.open` while
 *    the click's user activation is live; the original flow awaited fonts, a
 *    canvas render and an upload first, so Safari and Chrome-Android swallowed
 *    it silently. A screenshot cannot catch that — the button looks fine, it
 *    just does nothing — which is why this asserts the tab starts life at
 *    about:blank and is redirected afterwards.
 * 2. Still produce a tweet when publishing fails, naming the real status.
 *
 * x.com is stubbed: an unauthenticated intent bounces through /i/flow/login,
 * which hides the URL under test, and a test has no business sending traffic
 * there anyway.
 *
 *   npm run dev &   bun run scripts/intent.ts <photo.jpg>
 */
import { chromium } from "playwright";

const URL_ = process.env.URL ?? "http://localhost:3000";
const PHOTO = process.argv[2];
if (!PHOTO) throw new Error("usage: bun run scripts/intent.ts <photo.jpg>");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });

await ctx.route("https://x.com/**", (route) =>
  route.fulfill({ status: 200, contentType: "text/html", body: "<h1>composer</h1>" }),
);

async function studio(failPublish: boolean) {
  const page = await ctx.newPage();
  if (failPublish) {
    await page.route("**/api/publish", (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "storage unavailable" }),
      }),
    );
  }
  await page.goto(URL_, { waitUntil: "networkidle" });
  await page.setInputFiles('input[type="file"]', PHOTO);
  await page.getByPlaceholder("your name").fill("Sai Salelkar");
  await page.waitForTimeout(1500);
  return page;
}

/* ---- 1. the tab is claimed on the gesture ---- */
{
  const page = await studio(false);
  const popup = page.waitForEvent("popup", { timeout: 5000 });

  const t0 = Date.now();
  await page.getByRole("button", { name: /^SHARE TO X$/ }).click();
  const tab = await popup;
  const claimedIn = Date.now() - t0;
  const firstUrl = tab.url();

  await tab.waitForURL(/x\.com\/intent/, { timeout: 20000 }).catch(() => {});
  const finalUrl = tab.url();

  console.log(`ok   tab claimed in ${claimedIn}ms as "${firstUrl}"`);
  if (!firstUrl.startsWith("about:blank")) {
    throw new Error("FAIL: the tab was not claimed synchronously on the click");
  }
  if (!finalUrl.includes("x.com/intent/tweet")) {
    throw new Error("FAIL: the tab never reached the X composer");
  }

  const params = new URL(finalUrl).searchParams;
  console.log(`ok   composer opened with a caption and a link`);
  console.log(`     caption: ${params.get("text")?.split("\n")[0].slice(0, 56)}…`);
  console.log(`     url:     ${params.get("url")}`);
  if (!params.get("url")?.includes("/id/")) {
    throw new Error("FAIL: the composer link is not the published pass");
  }
  await page.close();
}

/* ---- 2. a failed publish still produces a tweet ---- */
{
  const page = await studio(true);
  const popup = page.waitForEvent("popup", { timeout: 5000 });
  await page.getByRole("button", { name: /^SHARE TO X$/ }).click();
  const tab = await popup;
  await tab.waitForURL(/x\.com\/intent/, { timeout: 20000 }).catch(() => {});

  if (!tab.url().includes("x.com/intent/tweet")) {
    throw new Error("FAIL: a failed publish left the user with no tweet at all");
  }
  console.log("ok   502 still opens the composer, pointed at the generator");

  /* .first(): Next's route announcer is also role=alert */
  const message = await page.getByRole("alert").first().innerText();
  console.log(`ok   error names the status — "${message}"`);
  if (!message.includes("502")) {
    throw new Error("FAIL: the real status code was not surfaced to the user");
  }

  const anchor = await page
    .getByRole("link", { name: /OPEN X COMPOSER/i })
    .getAttribute("href");
  if (!anchor?.includes("x.com/intent/tweet")) {
    throw new Error("FAIL: no always-visible intent fallback for a blocked popup");
  }
  console.log("ok   manual fallback link is present regardless");
  await page.close();
}

await browser.close();
console.log("\nall checks passed");

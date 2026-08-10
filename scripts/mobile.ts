/**
 * Mobile regression checks.
 *
 * The studio looked fine in every screenshot while the card was rendering
 * completely blank on a real phone, because a screenshot of a green card on a
 * green page looks like a green card. These assertions read actual pixels and
 * exercise the controls.
 *
 *   npm run dev &   bun run scripts/mobile.ts <photo.jpg>
 */
import { chromium, devices } from "playwright";

const URL_ = process.env.URL ?? "http://localhost:3000";
const PHOTO = process.argv[2];

const browser = await chromium.launch();
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

for (const profile of ["Pixel 7", "iPhone 13"] as const) {
  console.log(`\n── ${profile} ──`);
  const ctx = await browser.newContext({ ...devices[profile] });
  const page = await ctx.newPage();

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto(URL_, { waitUntil: "networkidle" });
  await page.getByPlaceholder("your name").fill("Harsh Gaonkar");
  await page.waitForTimeout(1500);

  /* 1. the day canvas must actually contain the card, not be empty */
  const stats = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const { width, height } = canvas;
    if (!width || !height) return { width, height, distinct: 0, opaque: 0 };

    const d = ctx.getImageData(0, 0, width, height).data;
    const seen = new Set<number>();
    let opaque = 0;
    /* sample rather than scan: enough to tell "drawn" from "blank" */
    for (let i = 0; i < d.length; i += 4 * 97) {
      if (d[i + 3] > 8) opaque++;
      seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    }
    return { width, height, distinct: seen.size, opaque };
  });

  if (!stats) {
    check("card canvas present", false, "no canvas in the DOM");
  } else {
    check(
      "canvas has a backing store",
      stats.width > 0 && stats.height > 0,
      `${stats.width}x${stats.height}`,
    );
    check(
      "canvas is actually drawn",
      stats.distinct > 20 && stats.opaque > 0,
      `${stats.distinct} distinct colours sampled`,
    );
    const megapixels = ((stats.width * stats.height) / 1e6) * 3;
    check(
      "canvas memory is sane for a phone",
      megapixels < 6,
      `${megapixels.toFixed(1)}MP across 3 layers`,
    );
  }

  /* 2. reroll must change the builder class */
  const classOf = () =>
    page.locator("p.truncate").first().textContent().then((t) => t?.trim() ?? "");
  const before = await classOf();
  await page.getByRole("button", { name: /REROLL/i }).click();
  await page.waitForTimeout(250);
  const after = await classOf();
  check("reroll changes builder class", before !== after, `${before} -> ${after}`);

  /* 3. the photo input must be reachable and wired */
  const input = page.locator('input[type="file"]');
  check("file input exists", (await input.count()) > 0);
  check(
    "file input accepts plain image/*",
    (await input.getAttribute("accept")) === "image/*",
    `accept="${await input.getAttribute("accept")}"`,
  );

  if (PHOTO) {
    await input.setInputFiles(PHOTO);
    await page.waitForTimeout(1500);
    const swapped = await page
      .getByText("SWAP PHOTO")
      .count()
      .then((n) => n > 0);
    check("photo selection registers", swapped);
  }

  /* 4. drag must move the card when there's no sensor */
  const tiltEl = page.locator('[class*="tilt"]').first();
  const box = await tiltEl.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.98, box.y + box.height / 2, {
      steps: 10,
    });
    await page.waitForTimeout(700);
    const tx = await tiltEl.evaluate(
      (el) => (el as HTMLElement).style.getPropertyValue("--reveal-right"),
    );
    await page.mouse.up();
    check("drag reveals the night layer", Number(tx) > 0.3, `--reveal-right=${tx}`);
  }

  /* 5. motion tilt: tap to enable, then feed synthetic sensor readings */
  const motion = await page.evaluate(async () => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /ENABLE MOTION TILT/i.test(b.textContent ?? ""),
    );
    if (!btn) return { error: "no enable button" };

    btn.click();

    /* the hook waits ~1.4s for a reading before declaring the sensor blocked;
       hold the phone at a natural angle first, then roll it right */
    const fire = (beta: number, gamma: number) =>
      window.dispatchEvent(
        new DeviceOrientationEvent("deviceorientation", { beta, gamma }),
      );

    await new Promise((r) => setTimeout(r, 120));
    fire(78, 4); /* baseline: however it happens to be held */
    await new Promise((r) => setTimeout(r, 200));
    for (let i = 0; i < 12; i++) {
      fire(78, 4 + i * 2.2);
      await new Promise((r) => setTimeout(r, 40));
    }
    await new Promise((r) => setTimeout(r, 1600));

    const el = document.querySelector('[class*="tilt"]') as HTMLElement | null;
    const label = document.body.innerText;
    return {
      revealRight: el?.style.getPropertyValue("--reveal-right") ?? "",
      saysTilt: /TILT YOUR PHONE/i.test(label),
      saysBlocked: /blocking motion sensors/i.test(label),
    };
  });

  if ("error" in motion) {
    check("motion enable button present", false, motion.error);
  } else {
    check("motion tilt goes live on synthetic readings", motion.saysTilt === true);
    check(
      "baseline calibration: neutral hold is not full deflection",
      Number(motion.revealRight) > 0.4 && Number(motion.revealRight) <= 1,
      `--reveal-right=${motion.revealRight}`,
    );
    check("no false 'blocked' message", motion.saysBlocked === false);
  }

  check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));

  await page.screenshot({
    path: `.preview/web/mobile-${profile.replace(/\s+/g, "-").toLowerCase()}.png`,
    fullPage: false,
  });
  await ctx.close();
}

await browser.close();
console.log(
  failures.length ? `\n${failures.length} FAILING: ${failures.join(", ")}` : "\nall checks passed",
);
if (failures.length) process.exit(1);

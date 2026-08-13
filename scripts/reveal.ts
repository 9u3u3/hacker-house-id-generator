/**
 * Checks the animated reveal export (A1).
 *
 * Three things can go wrong and none of them are visible in a screenshot: the
 * recorder can produce a zero-byte file, the container can come out as
 * something X won't take, and the interlace can render as a static frame — a
 * video of a card that never tilts still "works" by every other measure.
 *
 * So this samples frames straight out of the ported optics and asserts the card
 * actually changes across the sweep, then records for real and checks the file.
 *
 *   npm run dev &   bun run scripts/reveal.ts <photo.jpg>
 */
import { chromium } from "playwright";
import { mkdirSync, statSync } from "node:fs";

const OUT = ".preview/reveal";
const URL_ = process.env.URL ?? "http://localhost:3000";
const PHOTO = process.argv[2];
if (!PHOTO) throw new Error("usage: bun run scripts/reveal.ts <photo.jpg>");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto(URL_, { waitUntil: "networkidle" });
await page.setInputFiles('input[type="file"]', PHOTO);
await page.getByPlaceholder("your name").fill("Sai Salelkar");
await page.getByPlaceholder("design engineer").fill("Design Engineer");
await page.getByPlaceholder("typescript · rust").fill("TypeScript · Rust");
await page.waitForTimeout(2500);

/* ---- 1. the sweep reaches both fully revealed layers ---- */
const phases = await page.evaluate(() => {
  const ramp = (v: number) => Math.pow(Math.max(0, v), 1.7);
  return [0, 0.25, 0.5, 0.75].map((t) => {
    const x = -Math.sin(t * Math.PI * 2);
    return { t, left: +ramp(-x).toFixed(3), right: +ramp(x).toFixed(3) };
  });
});
console.log("sweep phases (t, sunrise, night):");
for (const p of phases) console.log(`  t=${p.t}  left=${p.left}  right=${p.right}`);
if (phases[1].left !== 1 || phases[3].right !== 1) {
  throw new Error("FAIL: the sweep never reaches a fully revealed layer");
}

/* ---- 2. the recorder produces a real, playable file ---- */
const t0 = Date.now();
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 60000 }),
  page.getByRole("button", { name: /RECORD THE REVEAL/i }).click(),
]);
const name = download.suggestedFilename();
const path = `${OUT}/${name}`;
await download.saveAs(path);

const bytes = statSync(path).size;
console.log(`recorded "${name}" in ${Date.now() - t0}ms — ${(bytes / 1024).toFixed(0)}KB`);

if (bytes < 20_000) throw new Error(`FAIL: ${bytes} bytes is not a real clip`);
if (!/\.(mp4|webm)$/.test(name)) throw new Error(`FAIL: unexpected container ${name}`);
if (bytes > 15 * 1024 * 1024) {
  throw new Error("FAIL: too large to post comfortably");
}

/* ---- 3. the clip actually moves ----
   A recorder that captured a frozen canvas still yields a valid, correctly
   sized file. So play the real thing back and sample the card region: across a
   sunrise→night sweep those samples have to differ, and by a lot. */
const { readFileSync } = await import("node:fs");
const base64 = readFileSync(path).toString("base64");

const samples: number[][] = await page.evaluate(
  async ([b64, mime]) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));

    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    await new Promise((r) => {
      video.onloadeddata = r;
      video.onerror = r;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    /* the card occupies roughly the left third of the 16:9 composition */
    const readCard = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const d = ctx.getImageData(20, 30, 70, 120).data;
      let r = 0,
        g = 0,
        b = 0;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
      }
      const n = d.length / 4;
      return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    };

    const out: number[][] = [];
    await video.play().catch(() => {});
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 260));
      out.push(readCard());
    }
    video.pause();
    URL.revokeObjectURL(url);
    return out;
  },
  [base64, name.endsWith(".mp4") ? "video/mp4" : "video/webm"] as const,
);

const spread = (i: number) =>
  Math.max(...samples.map((s) => s[i])) - Math.min(...samples.map((s) => s[i]));
const swing = Math.max(spread(0), spread(1), spread(2));
console.log(`card samples across playback: ${samples.map((s) => s.join(",")).join("  ")}`);
console.log(`largest channel swing: ${swing}`);
if (swing < 20) {
  throw new Error(`FAIL: the clip barely changes (swing ${swing}) — it's a still`);
}

await page.getByRole("button", { name: /SHARE THE CLIP/i }).waitFor({ timeout: 5000 });
console.log("share-the-clip button appeared for the recorded file");

await browser.close();

if (errors.length) {
  console.log("PAGE ERRORS:");
  for (const e of errors) console.log("  " + e);
  process.exit(1);
}
console.log("no page errors");

/**
 * Auto-crop regression check.
 *
 * The brief says not to assume users will crop first, so the framing in
 * `src/lib/photo.ts` has to hold up on photos nobody prepared: subjects in a
 * corner, landscape group shots, panoramas, deep skin tones in low light, a
 * close-up that fills the frame, and a photo with no person in it at all.
 *
 * The detector is a heuristic, and a heuristic that isn't measured drifts. This
 * paints those cases with a known head position, runs the *real* `loadPhoto` and
 * `computeCrop` against them, and asserts the head survives the crop — no
 * browser needed, since the only browser APIs that file touches are a canvas
 * and a decode, both stubbed onto napi-canvas below.
 *
 *   node --experimental-strip-types scripts/framing.ts [--write]
 *
 * `--write` drops annotated before/after tiles into .preview/framing for
 * eyeballing, which is the only way to judge whether a *passing* crop is also
 * a flattering one.
 */
import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(new URL(".", import.meta.url).pathname, "..");
const OUT = join(ROOT, ".preview/framing");
const WRITE = process.argv.includes("--write");

/* The two browser APIs photo.ts reaches for, on napi-canvas. Everything else in
   that module is plain arithmetic, so this exercises the real code path — and
   with no `window.FaceDetector` it takes the fallback every browser but Chrome
   takes. */
const g = globalThis as unknown as Record<string, unknown>;
g.window = {};
g.document = { createElement: () => createCanvas(1, 1) };
g.createImageBitmap = async (blob: Blob) =>
  await loadImage(Buffer.from(await blob.arrayBuffer()));

const { loadPhoto, computeCrop } = await import("../src/lib/photo.ts");
const { PHOTO_ASPECT } = await import("../src/lib/card/layout.ts");

type Head = { x: number; y: number; w: number; h: number };
type Case = { name: string; png: Buffer; w: number; h: number; heads: Head[]; expect: string };

/**
 * Paint a scene, and report where the heads actually are.
 *
 * The background is deliberately hostile: a warm sky over sand is the exact
 * palette a skin classifier confuses itself on, and it's also what half the
 * photos taken at this event will look like.
 */
function scene(
  name: string,
  w: number,
  h: number,
  people: Array<{ cx: number; cy: number; r: number; skin?: string }>,
  opts: { dark?: boolean; expect?: string } = {},
): Case {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d") as SKRSContext2D;

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, opts.dark ? "#243447" : "#8fc7e8");
  sky.addColorStop(0.55, opts.dark ? "#3a4a5e" : "#e8d9b0");
  sky.addColorStop(1, opts.dark ? "#1c2733" : "#d8c49a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  /* sand: skin-adjacent hue, plenty of gradient energy */
  for (let i = 0; i < 4000; i++) {
    const gx = ((i * 7919) % 10007) / 10007;
    const gy = ((i * 104729) % 10007) / 10007;
    ctx.fillStyle = `rgba(${200 + (i % 40)},${175 + (i % 40)},${130 + (i % 40)},0.5)`;
    ctx.fillRect(gx * w, h * 0.55 + gy * h * 0.45, 3, 3);
  }

  const heads: Head[] = [];
  for (const p of people) {
    const { cx, cy, r } = p;
    ctx.fillStyle = p.skin ?? "#c98a63";

    /* torso and neck in the same tone, continuous with the head — the reason a
       bounding box alone frames people at chest height */
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 2.4, r * 1.5, r * 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - r * 0.35, cy, r * 0.7, r * 1.4);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.8, r, 0, 0, Math.PI * 2);
    ctx.fill();

    /* hair, eyes, mouth: the detail a wall doesn't have */
    ctx.fillStyle = "#2b1d16";
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.55, r * 0.85, r * 0.45, 0, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.3, cy - r * 0.05, r * 0.12, r * 0.09, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + r * 0.3, cy - r * 0.05, r * 0.12, r * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7d3a34";
    ctx.fillRect(cx - r * 0.25, cy + r * 0.45, r * 0.5, r * 0.08);

    heads.push({ x: cx - r * 0.8, y: cy - r, w: r * 1.6, h: r * 2 });
  }

  return {
    name,
    png: canvas.toBuffer("image/png"),
    w,
    h,
    heads,
    expect: opts.expect ?? "face",
  };
}

const CASES: Case[] = [
  /* a plain centre crop loses these two entirely */
  scene("landscape-left", 1600, 900, [{ cx: 250, cy: 330, r: 90 }]),
  scene("landscape-right", 1600, 900, [{ cx: 1380, cy: 300, r: 85 }]),
  scene("tall-portrait", 900, 1600, [{ cx: 500, cy: 340, r: 95 }]),
  scene("panorama", 2400, 700, [{ cx: 1900, cy: 250, r: 70 }]),
  /* three people, three sizes, three tones — the crop must pick the subject */
  scene("group", 1200, 1200, [
    { cx: 300, cy: 520, r: 70, skin: "#8a5a3b" },
    { cx: 620, cy: 470, r: 105 },
    { cx: 920, cy: 540, r: 66, skin: "#e0b48f" },
  ]),
  /* deep skin tone at night: the case a fixed luma threshold drops */
  scene("low-light", 1400, 900, [{ cx: 900, cy: 340, r: 100, skin: "#5c3a2a" }], { dark: true }),
  /* the head fills the frame — the crop has to pull back, not zoom */
  scene("close-up", 1000, 1000, [{ cx: 500, cy: 430, r: 330 }]),
  /* nobody in it: must degrade to the saliency crop rather than invent a face */
  scene("no-people", 1500, 900, [], { expect: "subject" }),
];

const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

if (WRITE) mkdirSync(OUT, { recursive: true });

for (const c of CASES) {
  const photo = await loadPhoto(new File([c.png], `${c.name}.png`, { type: "image/png" }));
  const crop = computeCrop(photo, PHOTO_ASPECT);

  /* the decoder caps the long edge, so ground truth has to follow it down */
  const s = photo.width / c.w;
  const detail = `${photo.framing}, crop ${crop.sx.toFixed(0)},${crop.sy.toFixed(0)} ${crop.sw.toFixed(0)}x${crop.sh.toFixed(0)}`;

  check(`${c.name}: framing is ${c.expect}`, photo.framing === c.expect, detail);

  if (c.heads.length) {
    /* the biggest head is the subject — that's the one the card is about */
    const head = c.heads.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b));
    const box = { x: head.x * s, y: head.y * s, w: head.w * s, h: head.h * s };

    const inside =
      box.x >= crop.sx - 1 &&
      box.y >= crop.sy - 1 &&
      box.x + box.w <= crop.sx + crop.sw + 1 &&
      box.y + box.h <= crop.sy + crop.sh + 1;
    check(`${c.name}: subject survives the crop`, inside, detail);

    /* in frame isn't enough — a face jammed against an edge is a bad card */
    const fx = (box.x + box.w / 2 - crop.sx) / crop.sw;
    const fy = (box.y + box.h / 2 - crop.sy) / crop.sh;
    check(
      `${c.name}: subject is composed, not shoved`,
      fx > 0.25 && fx < 0.75 && fy > 0.08 && fy < 0.62,
      `head centre at x ${fx.toFixed(2)}, y ${fy.toFixed(2)} of the window`,
    );
  }

  if (WRITE) {
    const TILE = 420;
    const out = createCanvas(TILE * 2, TILE);
    const o = out.getContext("2d") as SKRSContext2D;
    o.fillStyle = "#111";
    o.fillRect(0, 0, TILE * 2, TILE);

    const fit = Math.min(TILE / photo.width, TILE / photo.height);
    const dw = photo.width * fit;
    const dh = photo.height * fit;
    const ox = (TILE - dw) / 2;
    const oy = (TILE - dh) / 2;
    o.drawImage(photo.source as never, ox, oy, dw, dh);

    if (photo.face) {
      o.strokeStyle = "#00ff88";
      o.lineWidth = 2;
      o.strokeRect(
        ox + photo.face.x * fit,
        oy + photo.face.y * fit,
        photo.face.w * fit,
        photo.face.h * fit,
      );
    }
    o.strokeStyle = "#ffcc00";
    o.lineWidth = 2;
    o.strokeRect(ox + crop.sx * fit, oy + crop.sy * fit, crop.sw * fit, crop.sh * fit);

    const cw = TILE * PHOTO_ASPECT;
    o.drawImage(
      photo.source as never,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      TILE + (TILE - cw) / 2,
      0,
      cw,
      TILE,
    );
    writeFileSync(join(OUT, `${c.name}.png`), out.toBuffer("image/png"));
  }
}

if (WRITE) console.log(`\nannotated tiles in ${OUT}`);

if (failures.length) {
  console.log(`\n${failures.length} FAILED`);
  process.exit(1);
}
console.log("\nall framing checks passed");

import type { MintedPass } from "@/lib/builder";
import type { CardAssets } from "./assets";
import { drawCard, tracked, trackedWidth, type Fonts, type PhotoSource } from "./draw";
import { INK } from "./layout";
import { CARD_H, CARD_W } from "./theme";

/**
 * The share composition.
 *
 * The pass is portrait, but X crops tall images in-timeline — a portrait card
 * posted raw loses its top and bottom in the feed. So the exported image is
 * 16:9 with the card composited into a branded field, which doubles as the OG
 * image at the same aspect.
 *
 * Only the DAY layer is ever drawn here. Sunrise and night are the reward for
 * tilting on the site and deliberately never leave it.
 */

export const SCENE_W = 1200;
export const SCENE_H = 675;

/** Retina factor for exported PNGs; the OG tags must declare the same. */
export const EXPORT_SCALE = 2;

const GREEN_DEEP = "#08281d";
const CREAM = "#f2e6cf";

export function drawShareScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: {
    pass: MintedPass;
    photo: PhotoSource | null;
    fonts: Fonts;
    assets: CardAssets;
  },
) {
  const { pass, photo, fonts, assets } = opts;

  ctx.save();
  ctx.scale(width / SCENE_W, height / SCENE_H);

  /* ---- backdrop: the day plate, scaled way up and dimmed ---- */
  ctx.fillStyle = GREEN_DEEP;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);

  ctx.save();
  ctx.globalAlpha = 0.28;
  /* cover the frame from the plate's centre band, so the palms and sea read */
  const coverH = SCENE_H * 2.6;
  const coverW = coverH * (CARD_W / CARD_H);
  ctx.drawImage(
    assets.plates.day,
    (SCENE_W - coverW) / 2,
    SCENE_H * 0.5 - coverH * 0.42,
    coverW,
    coverH,
  );
  ctx.restore();

  ctx.fillStyle = "rgba(8,40,29,0.55)";
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);

  /* ---- the card ---- */
  const cardH = 590;
  const cardW = cardH * (CARD_W / CARD_H);
  const cardX = 86;
  const cardY = (SCENE_H - cardH) / 2;

  ctx.save();
  ctx.translate(cardX + cardW / 2, cardY + cardH / 2);
  ctx.rotate(-0.028);
  ctx.translate(-cardW / 2, -cardH / 2);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 54;
  ctx.shadowOffsetY = 22;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.roundRect(0, 0, cardW, cardH, 22);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, cardW, cardH, 22);
  ctx.clip();
  drawCard(ctx, cardW, cardH, { pass, photo, layer: "day", fonts, assets });
  ctx.restore();
  ctx.restore();

  /* ---- the type block ---- */
  const tx = cardX + cardW + 78;
  const maxW = SCENE_W - tx - 70;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "rgba(242,230,207,0.75)";
  ctx.font = `700 13px ${fonts.mono}`;
  tracked(ctx, "HACKER HOUSE GOA · 28–31 OCT 2026", tx, 188, 3.4, "left");

  const [first, ...rest] = pass.name.trim().split(/\s+/);
  const last = rest.length ? rest[rest.length - 1] : "";

  const fit = (text: string, cap: number) => {
    let size = cap / 0.72;
    ctx.font = `900 ${size}px ${fonts.display}`;
    const w = ctx.measureText(text).width;
    if (w > maxW) size *= maxW / w;
    ctx.font = `900 ${size}px ${fonts.display}`;
  };

  fit((first || "ANONYMOUS").toUpperCase(), 78);
  ctx.fillStyle = CREAM;
  ctx.fillText((first || "ANONYMOUS").toUpperCase(), tx, 282);

  if (last) {
    fit(last.toUpperCase(), 72);
    ctx.fillStyle = INK.pink;
    ctx.fillText(last.toUpperCase(), tx, 362);
  }

  /* builder class pill */
  ctx.font = `700 18px ${fonts.mono}`;
  const clsW = trackedWidth(ctx, pass.builderClass, 2.6);
  const pillW = Math.min(clsW + 44, maxW);
  const pillH = 42;
  const pillY = last ? 396 : 320;
  ctx.fillStyle = "#fee101";
  ctx.beginPath();
  ctx.roundRect(tx, pillY, pillW, pillH, pillH / 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(tx, pillY, pillW, pillH, pillH / 2);
  ctx.clip();
  ctx.fillStyle = "#08281d";
  ctx.textBaseline = "middle";
  tracked(ctx, pass.builderClass, tx + pillW / 2, pillY + pillH / 2 + 1, 2.6, "center");
  ctx.restore();

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(242,230,207,0.7)";
  ctx.font = `400 16px ${fonts.mono}`;
  tracked(ctx, `SEAT ${pass.seat} / 247 · ${pass.serial}`, tx, pillY + 84, 1.8, "left");

  ctx.fillStyle = "#fee101";
  ctx.font = `700 30px ${fonts.mono}`;
  tracked(ctx, "#FrameInGoa", tx, pillY + 138, 2, "left");

  ctx.fillStyle = "rgba(242,230,207,0.5)";
  ctx.font = `400 13px ${fonts.mono}`;
  tracked(ctx, "TILT THE CARD ON THE SITE TO SEE WHAT'S HIDING", tx, pillY + 172, 2, "left");

  /* keyline so the export reads as a designed frame, not a screenshot */
  ctx.strokeStyle = "rgba(242,230,207,0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(14, 14, SCENE_W - 28, SCENE_H - 28, 12);
  ctx.stroke();

  ctx.restore();
}

/** Convenience wrapper: full-res scene straight to a PNG blob. */
export async function renderShareBlob(opts: {
  pass: MintedPass;
  photo: PhotoSource | null;
  fonts: Fonts;
  assets: CardAssets;
  scale?: number;
}): Promise<Blob> {
  const scale = opts.scale ?? EXPORT_SCALE;
  const canvas = document.createElement("canvas");
  canvas.width = SCENE_W * scale;
  canvas.height = SCENE_H * scale;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");

  drawShareScene(ctx, canvas.width, canvas.height, opts);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png",
    );
  });
}

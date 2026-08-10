import type { MintedPass } from "@/lib/builder";
import { drawArtifact } from "./artifacts";
import {
  drawCard,
  fitFont,
  guilloche,
  palms,
  roundRect,
  sunDisc,
  tracked,
  trackedWidth,
  waves,
  type Fonts,
  type PhotoSource,
} from "./draw";
import { CARD_H, CARD_W } from "./theme";

/**
 * The share composition.
 *
 * The pass itself is portrait, but X crops tall images in-timeline — a portrait
 * card posted raw loses its top and bottom in the feed. So the exported image
 * is 16:9 with the card composited into a branded beach scene, which also
 * doubles as the OG image at the same aspect.
 *
 * Only the DAY layer is ever drawn here. The sunrise and night layers are the
 * reward for tilting on the site and deliberately never leave it.
 */

export const SCENE_W = 1200;
export const SCENE_H = 675;

/** Retina factor for exported PNGs; the OG tags must declare the same. */
export const EXPORT_SCALE = 2;

const GREEN_DEEP = "#074a28";
const PAPER = "#fffbe8";
const YELLOW = "#fee101";

export function drawShareScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: { pass: MintedPass; photo: PhotoSource | null; fonts: Fonts },
) {
  const { pass, photo, fonts } = opts;
  const seed = [...pass.serial].reduce((a, c) => a + c.charCodeAt(0), 0);

  ctx.save();
  ctx.scale(width / SCENE_W, height / SCENE_H);

  /* ---- backdrop ---- */
  const g = ctx.createLinearGradient(0, 0, 0, SCENE_H);
  g.addColorStop(0, "#0e7a43");
  g.addColorStop(1, GREEN_DEEP);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);

  sunDisc(ctx, 1010, 172, 168, "rgba(254,225,1,0.10)");
  waves(ctx, 0, 540, SCENE_W, "rgba(255,251,232,0.11)", 6);
  guilloche(ctx, -40, 120, SCENE_W + 80, 440, "rgba(255,251,232,0.05)", seed);

  /* palms live in a separate coordinate space sized to the card, so scale the
     helper into the scene's right-hand third */
  ctx.save();
  ctx.translate(560, 0);
  ctx.scale(1.05, 1.05);
  palms(ctx, SCENE_H / 1.05, "rgba(4,48,26,0.4)", seed, 1.9);
  ctx.restore();

  /* hole colour tracks the scene backdrop, not the card's */
  const sceneHole = "#0a5c37";
  drawArtifact(ctx, "boat", 640, 566, 76, "rgba(4,48,26,0.34)", sceneHole);
  drawArtifact(ctx, "scooter", 1096, 632, 72, "rgba(4,48,26,0.42)", sceneHole);

  /* ---- the card ---- */
  const cardH = 566;
  const cardW = cardH * (CARD_W / CARD_H);
  const cardX = 92;
  const cardY = (SCENE_H - cardH) / 2;

  ctx.save();
  ctx.translate(cardX + cardW / 2, cardY + cardH / 2);
  ctx.rotate(-0.035);
  ctx.translate(-cardW / 2, -cardH / 2);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = "#000";
  roundRect(ctx, 0, 0, cardW, cardH, 20);
  ctx.fill();
  ctx.restore();

  drawCard(ctx, cardW, cardH, { pass, photo, layer: "day", fonts });
  ctx.restore();

  /* ---- the type block ---- */
  const tx = cardX + cardW + 74;
  const maxW = SCENE_W - tx - 74;

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PAPER;
  ctx.font = `700 13px ${fonts.mono}`;
  tracked(ctx, "HACKER HOUSE GOA · 28–31 OCT 2026", tx, 196, 3.2, "left");

  fitFont(ctx, "TIDE PASS", fonts.display, "700", 132, maxW, 60);
  ctx.fillStyle = PAPER;
  ctx.fillText("TIDE PASS", tx, 300);

  ctx.fillStyle = YELLOW;
  ctx.font = `700 19px ${fonts.mono}`;
  const clsW = trackedWidth(ctx, pass.builderClass, 2.6);
  const pillW = Math.min(clsW + 46, maxW);
  const pillH = 44;
  roundRect(ctx, tx, 330, pillW, pillH, pillH / 2);
  ctx.fill();

  ctx.save();
  roundRect(ctx, tx, 330, pillW, pillH, pillH / 2);
  ctx.clip();
  ctx.fillStyle = "#04301a";
  ctx.textBaseline = "middle";
  tracked(ctx, pass.builderClass, tx + pillW / 2, 353, 2.6, "center");
  ctx.restore();

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,251,232,0.72)";
  ctx.font = `400 17px ${fonts.mono}`;
  const nameLine = `${pass.name.toUpperCase()} · SEAT ${pass.seat}/247`;
  fitFont(ctx, nameLine, fonts.mono, "400", 17, maxW, 11);
  tracked(ctx, nameLine, tx, 412, 1.6, "left");

  ctx.fillStyle = YELLOW;
  ctx.font = `700 30px ${fonts.mono}`;
  tracked(ctx, "#FrameInGoa", tx, 470, 2, "left");

  ctx.fillStyle = "rgba(255,251,232,0.5)";
  ctx.font = `400 13px ${fonts.mono}`;
  tracked(ctx, "TILT THE CARD ON THE SITE TO SEE WHAT'S HIDING", tx, 506, 2, "left");

  /* keyline so the export reads as a designed frame, not a screenshot */
  ctx.strokeStyle = "rgba(255,251,232,0.20)";
  ctx.lineWidth = 2;
  roundRect(ctx, 14, 14, SCENE_W - 28, SCENE_H - 28, 12);
  ctx.stroke();

  ctx.restore();
}

/** Convenience wrapper: full-res scene straight to a PNG blob. */
export async function renderShareBlob(opts: {
  pass: MintedPass;
  photo: PhotoSource | null;
  fonts: Fonts;
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

import type { MintedPass } from "@/lib/builder";
import type { CardAssets } from "./assets";
import { drawCard, type Fonts, type PhotoSource } from "./draw";
import {
  SCENE_CARD,
  SCENE_H,
  SCENE_W,
  drawSceneBackdrop,
  drawSceneType,
  withCardTransform,
} from "./scene";
import type { LayerName } from "./theme";

/**
 * The lenticular sweep, in canvas.
 *
 * The card's whole gimmick is the tilt, and the artifact that gets posted was a
 * static PNG — so the best thing about it was invisible in the thing being
 * scored. This renders the reveal as video instead.
 *
 * The catch was that the interlace lived in CSS (`TidePass.module.css`) while
 * every export path is canvas, and `MediaRecorder` can only capture a canvas or
 * a stream, never a DOM element. So the mask maths is ported here rather than
 * the effect being approximated with a crossfade: the stripe geometry, the duty
 * cycle, the ramp and the parallax offset are all the same numbers the
 * stylesheet and `useTilt` use, and this file is the one place they are
 * duplicated. If the optics change on screen, they change here too.
 *
 * What is deliberately *not* reproduced is the card's 3D `rotateY` — the share
 * scene sets the card at a fixed angle in a composed frame, and a perspective
 * transform in canvas would cost a lot to make the card wobble inside a layout
 * built around it sitting still.
 */

/* ---- the numbers, mirrored from TidePass.module.css and useTilt ---- */

/** Strip pitch of the simulated lens array, at the reference card width. */
const PITCH = 3;
/** The card is `min(100%, 380px)` on screen; the mask pitch is relative to it. */
const REFERENCE_CARD_W = 380;
/** `translateX(calc(var(--tx) * ±6px))` on the hidden layers. */
const PARALLAX = 6;

/**
 * One cycle: flat → sunrise → flat → night → flat.
 *
 * 2.5s rather than the site's 4.6s. `playSweep` is pacing a reveal for someone
 * holding the card; this is pacing a loop in a timeline, where the whole thing
 * has to land before a thumb moves on.
 */
export const SWEEP_CYCLE_MS = 2500;
/** Two passes, so the loop is legible even where autoplay doesn't repeat. */
export const SWEEP_CYCLES = 2;
export const SWEEP_DURATION_MS = SWEEP_CYCLE_MS * SWEEP_CYCLES;
export const SWEEP_FPS = 30;

/**
 * Tilt and the two reveal amounts at phase `t` ∈ [0,1).
 *
 * `-sin(2πt)` is `playSweep`'s path and `max(0,v)^1.7` is the ramp `useTilt`
 * applies. The ramp is steep on purpose: each plate prints its own chrome at
 * slightly different heights, so a half-revealed layer shows both copies at
 * once, and ramping hard passes through that doubled zone quickly.
 */
export function sweepAt(t: number): {
  tilt: number;
  left: number;
  right: number;
} {
  const tilt = -Math.sin(t * Math.PI * 2);
  const ramp = (v: number) => Math.pow(Math.max(0, v), 1.7);
  return { tilt, left: ramp(-tilt), right: ramp(tilt) };
}

/**
 * Composite the three plates through the striped mask.
 *
 * The duty cycle runs 0 → 100% of the pitch as the card tilts, so at rest the
 * hidden layer contributes nothing and mid-tilt shows real interlaced banding
 * rather than a dissolve. Only one hidden layer is ever revealed at a time, so
 * both share a phase and interlace against the day layer rather than each
 * other — which is why this can clip and draw them independently.
 */
export function drawInterlaced(
  ctx: CanvasRenderingContext2D,
  layers: Record<LayerName, CanvasImageSource>,
  w: number,
  h: number,
  t: number,
) {
  const { tilt, left, right } = sweepAt(t);
  const scale = w / REFERENCE_CARD_W;
  const pitch = PITCH * scale;

  ctx.drawImage(layers.day, 0, 0, w, h);

  const hidden: Array<[LayerName, number, number]> = [
    ["sunrise", left, tilt * PARALLAX * scale],
    ["night", right, -tilt * PARALLAX * scale],
  ];

  for (const [name, reveal, offset] of hidden) {
    if (reveal <= 0.001) continue;

    ctx.save();
    ctx.globalAlpha = reveal;

    /*
     * At full duty the stripes tile the whole card, so there is no mask left to
     * apply — and applying one anyway is actively harmful. Canvas antialiases
     * every edge of a clip path, so ~130 abutting rects put a seam of partial
     * coverage between each pair, which reads as vertical scan lines across a
     * layer that should be solid. Skipping the clip is both faster and correct.
     */
    if (reveal < 0.995) {
      const stripe = pitch * reveal;

      /* the mask is a repeating-linear-gradient in CSS; here it's the same
         geometry as a clip path, one rect per lens. Snapped to whole device
         pixels for the same antialiasing reason. */
      ctx.beginPath();
      for (let x = 0; x < w; x += pitch) {
        const left = Math.round(x);
        const width = Math.max(1, Math.round(Math.min(stripe, w - x)));
        ctx.rect(left, 0, width, h);
      }
      ctx.clip();
    }

    ctx.drawImage(layers[name], offset, 0, w, h);
    ctx.restore();
  }
}

/**
 * A prepared sweep: everything expensive done once, so a frame is just blits.
 *
 * Drawing the card three times per frame would mean re-running the plate
 * decode, the text fitting and the photo crop 180 times over a two-cycle
 * recording, which does not hold 30fps. Instead the three layers and the static
 * chrome are rendered up front and each frame composites them.
 */
export type PreparedSweep = {
  width: number;
  height: number;
  drawFrame: (ctx: CanvasRenderingContext2D, t: number) => void;
};

function offscreen(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function prepareSweep(opts: {
  pass: MintedPass;
  photo: PhotoSource | null;
  fonts: Fonts;
  assets: CardAssets;
  scale?: number;
}): PreparedSweep {
  const scale = opts.scale ?? 1.5;
  const width = Math.round(SCENE_W * scale);
  const height = Math.round(SCENE_H * scale);

  /* ---- the three card printings, at the size they'll be composited ---- */
  const cardW = SCENE_CARD.w * scale;
  const cardH = SCENE_CARD.h * scale;

  const layers = {} as Record<LayerName, HTMLCanvasElement>;
  for (const layer of ["day", "sunrise", "night"] as LayerName[]) {
    const canvas = offscreen(cardW, cardH);
    const lctx = canvas.getContext("2d");
    if (!lctx) throw new Error("canvas 2d context unavailable");
    drawCard(lctx, canvas.width, canvas.height, {
      pass: opts.pass,
      photo: opts.photo,
      layer,
      fonts: opts.fonts,
      assets: opts.assets,
    });
    layers[layer] = canvas;
  }

  /* ---- the chrome, in two passes so the card can sit between them ---- */
  const backdrop = offscreen(width, height);
  const bctx = backdrop.getContext("2d");
  if (!bctx) throw new Error("canvas 2d context unavailable");
  bctx.scale(scale, scale);
  drawSceneBackdrop(bctx, opts.assets);

  const overlay = offscreen(width, height);
  const octx = overlay.getContext("2d");
  if (!octx) throw new Error("canvas 2d context unavailable");
  octx.scale(scale, scale);
  drawSceneType(octx, opts.pass, opts.fonts, { animated: true });

  const drawFrame = (ctx: CanvasRenderingContext2D, t: number) => {
    ctx.drawImage(backdrop, 0, 0);

    ctx.save();
    ctx.scale(scale, scale);
    withCardTransform(ctx, () => {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(0, 0, SCENE_CARD.w, SCENE_CARD.h, SCENE_CARD.radius);
      ctx.clip();
      /* back into layer pixels, since the plates were rendered at `scale` */
      ctx.scale(1 / scale, 1 / scale);
      drawInterlaced(ctx, layers, cardW, cardH, t);
      ctx.restore();
    });
    ctx.restore();

    ctx.drawImage(overlay, 0, 0);
  };

  return { width, height, drawFrame };
}

import type { Tier } from "@/lib/builder";

/**
 * The foil treatment for a rare pull.
 *
 * A physical foil card is a metallic layer under the ink: it doesn't tint the
 * artwork, it throws a diagonal sheen across it that changes with the light.
 * That's what this reproduces — a raking gradient sweep composited over the
 * finished card, plus a coloured keyline so the tier is legible at thumbnail
 * size in a timeline.
 *
 * `COMMON` draws nothing at all. Most cards are common, and a "treatment" every
 * card has is just a filter — the tier only means something if the majority
 * look exactly as they did before.
 *
 * Kept out of `draw.ts` and applied at a single call site there, so the card's
 * geometry and the card's finish stay separable.
 */

export type FoilStyle = {
  /** the keyline drawn around the card edge */
  edge: string;
  /** stops for the raking sheen, front to back */
  sheen: [string, string, string];
  /** the printed tier chip */
  chipFill: string;
  chipInk: string;
};

const STYLES: Partial<Record<Tier, FoilStyle>> = {
  RARE: {
    edge: "rgba(254,225,1,0.85)",
    sheen: ["rgba(255,255,255,0.00)", "rgba(255,240,160,0.30)", "rgba(255,255,255,0.00)"],
    chipFill: "#fee101",
    chipInk: "#0d3b2e",
  },
  MYTHIC: {
    edge: "rgba(255,0,128,0.9)",
    sheen: ["rgba(120,255,235,0.00)", "rgba(255,120,220,0.34)", "rgba(120,220,255,0.00)"],
    chipFill: "#ff0080",
    chipInk: "#fffbe8",
  },
};

export function foilStyle(tier: Tier): FoilStyle | null {
  return STYLES[tier] ?? null;
}

/**
 * Lay the sheen and keyline over an already-drawn card.
 *
 * `lighter` rather than `overlay` or `destination-out`: additive compositing
 * can only brighten, so it cannot punch a hole in the card background. Two
 * separate bugs have put transparency into this export before, and transparent
 * regions render as white bars on X — `scripts/flow.ts` asserts against exactly
 * that, and a finish applied at the very end of the draw is the easiest place
 * to reintroduce it.
 */
export function drawFoil(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tier: Tier,
) {
  const style = foilStyle(tier);
  if (!style) return;

  ctx.save();

  /* the sheen runs corner to corner, the way a foil catches a raking light */
  ctx.globalCompositeOperation = "lighter";
  const sheen = ctx.createLinearGradient(0, height, width, 0);
  sheen.addColorStop(0, style.sheen[0]);
  sheen.addColorStop(0.5, style.sheen[1]);
  sheen.addColorStop(1, style.sheen[2]);
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = style.edge;
  ctx.lineWidth = Math.max(2, width * 0.008);
  ctx.beginPath();
  ctx.roundRect(
    ctx.lineWidth / 2,
    ctx.lineWidth / 2,
    width - ctx.lineWidth,
    height - ctx.lineWidth,
    width * 0.02,
  );
  ctx.stroke();

  ctx.restore();
}

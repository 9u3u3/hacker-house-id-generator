/**
 * The sigil is drawn as geometry, never as a character. Symbol codepoints like
 * ◐ / ⌬ / ❋ aren't in Victor Mono, so as text they fall back unpredictably —
 * fine in a browser, tofu in a headless renderer, and the card is downloaded as
 * a flat image where a missing glyph is permanent.
 */

type Ctx = CanvasRenderingContext2D;

function poly(ctx: Ctx, cx: number, cy: number, r: number, n: number, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot - Math.PI / 2 + (i / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function star(ctx: Ctx, cx: number, cy: number, r: number, n: number, inner: number) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * @param size full width/height the mark should occupy
 */
export function drawSigil(
  ctx: Ctx,
  index: number,
  cx: number,
  cy: number,
  size: number,
  color: string,
  glow: string | null = null,
) {
  const r = size / 2;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.2, size * 0.075);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = size * 0.55;
  }

  switch (index % 12) {
    case 0: /* half-filled disc */ {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI / 2, -Math.PI / 2);
      ctx.fill();
      break;
    }
    case 1: /* diamond in diamond */ {
      poly(ctx, cx, cy, r, 4, Math.PI / 4);
      ctx.stroke();
      poly(ctx, cx, cy, r * 0.46, 4, Math.PI / 4);
      ctx.fill();
      break;
    }
    case 2: /* six-petal asterisk */ {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.2, cy + Math.sin(a) * r * 0.2);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.stroke();
      }
      break;
    }
    case 3: /* looped square knot */ {
      const q = r * 0.62;
      ctx.beginPath();
      ctx.rect(cx - q, cy - q, q * 2, q * 2);
      ctx.stroke();
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        ctx.beginPath();
        ctx.arc(cx + sx * q, cy + sy * q, r * 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 4: /* four-point sparkle */ {
      star(ctx, cx, cy, r, 4, 0.34);
      ctx.fill();
      break;
    }
    case 5: /* triangle, barred */ {
      poly(ctx, cx, cy, r, 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.55, cy + r * 0.18);
      ctx.lineTo(cx + r * 0.55, cy + r * 0.18);
      ctx.stroke();
      break;
    }
    case 6: /* stacked diamonds */ {
      poly(ctx, cx, cy, r, 4, Math.PI / 4);
      ctx.stroke();
      poly(ctx, cx, cy, r * 0.66, 4, 0);
      ctx.stroke();
      break;
    }
    case 7: /* hexagon with core */ {
      poly(ctx, cx, cy, r, 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 8: /* crescent */ {
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI * 0.32, Math.PI * 1.68);
      ctx.arc(cx + r * 0.42, cy, r * 0.86, Math.PI * 1.62, Math.PI * 0.38, true);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 9: /* six-point star, open */ {
      poly(ctx, cx, cy, r, 3);
      ctx.stroke();
      poly(ctx, cx, cy, r, 3, Math.PI);
      ctx.stroke();
      break;
    }
    case 10: /* concentric rings, broken */ {
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI * 0.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.58, Math.PI * 1.15, Math.PI * 0.85);
      ctx.stroke();
      break;
    }
    default: /* tide mark: two waves in a ring */ {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
      ctx.clip();
      for (let row = 0; row < 2; row++) {
        const yy = cy - r * 0.18 + row * r * 0.5;
        ctx.beginPath();
        for (let px = -r; px <= r; px += 1.5) {
          const y = yy + Math.sin((px / r) * Math.PI * 2 + row) * r * 0.16;
          if (px === -r) ctx.moveTo(cx + px, y);
          else ctx.lineTo(cx + px, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
  }

  ctx.restore();
}

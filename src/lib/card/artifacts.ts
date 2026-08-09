/**
 * Cartoon beach junk that washes up on the card. Deterministic per pass, so two
 * builders get different clutter but the same person always gets theirs.
 *
 * Drawn as chunky silhouettes with knocked-out detail rather than outline-plus-
 * fill: they share the scenery band with the palms, and a stroked cartoon next
 * to a solid palm reads as two different illustrations pasted together.
 */

type Ctx = CanvasRenderingContext2D;

export const ARTIFACTS = [
  "scooter",
  "boat",
  "coconut",
  "flipflops",
  "surfboard",
  "parasol",
  "starfish",
  "shell",
  "crab",
  "cassette",
] as const;

export type ArtifactKind = (typeof ARTIFACTS)[number];

/** Knock a hole in whatever was just filled — cheap cartoon linework. */
function cut(ctx: Ctx, path: () => void) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  path();
  ctx.restore();
}

function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * @param cx  horizontal centre
 * @param baseY  the sand line the object sits on
 * @param size  nominal height
 */
export function drawArtifact(
  ctx: Ctx,
  kind: ArtifactKind,
  cx: number,
  baseY: number,
  size: number,
  color: string,
) {
  const s = size / 100; /* authored against a 100px tall unit */

  ctx.save();
  ctx.translate(cx, baseY);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  switch (kind) {
    case "scooter": {
      /* The rented-in-Anjuna special. It has to read as a step-through scooter,
         not a bicycle, so the silhouette is one solid body — the giveaway
         shapes are the low floorboard and the tall front leg shield. */
      circle(ctx, -34, -18, 18);
      circle(ctx, 36, -18, 18);
      cut(ctx, () => {
        circle(ctx, -34, -18, 7);
        circle(ctx, 36, -18, 7);
      });

      ctx.beginPath();
      ctx.moveTo(-54, -30);
      ctx.quadraticCurveTo(-58, -58, -32, -60); /* rear body */
      ctx.lineTo(-8, -60); /* seat */
      ctx.quadraticCurveTo(6, -60, 10, -44);
      ctx.lineTo(13, -34); /* dip to the floorboard */
      ctx.lineTo(26, -34);
      ctx.quadraticCurveTo(31, -34, 33, -48); /* leg shield rises */
      ctx.lineTo(39, -80);
      ctx.lineTo(53, -78);
      ctx.lineTo(47, -42);
      ctx.quadraticCurveTo(45, -26, 34, -26); /* front fender */
      ctx.lineTo(-42, -26);
      ctx.closePath();
      ctx.fill();

      /* handlebar and headlight */
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(30, -84);
      ctx.lineTo(60, -78);
      ctx.stroke();
      circle(ctx, 49, -62, 7);
      break;
    }

    case "boat": {
      /* single-sail fishing dinghy */
      ctx.beginPath();
      ctx.moveTo(-46, -14);
      ctx.lineTo(46, -14);
      ctx.quadraticCurveTo(34, 4, 0, 4);
      ctx.quadraticCurveTo(-34, 4, -46, -14);
      ctx.closePath();
      ctx.fill();

      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-2, -16);
      ctx.lineTo(-2, -84);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(4, -80);
      ctx.quadraticCurveTo(40, -52, 34, -20);
      ctx.lineTo(4, -20);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case "coconut": {
      ctx.beginPath();
      ctx.arc(0, -34, 34, 0, Math.PI * 2);
      ctx.fill();
      cut(ctx, () => {
        ctx.beginPath();
        ctx.ellipse(-2, -60, 15, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      /* straw + tiny parasol */
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(2, -62);
      ctx.lineTo(26, -96);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-14, -86);
      ctx.lineTo(24, -102);
      ctx.lineTo(6, -74);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case "flipflops": {
      for (const [dx, rot] of [
        [-24, -0.18],
        [22, 0.16],
      ] as const) {
        ctx.save();
        ctx.translate(dx, -18);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, 17, 30, 0, 0, Math.PI * 2);
        ctx.fill();
        cut(ctx, () => {
          ctx.lineWidth = 5;
          ctx.strokeStyle = "#000";
          ctx.beginPath();
          ctx.moveTo(0, -4);
          ctx.lineTo(-11, -22);
          ctx.moveTo(0, -4);
          ctx.lineTo(11, -22);
          ctx.stroke();
        });
        ctx.restore();
      }
      break;
    }

    case "surfboard": {
      ctx.save();
      ctx.rotate(-0.22);
      /* wide enough to read as a board; the first pass was a needle */
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-36, -54, 0, -104);
      ctx.quadraticCurveTo(36, -54, 0, 0);
      ctx.closePath();
      ctx.fill();
      cut(ctx, () => {
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.lineTo(0, -88);
        ctx.stroke();
      });
      ctx.restore();
      break;
    }

    case "parasol": {
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -74);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-48, -70);
      ctx.quadraticCurveTo(0, -116, 48, -70);
      ctx.quadraticCurveTo(24, -80, 0, -70);
      ctx.quadraticCurveTo(-24, -80, -48, -70);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case "starfish": {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 40 : 16;
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const y = -34 + Math.sin(a) * r * 0.86;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      cut(ctx, () => {
        circle(ctx, 0, -34, 7);
      });
      break;
    }

    case "shell": {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 42, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      cut(ctx, () => {
        ctx.lineWidth = 4;
        for (let i = 1; i < 5; i++) {
          const a = Math.PI + (i / 5) * Math.PI;
          ctx.beginPath();
          ctx.moveTo(0, -2);
          ctx.lineTo(Math.cos(a) * 40, Math.sin(a) * 40);
          ctx.stroke();
        }
      });
      break;
    }

    case "crab": {
      ctx.beginPath();
      ctx.ellipse(0, -26, 32, 21, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 6;
      for (const dir of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(dir * 24, -30 + i * 9);
          ctx.lineTo(dir * 44, -20 + i * 11);
          ctx.stroke();
        }
        /* claw */
        ctx.beginPath();
        ctx.moveTo(dir * 26, -38);
        ctx.lineTo(dir * 46, -54);
        ctx.stroke();
        circle(ctx, dir * 50, -58, 9);
      }
      cut(ctx, () => {
        circle(ctx, -11, -32, 5);
        circle(ctx, 11, -32, 5);
      });
      break;
    }

    default: {
      /* mixtape — the trance coast runs on them */
      ctx.beginPath();
      ctx.roundRect(-44, -62, 88, 58, 7);
      ctx.fill();
      cut(ctx, () => {
        ctx.beginPath();
        ctx.roundRect(-32, -52, 64, 24, 4);
        ctx.fill();
        circle(ctx, -15, -22, 8);
        circle(ctx, 15, -22, 8);
      });
      break;
    }
  }

  ctx.restore();
}

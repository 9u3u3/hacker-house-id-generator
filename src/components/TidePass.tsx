"use client";

import { useEffect, useRef } from "react";
import type { MintedPass } from "@/lib/builder";
import { drawCard, type PhotoSource } from "@/lib/card/draw";
import { ensureFontsLoaded, resolveFonts } from "@/lib/card/fonts";
import { CARD_H, CARD_W, type LayerName } from "@/lib/card/theme";
import styles from "./TidePass.module.css";

const LAYERS: LayerName[] = ["day", "sunrise", "night"];

/** Render scale for the on-screen canvases. 2x is enough at card size. */
const SCREEN_SCALE = 2;

type Props = {
  pass: MintedPass;
  photo: PhotoSource | null;
  /** forwarded to the outer element so useTilt can publish CSS vars onto it */
  tiltRef: React.Ref<HTMLDivElement>;
  dragHandlers?: React.DOMAttributes<HTMLDivElement>;
  className?: string;
};

export function TidePass({ pass, photo, tiltRef, dragHandlers, className }: Props) {
  const canvases = useRef<Record<string, HTMLCanvasElement | null>>({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const fonts = resolveFonts();
      await ensureFontsLoaded(fonts);
      if (cancelled) return;

      for (const layer of LAYERS) {
        const canvas = canvases.current[layer];
        if (!canvas) continue;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        /* these canvases are reused across renders, so clear before redrawing */
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawCard(ctx, canvas.width, canvas.height, { pass, photo, layer, fonts });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pass, photo]);

  return (
    <div className={`${styles.stage} ${className ?? ""}`}>
      <div ref={tiltRef} className={styles.tilt} {...dragHandlers}>
        <div className={styles.card}>
          {LAYERS.map((layer) => (
            <canvas
              key={layer}
              ref={(el) => {
                canvases.current[layer] = el;
              }}
              width={CARD_W * SCREEN_SCALE}
              height={CARD_H * SCREEN_SCALE}
              className={styles[layer]}
              aria-hidden={layer !== "day"}
            />
          ))}

          {/* foil sweep and grain sit above the interlace, like laminate */}
          <div className={styles.foil} aria-hidden />
          <div className={styles.grain} aria-hidden />
        </div>
      </div>
    </div>
  );
}

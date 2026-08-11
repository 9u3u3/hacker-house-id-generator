"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MintedPass } from "@/lib/builder";
import { loadCardAssets, type CardAssets } from "@/lib/card/assets";
import { drawCard, type Fonts, type PhotoSource } from "@/lib/card/draw";
import { ensureFontsLoaded, resolveFonts } from "@/lib/card/fonts";
import { CARD_H, CARD_W, type LayerName } from "@/lib/card/theme";
import styles from "./TidePass.module.css";

const LAYERS: LayerName[] = ["day", "sunrise", "night"];

/**
 * Ceiling on backing-store resolution per layer.
 *
 * This used to be a flat 1240x1960 regardless of display size. Three of those
 * is roughly 29MB of canvas memory, and a mid-range Android simply fails the
 * allocation — which does not throw, it just leaves you with blank canvases.
 * Sizing to the element instead keeps a phone around 8MB.
 */
const MAX_CANVAS_W = CARD_W * 2;
const MAX_DPR = 2;

type Props = {
  pass: MintedPass;
  photo: PhotoSource | null;
  /** forwarded to the outer element so useTilt can publish CSS vars onto it */
  tiltRef: React.Ref<HTMLDivElement>;
  dragHandlers?: React.DOMAttributes<HTMLDivElement>;
  className?: string;
  /** surfaces draw failures to the UI instead of swallowing them */
  onDrawError?: (message: string) => void;
};

export function TidePass({
  pass,
  photo,
  tiltRef,
  dragHandlers,
  className,
  onDrawError,
}: Props) {
  const canvases = useRef<Record<string, HTMLCanvasElement | null>>({});
  const cardRef = useRef<HTMLDivElement | null>(null);

  const assets = useRef<CardAssets | null>(null);

  const draw = useCallback(
    (fonts: Fonts) => {
      if (!assets.current) return;
      const card = cardRef.current;
      if (!card) return;

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const cssW = card.clientWidth || 320;
      const w = Math.max(1, Math.min(Math.round(cssW * dpr), MAX_CANVAS_W));
      const h = Math.round(w * (CARD_H / CARD_W));

      for (const layer of LAYERS) {
        const canvas = canvases.current[layer];
        if (!canvas) continue;

        /* assigning width/height also clears the canvas, so only touch it when
           the size actually changed — otherwise every redraw thrashes */
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          onDrawError?.("canvas 2d context unavailable on this browser");
          return;
        }

        ctx.clearRect(0, 0, w, h);
        drawCard(ctx, w, h, { pass, photo, layer, fonts, assets: assets.current });
      }
    },
    [pass, photo, onDrawError],
  );

  useEffect(() => {
    /*
     * Draw immediately with whatever fonts are resolvable right now, then draw
     * again once the webfonts report in. Awaiting the fonts before the first
     * paint means any hang in document.fonts leaves the card permanently
     * blank — a card in a fallback face for 200ms is strictly better.
     */
    let cancelled = false;

    /* artwork first — nothing can be drawn without the plates */
    loadCardAssets()
      .then((loaded) => {
        if (cancelled) return;
        assets.current = loaded;
        draw(resolveFonts());
        return ensureFontsLoaded(resolveFonts());
      })
      .then(() => {
        if (!cancelled) draw(resolveFonts());
      })
      .catch((err) => {
        console.error("card render failed", err);
        onDrawError?.(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [draw, onDrawError]);

  /* the backing store is sized from layout, so it has to follow layout */
  useEffect(() => {
    const card = cardRef.current;
    if (!card || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver(() => {
      try {
        draw(resolveFonts());
      } catch (err) {
        console.error("card redraw failed", err);
      }
    });
    ro.observe(card);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <div className={`${styles.stage} ${className ?? ""}`}>
      <div ref={tiltRef} className={styles.tilt} {...dragHandlers}>
        <div ref={cardRef} className={styles.card}>
          {LAYERS.map((layer) => (
            <canvas
              key={layer}
              ref={(el) => {
                canvases.current[layer] = el;
              }}
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

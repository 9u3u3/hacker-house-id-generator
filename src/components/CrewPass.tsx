"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MintedCrew } from "@/lib/builder";
import { loadCardAssets, type CardAssets } from "@/lib/card/assets";
import { loadCrewPlates, type CrewPlates } from "@/lib/card/crewAssets";
import { drawCrewCard, type Fonts, type PhotoSource } from "@/lib/card/draw";
import { ensureFontsLoaded, resolveFonts } from "@/lib/card/fonts";
import { CREW } from "@/lib/card/layout";
import type { LayerName } from "@/lib/card/theme";
import styles from "./TidePass.module.css";

const LAYERS: LayerName[] = ["day", "sunrise", "night"];

/**
 * Ceiling on backing-store resolution per layer, for the reason TidePass has
 * one: a mid-range Android simply fails a large canvas allocation, and it does
 * not throw — it leaves you with blank canvases.
 */
const MAX_CANVAS_W = CREW.W;
const MAX_DPR = 2;

type Props = {
  crew: MintedCrew;
  photos: (PhotoSource | null)[];
  /** forwarded so useTilt can publish its CSS vars onto the same element */
  tiltRef: React.Ref<HTMLDivElement>;
  dragHandlers?: React.DOMAttributes<HTMLDivElement>;
  onDrawError?: (message: string) => void;
};

/**
 * The crew pass, on screen — and it tilts.
 *
 * Three printings interlaced through the same striped mask the solo card uses,
 * reusing `TidePass.module.css` rather than copying the optics. The card's shape
 * is the only thing that differs, so that is the only thing overridden; keeping
 * one stylesheet means the two cards cannot drift apart.
 *
 * If the crew plates aren't in the checkout, `drawCrewCard` falls back to the
 * composed background and ignores the layer, so all three canvases render the
 * same image. The tilt then does nothing visible, which is the correct
 * degradation — nothing breaks, there is just no reveal to see.
 */
export function CrewPass({
  crew,
  photos,
  tiltRef,
  dragHandlers,
  onDrawError,
}: Props) {
  const canvases = useRef<Record<string, HTMLCanvasElement | null>>({});
  const cardRef = useRef<HTMLDivElement | null>(null);
  const assets = useRef<CardAssets | null>(null);
  const plates = useRef<CrewPlates | null>(null);

  const draw = useCallback(
    (fonts: Fonts) => {
      if (!assets.current) return;
      const card = cardRef.current;
      if (!card) return;

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const cssW = card.clientWidth || 480;
      const w = Math.max(1, Math.min(Math.round(cssW * dpr), MAX_CANVAS_W));
      const h = Math.round(w * (CREW.H / CREW.W));

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
        drawCrewCard(ctx, w, h, {
          crew,
          photos,
          fonts,
          assets: assets.current,
          plates: plates.current,
          layer,
        });
      }
    },
    [crew, photos, onDrawError],
  );

  useEffect(() => {
    /* draw with whatever's resolvable now, then again once the webfonts report
       in — awaiting them first leaves the card blank if document.fonts hangs */
    let cancelled = false;

    Promise.all([loadCardAssets(), loadCrewPlates()])
      .then(([loaded, crewPlates]) => {
        if (cancelled) return;
        assets.current = loaded;
        plates.current = crewPlates;
        draw(resolveFonts());
        return ensureFontsLoaded(resolveFonts());
      })
      .then(() => {
        if (!cancelled) draw(resolveFonts());
      })
      .catch((err) => {
        console.error("crew render failed", err);
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
        console.error("crew redraw failed", err);
      }
    });
    ro.observe(card);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <div className={styles.stage}>
      <div
        ref={tiltRef}
        className={styles.tilt}
        /* the only thing the crew card changes about the optics is its shape */
        style={
          {
            "--card-aspect": `${CREW.W} / ${CREW.H}`,
            /* landscape and dense with small type, so it needs room — at the
               solo card's 380px the member names were unreadable */
            "--card-width": "1100px",
          } as React.CSSProperties
        }
        {...dragHandlers}
      >
        <div ref={cardRef} className={styles.card}>
          {LAYERS.map((layer) => (
            <canvas
              key={layer}
              ref={(el) => {
                canvases.current[layer] = el;
              }}
              className={styles[layer]}
              aria-hidden={layer !== "day"}
              aria-label={layer === "day" ? `${crew.team} crew pass` : undefined}
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

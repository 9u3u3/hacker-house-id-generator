"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MintedCrew } from "@/lib/builder";
import { loadCardAssets, type CardAssets } from "@/lib/card/assets";
import { drawCrewCard, type Fonts, type PhotoSource } from "@/lib/card/draw";
import { ensureFontsLoaded, resolveFonts } from "@/lib/card/fonts";
import { CREW } from "@/lib/card/layout";

/** Same ceiling TidePass uses, for the same reason: phones fail big allocations
    silently and leave you with a blank canvas rather than an error. */
const MAX_DPR = 2;
const MAX_CANVAS_W = CREW.W * 2;

type Props = {
  crew: MintedCrew;
  photos: (PhotoSource | null)[];
  onDrawError?: (message: string) => void;
};

/**
 * The crew pass, on screen.
 *
 * One canvas rather than TidePass's three: the lenticular tilt is the solo
 * card's payoff and stays there. A crew pass is a different artifact — landscape,
 * already 16:9, and drawn from the day plate only — so there is nothing to
 * interlace and no second face to hide a secret on.
 *
 * Reusing TidePass here would have meant reshaping its layer stack and the CSS
 * mask geometry around a card of a different aspect, which is exactly the change
 * `npm run check:mobile` exists to catch. Leaving the solo path untouched is
 * worth more than sharing the component.
 */
export function CrewPass({ crew, photos, onDrawError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const assets = useRef<CardAssets | null>(null);

  const draw = useCallback(
    (fonts: Fonts) => {
      const canvas = canvasRef.current;
      if (!canvas || !assets.current) return;

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const cssW = canvas.clientWidth || 320;
      const w = Math.max(1, Math.min(Math.round(cssW * dpr), MAX_CANVAS_W));
      const h = Math.round(w * (CREW.H / CREW.W));

      /* assigning width/height clears the canvas, so only touch it on a real
         size change — otherwise every redraw thrashes */
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
      drawCrewCard(ctx, w, h, { crew, photos, fonts, assets: assets.current });
    },
    [crew, photos, onDrawError],
  );

  useEffect(() => {
    /* draw with whatever's resolvable now, then again once the webfonts report
       in — awaiting them first leaves the card blank if document.fonts hangs */
    let cancelled = false;

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
        console.error("crew render failed", err);
        onDrawError?.(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [draw, onDrawError]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver(() => {
      try {
        draw(resolveFonts());
      } catch (err) {
        console.error("crew redraw failed", err);
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ aspectRatio: `${CREW.W} / ${CREW.H}` }}
      className="w-full rounded-xl border border-paper/15 shadow-2xl"
      aria-label={`${crew.team} crew pass`}
    />
  );
}

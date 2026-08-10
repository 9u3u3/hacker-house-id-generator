"use client";

import { useEffect, useState } from "react";

/**
 * On-page readout of the things that differ between a dev machine and a real
 * phone. Reachable at `?debug=1`.
 *
 * The card rendered blank on a physical Android while every desktop and
 * emulated run looked perfect, and there was no way to see why from here — a
 * green card failing to draw on a green page looks exactly like a green card.
 * This makes the invisible state readable on the device itself.
 */
export function Diagnostics() {
  const [rows, setRows] = useState<[string, string][] | null>(null);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("debug")) return;

    const collect = () => {
      const canvases = Array.from(document.querySelectorAll("canvas"));
      const first = canvases[0];

      let drawn = "n/a";
      if (first) {
        const ctx = first.getContext("2d");
        if (ctx && first.width && first.height) {
          try {
            const d = ctx.getImageData(0, 0, first.width, first.height).data;
            const seen = new Set<number>();
            for (let i = 0; i < d.length; i += 4 * 331) {
              seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
            }
            drawn = `${seen.size} colours`;
          } catch (err) {
            drawn = `readback blocked (${err instanceof Error ? err.name : "?"})`;
          }
        } else {
          drawn = "no context or zero size";
        }
      }

      const mp = canvases.reduce((a, c) => a + (c.width * c.height) / 1e6, 0);

      setRows([
        ["secure context", String(window.isSecureContext)],
        ["deviceorientation", String("DeviceOrientationEvent" in window)],
        ["pointer coarse", String(window.matchMedia("(pointer: coarse)").matches)],
        ["dpr", String(window.devicePixelRatio)],
        ["canvases", String(canvases.length)],
        ["canvas size", first ? `${first.width}x${first.height}` : "none"],
        ["canvas total", `${mp.toFixed(2)} MP`],
        ["day layer", drawn],
        ["fonts api", String(!!document.fonts)],
        ["fonts status", document.fonts?.status ?? "n/a"],
        ["imbue loaded", String(document.fonts?.check?.('700 74px "Imbue"') ?? "n/a")],
        ["roundRect", String(typeof CanvasRenderingContext2D !== "undefined" &&
          "roundRect" in CanvasRenderingContext2D.prototype)],
        ["ua", navigator.userAgent.slice(0, 64)],
      ]);
    };

    /* give the card a beat to draw before sampling it */
    const t = setTimeout(collect, 2500);
    return () => clearTimeout(t);
  }, []);

  if (!rows) return null;

  return (
    <div className="mx-auto mb-10 max-w-md rounded-xl border border-pink/50 bg-green-ink/70 p-4">
      <p className="mb-2 font-mono text-[10px] tracking-[0.3em] text-pink">
        DIAGNOSTICS
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[10px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-paper/50">{k}</dt>
            <dd className="break-all text-paper">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

import type { LayerName } from "./theme";

/**
 * The card artwork is now three illustrated plates plus the गोवा badge, rather
 * than procedural drawing. They have to be decoded before the first draw, so
 * loading is cached and shared: the tilt view draws three layers and the export
 * draws a fourth copy, and none of them should re-fetch.
 */

export type CardAssets = {
  plates: Record<LayerName, CanvasImageSource>;
  badge: CanvasImageSource;
};

const SOURCES = {
  day: "/plates/day.webp",
  sunrise: "/plates/sunrise.webp",
  night: "/plates/night.webp",
  badge: "/plates/goa-badge.png",
} as const;

function loadOne(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

let cached: Promise<CardAssets> | null = null;

export function loadCardAssets(): Promise<CardAssets> {
  if (cached) return cached;

  cached = (async () => {
    const [day, sunrise, night, badge] = await Promise.all([
      loadOne(SOURCES.day),
      loadOne(SOURCES.sunrise),
      loadOne(SOURCES.night),
      loadOne(SOURCES.badge),
    ]);
    return { plates: { day, sunrise, night }, badge };
  })();

  /* a failed load shouldn't poison the cache forever */
  cached.catch(() => {
    cached = null;
  });

  return cached;
}

import { CREW_PLATES_AVAILABLE } from "./crewPlatesManifest";
import type { LayerName } from "./theme";

/**
 * The crew pass's own illustrated plates.
 *
 * The solo card has three printings of one design — day, sunrise, blacklight —
 * and the crew card originally faked its background by blurring the day plate
 * up to fill a landscape frame. These are the real thing: three 16:9 scenes,
 * same subject under three lights.
 *
 * Loading is **optional on purpose**. Every call site falls back to the
 * composed background if any plate is missing, so the crew pass keeps working
 * on a checkout where the art hasn't been dropped in yet, and a half-finished
 * asset drop can't take the feature down mid-competition.
 *
 * Unlike `plates.ts`, these need no registration pass. They carry no printed
 * photo window and no card border — the tiles, the keyline and every word are
 * drawn in code — so there is nothing between the three that can fail to line
 * up. See `docs/crew-plates.md`.
 */

export type CrewPlates = Record<LayerName, CanvasImageSource>;

const SOURCES: Record<LayerName, string> = {
  day: "/plates/crew/day.webp",
  sunrise: "/plates/crew/sunrise.webp",
  night: "/plates/crew/night.webp",
};

function loadOne(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`missing ${src}`));
    img.src = src;
  });
}

let cached: Promise<CrewPlates | null> | null = null;

/** Resolves to null — never rejects — when the art isn't present. */
export function loadCrewPlates(): Promise<CrewPlates | null> {
  if (cached) return cached;

  /* Ask the manifest rather than probing the network. Discovering the art by
     requesting it and catching the failure works, but a miss logs a 404 on
     every visit — noise in production, and it makes a genuinely broken asset
     indistinguishable from the expected empty state. */
  if (!CREW_PLATES_AVAILABLE) {
    cached = Promise.resolve(null);
    return cached;
  }

  cached = (async () => {
    try {
      const [day, sunrise, night] = await Promise.all([
        loadOne(SOURCES.day),
        loadOne(SOURCES.sunrise),
        loadOne(SOURCES.night),
      ]);
      return { day, sunrise, night };
    } catch {
      /* the fallback background is a supported state, not an error */
      return null;
    }
  })();

  return cached;
}

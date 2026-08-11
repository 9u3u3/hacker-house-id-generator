import type { Fonts } from "./draw";

/**
 * next/font hashes the family name at build time (`__Imbue_a1b2c3`), so the
 * only reliable way to name it in a canvas `ctx.font` string is to read back
 * the CSS variable it exposes.
 */
export function resolveFonts(): Fonts {
  if (typeof window === "undefined") {
    return { display: "serif", mono: "monospace" };
  }
  const s = getComputedStyle(document.documentElement);
  return {
    display: s.getPropertyValue("--font-bodoni").trim() || "serif",
    mono: s.getPropertyValue("--font-victor-mono").trim() || "monospace",
  };
}

/**
 * Canvas does not trigger font loading and does not wait for it — draw too
 * early and the card silently renders in Times New Roman. Every size/weight
 * combination the card uses has to be requested explicitly.
 */
export async function ensureFontsLoaded(fonts: Fonts): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;

  const specs = [
    `900 170px ${fonts.display}`,
    `700 17px ${fonts.mono}`,
    `400 17px ${fonts.mono}`,
    `400 13px ${fonts.mono}`,
    `700 46px ${fonts.mono}`,
    `700 25px ${fonts.mono}`,
  ];

  /*
   * Hard timeout. `document.fonts.ready` is supposed to settle once loading
   * finishes, but a browser that never resolves it would otherwise block every
   * caller forever — and the callers here gate rendering and export on it.
   * Falling back to system faces beats hanging.
   */
  const withTimeout = <T,>(p: Promise<T>, ms: number) =>
    Promise.race([p, new Promise<void>((resolve) => setTimeout(resolve, ms))]);

  await withTimeout(
    Promise.all(specs.map((s) => document.fonts.load(s).catch(() => undefined))),
    3000,
  );
  await withTimeout(document.fonts.ready, 1000);
}

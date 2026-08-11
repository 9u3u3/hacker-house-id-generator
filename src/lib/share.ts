import type { MintedPass } from "./builder";
import { resolveFonts, ensureFontsLoaded } from "./card/fonts";
import { loadCardAssets } from "./card/assets";
import { renderShareBlob } from "./card/scene";
import type { PhotoSource } from "./card/draw";

export type ShareResult = { url: string };

/**
 * Publish, then hand X a link whose OG image is the rendered card.
 *
 * The web intent can't attach an image directly, so the link preview is what
 * makes the tweet show the graphic — which is also why the pass has to be
 * uploaded rather than kept local. The photo only leaves the device here, on
 * an explicit share; download stays entirely offline.
 */
export async function shareToX(params: {
  pass: MintedPass;
  photo: PhotoSource | null;
  salt: number;
}): Promise<ShareResult> {
  const { pass, photo, salt } = params;

  const fonts = resolveFonts();
  const [assets] = await Promise.all([loadCardAssets(), ensureFontsLoaded(fonts)]);
  const blob = await renderShareBlob({ pass, photo, fonts, assets });

  const form = new FormData();
  form.append("image", blob, "pass.png");
  form.append(
    "meta",
    JSON.stringify({
      name: pass.name,
      role: pass.role,
      stack: pass.stack,
      handle: pass.handle,
      builderClass: pass.builderClass,
      serial: pass.serial,
      seat: pass.seat,
      salt,
    }),
  );

  const res = await fetch("/api/publish", { method: "POST", body: form });
  if (!res.ok) throw new Error(`publish failed: ${res.status}`);
  const { path } = (await res.json()) as { path: string };

  const url = `${window.location.origin}${path}`;

  const text = `I'm a ${pass.builderClass} at Hacker House Goa 2026 — pass ${pass.serial}. Tilt the card, it doesn't show you the same thing twice.\n\n#FrameInGoa`;
  const intent = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

  window.open(intent, "_blank", "noopener,noreferrer");

  return { url };
}

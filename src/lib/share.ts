import type { MintedCrew, MintedPass } from "./builder";
import { resolveFonts, ensureFontsLoaded } from "./card/fonts";
import { loadCardAssets } from "./card/assets";
import { renderCrewBlob, renderShareBlob } from "./card/scene";
import type { PhotoSource } from "./card/draw";

export const SHARE_TAG = "#FrameInGoa";

/**
 * Publishing failed with a real HTTP status.
 *
 * The status is carried rather than swallowed because the two failures a user
 * can hit look identical otherwise: a 502 means the deploy has no blob store
 * configured (nothing they can do), a 429 means they're going too fast (wait a
 * minute). "couldn't publish — try again" told them neither.
 */
export class PublishError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PublishError";
    this.status = status;
  }
}

export function describePublishError(err: unknown): string {
  if (err instanceof PublishError) {
    if (err.status === 429) return "too many publishes — wait a minute and retry";
    if (err.status === 502)
      return "publish storage isn't configured on this deploy (502) — sharing the link instead";
    if (err.status === 413) return "that render came out too large (413)";
    return `publish failed (${err.status}) — sharing the link instead`;
  }
  return "publish failed — sharing the link instead";
}

/* ------------------------------------------------------------------ */
/* the caption                                                         */
/* ------------------------------------------------------------------ */

export function captionFor(pass: MintedPass): string {
  /* a rare pull is the reason someone posts rather than just downloading, so
     it leads the caption when there is one */
  const pull = pass.tier === "COMMON" ? "" : `${pass.tier} pull — `;
  return (
    `${pull}I'm a ${pass.builderClass} at Hacker House Goa 2026 — pass ${pass.serial}. ` +
    `Tilt the card, it doesn't show you the same thing twice.\n\n${SHARE_TAG}`
  );
}

export function captionForCrew(crew: MintedCrew): string {
  const names = crew.members.map((m) => m.name).join(", ");
  return (
    `${crew.team} took one frame together at Hacker House Goa 2026 — ` +
    `${names}. Crew pass ${crew.serial}. Make your team's with the generator.` +
    `\n\n${SHARE_TAG}`
  );
}

export function intentUrl(caption: string, url: string): string {
  return (
    `https://x.com/intent/tweet?text=${encodeURIComponent(caption)}` +
    `&url=${encodeURIComponent(url)}`
  );
}

/* ------------------------------------------------------------------ */
/* rendering and publishing                                            */
/* ------------------------------------------------------------------ */

/** The 16:9 share composition, as a PNG blob. Nothing leaves the device here. */
export async function renderPass(params: {
  pass: MintedPass;
  photo: PhotoSource | null;
}): Promise<Blob> {
  const fonts = resolveFonts();
  const [assets] = await Promise.all([loadCardAssets(), ensureFontsLoaded(fonts)]);
  return await renderShareBlob({ pass: params.pass, photo: params.photo, fonts, assets });
}

/**
 * Upload a rendered pass and get back the page whose OG image is that render.
 *
 * The web intent can't attach an image, so the link preview is what makes the
 * tweet show the graphic — which is why the pass has to be uploaded rather than
 * kept local. Downloads stay entirely offline.
 */
export async function publishRender(
  blob: Blob,
  meta: Record<string, unknown>,
): Promise<{ slug: string; path: string }> {
  const form = new FormData();
  form.append("image", blob, "pass.png");
  form.append("meta", JSON.stringify(meta));

  let res: Response;
  try {
    res = await fetch("/api/publish", { method: "POST", body: form });
  } catch {
    throw new PublishError(0, "network unreachable");
  }

  if (!res.ok) throw new PublishError(res.status, `publish failed: ${res.status}`);
  return (await res.json()) as { slug: string; path: string };
}

/** The combined team pass. Already 16:9, so there is no compositing step. */
export async function renderCrew(params: {
  crew: MintedCrew;
  photos: (PhotoSource | null)[];
}): Promise<Blob> {
  const fonts = resolveFonts();
  const [assets] = await Promise.all([loadCardAssets(), ensureFontsLoaded(fonts)]);
  return await renderCrewBlob({
    crew: params.crew,
    photos: params.photos,
    fonts,
    assets,
  });
}

export function metaForCrew(crew: MintedCrew, salt: number): Record<string, unknown> {
  return {
    team: crew.team,
    members: crew.members.map((m) => ({
      name: m.name,
      builderClass: m.builderClass,
      tier: m.tier,
    })),
    /* the flat fields stay populated so an older reader of the record — and the
       page's own fallbacks — still have something to print */
    name: crew.team,
    builderClass: `${crew.members.length} BUILDERS · ONE FRAME`,
    serial: crew.serial,
    role: "",
    stack: "",
    handle: "",
    seat: "",
    salt,
  };
}

export function metaFor(pass: MintedPass, salt: number): Record<string, unknown> {
  return {
    name: pass.name,
    role: pass.role,
    stack: pass.stack,
    handle: pass.handle,
    builderClass: pass.builderClass,
    tier: pass.tier,
    serial: pass.serial,
    seat: pass.seat,
    salt,
  };
}

/* ------------------------------------------------------------------ */
/* the window                                                          */
/* ------------------------------------------------------------------ */

/**
 * Claim a tab **synchronously, inside the click handler**.
 *
 * This is the bug that made SHARE TO X do nothing. The old flow awaited font
 * loading, a canvas render and a `fetch` before calling `window.open` — and
 * browsers only honour `window.open` while the user gesture is still active.
 * After those awaits the activation is spent, so Safari and Chrome-Android
 * swallowed the call silently and desktop Chrome usually did too.
 *
 * Claiming the tab first and pointing it somewhere later costs nothing and
 * works everywhere. `noopener` is deliberately *not* passed: with it the
 * browser returns `null` and there is no handle left to redirect. The opener
 * link is severed by hand instead.
 */
export function openBlankTab(): Window | null {
  try {
    const w = window.open("about:blank", "_blank");
    if (w) {
      try {
        w.opener = null;
      } catch {
        /* some browsers make `opener` read-only; about:blank is same-origin
           and short-lived, so this is not worth failing the share over */
      }
    }
    return w;
  } catch {
    return null;
  }
}

/** Point a claimed tab at a URL, or fall back to navigating this one. */
export function sendTabTo(tab: Window | null, url: string): void {
  if (tab && !tab.closed) {
    tab.location.href = url;
    return;
  }
  /* the popup was blocked despite being opened on the gesture — the visible
     <a> fallback in the UI covers this, but try a same-tab hop first */
  window.open(url, "_blank", "noopener,noreferrer");
}

/* ------------------------------------------------------------------ */
/* native mobile sharing                                               */
/* ------------------------------------------------------------------ */

export function pngFile(blob: Blob, serial: string): File {
  return new File([blob], `hh-goa-2026-${serial.toLowerCase()}.png`, {
    type: "image/png",
  });
}

export function videoFile(blob: Blob, serial: string, ext: string): File {
  return new File([blob], `hh-goa-2026-${serial.toLowerCase()}.${ext}`, {
    type: blob.type,
  });
}

/**
 * Whether this device can share the actual image rather than a link.
 *
 * On a phone this is strictly better: the PNG is attached to the post instead
 * of relying on a crawler fetching the OG tag, so the card is visible even if
 * the preview never resolves.
 */
export function canShareFile(file: File): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare || !navigator.share) {
    return false;
  }
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Returns false when the user dismissed the sheet, throws on real failures. */
export async function shareFileNatively(params: {
  file: File;
  caption: string;
  url: string;
}): Promise<boolean> {
  try {
    await navigator.share({
      files: [params.file],
      text: params.caption,
      url: params.url,
    });
    return true;
  } catch (err) {
    /* AbortError is the user closing the sheet — not something to report */
    if (err instanceof Error && err.name === "AbortError") return false;
    throw err;
  }
}

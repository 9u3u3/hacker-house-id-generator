import type { PhotoSource } from "./card/draw";

export type LoadedPhoto = {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /** where the face was found, in bitmap pixels — null if we fell back */
  face: Box | null;
};

export type Box = { x: number; y: number; w: number; h: number };

const HEIC_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence"]);

function looksLikeHeic(file: File): boolean {
  if (HEIC_TYPES.has(file.type.toLowerCase())) return true;
  /* iOS sometimes hands over an empty MIME type, so fall back to the name */
  return /\.hei[cf]$/i.test(file.name);
}

/**
 * Decode any of the formats a phone camera roll might hand us into an
 * ImageBitmap with EXIF rotation already applied.
 *
 * `imageOrientation: "from-image"` is what stops portrait iPhone shots from
 * arriving sideways — without it every photo taken in portrait lands rotated.
 */
export async function decodeImage(file: File): Promise<ImageBitmap> {
  if (looksLikeHeic(file)) {
    /* Safari decodes HEIC natively; everything else needs the wasm path, and
       it's ~1.5MB so it only loads when a HEIC actually shows up. */
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      const { heicTo } = await import("heic-to");
      const converted = await heicTo({
        blob: file,
        type: "image/jpeg",
        quality: 0.92,
      });
      return await createImageBitmap(converted, {
        imageOrientation: "from-image",
      });
    }
  }

  return await createImageBitmap(file, { imageOrientation: "from-image" });
}

type NativeFaceDetector = {
  detect: (
    source: ImageBitmapSource,
  ) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
};

/**
 * Best-effort face location. Chrome ships a native detector behind
 * `window.FaceDetector`; nothing else does, and it is never worth blocking the
 * flow on, so a miss just returns null and the crop falls back to the
 * portrait heuristic.
 */
export async function detectFace(bitmap: ImageBitmap): Promise<Box | null> {
  const Ctor = (
    window as unknown as {
      FaceDetector?: new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => NativeFaceDetector;
    }
  ).FaceDetector;
  if (!Ctor) return null;

  try {
    const detector = new Ctor({ fastMode: true, maxDetectedFaces: 8 });
    const faces = await detector.detect(bitmap);
    if (!faces.length) return null;

    /* biggest face wins — in a group shot that's whoever is closest */
    const best = faces.reduce((a, b) =>
      a.boundingBox.width * a.boundingBox.height >=
      b.boundingBox.width * b.boundingBox.height
        ? a
        : b,
    );
    const r = best.boundingBox;
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  } catch {
    return null;
  }
}

export async function loadPhoto(file: File): Promise<LoadedPhoto> {
  const bitmap = await decodeImage(file);
  const face = await detectFace(bitmap);
  return { bitmap, width: bitmap.width, height: bitmap.height, face };
}

/**
 * Choose the source rectangle for the card's photo window.
 *
 * With a detected face we frame it like a passport photo: head in the upper
 * third, a bit of room above. Without one we bias the crop upward instead of
 * centring, because in an uncropped portrait the subject's head is almost
 * never at the vertical middle of the frame — a plain centre crop cuts it off.
 */
export function computeCrop(
  photo: LoadedPhoto,
  targetAspect: number,
  adjust: { zoom: number; offsetX: number; offsetY: number } = {
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  },
): PhotoSource {
  const { width: iw, height: ih, face } = photo;

  /* largest rect of the target aspect that fits inside the source */
  let cropW = Math.min(iw, ih * targetAspect);
  let cropH = cropW / targetAspect;

  cropW /= adjust.zoom;
  cropH /= adjust.zoom;

  let cx: number;
  let cy: number;

  if (face) {
    cx = face.x + face.w / 2;
    /* put the face centre ~38% down the window rather than dead centre */
    cy = face.y + face.h / 2 + cropH * 0.12;
    /* and make sure the head isn't filling the whole frame */
    const desired = face.h * 3.6;
    if (desired > cropH && desired <= ih) {
      cropH = Math.min(ih, desired);
      cropW = Math.min(iw, cropH * targetAspect);
      cropH = cropW / targetAspect;
    }
  } else {
    cx = iw / 2;
    cy = ih * 0.42;
  }

  cx += adjust.offsetX * cropW;
  cy += adjust.offsetY * cropH;

  /* keep the window inside the image */
  const sx = Math.max(0, Math.min(iw - cropW, cx - cropW / 2));
  const sy = Math.max(0, Math.min(ih - cropH, cy - cropH / 2));

  return { image: photo.bitmap, sx, sy, sw: cropW, sh: cropH };
}

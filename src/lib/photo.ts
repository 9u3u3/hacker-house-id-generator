import type { PhotoSource } from "./card/draw";

export type LoadedPhoto = {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** where the face was found, in bitmap pixels — null if we fell back */
  face: Box | null;
  /** what the crop should centre on: face centre, or the saliency centroid */
  focus: { x: number; y: number } | null;
};

export type Box = { x: number; y: number; w: number; h: number };

const HEIC_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence"]);

function looksLikeHeic(file: File): boolean {
  if (HEIC_TYPES.has(file.type.toLowerCase())) return true;
  /* iOS sometimes hands over an empty MIME type, so fall back to the name */
  return /\.hei[cf]$/i.test(file.name);
}

/** Anything canvas can draw. Not every browser gives us an ImageBitmap. */
export type Decoded = {
  source: CanvasImageSource;
  width: number;
  height: number;
};

/** Last-resort decode: an <img> element off an object URL. */
async function decodeViaImgElement(blob: Blob): Promise<Decoded> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    /* browsers apply EXIF orientation to <img> by default, which is what we
       want and matches the imageOrientation:"from-image" path above */
    img.src = url;

    await (img.decode
      ? img.decode()
      : new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("image failed to load"));
        }));

    if (!img.naturalWidth) throw new Error("image decoded with zero width");
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    /* the element keeps its own reference to the decoded data */
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/**
 * Decode whatever the camera roll hands us into something canvas can draw,
 * with EXIF rotation already applied.
 *
 * Every step here is a fallback for a browser that lacks the one before it.
 * `createImageBitmap` doesn't exist everywhere, and where it does the options
 * argument is a later addition — passing it to an older implementation throws,
 * which previously surfaced as "couldn't read that image" for a perfectly
 * valid JPEG. Orientation matters because without it portrait phone shots
 * arrive sideways.
 */
async function decodeBlob(blob: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      });
      return { source: bmp, width: bmp.width, height: bmp.height };
    } catch {
      /* options unsupported, or the codec is refused — keep going */
    }

    try {
      const bmp = await createImageBitmap(blob);
      return { source: bmp, width: bmp.width, height: bmp.height };
    } catch {
      /* fall through to the element path */
    }
  }

  return await decodeViaImgElement(blob);
}

export async function decodeImage(file: File): Promise<Decoded> {
  try {
    return await decodeBlob(file);
  } catch (err) {
    /* HEIC is the usual reason a native decode fails off an iPhone. The wasm
       decoder is ~1.5MB, so it only loads once we actually need it. */
    if (!looksLikeHeic(file)) throw err;

    const { heicTo } = await import("heic-to");
    const converted = await heicTo({
      blob: file,
      type: "image/jpeg",
      quality: 0.92,
    });
    return await decodeBlob(converted);
  }
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
export async function detectFace(image: Decoded): Promise<Box | null> {
  const Ctor = (
    window as unknown as {
      FaceDetector?: new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => NativeFaceDetector;
    }
  ).FaceDetector;
  if (!Ctor) return null;

  try {
    const detector = new Ctor({ fastMode: true, maxDetectedFaces: 8 });
    const faces = await detector.detect(image.source as ImageBitmapSource);
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

/**
 * Content-aware focal point, for when there's no face detector.
 *
 * A plain centre crop is wrong for exactly the photos the brief warns about —
 * an off-centre subject in a landscape frame gets shoved against the edge or
 * cut in half. This downscales to a thumbnail and scores each pixel on edge
 * energy plus skin-likeness, then returns the centroid of that attention mass.
 * It costs a few milliseconds and needs no model.
 */
function saliencyFocus(image: Decoded): { x: number; y: number } | null {
  const MAX = 128;
  const scale = Math.min(1, MAX / Math.max(image.width, image.height));
  const w = Math.max(8, Math.round(image.width * scale));
  const h = Math.max(8, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(image.source, 0, 0, w, h);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null; /* tainted canvas — shouldn't happen for local files */
  }

  const luma = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    luma[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  let sum = 0;
  let sx = 0;
  let sy = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;

      /* gradient magnitude: where the detail is */
      const gx = luma[p + 1] - luma[p - 1];
      const gy = luma[p + w] - luma[p - w];
      let score = Math.sqrt(gx * gx + gy * gy);

      /* skin gets weighted up, since the subject is usually a person */
      const i4 = p * 4;
      const r = data[i4];
      const g = data[i4 + 1];
      const b = data[i4 + 2];
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      if (r > 95 && g > 40 && b > 20 && mx - mn > 15 && r > g && r > b && r - g > 15) {
        score += 90;
      }

      sum += score;
      sx += score * x;
      sy += score * y;
    }
  }

  if (sum <= 0) return null;
  return { x: sx / sum / scale, y: sy / sum / scale };
}

export async function loadPhoto(file: File): Promise<LoadedPhoto> {
  const decoded = await decodeImage(file);
  const face = await detectFace(decoded);
  const focus = face
    ? { x: face.x + face.w / 2, y: face.y + face.h / 2 }
    : saliencyFocus(decoded);
  return {
    source: decoded.source,
    width: decoded.width,
    height: decoded.height,
    face,
    focus,
  };
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
  } else if (photo.focus) {
    /* content-aware centre, nudged up so there's headroom above the subject */
    cx = photo.focus.x;
    cy = photo.focus.y + cropH * 0.06;
  } else {
    cx = iw / 2;
    cy = ih * 0.42;
  }

  cx += adjust.offsetX * cropW;
  cy += adjust.offsetY * cropH;

  /* keep the window inside the image */
  const sx = Math.max(0, Math.min(iw - cropW, cx - cropW / 2));
  const sy = Math.max(0, Math.min(ih - cropH, cy - cropH / 2));

  return { image: photo.source, sx, sy, sw: cropW, sh: cropH };
}

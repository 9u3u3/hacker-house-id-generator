import type { PhotoSource } from "./card/draw";

/**
 * How the framing was arrived at, worst to best.
 *
 * Surfaced in the UI rather than kept internal: "we found a face" and "we
 * guessed from where the detail is" produce visibly different crops, and when
 * the crop is wrong the user's first question is which of the two happened.
 */
export type Framing = "face" | "subject" | "centre";

export type LoadedPhoto = {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** where the face was found, in bitmap pixels — null if we fell back */
  face: Box | null;
  /**
   * Which detector produced `face`. The native box is a real face; the skin
   * box is a head-shaped region of skin, which is close enough to centre on
   * but not tight enough to zoom as hard against.
   */
  faceSource: "native" | "skin" | null;
  /** what the crop should centre on: face centre, or the saliency centroid */
  focus: { x: number; y: number } | null;
  framing: Framing;
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

/**
 * Ceiling on the decoded long edge.
 *
 * A 48MP HEIC straight off a recent iPhone decodes to ~8000x6000 — 190MB of
 * RGBA — and the card's photo window is a few hundred plate pixels wide. On a
 * mid-range Android that allocation is what kills the tab, and it takes the
 * saliency pass and every `drawImage` down with it. 2000px is still four times
 * more detail than the window can print at 2x.
 */
const MAX_EDGE = 2000;

/**
 * Downscale a decoded image to fit `MAX_EDGE`, releasing the original.
 *
 * The peak allocation still happens — the browser has to decode before we know
 * how big it is, and there's no portable way to ask first. What this removes is
 * the *retained* cost: the full-res bitmap is closed here rather than held for
 * the session behind `LoadedPhoto`, so nothing downstream ever touches it.
 *
 * Halving in steps rather than one jump: a single 4:1+ `drawImage` reduction
 * aliases visibly on hair and fabric, and successive halves cost almost nothing
 * at these sizes.
 */
function downscale(decoded: Decoded): Decoded {
  if (Math.max(decoded.width, decoded.height) <= MAX_EDGE) return decoded;

  const original = decoded.source;
  let current = decoded;

  while (Math.max(current.width, current.height) > MAX_EDGE) {
    const longest = Math.max(current.width, current.height);
    const step = Math.max(MAX_EDGE / longest, 0.5);
    const w = Math.max(1, Math.round(current.width * step));
    const h = Math.max(1, Math.round(current.height * step));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return decoded; /* nothing to lose by keeping the original */

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current.source, 0, 0, w, h);

    current = { source: canvas, width: w, height: h };
  }

  if (typeof ImageBitmap !== "undefined" && original instanceof ImageBitmap) {
    original.close();
  }
  return current;
}

export async function decodeImage(file: File): Promise<Decoded> {
  try {
    return downscale(await decodeBlob(file));
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
    return downscale(await decodeBlob(converted));
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

/* ------------------------------------------------------------------ */
/* the analysis pass                                                    */
/* ------------------------------------------------------------------ */

/**
 * One downscaled read of the image, shared by everything that inspects pixels.
 *
 * `getImageData` is the expensive part of all of this, and the face pass and
 * the saliency pass want the same three derived channels. Computing them once
 * also keeps the two answers consistent — the saliency fallback scores skin the
 * same way the face finder segments it, so they can't disagree about where the
 * person is.
 *
 * 160px on the long edge: big enough that a face in a group shot is still a
 * dozen pixels across, small enough that the whole pass is single-digit
 * milliseconds on a phone.
 */
const ANALYSIS_MAX = 160;

type Thumb = {
  w: number;
  h: number;
  /** thumbnail px per source px — divide to get back to bitmap coordinates */
  scale: number;
  data: Uint8ClampedArray;
  /** gradient magnitude per pixel: where the detail is */
  edge: Float32Array;
  /** 1 where the pixel passes the skin gate */
  skin: Uint8Array;
  /**
   * The same mask under the per-photo threshold, or null when the loose one was
   * already selective enough. Both get searched — see `findHead`.
   */
  strict: Uint8Array | null;
};

/**
 * How much a pixel looks like skin — 0 for anything that can't be.
 *
 * Two rules in series. The gate is the textbook RGB + YCbCr intersection, with
 * a chroma window deliberately wider than the usual [77,127]×[133,173]: that
 * range was fitted on light skin under neutral light and it drops darker skin
 * and anyone lit by a sunset. Luma is only floored, never capped, for the same
 * reason.
 *
 * The score that survives the gate is the red-to-green ratio, which is the one
 * thing that still separates skin from the background of a photo taken in Goa.
 * Sand, terracotta, teak and warm evening light all pass the gate — they sit
 * around 1.05–1.20 — while skin of any tone runs 1.3–1.6, because melanin
 * absorbs green far more than it absorbs red. It's a ratio, so it survives
 * exposure changes that break every absolute threshold.
 */
function skinScore(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);

  /* skin is warm (red-dominant) and never fully saturated */
  if (!(r > 50 && g > 25 && b > 12 && r > g && g >= b - 12 && mx - mn > 10)) {
    return 0;
  }

  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

  if (!(y > 30 && cb >= 74 && cb <= 133 && cr >= 132 && cr <= 184)) return 0;

  return r / Math.max(1, g);
}

/** Below this red-to-green ratio it's a warm surface, not a person. */
const SKIN_FLOOR = 1.14;

/**
 * Nothing sensible has skin over this much of the frame — past it the mask is
 * describing the background, so only the most skin-like pixels are kept.
 */
const SKIN_CEILING = 0.3;

/**
 * Keep the mask honest on a beach.
 *
 * A fixed threshold is wrong in both directions: raise it and dark skin drops
 * out, lower it and half of Goa is a person. So a second, stricter threshold is
 * derived per photo — if what passes the gate covers more of the frame than a
 * subject plausibly would, it's tightened by the score above until it doesn't.
 * On a photo shot on sand the sand then loses to the actual skin in it, which
 * is the case where the old centroid crop drifted into the middle of the frame
 * and left the subject outside it.
 *
 * Returns `SKIN_FLOOR` when no tightening is called for, in which case the two
 * masks are identical and `findHead` only runs once.
 */
function threshold(scores: Float32Array): number {
  const BINS = 96;
  const hist = new Uint32Array(BINS);
  let passing = 0;

  for (const score of scores) {
    if (score < SKIN_FLOOR) continue;
    passing++;
    /* scores run 1.14 upward and flatten out well before 2.2 */
    const bin = Math.min(BINS - 1, Math.floor(((score - SKIN_FLOOR) / 1.06) * BINS));
    hist[bin]++;
  }

  const budget = scores.length * SKIN_CEILING;
  if (passing <= budget) return SKIN_FLOOR;

  /* walk down from the most skin-like bin until the budget is spent */
  let kept = 0;
  for (let bin = BINS - 1; bin >= 0; bin--) {
    kept += hist[bin];
    if (kept >= budget) return SKIN_FLOOR + (bin / BINS) * 1.06;
  }
  return SKIN_FLOOR;
}

function thumbnail(image: Decoded): Thumb | null {
  const scale = Math.min(1, ANALYSIS_MAX / Math.max(image.width, image.height));
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
  const scores = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    luma[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    /* a fully transparent pixel is background, whatever colour it claims */
    scores[p] = data[i + 3] > 32 ? skinScore(r, g, b) : 0;
  }

  const skin = new Uint8Array(w * h);
  for (let p = 0; p < scores.length; p++) skin[p] = scores[p] >= SKIN_FLOOR ? 1 : 0;

  const cut = threshold(scores);
  let strict: Uint8Array | null = null;
  if (cut > SKIN_FLOOR) {
    strict = new Uint8Array(w * h);
    for (let p = 0; p < scores.length; p++) strict[p] = scores[p] >= cut ? 1 : 0;
  }

  const edge = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const gx = luma[p + 1] - luma[p - 1];
      const gy = luma[p + w] - luma[p - w];
      edge[p] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  return { w, h, scale, data, edge, skin, strict };
}

/** A skin region, in thumbnail pixels. */
type Blob2D = {
  /** its value in the label map, so its rows can be measured later */
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
  /** mass centre of the skin pixels, not of the bounding box */
  cx: number;
  cy: number;
};

/** Every 8-connected run of skin pixels, plus the map that says which is which. */
function skinBlobs(t: Thumb, skin: Uint8Array): { blobs: Blob2D[]; labels: Int32Array } {
  const labels = new Int32Array(t.w * t.h);
  const stack: number[] = [];
  const out: Blob2D[] = [];

  for (let start = 0; start < labels.length; start++) {
    if (labels[start] || !skin[start]) continue;

    const id = out.length + 1;
    labels[start] = id;
    stack.push(start);

    let area = 0;
    let sx = 0;
    let sy = 0;
    let x0 = t.w;
    let y0 = t.h;
    let x1 = 0;
    let y1 = 0;

    while (stack.length) {
      const p = stack.pop() as number;
      const px = p % t.w;
      const py = (p - px) / t.w;

      area++;
      sx += px;
      sy += py;
      if (px < x0) x0 = px;
      if (py < y0) y0 = py;
      if (px > x1) x1 = px;
      if (py > y1) y1 = py;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= t.h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          if (nx < 0 || nx >= t.w) continue;
          const q = ny * t.w + nx;
          if (labels[q] || !skin[q]) continue;
          labels[q] = id;
          stack.push(q);
        }
      }
    }

    out.push({
      id,
      x: x0,
      y: y0,
      w: x1 - x0 + 1,
      h: y1 - y0 + 1,
      area,
      cx: sx / area,
      cy: sy / area,
    });
  }

  return { blobs: out, labels };
}

/** Mean gradient energy inside a box — a face has features, a wall doesn't. */
function detailIn(t: Thumb, b: Blob2D): number {
  let sum = 0;
  let n = 0;
  for (let y = b.y; y < b.y + b.h; y++) {
    for (let x = b.x; x < b.x + b.w; x++) {
      sum += t.edge[y * t.w + x];
      n++;
    }
  }
  return n ? sum / n : 0;
}

/**
 * Cut the head off the top of a skin region.
 *
 * Skin runs continuously from forehead to neck to bare shoulders, so a blob is
 * usually a whole person and its bounding box centres on the chest — which is
 * exactly the framing this is here to stop. Heads are narrow and shoulders are
 * wide, so the row where the region suddenly gets wider is the neckline: take
 * the width of the top rows as the head width, walk down until the region is
 * half again as wide as that, and stop.
 */
function headOf(t: Thumb, b: Blob2D, labels: Int32Array): Box {
  const widths: number[] = [];
  const lefts: number[] = [];
  const rights: number[] = [];

  for (let y = b.y; y < b.y + b.h; y++) {
    let min = -1;
    let max = -1;
    for (let x = b.x; x < b.x + b.w; x++) {
      if (labels[y * t.w + x] !== b.id) continue;
      if (min < 0) min = x;
      max = x;
    }
    widths.push(min < 0 ? 0 : max - min + 1);
    lefts.push(min);
    rights.push(max);
  }

  /* the crown tapers, so measure a little below the top rather than at it */
  const sampleTo = Math.max(1, Math.round(widths.length * 0.3));
  const sample = widths.slice(0, sampleTo).filter((w) => w > 0).sort((a, z) => a - z);
  const headW = sample.length ? sample[Math.floor(sample.length / 2)] : b.w;

  let rows = widths.length;
  for (let i = 0; i < widths.length; i++) {
    if (widths[i] > headW * 1.5) {
      rows = i;
      break;
    }
  }

  /* a head is taller than it is wide; clamp both ways so a bare torso can't
     masquerade as one and a cropped forehead doesn't shrink to a band */
  const h = Math.min(
    Math.max(rows, headW * 0.9),
    Math.max(headW * 1.45, Math.min(b.h, headW * 1.6)),
  );

  /* horizontal extent measured across the head rows only, not the shoulders */
  let x0 = b.x + b.w;
  let x1 = b.x;
  for (let i = 0; i < Math.min(Math.round(h), widths.length); i++) {
    if (lefts[i] < 0) continue;
    if (lefts[i] < x0) x0 = lefts[i];
    if (rights[i] > x1) x1 = rights[i];
  }
  if (x1 < x0) {
    x0 = b.x;
    x1 = b.x + b.w - 1;
  }

  return { x: x0, y: b.y, w: x1 - x0 + 1, h };
}

/**
 * Find a head without a face detector.
 *
 * `FaceDetector` exists in exactly one browser and is off by default in most
 * builds of it, so in practice every iPhone — the device the brief says most
 * people will use — was falling through to the saliency centroid, which centres
 * on the middle of the *whole subject* and reliably framed people at chest
 * height. This is the missing middle: segment skin, take the connected regions,
 * and score them on what separates a head from an arm, a beach or a wooden
 * table — roughly round, reasonably solid, carrying some detail, and not down
 * in the bottom of the frame.
 *
 * It is a heuristic and it knows it. The gates reject rather than rescue: a weak
 * best candidate returns null and the saliency crop takes over, because a
 * confident wrong face is worse than an honest guess.
 */
function headIn(t: Thumb, skin: Uint8Array): { box: Box; score: number } | null {
  const frame = t.w * t.h;
  const { blobs: all, labels } = skinBlobs(t, skin);
  const blobs = all.filter((b) => b.area >= Math.max(9, frame * 0.002));
  if (!blobs.length) return null;

  /* the busiest edge in the picture, as the yardstick for "has detail" */
  let peak = 0;
  for (let i = 0; i < t.edge.length; i++) if (t.edge[i] > peak) peak = t.edge[i];
  const detailScale = Math.max(1, peak * 0.18);

  let best: { blob: Blob2D; score: number } | null = null;

  for (const b of blobs) {
    const fill = b.area / (b.w * b.h);
    const aspect = b.w / b.h;

    /* a head is a solid, roughly round patch. An arm is thin and long; a sandy
       background is a huge sprawling region with a low fill ratio. */
    if (fill < 0.4) continue;
    if (aspect < 0.42 || aspect > 2.1) continue;

    /* an ellipse in a box fills ~0.79, so aim there and fall off both ways */
    const shape = Math.exp(-Math.pow((aspect - 0.85) / 0.5, 2));
    const solid = Math.min(1, fill / 0.62);

    /* heads sit above the middle of a frame far more often than below it */
    const height = 1 - 0.45 * Math.min(1, b.cy / t.h);

    /*
     * Weighted, not gated. A face is mostly smooth skin with a few busy
     * features, so mean gradient over the whole box is low for a real head —
     * low enough that a threshold strict enough to reject a wall also rejected
     * every actual person. As a multiplier it still breaks the tie between a
     * head and a stretch of forearm without ever vetoing the only candidate.
     */
    const texture = Math.min(1, detailIn(t, b) / detailScale);

    /* area counts, but with a square root — otherwise one huge torso beats
       every actual face in a group shot */
    const size = Math.sqrt(b.area / frame);

    const score = size * shape * solid * height * (0.35 + 0.65 * texture);
    if (!best || score > best.score) best = { blob: b, score };
  }

  /* nothing scored like a head — say so rather than framing a guess */
  if (!best || best.score < 0.02) return null;

  const head = headOf(t, best.blob, labels);

  /* back to bitmap pixels */
  return {
    box: {
      x: head.x / t.scale,
      y: head.y / t.scale,
      w: head.w / t.scale,
      h: head.h / t.scale,
    },
    score: best.score,
  };
}

/**
 * The best head across both masks.
 *
 * Searching twice, because the per-photo threshold cuts both ways. A photo shot
 * on sand needs the strict mask or the background swallows the subject; a tight
 * selfie is *itself* over the coverage cap, and the strict mask would carve the
 * face down to its reddest third. Neither can be told apart up front, so both
 * are searched and the higher-scoring head wins — which is the right answer in
 * each case, since the losing mask either fragments the face or sprawls into a
 * region too wide and too hollow to pass the gates.
 *
 * The second pass is a flood fill over 25k pixels. It costs nothing worth
 * measuring against being wrong about which one to run.
 */
function findHead(t: Thumb): Box | null {
  const loose = headIn(t, t.skin);
  const strict = t.strict ? headIn(t, t.strict) : null;

  if (!loose) return strict?.box ?? null;
  if (!strict) return loose.box;
  return strict.score >= loose.score ? strict.box : loose.box;
}

/**
 * Content-aware focal point, for when nothing reads as a head.
 *
 * A plain centre crop is wrong for exactly the photos the brief warns about —
 * an off-centre subject in a landscape frame gets shoved against the edge or
 * cut in half. This returns the centroid of attention mass: edge energy, with
 * skin weighted up, since the subject is usually a person.
 */
function saliencyFocus(t: Thumb): { x: number; y: number } | null {
  let sum = 0;
  let sx = 0;
  let sy = 0;

  for (let y = 1; y < t.h - 1; y++) {
    for (let x = 1; x < t.w - 1; x++) {
      const p = y * t.w + x;
      const score = t.edge[p] + (t.skin[p] ? 90 : 0);
      sum += score;
      sx += score * x;
      sy += score * y;
    }
  }

  if (sum <= 0) return null;
  return { x: sx / sum / t.scale, y: sy / sum / t.scale };
}

/**
 * Decode, then work out how to frame it — with no input from the user.
 *
 * The brief's "don't assume users will crop first" is answered here rather than
 * in the UI: by the time a photo reaches the card it already carries a focal
 * point, so *every* path through the app is auto-framed and cropping is never
 * something anyone has to do.
 */
export async function loadPhoto(file: File): Promise<LoadedPhoto> {
  const decoded = await decodeImage(file);
  const thumb = thumbnail(decoded);

  const native = await detectFace(decoded);
  const face = native ?? (thumb ? findHead(thumb) : null);

  const focus = face
    ? { x: face.x + face.w / 2, y: face.y + face.h / 2 }
    : thumb
      ? saliencyFocus(thumb)
      : null;

  return {
    source: decoded.source,
    width: decoded.width,
    height: decoded.height,
    face,
    faceSource: native ? "native" : face ? "skin" : null,
    focus,
    framing: face ? "face" : focus ? "subject" : "centre",
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
    /*
     * Pull back until the head occupies a portrait-sized share of the window.
     *
     * Only while the user hasn't touched the zoom: this rule exists to undo a
     * tight close-up, and applying it on top of a manual zoom would silently
     * cancel the drag the user just made.
     *
     * The skin-blob box is looser than a real face box — it can carry a slice
     * of neck — so it earns a gentler multiplier; scaling it like a true face
     * box would push the subject too far away.
     */
    if (adjust.zoom === 1) {
      const headroom = photo.faceSource === "skin" ? 3.1 : 3.6;
      const desired = face.h * headroom;
      if (desired > cropH && desired <= ih) {
        cropH = Math.min(ih, desired);
        cropW = Math.min(iw, cropH * targetAspect);
        cropH = cropW / targetAspect;
      }
    }

    cx = face.x + face.w / 2;
    /* put the face centre ~38% down the window rather than dead centre */
    cy = face.y + face.h / 2 + cropH * 0.12;
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
  let sx = Math.max(0, Math.min(iw - cropW, cx - cropW / 2));
  let sy = Math.max(0, Math.min(ih - cropH, cy - cropH / 2));

  /*
   * Last guard: a subject standing at the very edge of a wide photo gets the
   * window clamped away from them, and the headroom nudge above can push the
   * bottom of a low face out of frame. If the head fits at all, slide the
   * window the minimum distance that contains it — nothing here is allowed to
   * hand back a crop that cuts off the face it just found.
   */
  if (face) {
    if (face.w <= cropW) {
      sx = Math.min(sx, face.x);
      sx = Math.max(sx, face.x + face.w - cropW);
    }
    if (face.h <= cropH) {
      sy = Math.min(sy, face.y);
      sy = Math.max(sy, face.y + face.h - cropH);
    }
    sx = Math.max(0, Math.min(iw - cropW, sx));
    sy = Math.max(0, Math.min(ih - cropH, sy));
  }

  return { image: photo.source, sx, sy, sw: cropW, sh: cropH };
}

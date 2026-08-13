/**
 * Canvas → video, for the animated reveal export.
 *
 * `MediaRecorder` can only capture a canvas or a stream — never a DOM element —
 * which is why the lenticular optics had to be ported into canvas first (see
 * `card/sweep.ts`). What's left is straightforward: point a recorder at a
 * captured stream and drive the canvas for the duration.
 */

/**
 * MP4 first, WebM second.
 *
 * X transcodes MP4 reliably and treats WebM inconsistently, so the container
 * matters more than the quality difference. Chrome 130+ and Safari can record
 * MP4 directly; older Chrome and Firefox only offer WebM, which is still worth
 * shipping — a file the user can post by hand beats no file.
 */
const CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

export function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export function videoSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof HTMLCanvasElement === "undefined") return false;
  if (typeof HTMLCanvasElement.prototype.captureStream !== "function") return false;
  return pickMimeType() !== null;
}

export type RecordedVideo = {
  blob: Blob;
  mimeType: string;
  /** file extension matching the container actually produced */
  ext: "mp4" | "webm";
};

/**
 * Record `durationMs` of `drawFrame`, driven in real time.
 *
 * Real time rather than fixed timesteps: `MediaRecorder` takes its timestamps
 * from the wall clock, so rendering faster than realtime produces a file whose
 * duration doesn't match its content. Phase is derived from elapsed time rather
 * than a frame counter, so a dropped frame shortens the animation by nothing —
 * it just lands on the next phase.
 */
export async function recordCanvas(params: {
  canvas: HTMLCanvasElement;
  durationMs: number;
  fps: number;
  cycleMs: number;
  drawFrame: (ctx: CanvasRenderingContext2D, t: number) => void;
  onProgress?: (fraction: number) => void;
}): Promise<RecordedVideo> {
  const mimeType = pickMimeType();
  if (!mimeType) throw new Error("this browser can't record video");

  const ctx = params.canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");

  /* draw one frame before the recorder starts, so the first captured frame is
     the card rather than a blank canvas */
  params.drawFrame(ctx, 0);

  const stream = params.canvas.captureStream(params.fps);
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
  });

  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("recording failed"));
  });

  recorder.start();
  const started = performance.now();

  await new Promise<void>((resolve) => {
    const step = (now: number) => {
      const elapsed = now - started;
      params.drawFrame(ctx, (elapsed % params.cycleMs) / params.cycleMs);
      params.onProgress?.(Math.min(elapsed / params.durationMs, 1));

      if (elapsed >= params.durationMs) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  recorder.stop();
  await stopped;
  for (const track of stream.getTracks()) track.stop();

  if (!chunks.length) throw new Error("the recorder produced no data");

  return {
    blob: new Blob(chunks, { type: mimeType }),
    mimeType,
    ext: mimeType.startsWith("video/mp4") ? "mp4" : "webm",
  };
}

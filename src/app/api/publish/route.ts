import { NextResponse } from "next/server";
import { putImage, putRecord, type PassRecord } from "@/lib/store";

export const runtime = "nodejs";

/** 8 chars of url-safe randomness — enough to be unguessable, short enough to tweet. */
function makeSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Buffer.from(bytes).toString("base64url");
}

const MAX_BYTES = 8 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/* rate limiting                                                       */
/* ------------------------------------------------------------------ */

/**
 * Per-IP publish limit.
 *
 * The endpoint took 8MB uploads from anyone at any rate: one loop fills the
 * blob store and the share flow — the thing being scored — dies for everybody
 * mid-competition.
 *
 * This is a per-instance in-memory window, not a distributed limiter. On
 * serverless that means a determined attacker spread across cold starts gets
 * more than `MAX_PER_WINDOW`, and it is still the difference between a script
 * doing thousands of writes and doing a handful. A shared limiter needs a
 * datastore this project deliberately doesn't have.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;
const MAX_TRACKED_IPS = 5_000;

const buckets = new Map<string, number[]>();

/** `NextRequest.ip` was removed in Next 15 — the proxy header is what's left. */
function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function overLimit(ip: string): boolean {
  const now = Date.now();
  const recent = (buckets.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_PER_WINDOW) {
    buckets.set(ip, recent);
    return true;
  }

  recent.push(now);
  buckets.set(ip, recent);

  /* the map is the only thing here that grows without bound; drop whatever has
     fully aged out once it gets big rather than sweeping on every request */
  if (buckets.size > MAX_TRACKED_IPS) {
    for (const [key, hits] of buckets) {
      if (hits.every((t) => now - t >= WINDOW_MS)) buckets.delete(key);
    }
  }

  return false;
}

/* ------------------------------------------------------------------ */

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(buffer: Buffer): boolean {
  if (buffer.length < PNG_MAGIC.length) return false;
  return PNG_MAGIC.every((byte, i) => buffer[i] === byte);
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (overLimit(ip)) {
    return NextResponse.json(
      { error: "too many publishes — try again shortly" },
      { status: 429, headers: { "retry-after": String(WINDOW_MS / 1000) } },
    );
  }

  /* refuse oversized bodies before buffering them into the form parser, rather
     than after — `formData()` reads the whole upload into memory first */
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    return NextResponse.json({ error: "image too large" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart form" }, { status: 400 });
  }

  const image = form.get("image");
  const metaRaw = form.get("meta");

  if (!(image instanceof Blob)) {
    return NextResponse.json({ error: "missing image" }, { status: 400 });
  }
  if (image.size > MAX_BYTES) {
    return NextResponse.json({ error: "image too large" }, { status: 413 });
  }
  /* the type used to be optional — an empty Content-Type walked straight past
     it, which is exactly what a hand-rolled upload sends */
  if (image.type !== "image/png") {
    return NextResponse.json({ error: "expected image/png" }, { status: 415 });
  }

  let meta: Partial<PassRecord> = {};
  if (typeof metaRaw === "string") {
    try {
      meta = JSON.parse(metaRaw) as Partial<PassRecord>;
    } catch {
      /* metadata is only used for the page's text — a bad blob isn't fatal */
    }
  }

  const slug = makeSlug();
  const buffer = Buffer.from(await image.arrayBuffer());

  /* a declared Content-Type proves nothing about the bytes */
  if (!isPng(buffer)) {
    return NextResponse.json({ error: "expected image/png" }, { status: 415 });
  }

  const record: PassRecord = {
    name: String(meta.name ?? "").slice(0, 60),
    role: String(meta.role ?? "").slice(0, 40),
    stack: String(meta.stack ?? "").slice(0, 80),
    handle: String(meta.handle ?? "").slice(0, 40),
    builderClass: String(meta.builderClass ?? "").slice(0, 60),
    serial: String(meta.serial ?? "").slice(0, 24),
    seat: String(meta.seat ?? "").slice(0, 8),
    salt: Number(meta.salt ?? 0) || 0,
    createdAt: new Date().toISOString(),
  };

  try {
    await putImage(slug, buffer);
    await putRecord(slug, record);
  } catch (err) {
    console.error("publish failed", err);
    return NextResponse.json({ error: "storage unavailable" }, { status: 502 });
  }

  return NextResponse.json({ slug, path: `/id/${slug}` });
}

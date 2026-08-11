import { NextResponse } from "next/server";
import { putImage, putRecord, type PassRecord } from "@/lib/store";

export const runtime = "nodejs";

/** 8 chars of url-safe randomness — enough to be unguessable, short enough to tweet. */
function makeSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Buffer.from(bytes).toString("base64url");
}

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
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
  if (image.type && image.type !== "image/png") {
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

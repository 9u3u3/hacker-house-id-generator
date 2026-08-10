import { NextResponse } from "next/server";
import { getLocalImage } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Serves locally-stored pass images in development. In production Vercel Blob
 * hands out its own CDN URLs and this route is never hit — but it has to exist
 * so the OG crawler has something real to fetch when testing locally.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  /* the route only ever serves flat keys, so anything path-ish is a probe */
  const slug = key.replace(/\.png$/, "");
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(slug)) {
    return new NextResponse("not found", { status: 404 });
  }

  const buf = await getLocalImage(slug);
  if (!buf) return new NextResponse("not found", { status: 404 });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

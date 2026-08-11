import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getRecord, imageUrl } from "@/lib/store";
import { EXPORT_SCALE, SCENE_H, SCENE_W } from "@/lib/card/scene";

export const dynamic = "force-dynamic";

const SLUG = /^[A-Za-z0-9_-]{1,32}$/;

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG.test(slug)) return { title: "HH Goa 2026 — Tide Pass" };

  const record = await getRecord(slug);
  const base = await origin();
  const img = await imageUrl(slug, base);

  const who = record?.name || "A builder";
  const cls = record?.builderClass ? ` — ${record.builderClass}` : "";
  const title = `${who}${cls} · HH Goa 2026`;
  const description =
    "Minted a Tide Pass for Hacker House Goa 2026. Tilt it to see what's hiding. #FrameInGoa";

  return {
    title,
    description,
    metadataBase: new URL(base),
    openGraph: {
      title,
      description,
      url: `${base}/id/${slug}`,
      siteName: "HH Goa 2026",
      type: "website",
      images: [
        {
          url: img,
          /* declared dimensions must match what's actually served — the scene
             is rendered at 2x for retina, so say so */
          width: SCENE_W * EXPORT_SCALE,
          height: SCENE_H * EXPORT_SCALE,
          alt: `${who}'s HH Goa 2026 Tide Pass`,
        },
      ],
    },
    twitter: {
      /* the whole point: X must render the generated graphic, not a thumbnail */
      card: "summary_large_image",
      title,
      description,
      images: [img],
    },
  };
}

export default async function PassPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();

  const record = await getRecord(slug);
  if (!record) notFound();

  const base = await origin();
  const img = await imageUrl(slug, base);

  return (
    <div className="min-h-dvh bg-green px-5 py-12 text-paper">
      <main className="mx-auto flex max-w-4xl flex-col items-center gap-8">
        <p className="font-mono text-[11px] tracking-[0.35em] text-yellow">
          HACKER HOUSE GOA · 28–31 OCT 2026
        </p>

        {/* eslint-disable-next-line @next/next/no-img-element -- remote blob URL, already sized */}
        <img
          src={img}
          alt={`${record.name}'s HH Goa 2026 Tide Pass`}
          width={SCENE_W * EXPORT_SCALE}
          height={SCENE_H * EXPORT_SCALE}
          className="w-full rounded-xl border border-paper/15 shadow-2xl"
        />

        <div className="text-center">
          <h1 className="font-display text-5xl sm:text-6xl">{record.name}</h1>
          {record.builderClass && (
            <p className="mt-3 inline-block rounded-full bg-yellow px-5 py-2 font-mono text-sm font-bold tracking-widest text-green-ink">
              {record.builderClass}
            </p>
          )}
          {(record.role || record.stack) && (
            <p className="mt-3 font-mono text-sm text-paper/70">
              {[record.role, record.stack].filter(Boolean).join(" · ")}
            </p>
          )}
          {record.serial && (
            <p className="mt-2 font-mono text-xs tracking-widest text-paper/50">
              PASS {record.serial}
            </p>
          )}
        </div>

        <Link
          href="/"
          className="rounded-full bg-yellow px-7 py-3.5 font-mono text-sm font-bold tracking-widest text-green-ink transition hover:brightness-110"
        >
          MINT YOUR OWN ↗
        </Link>

        <p className="max-w-sm text-center font-mono text-xs leading-relaxed text-paper/45">
          This is the flat print. The live card shows a different face depending
          which way you tilt it — mint your own to see.
        </p>
      </main>
    </div>
  );
}

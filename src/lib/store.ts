import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Blob storage for published passes.
 *
 * Two drivers behind one interface: Vercel Blob in production, and the local
 * filesystem in dev so the whole share flow — including what the OG crawler
 * actually fetches — can be exercised without a cloud token.
 */

const LOCAL_DIR = join(process.cwd(), ".blob-store");

function hasVercelBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export type PassRecord = {
  name: string;
  role: string;
  stack: string;
  handle: string;
  builderClass: string;
  serial: string;
  seat: string;
  salt: number;
  createdAt: string;
};

export async function putImage(key: string, body: Buffer): Promise<string> {
  if (hasVercelBlob()) {
    const { put } = await import("@vercel/blob");
    const res = await put(`passes/${key}.png`, body, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false,
    });
    return res.url;
  }

  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(join(LOCAL_DIR, `${key}.png`), body);
  /* served back by /api/blob/[key] in dev */
  return `/api/blob/${key}.png`;
}

export async function putRecord(key: string, record: PassRecord): Promise<void> {
  const body = Buffer.from(JSON.stringify(record), "utf8");

  if (hasVercelBlob()) {
    const { put } = await import("@vercel/blob");
    await put(`passes/${key}.json`, body, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
    });
    return;
  }

  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(join(LOCAL_DIR, `${key}.json`), body);
}

export async function getRecord(key: string): Promise<PassRecord | null> {
  try {
    if (hasVercelBlob()) {
      const { head } = await import("@vercel/blob");
      const meta = await head(`passes/${key}.json`);
      const res = await fetch(meta.url, { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as PassRecord;
    }

    const raw = await readFile(join(LOCAL_DIR, `${key}.json`), "utf8");
    return JSON.parse(raw) as PassRecord;
  } catch {
    return null;
  }
}

export async function getLocalImage(key: string): Promise<Buffer | null> {
  try {
    return await readFile(join(LOCAL_DIR, `${key}.png`));
  } catch {
    return null;
  }
}

/** Public URL for a stored image, whichever driver is active. */
export async function imageUrl(key: string, origin: string): Promise<string> {
  if (hasVercelBlob()) {
    try {
      const { head } = await import("@vercel/blob");
      const meta = await head(`passes/${key}.png`);
      return meta.url;
    } catch {
      return `${origin}/api/blob/${key}.png`;
    }
  }
  return `${origin}/api/blob/${key}.png`;
}

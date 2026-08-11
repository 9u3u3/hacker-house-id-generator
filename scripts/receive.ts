/**
 * Temporary file-drop server, for getting design assets from a phone onto this
 * machine when there's no shared filesystem.
 *
 * Dev tooling only, and deliberately short-lived: it writes into one fixed
 * directory, sanitises names, and caps size. Run it, tunnel it, upload, then
 * kill it — do not leave it running.
 *
 *   bun run scripts/receive.ts
 *   cloudflared tunnel --url http://localhost:4000
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PORT = 4000;
const DEST = join(process.cwd(), "public/plates/incoming");
const MAX_BYTES = 25 * 1024 * 1024;

await mkdir(DEST, { recursive: true });

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Drop the plates</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#0b6839; color:#fffbe8;
         font:16px ui-monospace,SFMono-Regular,Menlo,monospace; padding:24px; }
  .box { width:min(100%,420px); }
  h1 { font-size:20px; letter-spacing:.15em; color:#fee101; margin:0 0 6px; }
  p { opacity:.7; line-height:1.5; font-size:13px; margin:0 0 20px; }
  label { display:block; border:2px dashed rgba(255,251,232,.4); border-radius:14px;
          padding:28px 20px; text-align:center; cursor:pointer; }
  input[type=file] { position:absolute; width:1px; height:1px; opacity:0; }
  button { width:100%; margin-top:16px; padding:16px; border:0; border-radius:999px;
           background:#fee101; color:#04301a; font:700 14px ui-monospace,monospace;
           letter-spacing:.15em; cursor:pointer; }
  button:disabled { opacity:.4; }
  #out { margin-top:18px; font-size:12px; white-space:pre-wrap; line-height:1.6; }
  .ok { color:#fee101; }
  .err { color:#ff0080; }
</style></head>
<body><div class="box">
  <h1>DROP THE PLATES</h1>
  <p>Select all 6 images at once. Order doesn't matter — they get sorted out on the other side.</p>
  <form id="f">
    <label>
      <input type="file" name="files" accept="image/*" multiple required>
      <span id="pick">TAP TO PICK IMAGES</span>
    </label>
    <button type="submit">UPLOAD</button>
  </form>
  <div id="out"></div>
</div>
<script>
  const f = document.getElementById('f');
  const input = f.querySelector('input');
  const out = document.getElementById('out');
  input.addEventListener('change', () => {
    document.getElementById('pick').textContent =
      input.files.length + ' FILE(S) SELECTED';
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.disabled = true; btn.textContent = 'UPLOADING…';
    out.textContent = '';
    try {
      const body = new FormData();
      for (const file of input.files) body.append('files', file, file.name);
      const res = await fetch('/upload', { method: 'POST', body });
      const json = await res.json();
      out.className = res.ok ? 'ok' : 'err';
      out.textContent = res.ok
        ? 'SAVED:\\n' + json.saved.join('\\n')
        : 'FAILED: ' + (json.error || res.status);
    } catch (err) {
      out.className = 'err';
      out.textContent = 'FAILED: ' + err.message;
    }
    btn.disabled = false; btn.textContent = 'UPLOAD';
  });
</script></body></html>`;

function safeName(name: string, index: number): string {
  const ext = (name.match(/\.(png|jpe?g|webp|avif)$/i)?.[1] ?? "png").toLowerCase();
  return `upload-${String(index).padStart(2, "0")}.${ext === "jpg" ? "jpeg" : ext}`;
}

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/") {
      return new Response(PAGE, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (req.method === "POST" && url.pathname === "/upload") {
      try {
        const form = await req.formData();
        const files = form.getAll("files").filter((f) => f instanceof File) as File[];
        if (!files.length) {
          return Response.json({ error: "no files" }, { status: 400 });
        }

        const saved: string[] = [];
        for (const [i, file] of files.entries()) {
          if (file.size > MAX_BYTES) {
            return Response.json({ error: `${file.name} too large` }, { status: 413 });
          }
          const name = safeName(file.name, i + 1);
          await writeFile(
            join(DEST, name),
            Buffer.from(await file.arrayBuffer()),
          );
          saved.push(`${name}  (${(file.size / 1024).toFixed(0)}KB)`);
          console.log("received", name, file.size, "bytes");
        }
        return Response.json({ saved });
      } catch (err) {
        console.error(err);
        return Response.json({ error: String(err) }, { status: 500 });
      }
    }

    return new Response("not found", { status: 404 });
  },
});

console.log(`file drop listening on http://localhost:${PORT} -> ${DEST}`);

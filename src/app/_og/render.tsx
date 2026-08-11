import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Shared composition for opengraph-image.tsx and twitter-image.tsx — same
 * card the studio itself uses (brand fonts, the sunrise scene), so the link
 * preview looks like the actual product rather than a generic placeholder.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "HH Goa 2026 — Tide Pass. Mint your builder ID, then tilt it.";

/* Read once at module scope — this doesn't depend on request data.
   Only Bodoni is registered: public/fonts/RobotoMono.ttf is a variable font
   (fvar/gvar/avar tables), and satori's font engine can't parse variable
   fonts — it needs a static instance, same issue the project already solved
   for Bodoni (see the comment in layout.tsx). Registering it here crashes
   the route with an opaque "Cannot read properties of undefined (reading
   '256')". Not worth pulling in font-instancing tooling for one image, so
   the supporting text falls back to satori's default font instead. */
const bodoniData = await readFile(
  join(process.cwd(), "public/fonts/BodoniModa-Black.ttf"),
);
const sunriseData = await readFile(join(process.cwd(), "src/app/_og/sunrise.png"));
const sunriseSrc = `data:image/png;base64,${sunriseData.toString("base64")}`;

export function renderOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#0b6839",
          position: "relative",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- satori image source, not a browser-rendered img */}
        <img
          src={sunriseSrc}
          width={700}
          height={699}
          alt=""
          style={{ position: "absolute", bottom: -80, right: -60, opacity: 0.55 }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(11,104,57,0.88) 0%, rgba(11,104,57,0.55) 55%, rgba(11,104,57,0.8) 100%)",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "64px 72px",
            width: "100%",
            height: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              color: "#fee101",
              fontSize: 26,
              letterSpacing: 6,
              marginBottom: 24,
            }}
          >
            HACKER HOUSE GOA · 28–31 OCT 2026
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              color: "#fffbe8",
              fontFamily: "Bodoni",
              fontSize: 104,
              lineHeight: 0.95,
              fontWeight: 900,
            }}
          >
            <span>MINT YOUR</span>
            <span>TIDE PASS</span>
          </div>
          <div
            style={{
              display: "flex",
              color: "#fffbe8",
              opacity: 0.8,
              fontSize: 24,
              marginTop: 28,
              maxWidth: 700,
            }}
          >
            Drop a photo, take your seat. Tilt the card — it doesn&apos;t show
            you the same thing twice.
          </div>
          <div
            style={{
              display: "flex",
              color: "#ff0080",
              fontSize: 28,
              letterSpacing: 4,
              marginTop: 36,
            }}
          >
            #FrameInGoa
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Bodoni", data: bodoniData, style: "normal", weight: 900 }],
    },
  );
}

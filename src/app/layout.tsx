import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Roboto_Mono, Imbue, Victor_Mono } from "next/font/google";
import "./globals.css";

/*
 * Bodoni Moda, instanced at wght=900 opsz=6 by scripts (the variable font's
 * display optical sizes thin the hairlines to nothing at this weight). Served
 * locally so the canvas renderer and the browser agree exactly.
 *
 * Kept loaded (unused by the Tailwind theme below) purely so the canvas card
 * renderer keeps resolving --font-bodoni / --font-roboto-mono exactly as
 * before — src/lib/card/fonts.ts reads those two variable names literally,
 * and every coordinate in src/lib/card/layout.ts was hand-measured against
 * these specific faces. Imbue/Victor Mono replace them for the page chrome
 * only; the card itself is untouched.
 */
const bodoni = localFont({
  src: "../../public/fonts/BodoniModa-Black.ttf",
  variable: "--font-bodoni",
  weight: "900",
  display: "swap",
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  display: "swap",
});

/* hhgoa.com's real brand faces (recovered from their compiled CSS), used for
   everything the browser renders directly — headings, labels, the ticker. */
const imbue = Imbue({
  variable: "--font-imbue",
  subsets: ["latin"],
  weight: "900",
  display: "swap",
});

const victorMono = Victor_Mono({
  variable: "--font-victor-mono",
  subsets: ["latin"],
  weight: ["500", "700"],
  display: "swap",
});

/* Vercel sets these automatically; the literal domain is the fallback for
   local dev, where no external crawler will ever fetch this anyway. */
const SITE_URL =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  process.env.VERCEL_URL ??
  "hacker-house-id-generator.vercel.app";

const TITLE = "HH Goa 2026 — Tide Pass";
const DESCRIPTION =
  "Mint your Hacker House Goa 2026 builder ID. Tilt it to change the time of day.";

export const metadata: Metadata = {
  metadataBase: new URL(`https://${SITE_URL}`),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "HH Goa 2026",
    type: "website",
  },
  twitter: {
    /* the whole point: X must render the generated graphic, not a thumbnail */
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#0b6839",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bodoni.variable} ${robotoMono.variable} ${imbue.variable} ${victorMono.variable} h-full antialiased`}
    >
      {/* The card can't draw its first frame until all four of these load —
          hinting here lets the browser start fetching before hydration even
          runs, rather than waiting on the useEffect in Studio.tsx. React 19
          hoists <link> tags into <head> regardless of where they're
          rendered in the tree. */}
      <link rel="preload" as="image" href="/plates/day.webp" type="image/webp" />
      <link rel="preload" as="image" href="/plates/sunrise.webp" type="image/webp" />
      <link rel="preload" as="image" href="/plates/night.webp" type="image/webp" />
      <link rel="preload" as="image" href="/plates/goa-badge.png" type="image/png" />
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

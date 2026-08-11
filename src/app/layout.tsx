import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Roboto_Mono } from "next/font/google";
import "./globals.css";

/*
 * Bodoni Moda, instanced at wght=900 opsz=6 by scripts (the variable font's
 * display optical sizes thin the hairlines to nothing at this weight). Served
 * locally so the canvas renderer and the browser agree exactly.
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
      className={`${bodoni.variable} ${robotoMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

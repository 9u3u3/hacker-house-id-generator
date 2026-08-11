import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Victor_Mono } from "next/font/google";
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

const victorMono = Victor_Mono({
  variable: "--font-victor-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "HH Goa 2026 — Tide Pass",
  description:
    "Mint your Hacker House Goa 2026 builder ID. Tilt it to change the time of day.",
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
      className={`${bodoni.variable} ${victorMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Next 16 refuses cross-origin requests for /_next/* dev resources by
   * default. Opening the dev server from a phone on the LAN, or through a
   * tunnel, therefore serves the HTML but blocks every JS chunk — React
   * included — so the page renders and is completely inert. Typing still works
   * because the inputs are real DOM; nothing else does.
   *
   * This only affects `next dev`; production builds have no such restriction.
   */
  allowedDevOrigins: [
    "192.168.1.15",
    "192.168.1.*",
    "*.trycloudflare.com",
    "*.ngrok-free.app",
  ],
};

export default nextConfig;

"use client";

/**
 * The studio's background: hhgoa.com's own sunrise illustration, behind a
 * scrim so the card and form stay the hero. Fixed to the viewport so it
 * doesn't scroll with the (potentially long) form column.
 *
 * One image, not several — sunrise.webp's top half is flat brand-green sky,
 * so `object-cover` fills any viewport (tall mobile, wide desktop) cleanly
 * without stretching, and `object-bottom` keeps the actual scene (sun,
 * palms, beach shack) anchored in frame instead of cropped off.
 */
export function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-green" />

      {/* eslint-disable-next-line @next/next/no-img-element -- decorative,
          aria-hidden background layer with hand-picked width variants;
          next/image's optimizer buys nothing here */}
      <img
        src="/scene/sunrise-1400.webp"
        srcSet="/scene/sunrise-700.webp 700w, /scene/sunrise-1400.webp 1400w"
        sizes="100vw"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-bottom"
      />

      {/* scrim: keeps the card and form legible over the artwork below */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(11,104,57,0.78) 0%, rgba(11,104,57,0.62) 38%, rgba(11,104,57,0.4) 70%, rgba(11,104,57,0.18) 100%)",
        }}
      />

      {/* vignette, for depth */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 15%, transparent 0%, #04301a 140%)",
        }}
      />
    </div>
  );
}

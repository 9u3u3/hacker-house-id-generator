"use client";

/**
 * The studio's background: the official HH Goa illustrations, layered behind
 * a scrim so the card and form stay the hero. Fixed to the viewport so it
 * doesn't scroll with the (potentially long) form column.
 *
 * The scrim is a gradient rather than a flat wash — strongest near the top,
 * where the ticker/header/card sit, easing off toward the bottom edge where
 * only the decorative footer trees are, so the art actually gets to breathe
 * somewhere on the page.
 */
export function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* base fill — sunrise.webp's own sky is mostly this same green, so the
          seam between art and flat background is invisible */}
      <div className="absolute inset-0 bg-green" />

      {/* mid band: hackers at the table, subdued, behind the form column */}
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative,
          aria-hidden background layer with hand-picked width variants;
          next/image's optimizer buys nothing here */}
      <img
        src="/scene/hackers-1400.webp"
        srcSet="/scene/hackers-700.webp 700w, /scene/hackers-1400.webp 1400w"
        sizes="100vw"
        alt=""
        className="absolute inset-x-0 top-[22%] h-[30vh] w-full object-cover opacity-40"
      />

      {/* bottom band: sunrise over the beach */}
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative,
          aria-hidden background layer with hand-picked width variants;
          next/image's optimizer buys nothing here */}
      <img
        src="/scene/sunrise-1400.webp"
        srcSet="/scene/sunrise-700.webp 700w, /scene/sunrise-1400.webp 1400w"
        sizes="100vw"
        alt=""
        className="absolute inset-x-0 bottom-0 h-[46vh] w-full object-cover object-bottom"
      />

      {/* footer trees: thin strip right at the bottom edge */}
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative,
          aria-hidden background layer with hand-picked width variants;
          next/image's optimizer buys nothing here */}
      <img
        src="/scene/footer-trees-1400.webp"
        srcSet="/scene/footer-trees-700.webp 700w, /scene/footer-trees-1400.webp 1400w"
        sizes="100vw"
        alt=""
        className="absolute inset-x-0 bottom-0 h-[14vh] w-full object-cover object-bottom opacity-90"
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
